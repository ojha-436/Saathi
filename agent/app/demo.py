"""The shared demo logins (prince, amit, neha, rahul, suresh, kavya @saathi.demo).

Their password is on the login page, so anyone can be them. They can try every flow, but not change what the next person
trying Saathi depends on: the demo sign-ins themselves (password, email, sessions, name, photo), other people's access and
roles, or the workspace's settings. Prince stays the demo admin so the admin console can be shown; it's look-only apart
from inviting a member or guest.

Firebase lets a signed-in user change their own password or email, or delete their account, straight from the browser,
which no API check can stop. So the minute-by-minute cron puts a demo sign-in back the moment that happens."""
import logging

from fastapi import HTTPException

from .config import LOCAL_MODE, TZ
from .firebase import DEMO_USERS as USERS, auth, db, set_claims, user_profile

log = logging.getLogger("saathi.demo")

DOMAIN = "@saathi.demo"
PASSWORD = "Saathi@2026"  # not a secret: the login page shows it to everyone
LOOK_ONLY = "Demo logins are shared by everyone trying Saathi, so they can look around here but not change it."


def is_demo(user: dict) -> bool:
    """One of the shared demo logins (the ones whose password is public)."""
    return user.get("uid") in USERS


def guard(user: dict, message: str = LOOK_ONLY) -> None:
    if is_demo(user):
        raise HTTPException(403, message)


# ---------------- keeping the demo sign-ins working ----------------

def _state(u) -> dict:
    """What a password or email change, or a deleted account, would alter."""
    return {"email": (u.email or "").lower(), "password": "password" in {p.provider_id for p in u.provider_data},
            "password_at": (getattr(u, "_data", None) or {}).get("passwordUpdatedAt"), "valid_after": u.tokens_valid_after_timestamp}


def heal() -> list[str]:
    """Puts back any demo sign-in someone changed (password, email, password sign-in removed, account deleted).
    Leaves accounts alone otherwise: resetting a password signs that persona out everywhere."""
    if LOCAL_MODE:
        return []
    from datetime import datetime

    ref = db.collection("system").document("demo_logins")
    seen = ref.get().to_dict() or {}
    fixed, update = [], {}
    for uid in USERS:
        email = f"{uid}{DOMAIN}"
        try:
            try:
                u = auth.get_user(uid)
            except auth.UserNotFoundError:
                if not db.collection("users").document(uid).get().exists:
                    continue  # this deployment has no demo workspace
                p = user_profile(uid)
                auth.create_user(uid=uid, email=email, password=PASSWORD, display_name=p["name"])
                if p["org_id"]:
                    set_claims(uid, p["org_id"], p["org_role"] or "member")
                fixed.append(uid)
                update[uid] = _state(auth.get_user(uid))
                continue
            now = _state(u)
            before = seen.get(uid)
            if now["email"] == email and now["password"] and (before is None or before == now):
                if before is None:
                    update[uid] = now  # first look: remember how it is
                continue
            auth.update_user(uid, email=email, password=PASSWORD)
            fixed.append(uid)
            update[uid] = _state(auth.get_user(uid))
        except Exception:
            log.exception("demo login check failed for %s", uid)
    if update:
        ref.set({**seen, **update, "checked_at": datetime.now(TZ)})
    if fixed:
        log.warning("demo logins restored: %s", ", ".join(fixed))
    return fixed
