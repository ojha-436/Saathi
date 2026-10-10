import time

import firebase_admin
from fastapi import Header, HTTPException
from firebase_admin import auth, firestore
from google.cloud import storage

from .config import FILES_BUCKET, PROJECT, SIGNUP_DOMAINS

if not firebase_admin._apps:
    firebase_admin.initialize_app(options={"projectId": PROJECT})

db = firestore.client()
bucket = storage.Client(project=PROJECT).bucket(FILES_BUCKET)


_PROFILE_TTL = 300  # profiles can now be edited; other Cloud Run instances pick changes up within 5 minutes
_profiles: dict[str, tuple[float, dict]] = {}


def user_profile(uid: str) -> dict:
    hit = _profiles.get(uid)
    if hit and time.monotonic() - hit[0] < _PROFILE_TTL:
        return hit[1]
    snap = db.collection("users").document(uid).get()
    data = snap.to_dict() or {}
    profile = {"uid": uid, "name": data.get("name", "Unknown"), "role": data.get("role", ""), "email": data.get("email", "")}
    if snap.exists:
        _profiles[uid] = (time.monotonic(), profile)
    return profile


user_profile.cache_clear = _profiles.clear  # type: ignore[attr-defined]


def _create_profile(decoded: dict) -> None:
    """First sign-in (email sign-up or Google SSO): create the directory profile from the verified token."""
    email = (decoded.get("email") or "").lower()
    domain = email.rsplit("@", 1)[-1]
    if SIGNUP_DOMAINS and domain not in SIGNUP_DOMAINS:
        raise HTTPException(403, "Your organisation hasn't enabled Saathi for this email domain. Sign in with your work account.")
    name = (decoded.get("name") or email.split("@")[0].replace(".", " ").title() or "New colleague").strip()[:80]
    db.collection("users").document(decoded["uid"]).set(
        {"name": name, "role": "", "email": email, "photo": decoded.get("picture", ""),
         "provider": (decoded.get("firebase") or {}).get("sign_in_provider", ""), "created_at": firestore.SERVER_TIMESTAMP}
    )
    user_profile.cache_clear()


async def current_user(authorization: str = Header(default="")) -> dict:
    if not authorization.startswith("Bearer "):
        raise HTTPException(401, "Missing bearer token")
    try:
        decoded = auth.verify_id_token(authorization[7:])
    except Exception:
        raise HTTPException(401, "Invalid token")
    profile = user_profile(decoded["uid"])
    if profile["name"] == "Unknown" and not db.collection("users").document(decoded["uid"]).get().exists:
        _create_profile(decoded)
        profile = user_profile(decoded["uid"])
    return profile


def get_chat_for_member(chat_id: str, uid: str) -> dict:
    snap = db.collection("chats").document(chat_id).get()
    if not snap.exists or uid not in (snap.get("members") or []):
        raise HTTPException(404, "Chat not found")
    return {"id": chat_id, **snap.to_dict()}
