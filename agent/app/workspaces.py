"""One account, several workspaces. A supplier's QA engineer can work in their own company's workspace and be a guest in each
customer's, with one sign-in, switching from the profile menu.

users/{uid} keeps `org_id`/`org_role`: the workspace open right now, which every other module (and the security rules, via
token claims) reads. `memberships` maps each workspace to {org_role, guest, until, ended, left_chats, ...}; `orgs` lists the
current ones and `all_orgs` every one ever joined (so admins still see people whose access ended). Saathi only ever works
inside the open workspace: search, history and AI tools are filtered to it.

Guest access can end on a date. A minute-by-minute sweep (the reminders cron) ends it: the guest is taken out of that
workspace's chats, files and records, so neither the app nor a direct database read shows them anything there. Extending
the date (or reactivating) puts them back into the same chats."""
from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from .config import TZ
from .firebase import (
    FieldFilter, audit, current_user, db, firestore, forget_profile, membership_live, memberships_of, set_claims, user_profile,
)

router = APIRouter(prefix="/api/me")

# Where a person's access to a workspace lives (the content stays when they leave; only their access goes)
ACCESS = {"chats": ("members", "owners"), "files": ("members",), "decisions": ("members",), "handovers": ("members",),
          "chunks": ("members",), "tasks": ("participants",), "meetings": ("participants",), "records": ("participants",)}


def now() -> datetime:
    return datetime.now(TZ)


def org_name(org_id: str) -> str:
    return (db.collection("orgs").document(org_id).get().to_dict() or {}).get("name", "the workspace") if org_id else "the workspace"


def when(v) -> str:
    v = v.astimezone(TZ)
    return f"{v.day} {v:%b %Y}"


def _live_orgs(ms: dict) -> list[str]:
    return [o for o, m in ms.items() if membership_live(m)]


def _next_end(ms: dict):
    ends = [m["until"] for m in ms.values() if not m.get("ended") and m.get("until")]
    return min(ends) if ends else None


def _save(ref, data: dict, ms: dict, extra: dict | None = None) -> None:
    all_orgs = sorted(set(data.get("all_orgs") or []) | set(ms))
    ref.update({"memberships": ms, "orgs": _live_orgs(ms), "all_orgs": all_orgs, "access_next_end": _next_end(ms), **(extra or {})})


def org_people(org_id: str, include_ended: bool = False) -> dict[str, dict]:
    """Everyone in a workspace, including people who have another workspace open right now. uid -> user document."""
    out = {s.id: s.to_dict() for s in db.collection("users").where(filter=FieldFilter("org_id", "==", org_id)).stream()}
    field = "all_orgs" if include_ended else "orgs"
    for s in db.collection("users").where(filter=FieldFilter(field, "array_contains", org_id)).stream():
        out.setdefault(s.id, s.to_dict())
    if include_ended:
        return out
    return {u: d for u, d in out.items() if membership_live(memberships_of(d).get(org_id))}


def ended_text(m: dict, org_id: str) -> str:
    e = m.get("ended") or {}
    name = org_name(org_id)
    if e.get("reason") == "removed":
        return f"{e.get('by_name') or 'An admin'} removed your access to {name}."
    until = e.get("at") or m.get("until")
    inviter = m.get("invited_by_name") or "the person who invited you"
    return f"Your guest access to {name} ended{' on ' + when(until) if until else ''}. Ask {inviter} to extend it."


# ---------------- changing memberships ----------------

def switch(uid: str, org_id: str) -> None:
    """Opens another of this person's workspaces. Their browser refreshes its token to pick up the new claims."""
    ref = db.collection("users").document(uid)
    data = ref.get().to_dict() or {}
    m = memberships_of(data).get(org_id)
    if not membership_live(m):
        raise HTTPException(403, "You're not a member of that workspace")
    ref.update({"org_id": org_id, "org_role": m["org_role"]})
    set_claims(uid, org_id, m["org_role"])
    forget_profile(uid)


def add(uid: str, org_id: str, org_role: str, *, guest: dict | None = None, until=None, invited_by: dict | None = None,
        open_now: bool = True) -> None:
    """Adds a workspace to an existing account (a person who already uses Saathi elsewhere accepting an invite)."""
    ref = db.collection("users").document(uid)
    data = ref.get().to_dict() or {}
    ms = memberships_of(data)
    m = {"org_role": org_role, "joined_at": now()}
    if org_role == "guest":
        m.update({"guest": guest or {}, "until": until})
    if invited_by:
        m.update({"invited_by": invited_by.get("uid"), "invited_by_name": invited_by.get("name")})
    ms[org_id] = m
    _save(ref, data, ms, {"org_id": org_id, "org_role": org_role} if open_now else None)
    if open_now:
        set_claims(uid, org_id, org_role)
    forget_profile(uid)


def end(uid: str, org_id: str, reason: str, by: dict | None = None) -> bool:
    """Ends someone's access to one workspace ("expired" or "removed"). They leave its chats, files and records (remembered,
    so restore() can put them back); the content stays. Their other workspaces are untouched."""
    ref = db.collection("users").document(uid)
    data = ref.get().to_dict() or {}
    ms = memberships_of(data)
    m = ms.get(org_id)
    if not m or m.get("ended"):
        return False
    left = []
    for col, fields in ACCESS.items():
        for s in db.collection(col).where(filter=FieldFilter(fields[0], "array_contains", uid)).stream():
            d = s.to_dict() or {}
            if d.get("org_id") != org_id:
                continue
            s.reference.update({f: firestore.ArrayRemove([uid]) for f in fields if f in d})
            if col == "chats":
                left.append(s.id)
    m["ended"] = {"at": now(), "reason": reason, "by_name": (by or {}).get("name")}
    m["left_chats"] = left
    ms[org_id] = m
    extra = None
    if data.get("org_id") == org_id:  # it was open: move them to another workspace, or leave them with nothing to read
        other = next((o for o in _live_orgs(ms)), None)
        if other:
            extra = {"org_id": other, "org_role": ms[other]["org_role"]}
            set_claims(uid, other, ms[other]["org_role"])
        else:
            set_claims(uid, "", "")
    _save(ref, data, ms, extra)
    forget_profile(uid)
    return True


def restore(uid: str, org_id: str, *, org_role: str | None = None, guest: dict | None = None, until="keep",
            channels: list[str] | None = None) -> None:
    """Gives back access that ended (extended date, reactivation, a new invite): the same chats as before, plus `channels`."""
    ref = db.collection("users").document(uid)
    data = ref.get().to_dict() or {}
    ms = memberships_of(data)
    m = ms.get(org_id) or {"org_role": org_role or "member", "joined_at": now()}
    m.pop("ended", None)
    left = m.pop("left_chats", None) or []
    if org_role:
        m["org_role"] = org_role
    if guest is not None:
        m["guest"] = guest
    if until != "keep":
        m["until"] = until
    ms[org_id] = m
    role = m["org_role"]
    for cid in dict.fromkeys(left + (channels or [])):
        snap = db.collection("chats").document(cid).get()
        c = snap.to_dict() or {}
        if not snap.exists or c.get("org_id") != org_id or (role == "guest" and c.get("default")):
            continue
        if uid not in (c.get("members") or []):
            snap.reference.update({"members": firestore.ArrayUnion([uid])})
        for col in ("files", "decisions", "handovers"):
            for f in db.collection(col).where(filter=FieldFilter("chat_id", "==", cid)).stream():
                f.reference.update({"members": firestore.ArrayUnion([uid])})
    extra = None
    if data.get("org_id") == org_id or not _live_orgs({o: x for o, x in ms.items() if o != org_id}):
        extra = {"org_id": org_id, "org_role": role}
        set_claims(uid, org_id, role)
    _save(ref, data, ms, extra)
    forget_profile(uid)


def set_guest_access(uid: str, org_id: str, *, dm: bool | None = None, ai: bool | None = None, until="keep") -> dict:
    """Changes what a guest may do and until when. A new end date in the future gives back access that had run out."""
    ref = db.collection("users").document(uid)
    data = ref.get().to_dict() or {}
    ms = memberships_of(data)
    m = ms.get(org_id)
    if not m:
        raise HTTPException(404, "Member not found")
    g = {**(m.get("guest") or {})}
    if dm is not None:
        g["dm"] = dm
    if ai is not None:
        g["ai"] = ai
    expired = (m.get("ended") or {}).get("reason") == "expired"
    if expired and until != "keep" and (until is None or until > now()):
        restore(uid, org_id, guest=g, until=until)
        return {"restored": True}
    m["guest"] = g
    if until != "keep":
        m["until"] = until
    ms[org_id] = m
    _save(ref, data, ms)
    forget_profile(uid)
    if until != "keep" and until is not None and until <= now() and not m.get("ended"):
        end(uid, org_id, "expired")
    return {"restored": False}


def sweep() -> int:
    """Ends guest access whose date has passed (called every minute by the reminders cron)."""
    t, n = now(), 0
    for s in db.collection("users").where(filter=FieldFilter("access_next_end", "<=", t)).stream():
        for org_id, m in memberships_of(s.to_dict() or {}).items():
            if not m.get("ended") and m.get("until") and m["until"] <= t and end(s.id, org_id, "expired"):
                audit({"uid": None, "name": "Saathi", "org_id": org_id}, "member.access_expired", s.id, name=(s.to_dict() or {}).get("name"))
                n += 1
    return n


def leave_ended(profile: dict) -> dict:
    """The open workspace is no longer theirs (access ran out or was removed since the last sweep): open another one, or explain."""
    uid, org_id = profile["uid"], profile["org_id"]
    m = profile["memberships"].get(org_id) or {}
    if not m.get("ended") and m.get("until"):
        end(uid, org_id, "expired")
        m = memberships_of(db.collection("users").document(uid).get().to_dict() or {}).get(org_id) or m
    text = ended_text(m, org_id)
    other = next((o for o, x in profile["memberships"].items() if o != org_id and membership_live(x)), None)
    if not other:
        raise HTTPException(403, f"access-ended: {text}")
    if user_profile(uid)["org_id"] == org_id:
        switch(uid, other)
    return {**user_profile(uid), "notice": text}


def summary(profile: dict) -> list[dict]:
    """The workspace switcher's list."""
    rows = []
    for org_id, m in profile.get("memberships", {}).items():
        if not membership_live(m):
            continue
        rows.append({"id": org_id, "name": org_name(org_id), "org_role": m.get("org_role", "member"), "active": org_id == profile["org_id"],
                     "until": m["until"].isoformat() if m.get("until") else None})
    rows.sort(key=lambda r: (not r["active"], r["name"].lower()))
    return rows


# ---------------- API ----------------

class SwitchIn(BaseModel):
    org_id: str


@router.post("/workspace")
def switch_workspace(body: SwitchIn, user=Depends(current_user)):
    if body.org_id != user["org_id"]:
        switch(user["uid"], body.org_id)
        audit(user_profile(user["uid"]), "user.switched_workspace", body.org_id)
    return {"ok": True}


def access_until(days: int | None, date: str | None):
    """An invite's or admin's choice -> an end time: N days from now, the end of a chosen day (IST), or None (no limit)."""
    if date:
        try:
            d = datetime.fromisoformat(date[:10])
        except ValueError:
            raise HTTPException(400, "Pick a valid end date")
        end_at = datetime(d.year, d.month, d.day, 23, 59, tzinfo=TZ)
        if end_at <= now():
            raise HTTPException(400, "The end date has to be in the future")
        if end_at > now() + timedelta(days=730):
            raise HTTPException(400, "Guest access can last up to two years")
        return end_at
    if days:
        if not 1 <= days <= 730:
            raise HTTPException(400, "Guest access can last 1 day to two years")
        return now() + timedelta(days=days)
    return None

