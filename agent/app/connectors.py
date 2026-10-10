"""Connected apps. Phase 2 ships Google (Calendar + Gmail, read-only); Microsoft Graph and Zoom plug into the same shape.

Security model
- OAuth runs server-side with a one-time `state` nonce; the browser never sees Google tokens.
- Refresh tokens are envelope-encrypted with Cloud KMS (asia-south1) and stored in `connections`, which security rules
  keep server-only. Access tokens live only in memory for one sync.
- Everything synced is personal: calendar events and emails are readable and searchable only by the person who
  connected them (`members=[uid]` on search chunks). Email text is treated as data, never as instructions.
- Disconnect revokes at Google and deletes the connection, synced items and their search index.
"""
import base64
import html
import json
import logging
import re
import secrets
from datetime import datetime, timedelta, timezone
from urllib.parse import urlencode

import requests
from fastapi import APIRouter, BackgroundTasks, Depends, Header, HTTPException
from fastapi.responses import RedirectResponse
from google.cloud import kms
from google.cloud.firestore_v1.base_query import FieldFilter
from pydantic import BaseModel

from . import ai
from .config import CRON_SECRET, GOOGLE_OAUTH_CLIENT, KMS_KEY, PUBLIC_API_URL, TZ, WEB_URL
from .firebase import audit, current_user, db, user_profile

router = APIRouter(prefix="/api/connectors")
log = logging.getLogger("saathi.connectors")

SCOPES = {
    "calendar": "https://www.googleapis.com/auth/calendar.readonly",
    "gmail": "https://www.googleapis.com/auth/gmail.readonly",
}
BASE_SCOPES = ["openid", "email"]
MAX_EMAILS_PER_SYNC = 30


def _client() -> dict:
    if not GOOGLE_OAUTH_CLIENT:
        raise HTTPException(503, "Google connection isn't configured yet. Ask your admin.")
    c = json.loads(GOOGLE_OAUTH_CLIENT)
    return c.get("web") or c


def _redirect_uri() -> str:
    return f"{PUBLIC_API_URL}/api/connectors/google/callback"


_kms: kms.KeyManagementServiceClient | None = None


def _kms_client() -> kms.KeyManagementServiceClient:
    global _kms
    if _kms is None:
        _kms = kms.KeyManagementServiceClient()
    return _kms


def _encrypt(plain: str) -> str:
    r = _kms_client().encrypt(request={"name": KMS_KEY, "plaintext": plain.encode()})
    return base64.b64encode(r.ciphertext).decode()


def _decrypt(cipher: str) -> str:
    r = _kms_client().decrypt(request={"name": KMS_KEY, "ciphertext": base64.b64decode(cipher)})
    return r.plaintext.decode()


def _google_allowed(user: dict) -> bool:
    org = db.collection("orgs").document(user["org_id"]).get().to_dict() or {}
    return (org.get("settings") or {}).get("integrations_google", True)


# ---------------- connect / callback / disconnect ----------------

class StartIn(BaseModel):
    services: list[str] = ["calendar", "gmail"]


@router.get("")
def list_connections(user=Depends(current_user)):
    rows = []
    for s in db.collection("connections").where(filter=FieldFilter("uid", "==", user["uid"])).stream():
        d = s.to_dict()
        rows.append({"provider": d["provider"], "email": d.get("email"), "services": d.get("services", []), "status": d.get("status"),
                     "error": d.get("error"), "last_sync": d["last_sync"].isoformat() if d.get("last_sync") else None,
                     "stats": d.get("stats", {})})
    return {"connections": rows, "available": {"google": bool(GOOGLE_OAUTH_CLIENT) and _google_allowed(user)}}


@router.post("/google/start")
def start(body: StartIn, user=Depends(current_user)):
    if user.get("org_role") == "guest":
        raise HTTPException(403, "Guests can't connect apps")
    if not _google_allowed(user):
        raise HTTPException(403, "Your workspace admin has turned off Google connections")
    services = [s for s in dict.fromkeys(body.services) if s in SCOPES]
    if not services:
        raise HTTPException(400, "Pick Calendar, Gmail or both")
    c = _client()
    state = secrets.token_urlsafe(24)
    db.collection("oauth_states").document(state).set({"uid": user["uid"], "services": services, "ts": datetime.now(TZ)})
    params = {
        "client_id": c["client_id"], "redirect_uri": _redirect_uri(), "response_type": "code", "access_type": "offline",
        "prompt": "consent", "include_granted_scopes": "true", "state": state, "login_hint": user["email"],
        "scope": " ".join(BASE_SCOPES + [SCOPES[s] for s in services]),
    }
    return {"url": "https://accounts.google.com/o/oauth2/v2/auth?" + urlencode(params)}


def _back(status: str, detail: str = "") -> RedirectResponse:
    q = urlencode({"connected": "google", "status": status, **({"detail": detail[:120]} if detail else {})})
    return RedirectResponse(f"{WEB_URL}/app?{q}", status_code=302)


@router.get("/google/callback")
def callback(bg: BackgroundTasks, state: str = "", code: str = "", error: str = ""):
    ref = db.collection("oauth_states").document(state or "-")
    snap = ref.get()
    if not state or not snap.exists:
        return _back("error", "This sign-in link has expired. Try connecting again.")
    st = snap.to_dict()
    ref.delete()  # one-time use
    if datetime.now(TZ) - st["ts"] > timedelta(minutes=10):
        return _back("error", "This sign-in link has expired. Try connecting again.")
    if error or not code:
        return _back("cancelled")
    c = _client()
    tok = requests.post("https://oauth2.googleapis.com/token", timeout=20, data={
        "code": code, "client_id": c["client_id"], "client_secret": c["client_secret"], "redirect_uri": _redirect_uri(), "grant_type": "authorization_code",
    }).json()
    if "access_token" not in tok:
        log.warning("google token exchange failed: %s", tok.get("error"))
        return _back("error", "Google didn't accept the sign-in. Try again.")
    granted = set((tok.get("scope") or "").split())
    services = [s for s in st["services"] if SCOPES[s] in granted]
    if not services:
        return _back("error", "No permissions were granted. Tick Calendar and/or Gmail on Google's screen.")
    info = requests.get("https://openidconnect.googleapis.com/v1/userinfo", timeout=20, headers={"Authorization": f"Bearer {tok['access_token']}"}).json()
    uid = st["uid"]
    user = user_profile(uid)
    old = db.collection("connections").document(f"{uid}_google").get().to_dict() or {}
    refresh = tok.get("refresh_token") or (old.get("enc_refresh") and _decrypt(old["enc_refresh"]))
    if not refresh:
        return _back("error", "Google didn't return offline access. Remove Saathi at myaccount.google.com/permissions and connect again.")
    db.collection("connections").document(f"{uid}_google").set({
        "uid": uid, "org_id": user["org_id"], "provider": "google", "email": info.get("email", ""), "services": services,
        "enc_refresh": _encrypt(refresh), "status": "active", "error": None, "created_at": old.get("created_at") or datetime.now(TZ),
        "last_sync": None, "cursor": old.get("cursor", {}), "stats": {},
    })
    audit(user, "connector.connected", "google", services=services, account=info.get("email", ""))
    bg.add_task(sync_user, uid, {"access_token": tok["access_token"]})
    return _back("ok")


@router.post("/google/disconnect")
def disconnect(user=Depends(current_user)):
    disconnect_user(user["uid"])
    audit(user, "connector.disconnected", "google")
    return {"ok": True}


def disconnect_user(uid: str) -> None:
    ref = db.collection("connections").document(f"{uid}_google")
    d = ref.get().to_dict() or {}
    if d.get("enc_refresh"):
        try:
            requests.post("https://oauth2.googleapis.com/revoke", params={"token": _decrypt(d["enc_refresh"])}, timeout=10)
        except Exception:
            log.warning("google revoke failed for %s", uid)
    ref.delete()
    for col in ("external_items", "events"):
        for s in db.collection(col).where(filter=FieldFilter("uid", "==", uid)).stream():
            s.reference.delete()
    for s in db.collection("chunks").where(filter=FieldFilter("chat_id", "==", f"mail_{uid}")).stream():
        s.reference.delete()
    db.collection("users").document(uid).update({"calendar_busy": []})


@router.post("/google/sync")
def sync_now(bg: BackgroundTasks, user=Depends(current_user)):
    snap = db.collection("connections").document(f"{user['uid']}_google").get()
    if not snap.exists:
        raise HTTPException(404, "Google isn't connected")
    bg.add_task(sync_user, user["uid"])
    return {"ok": True}


@router.post("/cron/sync")
def cron_sync(bg: BackgroundTasks, x_cron_secret: str = Header(default="")):
    """Cloud Scheduler, every 10 minutes."""
    if x_cron_secret != CRON_SECRET:
        raise HTTPException(403, "Forbidden")
    uids = [s.get("uid") for s in db.collection("connections").where(filter=FieldFilter("status", "==", "active")).stream()]
    for uid in uids:
        bg.add_task(sync_user, uid)
    return {"queued": len(uids)}


# ---------------- sync ----------------

def _access_token(conn: dict) -> str:
    c = _client()
    r = requests.post("https://oauth2.googleapis.com/token", timeout=20, data={
        "client_id": c["client_id"], "client_secret": c["client_secret"], "refresh_token": _decrypt(conn["enc_refresh"]), "grant_type": "refresh_token",
    }).json()
    if "access_token" not in r:
        raise PermissionError(r.get("error_description") or r.get("error") or "token refresh failed")
    return r["access_token"]


def sync_user(uid: str, fresh: dict | None = None) -> None:
    ref = db.collection("connections").document(f"{uid}_google")
    conn = ref.get().to_dict()
    if not conn:
        return
    user = user_profile(uid)
    if user["deactivated"]:
        return
    try:
        token = (fresh or {}).get("access_token") or _access_token(conn)
    except PermissionError as e:
        ref.update({"status": "needs_reauth", "error": f"Google access was revoked or expired ({e}). Reconnect Google."})
        return
    headers = {"Authorization": f"Bearer {token}"}
    stats, errors = {}, []
    if "calendar" in conn.get("services", []):
        try:
            stats["events"] = _sync_calendar(uid, user, headers)
        except Exception as e:
            log.exception("calendar sync failed for %s", uid)
            errors.append(f"Calendar: {str(e)[:120]}")
    if "gmail" in conn.get("services", []):
        try:
            stats["emails"], stats["email_promises"] = _sync_gmail(uid, user, headers)
        except Exception as e:
            log.exception("gmail sync failed for %s", uid)
            errors.append(f"Gmail: {str(e)[:120]}")
    ref.update({"last_sync": datetime.now(TZ), "stats": stats, "error": "; ".join(errors) or None, "status": "active"})


def _org_users_by_email(org_id: str) -> dict[str, str]:
    return {(s.get("email") or "").lower(): s.id for s in db.collection("users").where(filter=FieldFilter("org_id", "==", org_id)).stream()}


def _sync_calendar(uid: str, user: dict, headers: dict) -> int:
    t = datetime.now(timezone.utc)
    r = requests.get("https://www.googleapis.com/calendar/v3/calendars/primary/events", headers=headers, timeout=30, params={
        "timeMin": (t - timedelta(days=2)).isoformat(), "timeMax": (t + timedelta(days=14)).isoformat(), "singleEvents": "true",
        "orderBy": "startTime", "maxResults": 150,
    })
    r.raise_for_status()
    people = _org_users_by_email(user["org_id"])
    seen, busy = set(), []
    for ev in r.json().get("items", []):
        if ev.get("status") == "cancelled" or "dateTime" not in (ev.get("start") or {}):
            continue  # skip all-day events
        me = next((a for a in ev.get("attendees", []) if a.get("self")), None)
        if me and me.get("responseStatus") == "declined":
            continue
        start, end = ai.parse_iso(ev["start"]["dateTime"]), ai.parse_iso(ev["end"]["dateTime"])
        private = ev.get("visibility") in ("private", "confidential")
        emails = [a.get("email", "").lower() for a in ev.get("attendees", []) if not a.get("resource")]
        doc_id = f"{uid}_{ev['id']}"[:400]
        seen.add(doc_id)
        meet = ev.get("hangoutLink") or next((e.get("uri") for e in (ev.get("conferenceData") or {}).get("entryPoints", []) if e.get("entryPointType") == "video"), None)
        db.collection("events").document(doc_id).set({
            "uid": uid, "org_id": user["org_id"], "provider": "google", "title": "Busy (private)" if private else (ev.get("summary") or "(no title)"),
            "start": start, "end": end, "location": "" if private else (ev.get("location") or "")[:200], "meet_url": meet,
            "html_link": ev.get("htmlLink"), "organizer": (ev.get("organizer") or {}).get("email", ""),
            "attendee_emails": [] if private else emails[:50], "attendee_uids": [] if private else [people[e] for e in emails if e in people],
            "private": private, "updated_at": datetime.now(TZ),
        })
        # Only real meetings count as busy: skip "free" events and long blocks (multi-day, holidays, all-day-ish reminders)
        if ev.get("transparency") != "transparent" and end and end > t and start < t + timedelta(hours=24) and end - start <= timedelta(hours=12):
            busy.append({"start": start, "end": end})
    for s in db.collection("events").where(filter=FieldFilter("uid", "==", uid)).stream():
        if s.id not in seen:
            s.reference.delete()
    # Free/busy only (no titles) on the profile, so colleagues see "In a meeting"
    db.collection("users").document(uid).update({"calendar_busy": busy[:20]})
    return len(seen)


def _body_text(payload: dict) -> str:
    """Prefers text/plain parts; falls back to stripped HTML."""
    plain, rich = [], []

    def walk(p):
        mt, data = p.get("mimeType", ""), (p.get("body") or {}).get("data")
        if data:
            txt = base64.urlsafe_b64decode(data + "===").decode("utf-8", errors="ignore")
            (plain if mt == "text/plain" else rich if mt == "text/html" else []).append(txt)
        for c in p.get("parts", []) or []:
            walk(c)

    walk(payload)
    if plain:
        text = "\n".join(plain)
    else:
        text = re.sub(r"<(script|style)[^>]*>.*?</\1>", " ", "\n".join(rich), flags=re.S | re.I)
        text = html.unescape(re.sub(r"<[^>]+>", " ", text))
    # drop quoted replies so old threads aren't re-detected
    text = re.split(r"\n(?:On .{5,80} wrote:|-{2,} ?Original Message ?-{2,}|From: .+\nSent: )", text)[0]
    return re.sub(r"[ \t]+", " ", re.sub(r"\n{3,}", "\n\n", text)).strip()


def _sync_gmail(uid: str, user: dict, headers: dict) -> tuple[int, int]:
    from .ingest import _chunk_doc, classify_signals

    q = "newer_than:14d -category:promotions -category:social -category:forums -in:spam -in:trash"
    r = requests.get("https://gmail.googleapis.com/gmail/v1/users/me/messages", headers=headers, timeout=30, params={"q": q, "maxResults": 100})
    r.raise_for_status()
    ids = [m["id"] for m in r.json().get("messages", [])]
    known = {s.id for s in db.collection("external_items").where(filter=FieldFilter("uid", "==", uid)).stream()}
    new = [i for i in ids if f"{uid}_gmail_{i}" not in known][:MAX_EMAILS_PER_SYNC]
    promises = 0
    for mid in new:
        m = requests.get(f"https://gmail.googleapis.com/gmail/v1/users/me/messages/{mid}", headers=headers, timeout=30, params={"format": "full"}).json()
        h = {x["name"].lower(): x["value"] for x in (m.get("payload") or {}).get("headers", [])}
        sender = h.get("from", "")
        sender_name = re.sub(r"\s*<.*>", "", sender).strip('" ') or sender
        subject = h.get("subject", "(no subject)")[:200]
        sent_at = datetime.fromtimestamp(int(m.get("internalDate", "0")) / 1000, TZ)
        text = _body_text(m.get("payload") or {})[:6000]
        item_id = f"{uid}_gmail_{mid}"
        item = {"uid": uid, "org_id": user["org_id"], "provider": "gmail", "kind": "email", "subject": subject, "from": sender[:200],
                "from_name": sender_name[:120], "to": h.get("to", "")[:300], "ts": sent_at, "snippet": html.unescape(m.get("snippet", ""))[:300],
                "url": f"https://mail.google.com/mail/u/0/#all/{m.get('threadId', mid)}", "promise": None, "task_id": None, "dismissed": False}
        sig = classify_signals(f"Subject: {subject}\n{text[:3000]}", sender_name, sent_at, {"members": [uid]}) if text else None
        if sig and sig.is_commitment and sig.confidence >= 0.7 and sig.action:
            item["promise"] = {"committer": sig.committer, "action": sig.action, "due_at": ai.parse_iso(sig.due_at), "confidence": round(sig.confidence, 2)}
            promises += 1
        db.collection("external_items").document(item_id).set(item)
        if text:
            body = f"Email from {sender_name} — {subject}\n{text[:1500]}"
            _chunk_doc(f"mail_{mid}_{uid}"[:400], text=body, embed_text=body, members=[uid],
                       chat={"id": f"mail_{uid}", "name": "Email", "org_id": user["org_id"]}, recheck=False,
                       extra={"source_type": "email", "sender_name": sender_name, "ts": sent_at, "ref": f"mail:{item_id}", "file_name": subject})
    return len(new), promises


# ---------------- email promises -> tasks ----------------

def _item_for(item_id: str, user: dict):
    ref = db.collection("external_items").document(item_id)
    snap = ref.get()
    if not snap.exists or snap.get("uid") != user["uid"]:
        raise HTTPException(404, "Item not found")
    return ref, snap.to_dict()


@router.post("/items/{item_id}/track")
def track_email_promise(item_id: str, user=Depends(current_user)):
    from .main import new_task

    ref, it = _item_for(item_id, user)
    if it.get("task_id"):
        return {"task_id": it["task_id"]}
    p = it.get("promise") or {}
    mine = (p.get("committer") or "").split()[:1] == user["name"].split()[:1]
    title = p.get("action") if mine else f"Follow up: {p.get('committer') or it.get('from_name')} — {p.get('action') or it.get('subject')}"
    task_id = new_task(user, title or it["subject"], due_at=p.get("due_at"), kind="promise", source_ref=f"mail:{item_id}", counterparty=p.get("committer"))
    ref.update({"task_id": task_id})
    return {"task_id": task_id}


@router.post("/items/{item_id}/dismiss")
def dismiss_email_promise(item_id: str, user=Depends(current_user)):
    ref, _ = _item_for(item_id, user)
    ref.update({"dismissed": True})
    return {"ok": True}
