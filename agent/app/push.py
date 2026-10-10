"""Web push via Firebase Cloud Messaging. Device tokens live in the private user_settings/{uid}.push_tokens.

Delivery rules (checked on the server, per recipient):
- never to the sender; never while the recipient is on Do not disturb or inside their quiet hours
- chat messages respect the per-chat level (all / mentions / off); mentions, assignments and reminders always qualify
Sends run on a small thread pool so API requests don't wait on FCM."""
import logging
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime
from zoneinfo import ZoneInfo

from firebase_admin import messaging
from google.cloud import firestore

from .config import TZ, WEB_URL
from .firebase import db

log = logging.getLogger("saathi.push")
_pool = ThreadPoolExecutor(max_workers=4, thread_name_prefix="push")


def _settings(uid: str) -> dict:
    return db.collection("user_settings").document(uid).get().to_dict() or {}


def _quiet(uid: str, user: dict, s: dict) -> bool:
    st = user.get("status") or {}
    until = st.get("until")
    if st.get("state") == "dnd" and (not until or until > datetime.now(TZ)):
        return True
    q = s.get("quiet_hours") or {}
    if not q.get("enabled"):
        return False
    try:
        tz = ZoneInfo(user.get("timezone") or "Asia/Kolkata")
    except Exception:
        tz = TZ
    hm = datetime.now(tz).strftime("%H:%M")
    start, end = q.get("start", "20:00"), q.get("end", "08:00")
    return (start <= hm < end) if start <= end else (hm >= start or hm < end)


def chat_level(s: dict, chat: dict) -> str:
    return (s.get("notify") or {}).get(chat["id"]) or (s.get("defaults") or {}).get(chat.get("type", "group")) or "all"


def _send(uid: str, title: str, body: str, url: str, tag: str) -> None:
    try:
        user = db.collection("users").document(uid).get().to_dict() or {}
        s = _settings(uid)
        tokens = s.get("push_tokens") or []
        if not tokens or user.get("deactivated") or _quiet(uid, user, s):
            return
        msg = messaging.MulticastMessage(
            tokens=tokens,
            data={"title": title[:120], "body": body[:240], "url": url, "tag": tag},
            webpush=messaging.WebpushConfig(headers={"Urgency": "high", "TTL": "3600"}),
        )
        res = messaging.send_each_for_multicast(msg)
        dead = [tokens[i] for i, r in enumerate(res.responses)
                if not r.success and isinstance(r.exception, (messaging.UnregisteredError, messaging.SenderIdMismatchError))]
        if dead:
            db.collection("user_settings").document(uid).update({"push_tokens": firestore.ArrayRemove(dead)})
    except Exception:
        log.exception("push to %s failed", uid)


def push(uid: str, title: str, body: str, ref: str | None = None, tag: str = "saathi") -> None:
    """Queue a push. `ref` (msg:/meet:/mail:/task:) becomes the deep link the notification opens."""
    url = f"{WEB_URL}/app" + (f"?open={ref}" if ref else "")
    _pool.submit(_send, uid, title, body, url, tag)


def push_message(chat: dict, sender: dict, text: str, msg_id: str, skip: set[str]) -> None:
    """New chat message: members whose level for this chat is 'all' (mentions are pushed separately via notify)."""
    where = chat.get("name") or sender["name"]
    for uid in chat.get("members", []):
        if uid == sender["uid"] or uid in skip:
            continue
        if chat_level(_settings(uid), chat) != "all":
            continue
        title = sender["name"] if chat.get("type") == "dm" else f"{sender['name']} in {where}"
        push(uid, title, text or "Shared a file", ref=f"msg:{chat['id']}/{msg_id}", tag=f"chat-{chat['id']}")
