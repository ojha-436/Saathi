"""Saathi assistant conversations: a ChatGPT-style list of chats with pinning and projects.

Layout in Firestore (all private to the person; the browser reads them through firestore.rules, every write goes through here):
  assistant/{uid}/threads/{tid}    one conversation: title, pinned, project_id, updated_at
  assistant/{uid}/projects/{pid}   a folder of conversations
  assistant/{uid}/messages/{mid}   the messages; `thread_id` says which conversation they belong to (older messages have none and
                                   are shown as one "Earlier conversation")
"""
import json
import logging
import re
import threading
import time
import uuid
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from .agent import ask
from .config import TZ
from .firebase import current_user, db

log = logging.getLogger("saathi.threads")
router = APIRouter(prefix="/api/assistant", tags=["assistant"])

DEFAULT_TITLE = "New chat"
MAX_PROJECTS = 30
CITATION = re.compile(r"\[(?:msg|file|meet|dec|rec|mail|drive):[^\]]+\]")


def _now() -> datetime:
    return datetime.now(TZ)


def _col(uid: str, name: str):
    return db.collection("assistant").document(uid).collection(name)


def _clean(s: str, n: int) -> str:
    return re.sub(r"\s+", " ", s or "").strip()[:n]


def _title_from(text: str) -> str:
    t = _clean(re.sub(r"\[[^\]]*\]\([^)]*\)", "", text), 48)
    return (t[:45] + "…") if len(t) > 47 else (t or DEFAULT_TITLE)


def _own_thread(uid: str, tid: str):
    ref = _col(uid, "threads").document(tid)
    snap = ref.get()
    if not snap.exists:
        raise HTTPException(404, "Conversation not found")
    return ref, snap.to_dict()


# ---------------------------------------------------------------- answering (called by POST /api/assistant)

async def answer(user: dict, tid: str | None, text: str, bg=None) -> dict:
    """Writes the question, streams the answer into the conversation and returns the result. Creates the conversation if needed."""
    from .main import log_event_bigquery, now  # noqa: PLC0415  (main imports this module)

    uid = user["uid"]
    if tid:
        ref, _ = _own_thread(uid, tid)
    else:
        tid = uuid.uuid4().hex[:20]
        ref = _col(uid, "threads").document(tid)
        ref.set({"title": DEFAULT_TITLE, "pinned": False, "project_id": None, "org_id": user["org_id"], "created_at": now(), "updated_at": now()})
    col = _col(uid, "messages")
    # Conversations are per workspace and per thread: nothing from another thread or company leaks into the prompt
    recent = sorted((s.to_dict() for s in col.where(filter=_eq("thread_id", tid)).stream()), key=lambda d: d.get("ts") or now())[-30:]
    history = [{"role": d.get("role"), "text": d.get("text") or ""} for d in recent if d.get("org_id") in (None, "", user["org_id"])][-6:]
    stamp = now()
    col.document().set({"role": "user", "text": text, "ts": stamp, "org_id": user["org_id"], "thread_id": tid})
    pending = col.document()
    pending.set({"role": "assistant", "text": "", "pending": True, "ts": now(), "org_id": user["org_id"], "thread_id": tid})
    update = {"updated_at": stamp}
    if (ref.get().to_dict() or {}).get("title") in (None, "", DEFAULT_TITLE):
        update["title"] = _title_from(text)
    ref.update(update)

    started = time.monotonic()
    last = [0.0]

    def on_partial(t: str) -> None:  # stream into the message the browser is already listening to (~4 writes/s max)
        if time.monotonic() - last[0] >= 0.25:
            last[0] = time.monotonic()
            try:
                pending.update({"text": t})
            except Exception:
                log.warning("partial update failed")

    try:
        result = await ask(user, text, history, on_partial=on_partial)
    except Exception as e:
        log.exception("assistant failed")
        pending.update({"text": "Sorry, something went wrong while I was working on that. Please try again.", "pending": False, "error": str(e)[:300]})
        raise HTTPException(500, "Assistant failed")
    latency = int((time.monotonic() - started) * 1000)
    pending.update({"text": result["text"], "pending": False, "tasks": result["proposed_tasks"], "tool_calls": result["tool_calls"],
                    "charts": result.get("charts") or [], "provenance": {"model": result.get("model"), "latency_ms": latency,
                    "first_token_ms": result.get("first_token_ms"), "prefetched": result.get("prefetched", [])}})
    ref.update({"updated_at": now()})
    tools = [c["tool"] for c in result["tool_calls"]]
    cited = len(set(CITATION.findall(result["text"])))
    db.collection("audit_log").add({"uid": uid, "org_id": user["org_id"], "kind": "assistant", "query": text, "tool_calls": result["tool_calls"],
                                    "tools": tools, "latency_ms": latency, "first_token_ms": result.get("first_token_ms"), "ts": now(), "cited": cited})
    event = {"uid": uid, "query": text[:1000], "tools": json.dumps(tools), "latency_ms": latency, "answer_chars": len(result["text"]),
             "cited_sources": cited, "ts": now().isoformat()}
    if bg is not None:
        bg.add_task(log_event_bigquery, event)
    else:
        threading.Thread(target=log_event_bigquery, args=(event,), daemon=True).start()
    return {**result, "thread_id": tid}


def _eq(field: str, value):
    from .firebase import FieldFilter  # noqa: PLC0415

    return FieldFilter(field, "==", value)


# ---------------------------------------------------------------- threads

class ThreadIn(BaseModel):
    title: str | None = Field(default=None, max_length=120)
    project_id: str | None = Field(default=None, max_length=40)


class ThreadPatch(BaseModel):
    title: str | None = Field(default=None, max_length=120)
    pinned: bool | None = None
    project_id: str | None = Field(default=None, max_length=40)  # "" moves it out of its project


def _check_project(uid: str, pid: str | None) -> str | None:
    if not pid:
        return None
    if not _col(uid, "projects").document(pid).get().exists:
        raise HTTPException(404, "Project not found")
    return pid


@router.post("/threads")
def create_thread(body: ThreadIn, user=Depends(current_user)):
    uid, tid = user["uid"], uuid.uuid4().hex[:20]
    _col(uid, "threads").document(tid).set({
        "title": _clean(body.title or "", 80) or DEFAULT_TITLE, "pinned": False, "project_id": _check_project(uid, body.project_id),
        "org_id": user["org_id"], "created_at": _now(), "updated_at": _now()})
    return {"id": tid}


@router.patch("/threads/{tid}")
def update_thread(tid: str, body: ThreadPatch, user=Depends(current_user)):
    ref, _ = _own_thread(user["uid"], tid)
    change: dict = {}
    if body.title is not None and _clean(body.title, 80):
        change["title"] = _clean(body.title, 80)
    if body.pinned is not None:
        change["pinned"] = body.pinned
    if body.project_id is not None:
        change["project_id"] = _check_project(user["uid"], body.project_id)
    if change:
        ref.update(change)  # no updated_at: pinning or filing a chat should not push it to the top of Recents
    return {"ok": True}


def _delete_messages(uid: str, tid: str | None) -> None:
    for s in _col(uid, "messages").stream():
        d = s.to_dict()
        if (tid is None and not d.get("thread_id")) or (tid and d.get("thread_id") == tid):
            s.reference.delete()


@router.delete("/threads/{tid}")
def delete_thread(tid: str, user=Depends(current_user)):
    uid = user["uid"]
    if tid == "legacy":  # the "Earlier conversation": messages from before conversations existed
        _delete_messages(uid, None)
        return {"ok": True}
    ref, _ = _own_thread(uid, tid)
    _delete_messages(uid, tid)
    ref.delete()
    return {"ok": True}


# ---------------------------------------------------------------- projects

class ProjectIn(BaseModel):
    name: str = Field(min_length=1, max_length=60)


@router.post("/projects")
def create_project(body: ProjectIn, user=Depends(current_user)):
    uid = user["uid"]
    name = _clean(body.name, 60)
    if not name:
        raise HTTPException(400, "Give the project a name")
    if len(list(_col(uid, "projects").limit(MAX_PROJECTS + 1).stream())) >= MAX_PROJECTS:
        raise HTTPException(400, f"You can have up to {MAX_PROJECTS} projects")
    pid = uuid.uuid4().hex[:16]
    _col(uid, "projects").document(pid).set({"name": name, "org_id": user["org_id"], "created_at": _now()})
    return {"id": pid}


@router.patch("/projects/{pid}")
def rename_project(pid: str, body: ProjectIn, user=Depends(current_user)):
    ref = _col(user["uid"], "projects").document(pid)
    if not ref.get().exists:
        raise HTTPException(404, "Project not found")
    ref.update({"name": _clean(body.name, 60) or "Project"})
    return {"ok": True}


@router.delete("/projects/{pid}")
def delete_project(pid: str, user=Depends(current_user)):
    uid = user["uid"]
    ref = _col(uid, "projects").document(pid)
    if not ref.get().exists:
        raise HTTPException(404, "Project not found")
    for s in _col(uid, "threads").where(filter=_eq("project_id", pid)).stream():
        s.reference.update({"project_id": None})  # the conversations stay, back in Recents
    ref.delete()
    return {"ok": True}
