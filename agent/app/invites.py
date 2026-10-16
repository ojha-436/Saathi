"""Workspace invites: personal links, invite emails, and joining a workspace.

An invite is `invites/{id}` (server-only, see firestore.rules). Its link is `{WEB_URL}/invite/{id}.{secret}`. Only SHA-256
hashes of secrets are stored, newest first and at most MAX_LINKS, so a fresh link (a resend, or one copied for WhatsApp)
never breaks a link that was already sent. Opening a link only shows the invite; joining needs a sign-in with the invited
email, so mail scanners that pre-open links (Safe Links, Mimecast) can't use an invite up.
Invites from before links existed (doc id = the email) still work through plain sign-up."""
import hashlib
import hmac
import html
import logging
import re
import secrets
import smtplib
import socket
import time
import uuid
from datetime import datetime, timedelta

from fastapi import APIRouter, Header, HTTPException, Request
from pydantic import BaseModel

from . import mailer, workspaces
from .config import LOCAL_MODE, SIGNUP_DOMAINS, TZ, WEB_URL
from .firebase import (
    GUEST_DEFAULTS, PUBLIC_DOMAINS, FieldFilter, _workspace_name, audit, auth, db, decode_token, ensure_general, firestore,
    forget_profile, membership_live, memberships_of, set_claims,
)

log = logging.getLogger("saathi.invites")
router = APIRouter(prefix="/api/invites")

INVITE_DAYS = 14
MAX_LINKS = 5
RESEND_COOLDOWN = 30  # seconds between invite emails to one person (double clicks, impatient retries)
# Shown under the invite page's heading ("This invite has expired", ...), so they say what to do next
STATE_TEXT = {
    "invalid": "It may be mistyped or cut short. Ask the person who invited you to send it again.",
    "expired": "Invites last 14 days. Ask {inviter} to send you a new one.",
    "revoked": "{inviter} withdrew it. Ask them if you still need access.",
    "accepted": "Sign in to open {workspace}.",
}


def new_id() -> str:
    return "inv_" + uuid.uuid4().hex[:16]


def norm_email(email: str) -> str:
    """Gmail ignores dots and anything after '+': R.Kumar@gmail.com and rkumar+x@googlemail.com are one mailbox."""
    email = (email or "").strip().lower()
    local, _, domain = email.partition("@")
    if domain in ("gmail.com", "googlemail.com"):
        return local.split("+", 1)[0].replace(".", "") + "@gmail.com"
    return email


def _hash(secret: str) -> str:
    return hashlib.sha256(secret.encode()).hexdigest()


def email_of(snap) -> str:
    return (snap.to_dict() or {}).get("email") or snap.id  # older invites are stored under the email itself


def state_of(d: dict) -> str:
    """valid | expired | accepted | revoked"""
    status = d.get("status", "pending")
    if status != "pending":
        return status
    exp = d.get("expires_at")
    return "expired" if exp and exp < datetime.now(TZ) else "valid"


def new_link(ref) -> str:
    """Adds a link to an invite and renews its expiry. Returns the link's path (/invite/...). Earlier links keep working."""
    secret = secrets.token_urlsafe(24)
    hashes = [_hash(secret)] + list((ref.get().to_dict() or {}).get("token_hashes") or [])
    ref.update({"token_hashes": hashes[:MAX_LINKS], "expires_at": datetime.now(TZ) + timedelta(days=INVITE_DAYS)})
    return f"/invite/{ref.id}.{secret}"


def find_by_link(token: str):
    """(snapshot, state) for a link token; (None, "invalid") when it doesn't match an invite."""
    inv_id, _, secret = (token or "").partition(".")
    if not re.fullmatch(r"inv_[a-f0-9]{16}", inv_id) or not re.fullmatch(r"[A-Za-z0-9_-]{20,64}", secret):
        return None, "invalid"
    snap = db.collection("invites").document(inv_id).get()
    h = _hash(secret)
    if not snap.exists or not any(hmac.compare_digest(h, x) for x in (snap.to_dict() or {}).get("token_hashes") or []):
        return None, "invalid"
    return snap, state_of(snap.to_dict())


def pending_for(email: str):
    """The pending invite for this email (valid ones first, then newest), from any workspace, older invites included."""
    found = [s for s in db.collection("invites").where(filter=FieldFilter("email_norm", "==", norm_email(email))).stream()
             if s.to_dict().get("status") == "pending"]
    legacy = db.collection("invites").document(email).get()
    if legacy.exists and legacy.to_dict().get("status") == "pending":
        found.append(legacy)
    oldest = datetime.min.replace(tzinfo=TZ)
    found.sort(key=lambda s: (state_of(s.to_dict()) == "valid", s.to_dict().get("created_at") or oldest), reverse=True)
    return found[0] if found else None


def has_others(org_id: str, uid: str) -> bool:
    """Whether anyone besides `uid` is active in the workspace."""
    return any(u != uid and not d.get("deactivated") for u, d in workspaces.org_people(org_id).items())


def guest_terms(d: dict) -> dict:
    """A guest invite's access: {dm, ai} and how long (days after joining, or a fixed end date)."""
    until = d.get("access_until")
    return {"guest": {**GUEST_DEFAULTS, **(d.get("guest") or {})}, "access_days": d.get("access_days"),
            "access_until": until.isoformat() if until else None}


def _access_text(d: dict) -> str:
    t = guest_terms(d)
    if t["access_until"]:
        period = f"Your access lasts until {workspaces.when(d['access_until'])}."
    elif t["access_days"]:
        period = f"Your access lasts {t['access_days']} days from when you join."
    else:
        period = ""
    can = ["post in those channels"] + (["message the people in them directly"] if t["guest"]["dm"] else []) + \
          (["ask Saathi about them"] if t["guest"]["ai"] else [])
    return f"You can {', '.join(can[:-1]) + ' and ' + can[-1] if len(can) > 1 else can[0]}. {period}".strip()


def account_kind(email: str) -> str:
    """none | password | google | both: lets the invite page offer "create" or "sign in" first."""
    if LOCAL_MODE:
        return "password" if list(db.collection("_auth").where(filter=FieldFilter("email", "==", email)).limit(1).stream()) else "none"
    try:
        u = auth.get_user_by_email(email)
    except auth.UserNotFoundError:
        return "none"
    except Exception:
        log.exception("account lookup failed")
        return "none"
    providers = {p.provider_id for p in u.provider_data}
    kinds = [k for k, p in (("password", "password"), ("google", "google.com")) if p in providers]
    return "both" if len(kinds) == 2 else (kinds[0] if kinds else "password")


# ---------------- invite email ----------------

def _channels_text(names: list[str]) -> str:
    return ", ".join(f"#{n}" for n in names)


def _email_parts(d: dict, org_name: str, link: str) -> tuple[str, str, str]:
    inviter = re.sub(r"\s+", " ", d.get("invited_by_name") or "").strip() or "A colleague"
    org_name = re.sub(r"\s+", " ", org_name).strip()
    role, chans = d.get("org_role", "member"), d.get("channel_names") or []
    exp = d["expires_at"].astimezone(TZ)
    until = f"{exp.day} {exp:%b %Y}"
    if role == "guest":
        access = f"As a guest you'll see only {_channels_text(chans)}. Nothing else in the workspace is visible to you. {_access_text(d)}"
    else:
        access = f"You'll join as {'an admin' if role == 'admin' else 'a member'}" + (f" and be added to {_channels_text(chans)}." if chans else ".")
    subject = f"{inviter} invited you to {org_name} on Saathi"
    text = (
        f"{inviter} invited you to join {org_name} on Saathi, the team workspace with an AI colleague.\n\n{access}\n\n"
        f"Accept the invite:\n{link}\n\n"
        f"Use this email address to sign in or create your account: {d['email']}\n"
        f"The link works until {until}. If you weren't expecting this, you can ignore this email.\n"
    )
    e = html.escape
    body = f"""<!doctype html><html><body style="margin:0;background:#f4f1ef;font-family:Arial,Helvetica,sans-serif;color:#1b2430">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f1ef;padding:24px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e3ddd8">
<tr><td style="background:#1d3954;padding:18px 24px;color:#ffffff;font-size:18px;font-weight:bold">Saathi</td></tr>
<tr><td style="padding:24px">
<p style="margin:0 0 6px;font-size:13px;color:#b8641a;font-weight:bold;text-transform:uppercase;letter-spacing:1px">You're invited</p>
<h1 style="margin:0 0 14px;font-size:22px;line-height:1.3">{e(inviter)} invited you to <span style="white-space:nowrap">{e(org_name)}</span></h1>
<p style="margin:0 0 20px;font-size:15px;line-height:1.5;color:#3b4654">{e(access)}</p>
<table role="presentation" cellpadding="0" cellspacing="0"><tr><td style="border-radius:8px;background:#1d3954">
<a href="{e(link)}" style="display:inline-block;padding:13px 26px;color:#ffffff;font-size:15px;font-weight:bold;text-decoration:none">Accept invite</a>
</td></tr></table>
<p style="margin:22px 0 0;font-size:14px;line-height:1.5;color:#3b4654">Sign in or create your account with <b>{e(d['email'])}</b>. Another email address won't be able to accept this invite.</p>
<p style="margin:14px 0 0;font-size:12px;line-height:1.5;color:#6b7480">The link works until {e(until)}. If the button doesn't work, copy this address into your browser:<br>
<a href="{e(link)}" style="color:#1d3954;word-break:break-all">{e(link)}</a></p>
</td></tr>
<tr><td style="padding:14px 24px;border-top:1px solid #eee7e1;font-size:12px;color:#6b7480">Not expecting this? You can ignore this email; nothing happens until you accept.</td></tr>
</table></td></tr></table></body></html>"""
    return subject, text, body


def _mail_error(e: Exception) -> str:
    # SMTP errors are OSErrors too, so the specific ones come first or every refusal would read as "didn't respond"
    if isinstance(e, smtplib.SMTPRecipientsRefused):
        return "The mail server refused this address. Check it for typos."
    if isinstance(e, smtplib.SMTPAuthenticationError):
        return "Saathi couldn't sign in to its mailbox (the app password may have been revoked). Share the link yourself for now."
    if isinstance(e, smtplib.SMTPResponseException):
        said = e.smtp_error.decode(errors="replace") if isinstance(e.smtp_error, bytes) else str(e.smtp_error)
        if "5.4.5" in said or "sending limit" in said.lower() or "quota" in said.lower():  # Gmail: about 500 a day
            return "Saathi's mailbox reached its daily sending limit. Share the link yourself; email works again within a day."
        if 400 <= e.smtp_code < 500:
            return "The mail server is busy. Try again in a few minutes."
        if isinstance(e, smtplib.SMTPSenderRefused):
            return "The mail server won't send from Saathi's address. Check MAIL_FROM."
        return "The email couldn't be sent. Try again, or share the link yourself."
    if isinstance(e, (socket.timeout, TimeoutError, ConnectionError, OSError)):
        return "The mail server didn't respond. Try again in a minute."
    return "The email couldn't be sent. Try again, or share the link yourself."


def deliver(ref, org_name: str, path: str) -> dict:
    """Emails the link and records the outcome on the invite. Never raises: the admin always gets the link to share."""
    d = ref.get().to_dict()
    if not mailer.enabled():
        if LOCAL_MODE:
            log.warning("invite email not sent (SMTP not configured): %s -> %s%s", d["email"], WEB_URL, path)
        out = {"status": "off"}
    else:
        try:
            subject, text, body = _email_parts(d, org_name, WEB_URL + path)
            mailer.send(d["email"], subject, text, body, reply_to=d.get("invited_by_email"), sender_name=d.get("invited_by_name"))
            out = {"status": "sent"}
        except Exception as e:
            log.warning("invite email to %s failed: %s: %s", d["email"], type(e).__name__, str(e)[:200])
            out = {"status": "failed", "error": _mail_error(e)}
    out["at"] = datetime.now(TZ)
    ref.update({"delivery": out, **({"emails_sent": firestore.Increment(1)} if out["status"] == "sent" else {})})
    return out


def recently_emailed(d: dict) -> bool:
    last = d.get("delivery") or {}
    return last.get("status") == "sent" and bool(last.get("at")) and (datetime.now(TZ) - last["at"]).total_seconds() < RESEND_COOLDOWN


# ---------------- joining ----------------

# Where a person's access lives; a move out of a workspace removes them from all of it (the content itself is kept)
_ACCESS = {"chats": ("members", "owners"), "files": ("members",), "decisions": ("members",), "handovers": ("members",),
           "chunks": ("members",), "tasks": ("participants",), "meetings": ("participants",), "records": ("participants",)}


def _leave_solo_workspace(uid: str, old_org: str, new_org: str) -> None:
    """Moves someone out of a workspace nobody else uses (typically one made by signing up before the invite arrived):
    their access to it ends and it is archived. Its content stays; nothing is deleted."""
    for col, fields in _ACCESS.items():
        for s in db.collection(col).where(filter=FieldFilter(fields[0], "array_contains", uid)).stream():
            d = s.to_dict() or {}
            if d.get("org_id") == new_org:
                continue
            s.reference.update({f: firestore.ArrayRemove([uid]) for f in fields if f in d})
    for s in db.collection("notifications").where(filter=FieldFilter("uid", "==", uid)).stream():
        if s.to_dict().get("org_id") == old_org:
            s.reference.delete()
    for s in db.collection("invites").where(filter=FieldFilter("org_id", "==", old_org)).stream():
        if s.to_dict().get("status") == "pending":
            s.reference.update({"status": "revoked"})
    try:  # connected Google data was read under the old workspace's settings; reconnecting is one click
        from .connectors import disconnect_user

        disconnect_user(uid)
    except Exception:
        log.exception("disconnect on workspace move failed for %s", uid)
    db.collection("orgs").document(old_org).update(
        {"archived": True, "archived_at": firestore.SERVER_TIMESTAMP, "moved_to": new_org, "domains": []})


def _org_name(org_id: str) -> str:
    return (db.collection("orgs").document(org_id).get().to_dict() or {}).get("name", "the workspace")


def _when(v) -> str:
    v = v.astimezone(TZ)
    return f"{v.day} {v:%b %Y}"


def join(decoded: dict, invite=None, move: bool = False, keep: bool = False) -> None:
    """Puts a signed-in person into a workspace. On first sign-in: a pending invite for this email, else a workspace that
    claimed this verified domain, else a new workspace. From an invite link: that invite. Someone who already uses Saathi
    keeps their workspace and gains this one; `move` instead leaves a workspace nobody else uses, `keep` keeps it."""
    uid = decoded["uid"]
    email = (decoded.get("email") or "").lower()
    domain = email.rsplit("@", 1)[-1]
    if not decoded.get("email_verified") and not email.endswith("@saathi.demo"):
        raise HTTPException(403, "verify-email: Please verify your email address to access your workspace.")
    name = (decoded.get("name") or email.split("@")[0].replace(".", " ").title() or "New colleague").strip()[:80]

    inv = invite or (pending_for(email) if email else None)
    inv_data = inv.to_dict() if inv else None
    lapsed = None
    if inv_data and state_of(inv_data) != "valid":
        lapsed, inv, inv_data = inv_data, None, None

    org_id, org_role, channels = "", "member", []
    if inv_data:  # an invite is the admin's decision, so it goes ahead of the domain allow-list
        org_id, org_role = inv_data["org_id"], inv_data.get("org_role", "member")
        for cid in inv_data.get("channel_ids") or []:
            snap = db.collection("chats").document(cid).get()
            if snap.exists and snap.to_dict().get("org_id") == org_id:
                channels.append(snap)
        if org_role == "guest" and not channels:
            raise HTTPException(409, f"The channels you were invited to no longer exist. Ask {inv_data.get('invited_by_name') or 'your admin'} to invite you again.")
    else:
        if SIGNUP_DOMAINS and domain not in SIGNUP_DOMAINS:
            raise HTTPException(403, "Your organisation hasn't enabled Saathi for this email domain. Sign in with your work account.")
        if domain and domain not in PUBLIC_DOMAINS:
            hit = [s for s in db.collection("orgs").where(filter=FieldFilter("domains", "array_contains", domain)).limit(3).get() if not s.to_dict().get("archived")]
            if hit:
                org_id = hit[0].id
        if not org_id and lapsed:  # don't quietly give them an empty workspace of their own instead
            raise HTTPException(403, f"invite-expired: Your invitation to {_org_name(lapsed['org_id'])} expired on {_when(lapsed['expires_at'])}. "
                                     f"Ask {lapsed.get('invited_by_name') or 'your admin'} to send you a new one.")

    guest, until = None, None
    if inv_data and org_role == "guest":
        terms = inv_data.get("guest") or {}
        guest = {**GUEST_DEFAULTS, **terms}
        until = inv_data.get("access_until") or (datetime.now(TZ) + timedelta(days=inv_data["access_days"]) if inv_data.get("access_days") else None)
        channels = [c for c in channels if not c.to_dict().get("default")]  # never company-wide, even from an older invite
        if not channels:
            raise HTTPException(409, f"The channels you were invited to aren't open to guests. Ask {inv_data.get('invited_by_name') or 'your admin'} to invite you again.")

    snap = db.collection("users").document(uid).get()
    old = snap.to_dict() if snap.exists else None
    old_ms = memberships_of(old) if old else {}
    inviter = {"uid": inv_data.get("invited_by"), "name": inv_data.get("invited_by_name")} if inv_data else None
    # new: first account | same: already in this workspace | rejoin: their access here had ended | add: a second workspace
    # move: leave an empty workspace of their own for this one
    mode = "new"
    if old and old_ms and org_id:
        if org_id in old_ms:
            mode = "same" if membership_live(old_ms[org_id]) else "rejoin"
        elif len([o for o, m in old_ms.items() if membership_live(m)]) <= 1 and not has_others(old.get("org_id", ""), uid) and not keep:
            if not move:
                raise HTTPException(409, {"code": "move_required", "workspace": _org_name(old["org_id"]),
                                          "message": "Your account has its own workspace that nobody else uses. Move your account here, "
                                                     "or keep that workspace as well and switch between them."})
            mode = "move"
        else:
            mode = "add"

    if not org_id:
        org_id, org_role = "org_" + uuid.uuid4().hex[:16], "owner"
        db.collection("orgs").document(org_id).set(
            {"name": _workspace_name(email, name), "domains": [], "created_by": uid, "created_at": firestore.SERVER_TIMESTAMP,
             "settings": {"channel_creation": "everyone", "ai_enabled": True}}
        )
    membership = {"org_role": org_role, "joined_at": datetime.now(TZ)}
    if org_role == "guest":
        membership.update({"guest": guest or dict(GUEST_DEFAULTS), "until": until})
    if inviter and inviter["uid"]:
        membership.update({"invited_by": inviter["uid"], "invited_by_name": inviter["name"]})

    if mode == "same":  # already here (an invite opened twice): keep their role; admins change roles in Members
        org_role = old_ms[org_id].get("org_role") or org_role
        name = old.get("name") or name
        if old.get("org_id") != org_id:
            workspaces.switch(uid, org_id)
    elif mode == "rejoin":
        name = old.get("name") or name
        workspaces.restore(uid, org_id, org_role=org_role, guest=membership.get("guest"), until=membership.get("until"))
        workspaces.switch(uid, org_id)
    elif mode == "add":
        name = old.get("name") or name
        workspaces.add(uid, org_id, org_role, guest=membership.get("guest"), until=membership.get("until"), invited_by=inviter)
    else:
        if mode == "move":
            _leave_solo_workspace(uid, old["org_id"], org_id)
            audit({"uid": uid, "name": old.get("name", name), "org_id": old["org_id"]}, "user.left", old["org_id"], moved_to=org_id)
        profile = {"name": name, "role": "", "email": email, "photo": decoded.get("picture", ""), "org_id": org_id, "org_role": org_role,
                   "provider": (decoded.get("firebase") or {}).get("sign_in_provider", ""), "created_at": firestore.SERVER_TIMESTAMP,
                   "memberships": {org_id: membership}, "orgs": [org_id], "all_orgs": [org_id],
                   "access_next_end": membership.get("until")}
        if old:  # moving: keep who they are
            profile.update({k: old[k] for k in ("name", "role", "photo", "created_at") if old.get(k)})
            name = profile["name"]
        db.collection("users").document(uid).set(profile)
        set_claims(uid, org_id, org_role)
    forget_profile(uid)
    same = mode == "same"

    if inv_data:
        inv.reference.update({"status": "accepted", "accepted_uid": uid, "accepted_at": firestore.SERVER_TIMESTAMP})
        inviter_uid, inviter_name = inv_data.get("invited_by"), inv_data.get("invited_by_name") or "an admin"
        now = datetime.now(TZ)
        line = f"{name} joined{' as a guest' if org_role == 'guest' else ''} · invited by {inviter_name}"
        for ch in channels:  # guests (and members) invited straight into channels; members see a guest arrive
            if uid in (ch.to_dict().get("members") or []):
                continue
            ch.reference.update({"members": firestore.ArrayUnion([uid]), "last_ts": now, "last_text": line[:120], "last_sender": ""})
            ch.reference.collection("messages").document().set({"sender": "system", "sender_name": "", "text": line, "ts": now, "system": True})
            for col in ("files", "decisions", "handovers"):
                for c in db.collection(col).where(filter=FieldFilter("chat_id", "==", ch.id)).stream():
                    c.reference.update({"members": firestore.ArrayUnion([uid])})
        if inviter_uid and not same:
            title = f"{name} accepted your invite"
            db.collection("notifications").add(
                {"uid": inviter_uid, "kind": "invite", "title": title, "body": f"{email} joined {_org_name(org_id)} as {org_role}.",
                 "source_ref": None, "chat_id": channels[0].id if channels else None, "task_id": None, "actor": uid, "actor_name": name,
                 "org_id": org_id, "ts": now, "read": False})
            try:
                from . import push

                push.push(inviter_uid, title, f"{email} joined as {org_role}.", tag=f"invite-{uid}")
            except Exception:
                log.exception("invite push failed")
    if org_role != "guest":
        ensure_general(org_id, uid, name)
    if not same:
        audit({"uid": uid, "name": name, "org_id": org_id}, "user.joined", org_id, org_role=org_role,
              via="invite" if inv_data else ("domain" if org_role != "owner" else "signup"), moved=mode == "move",
              second_workspace=mode == "add", rejoined=mode == "rejoin")


# ---------------- public endpoints (the invite page) ----------------

_hits: dict[str, list[float]] = {}


def _throttle(request: Request) -> None:
    ip = (request.headers.get("x-forwarded-for") or (request.client.host if request.client else "")).split(",")[0].strip()
    t = time.monotonic()
    hits = [h for h in _hits.get(ip, []) if t - h < 60]
    if len(hits) >= 30:
        raise HTTPException(429, "Too many attempts. Wait a minute.")
    _hits[ip] = hits + [t]


def _state_message(state: str, d: dict | None) -> str:
    d = d or {}
    text = STATE_TEXT[state].format(inviter=d.get("invited_by_name") or "The person who invited you", workspace=_org_name(d["org_id"]) if d.get("org_id") else "Saathi")
    return text[0].upper() + text[1:]


@router.get("/{token}")
def view(token: str, request: Request):
    """What the invite page shows. Only someone holding the link sees this."""
    _throttle(request)
    snap, state = find_by_link(token)
    if not snap:
        return {"state": "invalid", "message": STATE_TEXT["invalid"]}
    d = snap.to_dict()
    out = {"state": state, "workspace": _org_name(d["org_id"]), "inviter": d.get("invited_by_name", ""), "email": d["email"],
           "role": d.get("org_role", "member")}
    if state != "valid":
        return {**out, "message": _state_message(state, d)}
    out = {**out, "channels": d.get("channel_names", []), "expires_at": d["expires_at"].isoformat(), "account": account_kind(d["email"])}
    return {**out, **guest_terms(d)} if out["role"] == "guest" else out


class AcceptIn(BaseModel):
    move: bool = False
    keep: bool = False
    name: str = ""


@router.post("/{token}/accept")
def accept(token: str, body: AcceptIn, request: Request, authorization: str = Header(default="")):
    _throttle(request)
    if not authorization.startswith("Bearer "):
        raise HTTPException(401, "Sign in to accept this invite")
    decoded = decode_token(authorization[7:])
    snap, state = find_by_link(token)
    if state != "valid":
        raise HTTPException(410, {"code": state, "message": _state_message(state, snap.to_dict() if snap else None)})
    d = snap.to_dict()
    email = (decoded.get("email") or "").lower()
    if norm_email(email) != norm_email(d["email"]):
        raise HTTPException(403, {"code": "wrong_email", "email": d["email"],
                                  "message": f"This invite is for {d['email']}, but you're signed in as {email or 'another account'}."})
    if not decoded.get("email_verified"):
        # The link reached this mailbox (or the admin handed it to this person themselves): that is the email check
        auth.update_user(decoded["uid"], email_verified=True)
        decoded = {**decoded, "email_verified": True}
    if body.name.strip() and not decoded.get("name"):
        decoded = {**decoded, "name": body.name.strip()[:80]}
    join(decoded, invite=snap, move=body.move, keep=body.keep)
    return {"ok": True, "workspace": _org_name(d["org_id"])}
