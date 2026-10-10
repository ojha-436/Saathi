from functools import lru_cache

import firebase_admin
from fastapi import Header, HTTPException
from firebase_admin import auth, firestore
from google.cloud import storage

from .config import FILES_BUCKET, PROJECT

if not firebase_admin._apps:
    firebase_admin.initialize_app(options={"projectId": PROJECT})

db = firestore.client()
bucket = storage.Client(project=PROJECT).bucket(FILES_BUCKET)


@lru_cache(maxsize=256)
def user_profile(uid: str) -> dict:
    snap = db.collection("users").document(uid).get()
    data = snap.to_dict() or {}
    return {"uid": uid, "name": data.get("name", "Unknown"), "role": data.get("role", ""), "email": data.get("email", "")}


async def current_user(authorization: str = Header(default="")) -> dict:
    if not authorization.startswith("Bearer "):
        raise HTTPException(401, "Missing bearer token")
    try:
        decoded = auth.verify_id_token(authorization[7:])
    except Exception:
        raise HTTPException(401, "Invalid token")
    return user_profile(decoded["uid"])


def get_chat_for_member(chat_id: str, uid: str) -> dict:
    snap = db.collection("chats").document(chat_id).get()
    if not snap.exists or uid not in (snap.get("members") or []):
        raise HTTPException(404, "Chat not found")
    return {"id": chat_id, **snap.to_dict()}
