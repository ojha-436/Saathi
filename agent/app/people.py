"""Profile, presence/status, personal settings and session security for the signed-in user."""
import re
import time
from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException
from firebase_admin import auth
from pydantic import BaseModel

from .config import TZ
from google.cloud import firestore

from .firebase import audit, current_user, db, forget_profile

router = APIRouter(prefix="/api/me")

STATUS_STATES = {"available", "busy", "dnd", "away", "offline"}
NOTIFY_LEVELS = {"all", "mentions", "off"}


def _clean(v: str | None, n: int = 80) -> str:
    return re.sub(r"\s+", " ", v or "").strip()[:n]


class ProfileIn(BaseModel):
    name: str
    role: str = ""
    department: str = ""
    phone: str = ""
    location: str = ""
    timezone: str = ""


@router.post("/profile")
def update_profile(body: ProfileIn, user=Depends(current_user)):
    name = _clean(body.name)
    if len(name) < 2:
        raise HTTPException(400, "Enter your full name")
    if body.phone and not re.fullmatch(r"[+\d][\d\s\-()]{5,19}", body.phone.strip()):
        raise HTTPException(400, "Enter a valid phone number")
    db.collection("users").document(user["uid"]).update(
        {"name": name, "role": _clean(body.role), "department": _clean(body.department), "phone": _clean(body.phone, 20),
         "location": _clean(body.location), "timezone": _clean(body.timezone, 40)}
    )
    forget_profile(user["uid"])
    return {"ok": True}


class StatusIn(BaseModel):
    state: str
    text: str = ""
    clear_after_minutes: int | None = None  # None = don't clear; -1 = end of today


@router.post("/status")
def set_status(body: StatusIn, user=Depends(current_user)):
    if body.state not in STATUS_STATES:
        raise HTTPException(400, "Unknown status")
    until = None
    t = datetime.now(TZ)
    if body.clear_after_minutes == -1:
        until = t.replace(hour=23, minute=59, second=0, microsecond=0)
    elif body.clear_after_minutes:
        until = t + timedelta(minutes=max(1, min(body.clear_after_minutes, 60 * 24 * 14)))
    db.collection("users").document(user["uid"]).update(
        {"status": {"state": body.state, "text": _clean(body.text, 100), "until": until, "set_at": t}, "last_active": t}
    )
    return {"ok": True}


_last_beat: dict[str, float] = {}


@router.post("/presence")
def heartbeat(user=Depends(current_user)):
    """Called by the web app about once a minute while it's in use. Writes at most every 50 s per user."""
    t = time.monotonic()
    if t - _last_beat.get(user["uid"], 0) > 50:
        _last_beat[user["uid"]] = t
        db.collection("users").document(user["uid"]).update({"last_active": datetime.now(TZ)})
    return {"ok": True}


class SettingsIn(BaseModel):
    chat_id: str | None = None
    level: str | None = None  # all | mentions | off for chat_id
    quiet_hours: dict | None = None  # {"enabled": bool, "start": "20:00", "end": "08:00"}
    defaults: dict | None = None  # {"dm": "all", "group": "all", "channel": "mentions"}


@router.post("/settings")
def update_settings(body: SettingsIn, user=Depends(current_user)):
    """Private per-user preferences (never stored on shared chat documents)."""
    ref = db.collection("user_settings").document(user["uid"])
    update: dict = {"org_id": user["org_id"], "updated_at": datetime.now(TZ)}
    if body.chat_id:
        if body.level not in NOTIFY_LEVELS:
            raise HTTPException(400, "Level must be all, mentions or off")
        snap = db.collection("chats").document(body.chat_id).get()
        if not snap.exists or user["uid"] not in (snap.get("members") or []):
            raise HTTPException(404, "Chat not found")
        update[f"notify.{body.chat_id}"] = body.level
    if body.quiet_hours is not None:
        q = body.quiet_hours
        for k in ("start", "end"):
            if q.get(k) and not re.fullmatch(r"([01]\d|2[0-3]):[0-5]\d", str(q[k])):
                raise HTTPException(400, "Quiet hours use HH:MM")
        update["quiet_hours"] = {"enabled": bool(q.get("enabled")), "start": q.get("start", "20:00"), "end": q.get("end", "08:00")}
    if body.defaults is not None:
        update["defaults"] = {k: v for k, v in body.defaults.items() if k in ("dm", "group", "channel") and v in NOTIFY_LEVELS}
    if ref.get().exists:
        ref.update(update)
    else:
        nested: dict = {}
        for k, v in update.items():  # set() doesn't expand dotted keys
            if k.startswith("notify."):
                nested.setdefault("notify", {})[k[7:]] = v
            else:
                nested[k] = v
        ref.set(nested)
    return {"ok": True}


@router.post("/sessions/revoke")
def sign_out_everywhere(user=Depends(current_user)):
    """Invalidates every refresh token: other devices are signed out within the hour (immediately for the API)."""
    auth.revoke_refresh_tokens(user["uid"])
    audit(user, "user.sessions_revoked", user["uid"])
    return {"ok": True}


class PushIn(BaseModel):
    token: str
    enabled: bool = True


@router.post("/push")
def register_push(body: PushIn, user=Depends(current_user)):
    """Registers (or removes) this browser's FCM token. Tokens are private to the user."""
    token = body.token.strip()
    if not 20 <= len(token) <= 4096:
        raise HTTPException(400, "Invalid push token")
    ref = db.collection("user_settings").document(user["uid"])
    op = firestore.ArrayUnion if body.enabled else firestore.ArrayRemove
    if ref.get().exists:
        ref.update({"push_tokens": op([token])})
    elif body.enabled:
        ref.set({"org_id": user["org_id"], "push_tokens": [token]})
    if body.enabled:
        tokens = (ref.get().to_dict() or {}).get("push_tokens") or []
        if len(tokens) > 10:  # keep the 10 most recent devices
            ref.update({"push_tokens": tokens[-10:]})
    return {"ok": True}


@router.post("/push/test")
def test_push(user=Depends(current_user)):
    from .push import push

    push(user["uid"], "Saathi notifications are on", "You'll get mentions, replies, tasks and reminders here.", tag="test")
    return {"ok": True}
