import json
import logging
import re
import threading
import time
import uuid
from collections import Counter
from datetime import datetime, timedelta

from fastapi import BackgroundTasks, Depends, FastAPI, File, Form, Header, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
from pydantic import BaseModel, Field

from . import admin, ai, connectors, decisions, demo, dossier, drawings, handover, impact, ingest, invites, jobs, knowledge, live, meetings, memory, people, push, records, research, richdoc, specs, threads, voice, workspaces
from .agent import ask
from .plantdata import refresh as plant_refresh
from .config import ALLOWED_ORIGINS, BQ_TABLE, CRON_SECRET, FAST_MODEL, LOCAL_MODE, SAATHI_ROLE, TZ
from .firebase import auth, audit, bucket, current_user, db, FieldFilter, firestore, get_chat_for_member, memberships_of, require_admin, same_org, user_profile

logging.basicConfig(level=logging.INFO)
app = FastAPI(title="Saathi API")
app.include_router(people.router)
app.include_router(admin.router)
app.include_router(invites.router)
app.include_router(workspaces.router)
app.include_router(meetings.router)
app.include_router(connectors.router)
app.include_router(drawings.router)
app.include_router(records.router)
app.include_router(decisions.router)
app.include_router(memory.router)
app.include_router(impact.router)
app.include_router(handover.router)
app.include_router(knowledge.router)
app.include_router(live.router)
app.include_router(research.router)
app.include_router(dossier.router)
app.include_router(specs.router)
app.include_router(voice.router)
app.include_router(threads.router)
if SAATHI_ROLE in ("worker", "all"):
    app.include_router(jobs.router)  # Cloud Tasks targets; the worker service is private
app.add_middleware(
    CORSMiddleware, allow_origins=ALLOWED_ORIGINS, allow_methods=["*"], allow_headers=["*"], allow_credentials=True,
    allow_origin_regex=r"http://(localhost|127\.0\.0\.1)(:\d+)?" if LOCAL_MODE else None,
)

MAX_UPLOAD = 20 * 1024 * 1024
# Server-side upload allow-list (the browser's accept= attribute is only a hint)
UPLOAD_TYPES = {
    ".pdf": "application/pdf", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp",
    ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", ".txt": "text/plain", ".vtt": "text/vtt",
}

_hits: dict[tuple[str, str], list[float]] = {}


def rate_limit(uid: str, bucket_name: str, per_minute: int) -> None:
    """Per-instance sliding window; enough to stop runaway clients and scripted abuse."""
    t = time.monotonic()
    key = (uid, bucket_name)
    recent = [x for x in _hits.get(key, []) if t - x < 60]
    if len(recent) >= per_minute:
        raise HTTPException(429, "You're doing that too quickly. Wait a moment and try again.")
    recent.append(t)
    _hits[key] = recent


def org_of(user: dict) -> dict:
    snap = db.collection("orgs").document(user["org_id"]).get()
    return {"id": snap.id, **(snap.to_dict() or {})}


def is_guest(user: dict) -> bool:
    return user.get("org_role") == "guest"


def require_guest_dm(user: dict, chat: dict | None = None) -> None:
    """Guests talk in their channels; direct and group chats only if their admin allowed it."""
    if is_guest(user) and not user["guest"]["dm"] and (chat is None or chat.get("type") != "channel"):
        raise HTTPException(403, "Direct messages aren't part of your guest access. Write in your channels instead.")


def require_ai(user: dict) -> None:
    if is_guest(user) and not user["guest"]["ai"]:
        raise HTTPException(403, "Saathi isn't part of your guest access. Ask the person who invited you if you need it.")


def co_members(uid: str) -> set[str]:
    """Everyone who shares at least one chat with uid in the workspace they have open (a guest's whole visible world)."""
    org = user_profile(uid)["org_id"]
    out: set[str] = set()
    for s in db.collection("chats").where(filter=FieldFilter("members", "array_contains", uid)).stream():
        if s.to_dict().get("org_id") in (None, "", org):
            out |= set(s.get("members") or [])
    return out


def now() -> datetime:
    return datetime.now(TZ)


class TextIn(BaseModel):
    text: str


class ChatIn(BaseModel):
    member_ids: list[str]
    name: str | None = None


class ChannelIn(BaseModel):
    name: str
    description: str = ""
    visibility: str = "public"  # public: anyone in the company can find and join; private: invite only
    member_ids: list[str] = []


class ChatPatch(BaseModel):
    name: str | None = None
    description: str | None = None


class MembersIn(BaseModel):
    member_ids: list[str]


class ReactIn(BaseModel):
    reaction: str


class FavoriteIn(BaseModel):
    favorite: bool


REACTIONS = {"like", "heart", "laugh", "check", "pray", "wow"}
# Any emoji is allowed: the browser sends "e_<hex codepoints>" (e.g. e_1f44d), a safe Firestore field name.
EMOJI_REACTION = re.compile(r"^e_[0-9a-f]{2,6}(_[0-9a-f]{2,6}){0,9}$")
MAX_REACTION_KINDS = 20


# ---------------- local mode: sign-in and read API (replaces Firebase Auth + Firestore listeners) ----------------

def _jsonable(v):
    if isinstance(v, datetime):
        return {"__ts__": int(v.timestamp() * 1000)}
    if isinstance(v, dict):
        return {k: _jsonable(x) for k, x in v.items() if k != "embedding"}
    if isinstance(v, (list, tuple)):
        return [_jsonable(x) for x in v]
    return v


class LocalLoginIn(BaseModel):
    email: str
    password: str


class LocalSignupIn(BaseModel):
    email: str
    password: str
    name: str = ""


class LocalQueryIn(BaseModel):
    path: str
    where: list[list] = []
    order_by: list | None = None  # [field, "asc" | "desc"]
    limit: int | None = None


if LOCAL_MODE:

    @app.post("/api/local/login")
    def local_login(body: LocalLoginIn):
        uid = auth.login(body.email, body.password)
        if not uid:
            raise HTTPException(401, "Invalid email or password")
        return {"uid": uid, "token": auth.issue_token(uid), "email": body.email.strip().lower()}

    @app.post("/api/local/signup")
    def local_signup(body: LocalSignupIn):
        email = body.email.strip().lower()
        if "@" not in email or len(body.password) < 8:
            raise HTTPException(400, "Enter a valid email and a password of at least 8 characters")
        if auth.login(email, body.password) or list(db.collection("_auth").where("email", "==", email).limit(1).stream()):
            raise HTTPException(409, "An account with this email already exists")
        created = auth.create_user(email=email, password=body.password, display_name=body.name.strip())
        return {"uid": created.uid, "token": auth.issue_token(created.uid), "email": email}

    @app.post("/api/local/query")
    def local_query(body: LocalQueryIn, user=Depends(current_user)):
        """Read-only equivalent of the browser Firestore listeners, with the same access rules as firestore.rules."""
        uid, parts = user["uid"], body.path.strip("/").split("/")
        has = lambda f, op, v: [f, op, v] in body.where  # noqa: E731
        allowed = False
        if parts == ["users"]:
            allowed = has("org_id", "==", user["org_id"]) and not is_guest(user)
        elif parts == ["chats"]:
            allowed = has("members", "array-contains", uid)
        elif len(parts) == 3 and parts[0] == "chats" and parts[2] == "messages":
            allowed = uid in (db.collection("chats").document(parts[1]).get().get("members") or [])
        elif parts in (["files"], ):
            allowed = has("members", "array-contains", uid)
        elif parts in (["tasks"], ["meetings"], ["records"]):
            allowed = has("participants", "array-contains", uid)
        elif parts in (["events"], ["external_items"], ["notifications"]):
            allowed = has("uid", "==", uid)
        elif len(parts) == 3 and parts[0] == "assistant" and parts[2] in ("messages", "threads", "projects"):
            allowed = parts[1] == uid
        elif parts == ["research_runs"]:
            allowed = has("uid", "==", uid)
        elif len(parts) == 3 and parts[0] == "research_runs" and parts[2] == "events":
            allowed = (db.collection("research_runs").document(parts[1]).get().to_dict() or {}).get("uid") == uid
        elif len(parts) == 3 and parts[0] == "users" and parts[2] == "reads":
            allowed = parts[1] == uid
        if not allowed:
            raise HTTPException(403, "Not allowed")
        ops = {"array-contains": "array_contains"}
        q = db.collection(parts[0]) if len(parts) == 1 else db.collection(parts[0]).document(parts[1]).collection(parts[2])
        for field, op, value in body.where:
            q = q.where(filter=FieldFilter(field, ops.get(op, op), value))
        if body.order_by:
            q = q.order_by(body.order_by[0], direction=firestore.Query.DESCENDING if body.order_by[1] == "desc" else firestore.Query.ASCENDING)
        if body.limit:
            q = q.limit(body.limit)
        return [{"id": s.id, **_jsonable(s.to_dict())} for s in q.stream()]

    @app.get("/api/local/settings")
    def local_settings(user=Depends(current_user)):
        """The user_settings/{uid} document (own settings only)."""
        return _jsonable(db.collection("user_settings").document(user["uid"]).get().to_dict() or {})


@app.get("/health")
def health():
    return {"ok": True}


@app.get("/api/me")
def me(user=Depends(current_user)):
    org = org_of(user)
    out = {k: v for k, v in user.items() if k not in ("memberships", "until")}
    return {**out, "org": {"id": org["id"], "name": org.get("name", ""), "domains": org.get("domains", []), "settings": org.get("settings", {})},
            "workspaces": workspaces.summary(user), "access_until": user["until"].isoformat() if user.get("until") else None}


def notify(uid: str, kind: str, title: str, body: str, actor: dict | None = None, source_ref: str | None = None,
           chat_id: str | None = None, task_id: str | None = None) -> None:
    """Activity feed entry (mentions, assignments, task updates, reminders, meeting summaries)."""
    if actor and uid == actor["uid"]:
        return
    db.collection("notifications").add(
        {"uid": uid, "kind": kind, "title": title, "body": body[:300], "source_ref": source_ref, "chat_id": chat_id, "task_id": task_id,
         "actor": actor["uid"] if actor else None, "actor_name": actor["name"] if actor else None,
         "org_id": (actor or user_profile(uid))["org_id"], "ts": now(), "read": False}
    )
    push.push(uid, title, body, ref=source_ref, tag=f"{kind}-{task_id or source_ref or ''}")


# ---------------- chats ----------------

def mark_seen(uid: str, chat_id: str, ts: datetime | None = None) -> None:
    """Read markers live on the reader's own document (users/{uid}/reads/{chatId}), never on the chat document: a busy channel
    with thousands of members would otherwise turn every "seen" into a write on one hot document."""
    db.collection("users").document(uid).collection("reads").document(chat_id).set({"at": ts or now(), "chat_id": chat_id})


def post_message(chat: dict, user: dict, text: str, file: dict | None = None, mentions: list[str] | None = None,
                 parent_id: str | None = None, doc: dict | None = None) -> str:
    msg_id = uuid.uuid4().hex[:20]
    ts = now()
    body = {"sender": user["uid"], "sender_name": user["name"], "text": text, "ts": ts}
    if file:
        body["file"] = file
    if mentions:
        body["mentions"] = mentions
    if doc:
        body["doc"] = doc  # formatted version (Tiptap JSON); `text` stays the plain text used for search and AI
    col = db.collection("chats").document(chat["id"]).collection("messages")
    if parent_id:
        body["parent_id"] = parent_id
        col.document(parent_id).update({
            "reply_count": firestore.Increment(1), "last_reply_ts": ts, "reply_users": firestore.ArrayUnion([user["uid"]]),
            "thread_followers": firestore.ArrayUnion([user["uid"]]),
        })
    col.document(msg_id).set(body)
    preview = ("↪ " if parent_id else "") + (text or (f"📎 {file['name']}" if file else ""))
    db.collection("chats").document(chat["id"]).update({"last_ts": ts, "last_text": preview[:120], "last_sender": user["name"]})
    mark_seen(user["uid"], chat["id"], ts)
    return msg_id


def post_system(chat_id: str, text: str, actor: str) -> None:
    """Membership/settings events shown inline in the conversation. Never indexed for search."""
    ts = now()
    db.collection("chats").document(chat_id).collection("messages").document().set(
        {"sender": "system", "sender_name": "", "text": text, "ts": ts, "system": True}
    )
    db.collection("chats").document(chat_id).update({"last_ts": ts, "last_text": text[:120], "last_sender": ""})
    if actor:
        mark_seen(actor, chat_id, ts)


def sync_members(chat_id: str, members: list[str]) -> None:
    """Keeps the member copies on files, decisions and handovers (read directly by browsers through security rules) in step
    with chat membership. Search chunks are NOT rewritten: search resolves permissions from the caller's current chats at query
    time, so a join or leave in a 5,000-member channel costs O(files), not O(every message ever indexed)."""
    batch, n = db.batch(), 0
    for col in ("files", "decisions", "handovers"):
        for snap in db.collection(col).where(filter=FieldFilter("chat_id", "==", chat_id)).stream():
            batch.update(snap.reference, {"members": members})
            n += 1
            if n % 400 == 0:
                batch.commit()
                batch = db.batch()
    batch.commit()


def _names(uids: list[str]) -> str:
    names = [user_profile(u)["name"] for u in uids]
    return names[0] if len(names) == 1 else ", ".join(names[:-1]) + " and " + names[-1]


def _channel_owner(chat: dict, uid: str) -> None:
    if uid not in (chat.get("owners") or []):
        raise HTTPException(403, "Only channel owners can do that")


@app.post("/api/chats")
def create_chat(body: ChatIn, user=Depends(current_user)):
    require_guest_dm(user)
    wanted = same_org(user, body.member_ids)
    if is_guest(user):  # guests can only start chats with people they already share a channel with
        wanted = [m for m in wanted if m in co_members(user["uid"])]
    members = sorted(set(wanted) | {user["uid"]})
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
        {"type": "dm" if is_dm else "group", "members": members, "name": body.name or "", "last_ts": now(), "last_text": "", "ai_excluded": False,
         "org_id": user["org_id"]}
    )
    return {"id": chat_id}


# ---------------- channels ----------------

@app.post("/api/channels")
def create_channel(body: ChannelIn, user=Depends(current_user)):
    name = re.sub(r"\s+", " ", body.name).strip()[:60]
    if len(name) < 2:
        raise HTTPException(400, "Give the channel a name (at least 2 characters)")
    if body.visibility not in ("public", "private"):
        raise HTTPException(400, "Visibility must be public or private")
    if is_guest(user):
        raise HTTPException(403, "Guests can't create channels")
    if (org_of(user).get("settings") or {}).get("channel_creation") == "admins":
        require_admin(user)
    taken = (db.collection("chats").where(filter=FieldFilter("org_id", "==", user["org_id"]))
             .where(filter=FieldFilter("name_key", "==", name.lower())).limit(1).get())
    if taken:
        raise HTTPException(409, f"A channel called “{name}” already exists")
    members = sorted(set(same_org(user, body.member_ids)) | {user["uid"]})
    chat_id = "ch_" + uuid.uuid4().hex[:17]
    db.collection("chats").document(chat_id).set(
        {"type": "channel", "name": name, "name_key": name.lower(), "description": body.description.strip()[:300],
         "visibility": body.visibility, "members": members, "owners": [user["uid"]], "created_by": user["uid"],
         "created_at": now(), "last_ts": now(), "last_text": "", "ai_excluded": False,
         "org_id": user["org_id"]}
    )
    audit(user, "channel.created", chat_id, name=name, visibility=body.visibility)
    post_system(chat_id, f"{user['name']} created the channel", user["uid"])
    added = [m for m in members if m != user["uid"]]
    if added:
        post_system(chat_id, f"{user['name']} added {_names(added)}", user["uid"])
    return {"id": chat_id}


@app.get("/api/channels/browse")
def browse_channels(user=Depends(current_user)):
    """Public channels anyone in the company can join. Private channels are only visible to their members."""
    if is_guest(user):
        return []
    rows = []
    for s in (db.collection("chats").where(filter=FieldFilter("org_id", "==", user["org_id"]))
              .where(filter=FieldFilter("visibility", "==", "public")).stream()):
        c = s.to_dict()
        rows.append({"id": s.id, "name": c.get("name"), "description": c.get("description", ""), "member_count": len(c.get("members") or []),
                     "joined": user["uid"] in (c.get("members") or []), "last_ts": c["last_ts"].isoformat() if c.get("last_ts") else None})
    rows.sort(key=lambda r: (r["joined"], -(r["member_count"])))
    return rows


@app.post("/api/channels/{chat_id}/join")
def join_channel(chat_id: str, bg: BackgroundTasks, user=Depends(current_user)):
    ref = db.collection("chats").document(chat_id)
    snap = ref.get()
    if (not snap.exists or snap.get("type") != "channel" or snap.to_dict().get("visibility") != "public"
            or snap.to_dict().get("org_id") != user["org_id"] or is_guest(user)):
        raise HTTPException(404, "Channel not found")
    if user["uid"] not in snap.get("members"):
        members = sorted(set(snap.get("members")) | {user["uid"]})
        update = {"members": members}
        mark_seen(user["uid"], chat_id)
        if not snap.to_dict().get("owners"):
            update["owners"] = [user["uid"]]  # an abandoned channel gets its next member as owner
        ref.update(update)
        post_system(chat_id, f"{user['name']} joined the channel", user["uid"])
        bg.add_task(sync_members, chat_id, members)
    return {"id": chat_id}


@app.post("/api/chats/{chat_id}/members")
def add_members(chat_id: str, body: MembersIn, bg: BackgroundTasks, user=Depends(current_user)):
    chat = get_chat_for_member(chat_id, user["uid"])
    if chat.get("type") == "dm":
        raise HTTPException(400, "Start a group chat to add more people")
    if is_guest(user):
        raise HTTPException(403, "Guests can't add people")
    added = [m for m in same_org(user, body.member_ids) if m not in chat["members"]]
    if not added:
        return {"ok": True, "added": []}
    members = sorted(set(chat["members"]) | set(added))
    db.collection("chats").document(chat_id).update({"members": members})
    post_system(chat_id, f"{user['name']} added {_names(added)}", user["uid"])
    bg.add_task(sync_members, chat_id, members)
    return {"ok": True, "added": added}


@app.delete("/api/chats/{chat_id}/members/{member_id}")
def remove_member(chat_id: str, member_id: str, bg: BackgroundTasks, user=Depends(current_user)):
    """Leave (member_id == caller) or remove someone (channel owners only). Removed people lose access to history."""
    chat = get_chat_for_member(chat_id, user["uid"])
    if chat.get("type") == "dm":
        raise HTTPException(400, "You can't leave a direct message")
    leaving = member_id == user["uid"]
    if not leaving:
        if chat.get("type") == "channel":
            _channel_owner(chat, user["uid"])
        if member_id not in chat["members"]:
            raise HTTPException(404, "Not a member")
    members = [m for m in chat["members"] if m != member_id]
    owners = [o for o in (chat.get("owners") or []) if o != member_id]
    if chat.get("type") == "channel" and members and not owners:
        owners = [members[0]]  # a channel always keeps an owner
    db.collection("chats").document(chat_id).update({"members": members, "owners": owners})
    who = user_profile(member_id)["name"]
    post_system(chat_id, f"{who} left" if leaving else f"{user['name']} removed {who}", user["uid"])
    bg.add_task(sync_members, chat_id, members)
    return {"ok": True}


@app.patch("/api/chats/{chat_id}")
def update_chat(chat_id: str, body: ChatPatch, user=Depends(current_user)):
    chat = get_chat_for_member(chat_id, user["uid"])
    if chat.get("type") == "dm":
        raise HTTPException(400, "Direct messages have no name")
    if chat.get("type") == "channel":
        _channel_owner(chat, user["uid"])
    update = {}
    if body.name is not None and body.name.strip() and body.name.strip() != chat.get("name"):
        update["name"] = re.sub(r"\s+", " ", body.name).strip()[:60]
        update["name_key"] = update["name"].lower()
    if body.description is not None and body.description.strip() != chat.get("description", ""):
        update["description"] = body.description.strip()[:300]
    if update:
        db.collection("chats").document(chat_id).update(update)
        if "name" in update:
            post_system(chat_id, f"{user['name']} renamed the {chat['type']} to “{update['name']}”", user["uid"])
            for c in db.collection("chunks").where(filter=FieldFilter("chat_id", "==", chat_id)).stream():
                c.reference.update({"chat_name": update["name"]})
    return {"ok": True}


@app.delete("/api/chats/{chat_id}")
def delete_channel(chat_id: str, user=Depends(current_user)):
    """Channel owners can delete a channel with its messages, files and search index."""
    chat = get_chat_for_member(chat_id, user["uid"])
    if chat.get("type") != "channel":
        raise HTTPException(400, "Only channels can be deleted")
    _channel_owner(chat, user["uid"])
    # A shared demo login deletes only a channel it made itself today, never the demo workspace's own channels
    made = chat.get("created_at")
    if not (chat.get("created_by") == user["uid"] and isinstance(made, datetime) and now() - made < timedelta(days=1)):
        demo.guard(user, "Demo logins are shared by everyone trying Saathi, so they can't delete the demo's channels.")
    delete_chat_everything(chat_id)
    audit(user, "channel.deleted", chat_id, name=chat.get("name"))
    return {"ok": True}


def delete_chat_everything(chat_id: str) -> None:
    from . import archive

    archive.delete_chunks(chat_id=chat_id)
    ref = db.collection("chats").document(chat_id)
    for col, q in (("messages", ref.collection("messages")),
                   ("chunks", db.collection("chunks").where(filter=FieldFilter("chat_id", "==", chat_id))),
                   ("files", db.collection("files").where(filter=FieldFilter("chat_id", "==", chat_id))),
                   ("decisions", db.collection("decisions").where(filter=FieldFilter("chat_id", "==", chat_id))),
                   ("handovers", db.collection("handovers").where(filter=FieldFilter("chat_id", "==", chat_id)))):
        for s in q.stream():
            if col == "files":
                db.collection("spec_checks").document(s.id).delete()
            if col == "files" and s.to_dict().get("gcs_path"):
                try:
                    bucket.blob(s.get("gcs_path")).delete()
                except Exception:
                    logging.warning("could not delete blob for %s", s.id)
            s.reference.delete()
    ref.delete()


@app.post("/api/chats/{chat_id}/read")
def mark_read(chat_id: str, user=Depends(current_user)):
    get_chat_for_member(chat_id, user["uid"])
    mark_seen(user["uid"], chat_id)
    return {"ok": True}


@app.post("/api/chats/{chat_id}/favorite")
def set_favorite(chat_id: str, body: FavoriteIn, user=Depends(current_user)):
    get_chat_for_member(chat_id, user["uid"])
    op = firestore.ArrayUnion if body.favorite else firestore.ArrayRemove
    db.collection("chats").document(chat_id).update({"favorite_of": op([user["uid"]])})
    return {"ok": True}


@app.post("/api/chats/{chat_id}/messages/{msg_id}/react")
def react(chat_id: str, msg_id: str, body: ReactIn, user=Depends(current_user)):
    get_chat_for_member(chat_id, user["uid"])
    if body.reaction not in REACTIONS and not EMOJI_REACTION.match(body.reaction):
        raise HTTPException(400, "Unknown reaction")
    ref = db.collection("chats").document(chat_id).collection("messages").document(msg_id)
    snap = ref.get()
    if not snap.exists:
        raise HTTPException(404, "Message not found")
    existing = snap.to_dict().get("reactions") or {}
    if body.reaction not in existing and sum(1 for v in existing.values() if v) >= MAX_REACTION_KINDS:
        raise HTTPException(400, "This message already has the maximum number of different reactions")
    on = user["uid"] in (existing.get(body.reaction) or [])
    ref.update({f"reactions.{body.reaction}": (firestore.ArrayRemove if on else firestore.ArrayUnion)([user["uid"]])})
    return {"ok": True, "on": not on}


class MessageIn(BaseModel):
    text: str
    mentions: list[str] = []  # member uids, or "channel" to notify everyone in a channel
    doc: dict | None = None  # formatted message (Tiptap JSON); validated by richdoc.clean_doc
    parent_id: str | None = None  # reply in a thread (one level deep)


def thread_root(chat_id: str, parent_id: str | None) -> dict | None:
    """Validates a thread parent: it must exist in this chat and be a top-level message."""
    if not parent_id:
        return None
    snap = db.collection("chats").document(chat_id).collection("messages").document(parent_id).get()
    if not snap.exists or snap.to_dict().get("parent_id") or snap.to_dict().get("system"):
        raise HTTPException(400, "You can only reply to a message in this conversation")
    return {"id": parent_id, **snap.to_dict()}


def after_post(chat: dict, user: dict, text: str, msg_id: str, mentioned: list[str], everyone: bool, root: dict | None) -> None:
    """Notifications for a new message: mentions, thread followers, then plain pushes for everyone else."""
    where = chat.get("name") or "a direct message"
    ref = f"msg:{chat['id']}/{msg_id}"
    notified = set(chat["members"]) - {user["uid"]} if everyone else set(mentioned)
    for m in notified:
        notify(m, "mention", f"{user['name']} mentioned you in {where}", text, actor=user, source_ref=ref, chat_id=chat["id"])
    if root:
        followers = (set(root.get("thread_followers") or []) | {root.get("sender")} | set(root.get("mentions") or [])) & set(chat["members"])
        for f in followers - notified - {user["uid"]}:
            notify(f, "thread_reply", f"{user['name']} replied to a thread in {where}", text, actor=user, source_ref=ref, chat_id=chat["id"])
            notified.add(f)
    push.push_message(chat, user, text, msg_id, skip=notified)


@app.post("/api/chats/{chat_id}/messages")
def send_message(chat_id: str, body: MessageIn, bg: BackgroundTasks, user=Depends(current_user)):
    chat = get_chat_for_member(chat_id, user["uid"])
    require_guest_dm(user, chat)
    text = body.text.strip()
    if not text:
        raise HTTPException(400, "Empty message")
    rate_limit(user["uid"], "message", 60)
    root = thread_root(chat_id, body.parent_id)
    mentioned = [m for m in dict.fromkeys(body.mentions) if m in chat["members"] and m != user["uid"]]
    everyone = "channel" in body.mentions and chat.get("type") == "channel" and (
        user["uid"] in (chat.get("owners") or []) or user.get("org_role") in ("owner", "admin"))
    try:
        doc = richdoc.clean_doc(body.doc) if body.doc else None
    except richdoc.DocError as e:
        raise HTTPException(400, str(e))
    msg_id = post_message(chat, user, text[:4000], mentions=mentioned + (["channel"] if everyone else []), parent_id=body.parent_id if root else None,
                          doc=doc if doc and len(text) <= 4000 else None)
    after_post(chat, user, text, msg_id, mentioned, everyone, root)
    bg.add_task(ingest.process_message, chat_id, msg_id)
    return {"id": msg_id}


@app.post("/api/chats/{chat_id}/files")
async def upload_file(chat_id: str, bg: BackgroundTasks, file: UploadFile = File(...), text: str = Form(""), parent_id: str = Form(""),
                      user=Depends(current_user)):
    chat = get_chat_for_member(chat_id, user["uid"])
    require_guest_dm(user, chat)
    root = thread_root(chat_id, parent_id or None)
    rate_limit(user["uid"], "upload", 10)
    ext = ("." + (file.filename or "").rsplit(".", 1)[-1].lower()) if "." in (file.filename or "") else ""
    if ext not in UPLOAD_TYPES:
        raise HTTPException(415, "That file type isn't allowed. Share a PDF, image, Word, Excel or text file.")
    file.filename = re.sub(r"[^\w.\- ()]+", "_", file.filename)[:120]
    data = await file.read()
    if len(data) > MAX_UPLOAD:
        raise HTTPException(413, "File too large (max 20 MB)")
    file_id = uuid.uuid4().hex[:20]
    path = f"chats/{chat_id}/{file_id}/{file.filename}"
    bucket.blob(path).upload_from_string(data, content_type=UPLOAD_TYPES[ext])
    db.collection("files").document(file_id).set(
        {
            "name": file.filename, "mime": UPLOAD_TYPES[ext], "size": len(data), "gcs_path": path,
            "chat_id": chat_id, "chat_name": chat.get("name", ""), "members": chat["members"],
            "uploaded_by": user["uid"], "uploaded_by_name": user["name"], "ts": now(), "status": "processing",
            "org_id": user["org_id"],
        }
    )
    meta = {"id": file_id, "name": file.filename, "mime": UPLOAD_TYPES[ext], "size": len(data), "status": "processing"}
    msg_id = post_message(chat, user, text.strip(), file=meta, parent_id=parent_id if root else None)
    after_post(chat, user, text.strip() or f"📎 {file.filename}", msg_id, [], False, root)
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
    get_chat_for_member(f["chat_id"], user["uid"])  # current membership, not just the copy on the file
    data = bucket.blob(f["gcs_path"]).download_as_bytes()
    return Response(data, media_type=f.get("mime") or "application/octet-stream",
                    headers={"Content-Disposition": f'inline; filename="{f["name"]}"', "X-Content-Type-Options": "nosniff"})


@app.post("/api/chats/{chat_id}/summarize")
def summarize_chat(chat_id: str, user=Depends(current_user)):
    require_ai(user)
    chat = get_chat_for_member(chat_id, user["uid"])
    col = db.collection("chats").document(chat_id).collection("messages")
    snaps = list(col.order_by("ts", direction=firestore.Query.DESCENDING).limit(60).stream())
    lines = [f"{s.get('sender_name')} ({ai.fmt_ist(s.get('ts'))}): {s.get('text') or ''} {('[file: ' + s.get('file')['name'] + ']') if s.to_dict().get('file') else ''}" for s in reversed(snaps)]
    if ai.client is None:  # offline: most recent messages as bullets
        bullets = "\n".join(f"- {ln}" for ln in [x for x in lines if x.strip()][-6:])
        return {"summary": f"Gemini is not configured, so here are the latest messages instead:\n{bullets}"}
    summary = ai.generate_text(
        f"Summarise this workplace chat '{chat.get('name') or 'direct message'}' for {user['name']} in at most 6 bullets: "
        f"key points, decisions, pending asks with owners and dates. Match the chat's language.\n\n" + "\n".join(lines),
        model=FAST_MODEL,
    )
    return {"summary": summary}


# ---------------- promises ----------------

class TrackIn(BaseModel):
    assign: bool = False  # assign the task to the person who made the promise (caller becomes watcher)


@app.post("/api/chats/{chat_id}/messages/{msg_id}/track")
def track_promise(chat_id: str, msg_id: str, body: TrackIn | None = None, user=Depends(current_user)):
    chat = get_chat_for_member(chat_id, user["uid"])
    ref = db.collection("chats").document(chat_id).collection("messages").document(msg_id)
    msg = ref.get().to_dict() or {}
    p = msg.get("promise")
    if not p:
        raise HTTPException(400, "No promise on this message")
    mine = p.get("committer", "").split()[0:1] == user["name"].split()[0:1]
    source = f"msg:{chat_id}/{msg_id}"
    committer_uid = msg.get("sender") if msg.get("sender") != user["uid"] else None
    if body and body.assign and committer_uid and committer_uid in chat["members"]:
        task_id = new_task(user, p["action"], assignee=committer_uid, due_at=p.get("due_at"), kind="promise", source_ref=source,
                           chat_id=chat_id, watchers=[user["uid"]], counterparty=p.get("committer"))
    else:
        title = p["action"] if mine else f"Follow up: {p['committer']} — {p['action']}"
        task_id = new_task(user, title, due_at=p.get("due_at"), kind="promise", source_ref=source, chat_id=chat_id, counterparty=p.get("committer"))
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


class AskIn(BaseModel):
    text: str = Field(max_length=4000)
    thread_id: str | None = Field(default=None, max_length=40)  # none: a new conversation is started


@app.post("/api/assistant")
async def assistant(body: AskIn, bg: BackgroundTasks, user=Depends(current_user)):
    text = body.text.strip()
    if not text:
        raise HTTPException(400, "Empty message")
    require_ai(user)
    rate_limit(user["uid"], "assistant", 20)
    if not (org_of(user).get("settings") or {}).get("ai_enabled", True):
        raise HTTPException(403, "Your workspace admin has turned off the AI assistant")
    return await threads.answer(user, body.thread_id, text, bg)


@app.post("/api/assistant/clear")
def clear_assistant(user=Depends(current_user)):
    col = db.collection("assistant").document(user["uid"]).collection("messages")
    for s in col.stream():
        if s.to_dict().get("org_id") in (None, "", user["org_id"]):
            s.reference.delete()
    for t in db.collection("assistant").document(user["uid"]).collection("threads").stream():
        if t.to_dict().get("org_id") in (None, "", user["org_id"]):
            t.reference.delete()
    return {"ok": True}


# ---------------- tasks & notifications ----------------

TASK_STATUSES = {"open", "in_progress", "blocked", "done", "dismissed"}


def new_task(user: dict, title: str, *, assignee: str | None = None, due_at=None, kind: str = "todo", status: str = "open",
             source_ref: str | None = None, chat_id: str | None = None, watchers: list[str] | None = None,
             counterparty: str | None = None) -> str:
    """Creates a task. `owner` stays the assignee (reminders, insights and the agent read it); `participants`
    (creator + assignee + watchers) is what security rules and task lists use."""
    assignee = (same_org(user, [assignee]) or [user["uid"]])[0] if assignee else user["uid"]
    watchers = [w for w in same_org(user, watchers or []) if w != assignee]
    task_id = uuid.uuid4().hex[:20]
    db.collection("tasks").document(task_id).set(
        {"owner": assignee, "assignee": assignee, "creator": user["uid"], "creator_name": user["name"], "watchers": watchers,
         "participants": sorted({user["uid"], assignee, *watchers}), "title": title.strip()[:200], "due_at": due_at, "kind": kind,
         "status": status, "source_ref": source_ref, "chat_id": chat_id, "counterparty": counterparty, "notified": False,
         "org_id": user["org_id"], "created_at": now()}
    )
    if status == "open" and assignee != user["uid"]:
        notify(assignee, "task_assigned", f"{user['name']} assigned you a task", title, actor=user, source_ref=source_ref, task_id=task_id)
    return task_id


def _task_for(task_id: str, user: dict):
    ref = db.collection("tasks").document(task_id)
    snap = ref.get()
    if not snap.exists or user["uid"] not in (snap.to_dict().get("participants") or [snap.get("owner")]):
        raise HTTPException(404, "Task not found")
    return ref, snap.to_dict()


@app.post("/api/tasks/{task_id}/{action}")
def task_action(task_id: str, action: str, user=Depends(current_user)):
    ref, t = _task_for(task_id, user)
    creator, assignee = t.get("creator", t["owner"]), t.get("assignee", t["owner"])
    status = {"confirm": "open", "done": "done", "reopen": "open", "start": "in_progress", "block": "blocked", "dismiss": "dismissed"}.get(action)
    if not status:
        raise HTTPException(400, "Unknown action")
    if action in ("confirm", "dismiss") and user["uid"] != creator and not (action == "dismiss" and user["uid"] == assignee == creator):
        raise HTTPException(403, "Only the person who created this task can do that")
    if action != "confirm" and action != "dismiss" and user["uid"] not in (creator, assignee):
        raise HTTPException(403, "Only the assignee or the creator can update this task")
    ref.update({"status": status, "updated_at": now(), "updated_by": user["uid"], "done_at": now() if status == "done" else None})
    if t.get("kind") == "promise":
        threading.Thread(target=plant_refresh, daemon=True).start()
    if action == "confirm" and assignee != user["uid"]:
        notify(assignee, "task_assigned", f"{user['name']} assigned you a task", t["title"], actor=user, source_ref=t.get("source_ref"), task_id=task_id)
    elif action in ("done", "block", "start"):
        verb = {"done": "completed", "block": "is blocked on", "start": "started"}[action]
        for w in {creator, *t.get("watchers", [])} - {user["uid"]}:
            notify(w, "task_update", f"{user['name']} {verb} a task", t["title"], actor=user, source_ref=t.get("source_ref"), task_id=task_id)
        if action == "done" and t.get("chat_id"):
            try:
                get_chat_for_member(t["chat_id"], user["uid"])  # only into a chat they're in
                post_system(t["chat_id"], f"{user['name']} marked “{t['title'][:80]}” done", user["uid"])
            except Exception:
                logging.warning("could not post task status to chat %s", t.get("chat_id"))
    return {"ok": True, "status": status}


class TaskIn(BaseModel):
    text: str
    source_ref: str | None = None
    assignee: str | None = None
    due_at: str | None = None  # ISO 8601
    watchers: list[str] = []


@app.post("/api/tasks")
def create_task(body: TaskIn, user=Depends(current_user)):
    if not body.text.strip():
        raise HTTPException(400, "Give the task a title")
    source = body.source_ref if body.source_ref and re.fullmatch(r"msg:[\w-]+/[\w-]+", body.source_ref) else None
    chat_id = None
    if source:
        chat_id = source[4:].split("/")[0]
        get_chat_for_member(chat_id, user["uid"])
    if body.assignee and not same_org(user, [body.assignee]):
        raise HTTPException(400, "That person isn't in your workspace")
    if body.assignee and is_guest(user) and body.assignee not in co_members(user["uid"]):
        raise HTTPException(403, "Guests can only assign tasks to people they share a chat with")
    kind = "follow_up" if source else "todo"
    task_id = new_task(user, body.text, assignee=body.assignee, due_at=ai.parse_iso(body.due_at), kind=kind, source_ref=source,
                       chat_id=chat_id, watchers=body.watchers)
    return {"task_id": task_id}


class TaskPatch(BaseModel):
    title: str | None = None
    due_at: str | None = None
    clear_due: bool = False
    assignee: str | None = None


@app.patch("/api/tasks/{task_id}")
def update_task(task_id: str, body: TaskPatch, user=Depends(current_user)):
    ref, t = _task_for(task_id, user)
    creator = t.get("creator", t["owner"])
    update: dict = {"updated_at": now()}
    if body.title is not None and body.title.strip():
        update["title"] = body.title.strip()[:200]
    if body.clear_due:
        update["due_at"], update["notified"] = None, False
    elif body.due_at:
        update["due_at"], update["notified"] = ai.parse_iso(body.due_at), False
    if body.assignee and body.assignee != t.get("assignee"):
        if user["uid"] != creator:
            raise HTTPException(403, "Only the creator can reassign this task")
        new = same_org(user, [body.assignee])
        if not new:
            raise HTTPException(400, "That person isn't in your workspace")
        update |= {"assignee": new[0], "owner": new[0], "participants": sorted({creator, new[0], *t.get("watchers", [])})}
        notify(new[0], "task_assigned", f"{user['name']} assigned you a task", update.get("title", t["title"]), actor=user, task_id=task_id)
    ref.update(update)
    return {"ok": True}


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
            {"uid": t["owner"], "kind": "reminder", "title": title, "body": t.get("title"), "task_id": s.id, "source_ref": t.get("source_ref"),
             "org_id": t.get("org_id", ""), "ts": now(), "read": False}
        )
        push.push(t["owner"], title, t.get("title") or "", ref=t.get("source_ref"), tag=f"reminder-{s.id}")
        s.reference.update({"notified": True})
        fired += 1
    # statuses with an expiry ("Busy until 4 pm") go back to Available
    cleared = 0
    for u in db.collection("users").where(filter=FieldFilter("status.until", "<=", now())).stream():
        u.reference.update({"status": {"state": "available", "text": "", "until": None, "set_at": now()}})
        cleared += 1
    try:
        ho = handover.tick()
    except Exception:
        logging.exception("handover tick failed")
        ho = {}
    try:
        ho["guest_access_ended"] = workspaces.sweep()
    except Exception:
        logging.exception("guest access sweep failed")
    try:
        ho["live_prompts"] = live.prompt_starting_meetings()
    except Exception:
        logging.exception("live prompt failed")
    try:
        ho["demo_logins_restored"] = demo.heal()
    except Exception:
        logging.exception("demo login check failed")
    return {"fired": fired, "statuses_cleared": cleared, **ho}


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
    from . import archive

    get_chat_for_member(chat_id, user["uid"])
    db.collection("chats").document(chat_id).update({"ai_excluded": body.excluded, "ai_excluded_by": user["name"]})
    if body.excluded:
        archive.delete_chunks(chat_id=chat_id)
        for col in ("chunks", "decisions"):
            for c in db.collection(col).where(filter=FieldFilter("chat_id", "==", chat_id)).stream():
                c.reference.delete()
        for f in db.collection("files").where(filter=FieldFilter("chat_id", "==", chat_id)).stream():
            drawings.rebuild_for_file(f.id)
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
    events = [e for e in events if e.get("ts") and e["ts"] >= week and e.get("kind") != "security"]
    tool_use = Counter(tool for e in events for tool in (e.get("tools") or [c.get("tool") for c in e.get("tool_calls", [])]))
    lat = sorted(e["latency_ms"] for e in events if e.get("latency_ms"))

    chats = []
    decisions = []
    for c in db.collection("chats").where(filter=FieldFilter("members", "array_contains", uid)).stream():
        cd = c.to_dict()
        if cd.get("org_id") not in (None, "", user["org_id"]):
            continue
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


PUBLIC_PROFILE = ("name", "role", "email", "photo", "department", "phone", "location", "timezone", "status", "last_active", "org_role", "deactivated")


@app.get("/api/users")
def list_users(others: bool = False, user=Depends(current_user)):
    """Workspace directory, with each person's role in this workspace. Guests only see the people they share a chat with.
    others=1: only people in this workspace who have another one open right now (the browser's live directory misses them)."""
    org = user["org_id"]
    visible = co_members(user["uid"]) | {user["uid"]} if is_guest(user) else None
    rows = []
    for uid, d in workspaces.org_people(org).items():
        if (visible is not None and uid not in visible) or (others and d.get("org_id") == org):
            continue
        m = memberships_of(d).get(org) or {}
        rows.append({"id": uid, **{k: v for k, v in d.items() if k in PUBLIC_PROFILE}, "org_role": m.get("org_role", "member"),
                     "deactivated": bool(d.get("deactivated")), "org_id": org})
    return rows

