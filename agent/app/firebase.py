import logging
import re
import time
import uuid

import firebase_admin
from fastapi import Header, HTTPException
from firebase_admin import auth, firestore
from google.cloud import storage

from .config import FILES_BUCKET, PROJECT, SIGNUP_DOMAINS

if not firebase_admin._apps:
    firebase_admin.initialize_app(options={"projectId": PROJECT})

db = firestore.client()
bucket = storage.Client(project=PROJECT).bucket(FILES_BUCKET)
log = logging.getLogger("saathi.auth")

ORG_ROLES = ("owner", "admin", "member", "guest")
# Consumer mail domains can never be claimed by a workspace: everyone on them would join it.
PUBLIC_DOMAINS = {
    "gmail.com", "googlemail.com", "outlook.com", "hotmail.com", "live.com", "yahoo.com", "yahoo.co.in", "icloud.com",
    "me.com", "proton.me", "protonmail.com", "aol.com", "rediffmail.com", "zoho.com", "gmx.com", "mail.com",
}

_PROFILE_TTL = 300  # profiles can be edited; other Cloud Run instances pick changes up within 5 minutes
_profiles: dict[str, tuple[float, dict]] = {}


def user_profile(uid: str) -> dict:
    hit = _profiles.get(uid)
    if hit and time.monotonic() - hit[0] < _PROFILE_TTL:
        return hit[1]
    snap = db.collection("users").document(uid).get()
    data = snap.to_dict() or {}
    profile = {
        "uid": uid, "name": data.get("name", "Unknown"), "role": data.get("role", ""), "email": data.get("email", ""),
        "org_id": data.get("org_id", ""), "org_role": data.get("org_role", ""), "deactivated": bool(data.get("deactivated")),
    }
    if snap.exists:
        _profiles[uid] = (time.monotonic(), profile)
    return profile


def forget_profile(uid: str | None = None) -> None:
    if uid:
        _profiles.pop(uid, None)
    else:
        _profiles.clear()


user_profile.cache_clear = forget_profile  # type: ignore[attr-defined]


def set_claims(uid: str, org_id: str, org_role: str) -> None:
    """Security rules read org + role from the ID token, so they need no extra document reads."""
    auth.set_custom_user_claims(uid, {"org_id": org_id, "org_role": org_role})


def audit(actor: dict | str, action: str, target: str = "", **meta) -> None:
    """Security/admin event log (also used for the admin console's audit view)."""
    actor = actor if isinstance(actor, dict) else user_profile(actor)
    try:
        db.collection("audit_log").add(
            {"uid": actor.get("uid"), "actor_name": actor.get("name"), "org_id": actor.get("org_id", ""), "kind": "security",
             "action": action, "target": target, "meta": meta, "ts": firestore.SERVER_TIMESTAMP}
        )
    except Exception:
        log.exception("audit write failed")


def _workspace_name(email: str, name: str) -> str:
    domain = email.rsplit("@", 1)[-1]
    if not domain or domain in PUBLIC_DOMAINS:
        return f"{name.split(' ')[0]}'s workspace"
    return re.sub(r"[-_]+", " ", domain.split(".")[0]).title()


def ensure_general(org_id: str, uid: str, name: str) -> None:
    """Every workspace has a public #General that all members (not guests) belong to, so nobody starts with an empty chat list."""
    cid = f"ch_general_{org_id}"[:60]
    ref = db.collection("chats").document(cid)
    snap = ref.get()
    t = firestore.SERVER_TIMESTAMP
    if not snap.exists:
        ref.set({"type": "channel", "name": "General", "name_key": "general", "description": "Company-wide announcements and conversation",
                 "visibility": "public", "members": [uid], "owners": [uid], "created_by": uid, "created_at": t, "last_ts": t,
                 "last_text": f"{name} created the workspace", "last_sender": "", "ai_excluded": False, "org_id": org_id, "default": True})
        ref.collection("messages").document().set({"sender": "system", "sender_name": "", "text": f"{name} created the workspace", "ts": t, "system": True})
    elif uid not in (snap.get("members") or []):
        ref.update({"members": firestore.ArrayUnion([uid]), "last_ts": t, "last_text": f"{name} joined the workspace", "last_sender": ""})
        ref.collection("messages").document().set({"sender": "system", "sender_name": "", "text": f"{name} joined the workspace", "ts": t, "system": True})
        for c in db.collection("files").where("chat_id", "==", cid).stream():  # downloads follow membership; search needs no rewrite
            c.reference.update({"members": firestore.ArrayUnion([uid])})


def _join(decoded: dict) -> None:
    """First sign-in. Order: a pending invite, then a workspace that claimed this verified domain, else a new workspace."""
    uid = decoded["uid"]
    email = (decoded.get("email") or "").lower()
    domain = email.rsplit("@", 1)[-1]
    verified = bool(decoded.get("email_verified"))
    if SIGNUP_DOMAINS and domain not in SIGNUP_DOMAINS:
        raise HTTPException(403, "Your organisation hasn't enabled Saathi for this email domain. Sign in with your work account.")
    name = (decoded.get("name") or email.split("@")[0].replace(".", " ").title() or "New colleague").strip()[:80]

    org_id, org_role, channels = "", "member", []
    invite_ref = db.collection("invites").document(email) if email else None
    invite = invite_ref.get() if invite_ref else None
    if invite is not None and invite.exists and invite.get("status") == "pending":
        if not verified:
            raise HTTPException(403, "verify-email: Verify your email address to accept your invitation.")
        inv = invite.to_dict()
        org_id, org_role, channels = inv["org_id"], inv.get("org_role", "member"), inv.get("channel_ids") or []
    elif domain and domain not in PUBLIC_DOMAINS:
        hit = db.collection("orgs").where("domains", "array_contains", domain).limit(1).get()
        if hit:
            if not verified:
                raise HTTPException(403, "verify-email: Verify your email address to join your organisation's workspace.")
            org_id = hit[0].id
    if not org_id:
        org_id, org_role = "org_" + uuid.uuid4().hex[:16], "owner"
        db.collection("orgs").document(org_id).set(
            {"name": _workspace_name(email, name), "domains": [], "created_by": uid, "created_at": firestore.SERVER_TIMESTAMP,
             "settings": {"channel_creation": "everyone", "ai_enabled": True}}
        )

    db.collection("users").document(uid).set(
        {"name": name, "role": "", "email": email, "photo": decoded.get("picture", ""), "org_id": org_id, "org_role": org_role,
         "provider": (decoded.get("firebase") or {}).get("sign_in_provider", ""), "created_at": firestore.SERVER_TIMESTAMP}
    )
    set_claims(uid, org_id, org_role)
    forget_profile(uid)
    if invite is not None and invite.exists and org_id == invite.get("org_id"):
        invite_ref.update({"status": "accepted", "accepted_uid": uid, "accepted_at": firestore.SERVER_TIMESTAMP})
        for cid in channels:  # guests (and members) invited straight into channels
            ref = db.collection("chats").document(cid)
            snap = ref.get()
            if snap.exists and snap.get("org_id") == org_id:
                ref.update({"members": firestore.ArrayUnion([uid])})
    if org_role != "guest":
        ensure_general(org_id, uid, name)
    audit({"uid": uid, "name": name, "org_id": org_id}, "user.joined", org_id, org_role=org_role, via="invite" if channels or org_role != "owner" else "signup")


async def current_user(authorization: str = Header(default="")) -> dict:
    if not authorization.startswith("Bearer "):
        raise HTTPException(401, "Missing bearer token")
    return user_from_token(authorization[7:])


def user_from_token(token: str) -> dict:
    """Verifies a Firebase ID token and returns the caller's profile (also used by WebSockets, which can't send headers)."""
    try:
        decoded = auth.verify_id_token(token)
    except Exception:
        raise HTTPException(401, "Invalid token")
    profile = user_profile(decoded["uid"])
    if not profile["org_id"]:
        if not db.collection("users").document(decoded["uid"]).get().exists:
            _join(decoded)
            profile = user_profile(decoded["uid"])
        else:
            raise HTTPException(403, "Your account isn't part of a workspace yet. Ask your admin for an invite.")
    if profile["deactivated"]:
        raise HTTPException(401, "This account has been deactivated by your workspace admin.")
    return profile


def require_admin(user: dict) -> None:
    if user.get("org_role") not in ("owner", "admin"):
        raise HTTPException(403, "Only workspace admins can do that")


def same_org(user: dict, uids: list[str]) -> list[str]:
    """Keeps only active users from the caller's workspace (protects every member picker on the server side)."""
    out = []
    for u in dict.fromkeys(uids):
        p = user_profile(u)
        if p["org_id"] == user["org_id"] and not p["deactivated"] and p["name"] != "Unknown":
            out.append(u)
    return out


def get_chat_for_member(chat_id: str, uid: str) -> dict:
    snap = db.collection("chats").document(chat_id).get()
    if not snap.exists or uid not in (snap.get("members") or []):
        raise HTTPException(404, "Chat not found")
    data = snap.to_dict()
    if data.get("org_id") and data["org_id"] != user_profile(uid)["org_id"]:
        raise HTTPException(404, "Chat not found")
    return {"id": chat_id, **data}
