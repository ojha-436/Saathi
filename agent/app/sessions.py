"""Saathi conversations as sessions, like any AI assistant: every question belongs to a conversation with a title, and
Saathi's context is that conversation's recent turns. Conversations are private to the person (assistant/{uid}/sessions,
read only through this API), and can be searched, renamed, pinned and deleted.

History from before sessions existed is split into conversations at pauses of more than two hours (or a new day), once,
the first time the list is read. A new conversation gets a short title from the fast model after its first answer."""
import logging
import re
import uuid
from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from . import ai, demo
from .config import FAST_MODEL, TZ
from .firebase import FieldFilter, current_user, db, firestore

log = logging.getLogger("saathi.sessions")
router = APIRouter(prefix="/api/assistant/sessions")

SID = re.compile(r"[A-Za-z0-9_-]{8,48}")
GAP = timedelta(hours=2)
TITLE_PROMPT = """Write a 2 to 6 word title for this workplace conversation, as a chat-history label. Keep identifiers such as
drawing, heat, PO or job numbers and vendor names. Same language as the question. No quotes, no full stop.

Question: {q}
Answer: {a}"""


def _cols(uid: str):
    base = db.collection("assistant").document(uid)
    return base.collection("sessions"), base.collection("messages")


def _here(d: dict, org_id: str) -> bool:
    """Conversations are per workspace: someone in two workspaces never sees one company's in the other."""
    return d.get("org_id") in (None, "", org_id)


def _short(q: str, n: int = 58) -> str:
    q = re.sub(r"\s+", " ", q or "").strip()
    return q if len(q) <= n else q[: n - 1].rstrip() + "…"


def _iso(v):
    return v.isoformat() if isinstance(v, datetime) else None


def new_id() -> str:
    return "s_" + uuid.uuid4().hex[:16]


def valid(sid: str | None) -> bool:
    return bool(sid) and bool(SID.fullmatch(sid))


def migrate(user: dict) -> int:
    """Gives history from before sessions a conversation each: split at pauses over two hours or a new day."""
    sessions, msgs = _cols(user["uid"])
    legacy = [(s, s.to_dict()) for s in msgs.stream()]
    legacy = [(s, d) for s, d in legacy if not d.get("session_id") and _here(d, user["org_id"]) and isinstance(d.get("ts"), datetime)]
    if not legacy:
        return 0
    legacy.sort(key=lambda x: x[1]["ts"])
    groups: list[list] = []
    for s, d in legacy:
        prev = groups[-1][-1][1]["ts"] if groups else None
        if prev is None or d["ts"] - prev > GAP or d["ts"].astimezone(TZ).date() != prev.astimezone(TZ).date():
            groups.append([])
        groups[-1].append((s, d))
    for g in groups:
        sid = new_id()
        asked = [d.get("text") or "" for _, d in g if d.get("role") == "user"]
        sessions.document(sid).set({"title": _short(asked[0] if asked else "Conversation"), "auto_title": False, "org_id": user["org_id"],
                                    "created_at": g[0][1]["ts"], "updated_at": g[-1][1]["ts"], "pinned": False, "questions": len(asked),
                                    "preview": _short(asked[-1] if asked else "", 90)})
        for s, _ in g:
            s.reference.update({"session_id": sid})
    log.info("split %d earlier messages of %s into %d conversations", len(legacy), user["uid"], len(groups))
    return len(groups)


def touch(user: dict, sid: str, question: str) -> bool:
    """Starts the conversation on its first question, or marks it as just used. True when it is new."""
    sessions, _ = _cols(user["uid"])
    ref = sessions.document(sid)
    snap = ref.get()
    t = datetime.now(TZ)
    if snap.exists:
        if not _here(snap.to_dict(), user["org_id"]):
            raise HTTPException(404, "Conversation not found")
        ref.update({"updated_at": t, "questions": firestore.Increment(1), "preview": _short(question, 90)})
        return False
    ref.set({"title": _short(question), "auto_title": True, "org_id": user["org_id"], "created_at": t, "updated_at": t, "pinned": False,
             "questions": 1, "preview": _short(question, 90)})
    return True


def history(uid: str, sid: str, n: int = 6) -> list[dict]:
    """The conversation's last turns, oldest first: Saathi's context for the next answer."""
    _, msgs = _cols(uid)
    rows = [s.to_dict() for s in msgs.where(filter=FieldFilter("session_id", "==", sid)).stream()]
    rows = sorted((d for d in rows if isinstance(d.get("ts"), datetime) and not d.get("pending")), key=lambda d: d["ts"])
    return [{"role": d.get("role"), "text": d.get("text") or ""} for d in rows][-n:]


def name(uid: str, sid: str, question: str, answer: str) -> None:
    """A short title for a new conversation (kept if the person has renamed it meanwhile)."""
    try:
        t = ai.generate_text(TITLE_PROMPT.format(q=question[:600], a=answer[:600]), model=FAST_MODEL)
        t = _short(re.sub(r"^[\"'“”‘’#*\s]+|[\"'“”‘’.*\s]+$", "", (t or "").splitlines()[0] if t else ""), 60)
        if len(t) < 3:
            return
        ref = _cols(uid)[0].document(sid)
        d = ref.get().to_dict()
        if d and d.get("auto_title"):
            ref.update({"title": t})
    except Exception:
        log.warning("couldn't title conversation %s", sid)


def _plain(text: str) -> str:
    """Answer text as a list shows it: no markdown markers or [source] tags."""
    text = re.sub(r"\[(?:msg|file|meet|dec|rec|ho|kn|std|mail|drive):[^\]]*\]", "", text)
    return re.sub(r"\*\*|__|`+|^#+\s*|^\s*[-*]\s+", "", text, flags=re.M)


def _snippet(text: str, needle: str, width: int = 90) -> str:
    flat = re.sub(r"\s+([.,;:!?])", r"\1", re.sub(r"\s+", " ", _plain(text))).strip()
    i = flat.lower().find(needle)
    if i < 0:
        return _short(flat, width)
    start = max(0, i - 30)
    return ("…" if start else "") + _short(flat[start:], width)


def _row(sid: str, d: dict) -> dict:
    return {"id": sid, "title": d.get("title") or "Conversation", "pinned": bool(d.get("pinned")), "questions": d.get("questions") or 0,
            "preview": d.get("preview") or "", "created_at": _iso(d.get("created_at")), "updated_at": _iso(d.get("updated_at"))}


@router.get("")
def list_sessions(q: str = "", user=Depends(current_user)):
    """The person's conversations in this workspace, pinned first, then most recent. `q` searches titles and the text of
    every question and answer, and returns where it matched."""
    migrate(user)
    sessions, msgs = _cols(user["uid"])
    rows = {s.id: _row(s.id, s.to_dict()) for s in sessions.stream() if _here(s.to_dict(), user["org_id"])}
    needle = q.strip().lower()[:100]
    if needle:
        hits: dict[str, str] = {}
        for s in msgs.stream():
            d = s.to_dict()
            sid = d.get("session_id")
            if sid in rows and sid not in hits and needle in (d.get("text") or "").lower():
                hits[sid] = _snippet(d.get("text") or "", needle)
        rows = {sid: {**r, "match": hits.get(sid)} for sid, r in rows.items() if needle in r["title"].lower() or sid in hits}
    out = sorted(rows.values(), key=lambda r: r["updated_at"] or "", reverse=True)
    out.sort(key=lambda r: not r["pinned"])
    return out[:200]


class SessionPatch(BaseModel):
    title: str | None = None
    pinned: bool | None = None


def _own(user: dict, sid: str, changing: bool = True):
    if not valid(sid):
        raise HTTPException(404, "Conversation not found")
    ref = _cols(user["uid"])[0].document(sid)
    snap = ref.get()
    if not snap.exists or not _here(snap.to_dict(), user["org_id"]):
        raise HTTPException(404, "Conversation not found")
    started = snap.to_dict().get("created_at")
    if changing and not (isinstance(started, datetime) and datetime.now(TZ) - started < timedelta(days=1)):
        # a shared demo login keeps the demo's earlier conversations for the next person
        demo.guard(user, "Demo logins are shared by everyone trying Saathi, so they can rename or delete only today's conversations.")
    return ref


@router.patch("/{sid}")
def update_session(sid: str, body: SessionPatch, user=Depends(current_user)):
    ref = _own(user, sid, changing=body.title is not None)  # pinning is harmless
    upd: dict = {}
    if body.title is not None:
        title = _short(body.title, 80)
        if not title:
            raise HTTPException(400, "Give the conversation a name")
        upd.update({"title": title, "auto_title": False})
    if body.pinned is not None:
        upd["pinned"] = body.pinned
    if upd:
        ref.update(upd)
    return {"ok": True}


@router.delete("/{sid}")
def delete_session(sid: str, user=Depends(current_user)):
    ref = _own(user, sid)
    _, msgs = _cols(user["uid"])
    for s in msgs.where(filter=FieldFilter("session_id", "==", sid)).stream():
        s.reference.delete()
    ref.delete()
    return {"ok": True}
