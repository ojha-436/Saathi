import json
import logging
import re
import time
import uuid
from collections import Counter
from datetime import datetime, timedelta

from fastapi import BackgroundTasks, Depends, FastAPI, File, Form, Header, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
from google.cloud import firestore
from google.cloud.firestore_v1.base_query import FieldFilter
from pydantic import BaseModel

from . import ai, ingest
from .agent import ask
from .config import ALLOWED_ORIGINS, BQ_TABLE, CRON_SECRET, FAST_MODEL, TZ
from .firebase import bucket, current_user, db, get_chat_for_member

logging.basicConfig(level=logging.INFO)
app = FastAPI(title="Saathi API")
app.add_middleware(
    CORSMiddleware, allow_origins=ALLOWED_ORIGINS, allow_methods=["*"], allow_headers=["*"], allow_credentials=True
)

MAX_UPLOAD = 20 * 1024 * 1024


def now() -> datetime:
    return datetime.now(TZ)


class TextIn(BaseModel):
    text: str


class ChatIn(BaseModel):
    member_ids: list[str]
    name: str | None = None


@app.get("/health")
def health():
    return {"ok": True}


@app.get("/api/me")
def me(user=Depends(current_user)):
    return user


# ---------------- chats ----------------

def post_message(chat: dict, user: dict, text: str, file: dict | None = None) -> str:
    msg_id = uuid.uuid4().hex[:20]
    ts = now()
    body = {"sender": user["uid"], "sender_name": user["name"], "text": text, "ts": ts}
    if file:
        body["file"] = file
    db.collection("chats").document(chat["id"]).collection("messages").document(msg_id).set(body)
    preview = text or (f"📎 {file['name']}" if file else "")
    db.collection("chats").document(chat["id"]).update({"last_ts": ts, "last_text": preview[:120], "last_sender": user["name"]})
    return msg_id


@app.post("/api/chats")
def create_chat(body: ChatIn, user=Depends(current_user)):
    members = sorted(set(body.member_ids) | {user["uid"]})
    if len(members) < 2:
        raise HTTPException(400, "A chat needs at least two members")
    is_dm = len(members) == 2 and not body.name
    if is_dm:
        chat_id = "dm_" + "_".join(members)
        if db.collection("chats").document(chat_id).get().exists:
            return {"id": chat_id}
    else:
        chat_id = uuid.uuid4().hex[:20]
    db.collection("chats").document(chat_id).set(
        {"type": "dm" if is_dm else "group", "members": members, "name": body.name or "", "last_ts": now(), "last_text": "", "ai_excluded": False}
    )
    return {"id": chat_id}


@app.post("/api/chats/{chat_id}/messages")
def send_message(chat_id: str, body: TextIn, bg: BackgroundTasks, user=Depends(current_user)):
    chat = get_chat_for_member(chat_id, user["uid"])
    text = body.text.strip()
    if not text:
        raise HTTPException(400, "Empty message")
    msg_id = post_message(chat, user, text[:4000])
    bg.add_task(ingest.process_message, chat_id, msg_id)
    return {"id": msg_id}


@app.post("/api/chats/{chat_id}/files")
async def upload_file(chat_id: str, bg: BackgroundTasks, file: UploadFile = File(...), text: str = Form(""), user=Depends(current_user)):
    chat = get_chat_for_member(chat_id, user["uid"])
    data = await file.read()
    if len(data) > MAX_UPLOAD:
        raise HTTPException(413, "File too large (max 20 MB)")
    file_id = uuid.uuid4().hex[:20]
    path = f"chats/{chat_id}/{file_id}/{file.filename}"
    bucket.blob(path).upload_from_string(data, content_type=file.content_type or "application/octet-stream")
    db.collection("files").document(file_id).set(
        {
            "name": file.filename, "mime": file.content_type, "size": len(data), "gcs_path": path,
            "chat_id": chat_id, "chat_name": chat.get("name", ""), "members": chat["members"],
            "uploaded_by": user["uid"], "uploaded_by_name": user["name"], "ts": now(), "status": "processing",
        }
    )
    meta = {"id": file_id, "name": file.filename, "mime": file.content_type, "size": len(data), "status": "processing"}
    msg_id = post_message(chat, user, text.strip(), file=meta)
    if text.strip():  # quick: promise/decision chips appear before the slower document extraction
        bg.add_task(ingest.process_message, chat_id, msg_id)
    bg.add_task(ingest.process_file, chat_id, msg_id, file_id)
    return {"id": msg_id, "file_id": file_id}


@app.get("/api/files/{file_id}")
def download_file(file_id: str, user=Depends(current_user)):
    snap = db.collection("files").document(file_id).get()
    if not snap.exists or user["uid"] not in (snap.get("members") or []):
        raise HTTPException(404, "File not found")
    f = snap.to_dict()
    data = bucket.blob(f["gcs_path"]).download_as_bytes()
    return Response(data, media_type=f.get("mime") or "application/octet-stream",
                    headers={"Content-Disposition": f'inline; filename="{f["name"]}"'})


@app.post("/api/chats/{chat_id}/summarize")
def summarize_chat(chat_id: str, user=Depends(current_user)):
    chat = get_chat_for_member(chat_id, user["uid"])
    col = db.collection("chats").document(chat_id).collection("messages")
    snaps = list(col.order_by("ts", direction=firestore.Query.DESCENDING).limit(60).stream())
    lines = [f"{s.get('sender_name')} ({ai.fmt_ist(s.get('ts'))}): {s.get('text') or ''} {('[file: ' + s.get('file')['name'] + ']') if s.to_dict().get('file') else ''}" for s in reversed(snaps)]
    summary = ai.generate_text(
        f"Summarise this workplace chat '{chat.get('name') or 'direct message'}' for {user['name']} in at most 6 bullets: "
        f"key points, decisions, pending asks with owners and dates. Match the chat's language.\n\n" + "\n".join(lines),
        model=FAST_MODEL,
    )
    return {"summary": summary}


# ---------------- promises ----------------

@app.post("/api/chats/{chat_id}/messages/{msg_id}/track")
def track_promise(chat_id: str, msg_id: str, user=Depends(current_user)):
    get_chat_for_member(chat_id, user["uid"])
    ref = db.collection("chats").document(chat_id).collection("messages").document(msg_id)
    msg = ref.get().to_dict() or {}
    p = msg.get("promise")
    if not p:
        raise HTTPException(400, "No promise on this message")
    mine = p.get("committer", "").split()[0:1] == user["name"].split()[0:1]
    title = p["action"] if mine else f"Follow up: {p['committer']} — {p['action']}"
    task_id = uuid.uuid4().hex[:20]
    db.collection("tasks").document(task_id).set(
        {"owner": user["uid"], "title": title[:200], "due_at": p.get("due_at"), "kind": "promise", "status": "open",
         "source_ref": f"msg:{chat_id}/{msg_id}", "counterparty": p.get("committer"), "notified": False, "created_at": now()}
    )
    ref.update({"promise.tracked_by": firestore.ArrayUnion([user["uid"]])})
    return {"task_id": task_id}


@app.post("/api/chats/{chat_id}/messages/{msg_id}/dismiss")
def dismiss_promise(chat_id: str, msg_id: str, user=Depends(current_user)):
    get_chat_for_member(chat_id, user["uid"])
    db.collection("chats").document(chat_id).collection("messages").document(msg_id).update(
        {"promise.dismissed_by": firestore.ArrayUnion([user["uid"]])}
    )
    return {"ok": True}


# ---------------- assistant ----------------

def log_event_bigquery(row: dict) -> None:
    """Streams one assistant event to BigQuery for usage analytics (optional)."""
    if not BQ_TABLE:
        return
    try:
        from google.cloud import bigquery

        errors = bigquery.Client().insert_rows_json(BQ_TABLE, [row])
        if errors:
            logging.warning("bigquery insert errors: %s", errors)
    except Exception:
        logging.exception("bigquery insert failed")


@app.post("/api/assistant")
async def assistant(body: TextIn, bg: BackgroundTasks, user=Depends(current_user)):
    text = body.text.strip()
    if not text:
        raise HTTPException(400, "Empty message")
    col = db.collection("assistant").document(user["uid"]).collection("messages")
    history = [
        {"role": s.get("role"), "text": s.get("text") or ""}
        for s in reversed(list(col.order_by("ts", direction=firestore.Query.DESCENDING).limit(6).stream()))
    ]
    col.document().set({"role": "user", "text": text, "ts": now()})
    pending = col.document()
    pending.set({"role": "assistant", "text": "", "pending": True, "ts": now()})
    started = time.monotonic()
    try:
        result = await ask(user, text, history)
    except Exception as e:
        logging.exception("assistant failed")
        pending.update({"text": "Sorry, something went wrong while I was working on that. Please try again.", "pending": False, "error": str(e)[:300]})
        raise HTTPException(500, "Assistant failed")
    pending.update({"text": result["text"], "pending": False, "tasks": result["proposed_tasks"], "tool_calls": result["tool_calls"]})
    latency = int((time.monotonic() - started) * 1000)
    tools = [c["tool"] for c in result["tool_calls"]]
    db.collection("audit_log").add({"uid": user["uid"], "query": text, "tool_calls": result["tool_calls"], "tools": tools, "latency_ms": latency, "ts": now()})
    bg.add_task(log_event_bigquery, {
        "uid": user["uid"], "query": text[:1000], "tools": json.dumps(tools), "latency_ms": latency,
        "answer_chars": len(result["text"]), "cited_sources": len(set(re.findall(r"\[(?:msg|file):[^\]]+\]", result["text"]))),
        "ts": now().isoformat(),
    })
    return result


@app.post("/api/assistant/clear")
def clear_assistant(user=Depends(current_user)):
    col = db.collection("assistant").document(user["uid"]).collection("messages")
    for s in col.stream():
        s.reference.delete()
    return {"ok": True}


# ---------------- tasks & notifications ----------------

def _own_task(task_id: str, uid: str):
    ref = db.collection("tasks").document(task_id)
    snap = ref.get()
    if not snap.exists or snap.get("owner") != uid:
        raise HTTPException(404, "Task not found")
    return ref


@app.post("/api/tasks/{task_id}/{action}")
def task_action(task_id: str, action: str, user=Depends(current_user)):
    ref = _own_task(task_id, user["uid"])
    status = {"confirm": "open", "done": "done", "reopen": "open", "dismiss": "dismissed"}.get(action)
    if not status:
        raise HTTPException(400, "Unknown action")
    ref.update({"status": status, "updated_at": now()})
    return {"ok": True, "status": status}


@app.post("/api/tasks")
def create_task(body: TextIn, user=Depends(current_user)):
    task_id = uuid.uuid4().hex[:20]
    db.collection("tasks").document(task_id).set(
        {"owner": user["uid"], "title": body.text.strip()[:200], "due_at": None, "kind": "todo", "status": "open",
         "notified": False, "created_at": now()}
    )
    return {"task_id": task_id}


@app.post("/api/notifications/read")
def read_notifications(user=Depends(current_user)):
    q = db.collection("notifications").where(filter=FieldFilter("uid", "==", user["uid"])).where(filter=FieldFilter("read", "==", False))
    for s in q.stream():
        s.reference.update({"read": True})
    return {"ok": True}


@app.post("/api/cron/reminders")
def fire_reminders(x_cron_secret: str = Header(default="")):
    """Called every minute by Cloud Scheduler: turns due tasks into notifications."""
    if x_cron_secret != CRON_SECRET:
        raise HTTPException(403, "Forbidden")
    q = db.collection("tasks").where(filter=FieldFilter("status", "==", "open")).where(filter=FieldFilter("due_at", "<=", now()))
    fired = 0
    for s in q.stream():
        t = s.to_dict()
        if t.get("notified"):
            continue
        kind = t.get("kind")
        title = {"promise": "Promise due", "follow_up": "Follow-up due"}.get(kind, "Reminder")
        db.collection("notifications").add(
            {"uid": t["owner"], "title": title, "body": t.get("title"), "task_id": s.id, "source_ref": t.get("source_ref"), "ts": now(), "read": False}
        )
        s.reference.update({"notified": True})
        fired += 1
    return {"fired": fired}


class ExcludeIn(BaseModel):
    excluded: bool


def _reindex_chat(chat_id: str) -> None:
    for m in db.collection("chats").document(chat_id).collection("messages").stream():
        ingest.process_message(chat_id, m.id)
        if (m.to_dict() or {}).get("file"):
            ingest.process_file(chat_id, m.id, m.get("file")["id"])


@app.post("/api/chats/{chat_id}/ai-exclude")
def set_ai_exclude(chat_id: str, body: ExcludeIn, bg: BackgroundTasks, user=Depends(current_user)):
    """Privacy control: an excluded chat is removed from the assistant's index and never searched."""
    get_chat_for_member(chat_id, user["uid"])
    db.collection("chats").document(chat_id).update({"ai_excluded": body.excluded, "ai_excluded_by": user["name"]})
    if body.excluded:
        for c in db.collection("chunks").where(filter=FieldFilter("chat_id", "==", chat_id)).stream():
            c.reference.delete()
    else:
        bg.add_task(_reindex_chat, chat_id)
    return {"ok": True, "excluded": body.excluded}


@app.get("/api/insights")
def insights(user=Depends(current_user)):
    """Personal productivity overview for the last 7 days."""
    uid, t_now = user["uid"], now()
    week = t_now - timedelta(days=7)
    tasks = [s.to_dict() for s in db.collection("tasks").where(filter=FieldFilter("owner", "==", uid)).stream()]
    live = [t for t in tasks if t.get("status") in ("open", "done")]
    open_ = [t for t in live if t["status"] == "open"]
    overdue = [t for t in open_ if t.get("due_at") and t["due_at"] < t_now]
    done = [t for t in live if t["status"] == "done"]
    promises = [t for t in live if t.get("kind") == "promise"]
    by_kind = Counter(t.get("kind", "todo") for t in live)

    events = [s.to_dict() for s in db.collection("audit_log").where(filter=FieldFilter("uid", "==", uid)).stream()]
    events = [e for e in events if e.get("ts") and e["ts"] >= week]
    tool_use = Counter(tool for e in events for tool in (e.get("tools") or [c.get("tool") for c in e.get("tool_calls", [])]))
    lat = sorted(e["latency_ms"] for e in events if e.get("latency_ms"))

    chats = []
    decisions = []
    for c in db.collection("chats").where(filter=FieldFilter("members", "array_contains", uid)).stream():
        cd = c.to_dict()
        msgs = [m.to_dict() for m in c.reference.collection("messages").where(filter=FieldFilter("ts", ">=", week)).stream()]
        name = cd.get("name") or ", ".join(
            user_name for user_name in [db.collection("users").document(m).get().get("name") for m in cd["members"] if m != uid]
        )
        chats.append({"chat_id": c.id, "name": name, "messages": len(msgs), "files": sum(1 for m in msgs if m.get("file"))})
        decisions += [{"chat": name, "decision": m["decision"], "ts": m["ts"].isoformat()} for m in msgs if m.get("decision")]
    chats.sort(key=lambda x: x["messages"], reverse=True)
    decisions.sort(key=lambda d: d["ts"], reverse=True)

    return {
        "tasks": {"open": len(open_), "overdue": len(overdue), "done": len(done), "promises_tracked": len(promises),
                  "by_kind": dict(by_kind)},
        "assistant": {"questions_7d": len(events), "tool_use": dict(tool_use.most_common()),
                      "median_latency_ms": lat[len(lat) // 2] if lat else None},
        "chats": chats,
        "decisions": decisions[:10],
    }


@app.get("/api/users")
def list_users(user=Depends(current_user)):
    return [{"uid": s.id, **{k: v for k, v in s.to_dict().items() if k in ("name", "role", "email")}} for s in db.collection("users").stream()]

