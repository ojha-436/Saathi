import logging
import re
import time
import uuid
from datetime import datetime

from fastapi import Header, HTTPException

from .config import FILES_BUCKET, LOCAL_MODE, PROJECT, TZ

if LOCAL_MODE:
    from .localdb import DistanceMeasure, FieldFilter, LocalBucket, LocalDB, Vector, firestore  # noqa: F401

    db = LocalDB()
    bucket = LocalBucket()

    class _LocalAuth:
        """Stand-in for firebase_admin.auth: accounts live in the local `_auth` collection and tokens are HMAC-signed."""

        class UserNotFoundError(Exception):
            pass

        def _secret(self) -> bytes:
            from .config import CRON_SECRET

            return ("saathi-local-auth:" + CRON_SECRET).encode()

        def _hash_pw(self, password: str, salt: str | None = None) -> str:
            import hashlib
            import secrets

            salt = salt or secrets.token_hex(8)
            digest = hashlib.pbkdf2_hmac("sha256", password.encode(), salt.encode(), 100_000).hex()
            return f"pbkdf2:{salt}:{digest}"

        def _check_pw(self, stored: str, password: str) -> bool:
            import hmac

            if (stored or "").startswith("pbkdf2:"):
                _, salt, _ = stored.split(":", 2)
                return hmac.compare_digest(stored, self._hash_pw(password, salt))
            return hmac.compare_digest(stored or "", password)

        def issue_token(self, uid: str) -> str:
            import hashlib
            import hmac

            rec = self._rec(uid) or {}
            ver = int(rec.get("token_version") or 0)
            sig = hmac.new(self._secret(), f"{uid}:{ver}".encode(), hashlib.sha256).hexdigest()[:24]
            return f"local:{uid}:{ver}:{sig}"

        def _ref(self, uid: str):
            return db.collection("_auth").document(uid)

        def _rec(self, uid: str):
            snap = self._ref(uid).get()
            return snap.to_dict() if snap.exists else None

        def verify_id_token(self, token: str, *a, **k) -> dict:
            import hashlib
            import hmac

            if not token.startswith("local:"):
                raise ValueError("invalid local token")
            parts = token.split(":")
            uid = parts[1] if len(parts) >= 2 else ""
            rec = self._rec(uid) if uid else None
            if not rec or rec.get("disabled"):
                raise ValueError("invalid local token")
            ver = int(rec.get("token_version") or 0)
            if len(parts) == 4:
                expected = hmac.new(self._secret(), f"{uid}:{ver}".encode(), hashlib.sha256).hexdigest()[:24]
                if parts[2] != str(ver) or not hmac.compare_digest(parts[3], expected):
                    raise ValueError("invalid local token")
            elif ver > 0:
                raise ValueError("revoked local token")
            return {"uid": uid, "email": rec["email"], "name": rec.get("name", ""), "email_verified": True, "picture": "",
                    "firebase": {"sign_in_provider": "password"}, **(rec.get("claims") or {})}

        def get_user(self, uid: str):
            rec = self._rec(uid)
            if not rec:
                raise self.UserNotFoundError(uid)
            return type("U", (), {"uid": uid, "email": rec["email"], "display_name": rec.get("name", "")})()

        def get_user_by_email(self, email: str):
            for s in db.collection("_auth").where("email", "==", email.strip().lower()).limit(1).stream():
                return self.get_user(s.id)
            raise self.UserNotFoundError(email)

        def create_user(self, uid: str | None = None, email: str = "", password: str = "", display_name: str = "", **_):
            uid = uid or "u_" + uuid.uuid4().hex[:16]
            self._ref(uid).set({"email": email.lower(), "password": self._hash_pw(password), "name": display_name, "disabled": False, "claims": {}, "token_version": 0})
            return type("U", (), {"uid": uid})()

        def update_user(self, uid: str, email: str | None = None, password: str | None = None, display_name: str | None = None, disabled: bool | None = None, **_):
            if not self._rec(uid):
                raise self.UserNotFoundError(uid)
            changes = {k: v for k, v in {"email": email.lower() if email else None, "password": self._hash_pw(password) if password else None, "name": display_name, "disabled": disabled}.items() if v is not None}
            if changes:
                self._ref(uid).update(changes)

        def delete_user(self, uid: str):
            self._ref(uid).delete()

        def set_custom_user_claims(self, uid: str, claims: dict):
            if self._rec(uid):
                self._ref(uid).update({"claims": claims})

        def revoke_refresh_tokens(self, uid: str):
            rec = self._rec(uid)
            if rec:
                self._ref(uid).update({"token_version": int(rec.get("token_version") or 0) + 1})

        def login(self, email: str, password: str) -> str | None:
            for s in db.collection("_auth").where("email", "==", email.strip().lower()).stream():
                if self._check_pw(s.get("password") or "", password) and not s.get("disabled"):
                    return s.id
            return None

    auth = _LocalAuth()
else:
    import firebase_admin
    from firebase_admin import auth, firestore  # noqa: F401
    from google.cloud import storage
    from google.cloud.firestore_v1.base_query import FieldFilter  # noqa: F401
    from google.cloud.firestore_v1.base_vector_query import DistanceMeasure  # noqa: F401
    from google.cloud.firestore_v1.vector import Vector  # noqa: F401

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

# What a guest may do besides reading and writing in their channels (admins change these per guest)
GUEST_DEFAULTS = {"dm": True, "ai": True}


def memberships_of(data: dict) -> dict[str, dict]:
    """Every workspace a person belongs or belonged to: org_id -> {org_role, guest, until, ended, ...}.
    `org_id`/`org_role` on the user document are the workspace they're in right now. Accounts from before people could be in
    several workspaces have only those two fields, which are then their one membership."""
    out = {k: dict(v) for k, v in (data.get("memberships") or {}).items()}
    if data.get("org_id") and data["org_id"] not in out:
        out[data["org_id"]] = {"org_role": data.get("org_role") or "member"}
    return out


def membership_live(m: dict | None, at: datetime | None = None) -> bool:
    """Not removed and not past its end date (guests can have one)."""
    if not m or m.get("ended"):
        return False
    until = m.get("until")
    return not until or until > (at or datetime.now(TZ))


def in_org(profile: dict, org_id: str) -> bool:
    return bool(org_id) and membership_live(profile.get("memberships", {}).get(org_id))


def role_in(profile: dict, org_id: str) -> str:
    """A person's role in a given workspace ("" if they aren't in it). Use this, not profile["org_role"], for anyone but the caller:
    org_role is the role in whichever workspace that person has open right now."""
    return (profile.get("memberships", {}).get(org_id) or {}).get("org_role", "")


def user_profile(uid: str) -> dict:
    hit = _profiles.get(uid)
    if hit and time.monotonic() - hit[0] < _PROFILE_TTL:
        return hit[1]
    snap = db.collection("users").document(uid).get()
    data = snap.to_dict() or {}
    ms = memberships_of(data)
    here = ms.get(data.get("org_id", "")) or {}
    profile = {
        "uid": uid, "name": data.get("name", "Unknown"), "role": data.get("role", ""), "email": data.get("email", ""),
        "org_id": data.get("org_id", ""), "org_role": here.get("org_role") or data.get("org_role", ""), "deactivated": bool(data.get("deactivated")),
        "memberships": ms, "guest": {**GUEST_DEFAULTS, **(here.get("guest") or {})}, "until": here.get("until"),
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


# A missing IAM role once turned every request into "Invalid token" (2026-10-15): only real token problems are a 401.
_BAD_TOKEN = (ValueError,) if LOCAL_MODE else (ValueError, auth.InvalidIdTokenError, auth.UserDisabledError)


async def current_user(authorization: str = Header(default="")) -> dict:
    if not authorization.startswith("Bearer "):
        raise HTTPException(401, "Missing bearer token")
    return user_from_token(authorization[7:])


def decode_token(token: str) -> dict:
    """Verifies a Firebase ID token (signature, expiry, revocation, disabled account). Email verification is the caller's check."""
    try:
        return auth.verify_id_token(token, check_revoked=True)
    except _BAD_TOKEN as e:  # malformed, expired, revoked or disabled: the caller has to sign in again
        log.info("token rejected: %s", type(e).__name__)
        raise HTTPException(401, "Invalid token")
    except Exception as e:  # our side failed (IAM, network, key fetch): log it loudly and don't tell the client to sign out
        log.error("token verification failed: %s: %s", type(e).__name__, str(e)[:300])
        raise HTTPException(503, "Couldn't verify your sign-in right now. Please try again in a moment.")


def user_from_token(token: str) -> dict:
    """Verifies a Firebase ID token and returns the caller's profile (also used by WebSockets, which can't send headers)."""
    decoded = decode_token(token)
    email = (decoded.get("email") or "").lower()
    if not decoded.get("email_verified") and not email.endswith("@saathi.demo"):
        raise HTTPException(403, "verify-email: Please verify your email address before accessing the workspace.")
    profile = user_profile(decoded["uid"])
    if not profile["org_id"]:
        if not db.collection("users").document(decoded["uid"]).get().exists:
            from .invites import join  # first sign-in: invite, verified domain, or a new workspace

            join(decoded)
            profile = user_profile(decoded["uid"])
        else:
            raise HTTPException(403, "Your account isn't part of a workspace yet. Ask your admin for an invite.")
    if profile["deactivated"]:
        raise HTTPException(401, "This account has been deactivated by your workspace admin.")
    if not in_org(profile, profile["org_id"]):  # their guest access ran out, or an admin removed them, while it was open
        from .workspaces import leave_ended

        profile = leave_ended(profile)
    return profile


def require_admin(user: dict) -> None:
    if user.get("org_role") not in ("owner", "admin"):
        raise HTTPException(403, "Only workspace admins can do that")


def same_org(user: dict, uids: list[str]) -> list[str]:
    """Keeps only active users from the caller's workspace (protects every member picker on the server side). People who
    belong to several workspaces count wherever they are a member, whichever workspace they have open."""
    out = []
    for u in dict.fromkeys(uids):
        p = user_profile(u)
        if in_org(p, user["org_id"]) and not p["deactivated"] and p["name"] != "Unknown":
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
