"""Workspace administration: members and roles, invites, channel governance, workspace settings, audit log.
Admins see channel names and membership for governance, never message content."""
import re
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from . import demo, invites as inv, mailer, workspaces
from .config import TZ
from .firebase import (
    GUEST_DEFAULTS, ORG_ROLES, PUBLIC_DOMAINS, FieldFilter, audit, auth, current_user, db, forget_profile, membership_live,
    memberships_of, require_admin, role_in, set_claims, user_profile,
)

router = APIRouter(prefix="/api/admin")


def admin_user(user=Depends(current_user)) -> dict:
    require_admin(user)
    return user


def changing_admin(admin=Depends(admin_user)) -> dict:
    """Admin actions that change people, channels or settings. The shared demo admin login only looks: anyone can sign in
    as it, so it must not be able to lock others out, hand out admin rights, delete channels or switch features off."""
    demo.guard(admin)
    return admin


def _member(uid: str, admin: dict) -> dict:
    """Someone who is (or was) in the admin's workspace, with org_role = their role here."""
    forget_profile(uid)
    p = user_profile(uid)
    if admin["org_id"] not in p["memberships"]:
        raise HTTPException(404, "Member not found")
    return {**p, "org_role": role_in(p, admin["org_id"])}


def _only_here(p: dict, org_id: str) -> bool:
    """True when this workspace is the person's only one: removing them then deactivates the whole account (as before);
    otherwise only their access to this workspace ends."""
    return not any(o != org_id and membership_live(m) for o, m in p["memberships"].items())


def _ts(v):
    return v.isoformat() if hasattr(v, "isoformat") else None


@router.get("/members")
def members(admin=Depends(admin_user)):
    org = admin["org_id"]
    rows = []
    for uid, d in workspaces.org_people(org, include_ended=True).items():
        ms = memberships_of(d)
        m = ms.get(org) or {}
        ended = (m.get("ended") or {}).get("reason")
        expired = ended == "expired" or (not ended and bool(m.get("until")) and not membership_live(m))
        rows.append({"id": uid, "name": d.get("name"), "email": d.get("email"), "title": d.get("role", ""), "org_role": m.get("org_role", "member"),
                     "deactivated": bool(d.get("deactivated")) or ended == "removed", "expired": expired,
                     "provider": d.get("provider", ""), "last_active": _ts(d.get("last_active")), "created_at": _ts(m.get("joined_at") or d.get("created_at")),
                     "guest": {**GUEST_DEFAULTS, **(m.get("guest") or {})} if m.get("org_role") == "guest" else None,
                     "until": _ts(m.get("until")), "ended_at": _ts((m.get("ended") or {}).get("at")),
                     "other_workspaces": len([o for o, x in ms.items() if o != org and membership_live(x)])})
    order = {r: i for i, r in enumerate(ORG_ROLES)}
    rows.sort(key=lambda r: (r["deactivated"], order.get(r["org_role"], 9), (r["name"] or "").lower()))
    return rows


class RoleIn(BaseModel):
    org_role: str


@router.post("/members/{uid}/role")
def set_role(uid: str, body: RoleIn, admin=Depends(changing_admin)):
    if body.org_role not in ORG_ROLES:
        raise HTTPException(400, "Unknown role")
    target = _member(uid, admin)
    if (target["org_role"] == "owner" or body.org_role == "owner") and admin["org_role"] != "owner":
        raise HTTPException(403, "Only an owner can change owners")
    if target["org_role"] == "owner" and body.org_role != "owner":
        owners = [u for u, d in workspaces.org_people(admin["org_id"]).items() if (memberships_of(d).get(admin["org_id"]) or {}).get("org_role") == "owner"]
        if len(owners) <= 1:
            raise HTTPException(400, "A workspace needs at least one owner")
    ref = db.collection("users").document(uid)
    data = ref.get().to_dict() or {}
    ms = memberships_of(data)
    m = ms[admin["org_id"]]
    m["org_role"] = body.org_role
    if body.org_role == "guest":
        m.setdefault("guest", dict(GUEST_DEFAULTS))
    else:
        m.pop("until", None)  # only guest access has an end date
    update = {"memberships": ms, "access_next_end": workspaces._next_end(ms)}
    if data.get("org_id") == admin["org_id"]:  # they have this workspace open: the token's role changes too
        update["org_role"] = body.org_role
        set_claims(uid, admin["org_id"], body.org_role)
        auth.revoke_refresh_tokens(uid)  # new role applies on the next sign-in/refresh
    ref.update(update)
    forget_profile(uid)
    audit(admin, "member.role_changed", uid, name=target["name"], old=target["org_role"], new=body.org_role)
    return {"ok": True}


class ActiveIn(BaseModel):
    active: bool


@router.post("/members/{uid}/active")
def set_active(uid: str, body: ActiveIn, admin=Depends(changing_admin)):
    target = _member(uid, admin)
    if uid == admin["uid"]:
        raise HTTPException(400, "You can't deactivate yourself")
    if target["org_role"] == "owner" and admin["org_role"] != "owner":
        raise HTTPException(403, "Only an owner can deactivate an owner")
    here = target["memberships"][admin["org_id"]]
    ended = (here.get("ended") or {}).get("reason")
    if body.active and (ended == "expired" or (not ended and not membership_live(here))):
        raise HTTPException(400, "Their guest access ran out. Give it a new end date instead.")
    if ended or not _only_here(target, admin["org_id"]):
        # They use Saathi elsewhere too, or their access here had already ended: only this workspace changes
        if body.active:
            workspaces.restore(uid, admin["org_id"])
        elif ended:  # access that ran out becomes a removal, so a later invite or reactivation is a deliberate choice
            ref = db.collection("users").document(uid)
            data = ref.get().to_dict() or {}
            ms = memberships_of(data)
            ms[admin["org_id"]]["ended"] = {**ms[admin["org_id"]]["ended"], "reason": "removed", "by_name": admin["name"]}
            workspaces._save(ref, data, ms)
            forget_profile(uid)
        else:
            workspaces.end(uid, admin["org_id"], "removed", by=admin)
        audit(admin, "member.reactivated" if body.active else "member.deactivated", uid, name=target["name"], workspace_only=True)
        return {"ok": True}
    try:
        auth.update_user(uid, disabled=not body.active)
        if not body.active:
            set_claims(uid, "", "")
            auth.revoke_refresh_tokens(uid)
        else:
            set_claims(uid, admin["org_id"], target.get("org_role") or "member")
    except auth.UserNotFoundError:
        pass  # directory-only accounts (e.g. seeded data)
    db.collection("users").document(uid).update({"deactivated": not body.active})
    forget_profile(uid)
    audit(admin, "member.reactivated" if body.active else "member.deactivated", uid, name=target["name"])
    return {"ok": True}


class InviteIn(BaseModel):
    email: str
    org_role: str = "member"
    channel_ids: list[str] = []
    send_email: bool = True
    # guests only: what else they may do, and for how long after joining (days) or until a date (YYYY-MM-DD); neither = no limit
    guest_dm: bool = True
    guest_ai: bool = True
    access_days: int | None = 30
    access_until: str | None = None


class GuestIn(BaseModel):
    dm: bool | None = None
    ai: bool | None = None
    # one of: a number of days from now, a date (YYYY-MM-DD), or no_limit
    days: int | None = None
    until: str | None = None
    no_limit: bool = False
    end_now: bool = False  # ends access today; extending later gives back the same channels


@router.post("/members/{uid}/guest")
def guest_access(uid: str, body: GuestIn, admin=Depends(changing_admin)):
    """A guest's access: direct messages, Saathi, and the end date (extend, shorten, remove the limit)."""
    target = _member(uid, admin)
    if target["org_role"] != "guest":
        raise HTTPException(400, "Only guests have these settings")
    if (target["memberships"][admin["org_id"]].get("ended") or {}).get("reason") == "removed":
        raise HTTPException(400, "Reactivate them first")
    if body.end_now:
        workspaces.end(uid, admin["org_id"], "expired", by=admin)
        audit(admin, "member.guest_access", uid, name=target["name"], ended=True)
        return {"ok": True, "restored": False}
    until = "keep"
    if body.no_limit:
        until = None
    elif body.days or body.until:
        until = workspaces.access_until(body.days, body.until)
    out = workspaces.set_guest_access(uid, admin["org_id"], dm=body.dm, ai=body.ai, until=until)
    audit(admin, "member.guest_access", uid, name=target["name"], dm=body.dm, ai=body.ai,
          until=None if until in ("keep", None) else until.isoformat(), no_limit=body.no_limit, restored=out["restored"])
    return {"ok": True, **out}


def _delivery(d: dict | None) -> dict | None:
    return {**d, "at": _ts(d.get("at"))} if d else None


@router.get("/invites")
def invites(admin=Depends(admin_user)):
    rows = []
    for s in db.collection("invites").where(filter=FieldFilter("org_id", "==", admin["org_id"])).stream():
        d = s.to_dict()
        state = inv.state_of(d)
        if state == "revoked":
            continue
        rows.append({"id": s.id, "email": inv.email_of(s), "org_role": d.get("org_role"), "status": "pending" if state == "valid" else state,
                     "invited_by": d.get("invited_by_name"), "channels": d.get("channel_names", []), "created_at": _ts(d.get("created_at")),
                     "expires_at": _ts(d.get("expires_at")), "accepted_at": _ts(d.get("accepted_at")), "delivery": _delivery(d.get("delivery")),
                     **(inv.guest_terms(d) if d.get("org_role") == "guest" else {})})
    open_ = sorted((r for r in rows if r["status"] != "accepted"), key=lambda r: r["created_at"] or "", reverse=True)
    done = sorted((r for r in rows if r["status"] == "accepted"), key=lambda r: r["accepted_at"] or "", reverse=True)
    return {"mail": mailer.enabled(), "mail_from": mailer.sender(), "invites": open_ + done}


def _move_to_link_invite(snap):
    """Invites from before personal links are stored under the email; links need the inv_ id, so give it one."""
    if snap.id.startswith("inv_"):
        return snap.reference
    ref = db.collection("invites").document(inv.new_id())
    ref.set({**snap.to_dict(), "email": snap.id, "email_norm": inv.norm_email(snap.id)})
    snap.reference.delete()
    return ref


@router.post("/invites")
def invite(body: InviteIn, admin=Depends(admin_user)):
    email = body.email.strip().lower()
    if not re.fullmatch(r"[^@\s]+@[^@\s]+\.[^@\s]+", email):
        raise HTTPException(400, "Enter a valid email address")
    if body.org_role not in ("admin", "member", "guest"):
        raise HTTPException(400, "Invite as admin, member or guest")
    if body.org_role == "admin":
        demo.guard(admin, "Demo logins are shared by everyone trying Saathi, so they can invite members and guests but not admins.")
    if body.org_role == "guest" and not body.channel_ids:
        raise HTTPException(400, "Pick at least one channel for a guest")
    note = ""
    existing = db.collection("users").where(filter=FieldFilter("email", "==", email)).limit(1).get()
    if existing:
        u = existing[0].to_dict()
        ms = memberships_of(u)
        here = ms.get(admin["org_id"])
        if u.get("deactivated") and here:
            raise HTTPException(409, f"{u.get('name') or email} was deactivated in this workspace. Reactivate them in Members instead.")
        if membership_live(here):
            raise HTTPException(409, f"{u.get('name') or email} is already in this workspace. Change their role in Members, or add them to a channel from the channel itself.")
        if here:
            note = "Their earlier access here ended. When they accept, it starts again with these settings."
        elif inv.has_others(u.get("org_id", ""), existing[0].id) or len([o for o, m in ms.items() if membership_live(m)]) > 1:
            note = ("They already use Saathi with another organisation. They keep that workspace and get yours as well; "
                    "they switch between them from their profile menu.")
        else:
            note = "They already have a Saathi account that nobody else uses. When they accept, they can move it here or keep both."
    names = []
    for cid in body.channel_ids:
        snap = db.collection("chats").document(cid).get()
        c = snap.to_dict() or {}
        if not snap.exists or c.get("org_id") != admin["org_id"] or c.get("type") != "channel":
            raise HTTPException(400, "Unknown channel")
        if body.org_role == "guest" and c.get("default"):
            raise HTTPException(400, f"Guests can't join #{c.get('name')}: it's company-wide. Pick a project or supplier channel.")
        names.append(c.get("name"))

    # Inviting the same person again updates their pending invite (role, channels) instead of starting a second one
    ref = None
    for s in db.collection("invites").where(filter=FieldFilter("email_norm", "==", inv.norm_email(email))).stream():
        if s.to_dict().get("org_id") == admin["org_id"] and s.to_dict().get("status") == "pending":
            ref = s.reference
    legacy = db.collection("invites").document(email).get()
    if legacy.exists and legacy.to_dict().get("org_id") == admin["org_id"] and legacy.to_dict().get("status") == "pending":
        if ref:
            legacy.reference.delete()
        else:
            ref = _move_to_link_invite(legacy)
    data = {"email": email, "email_norm": inv.norm_email(email), "org_id": admin["org_id"], "org_role": body.org_role,
            "channel_ids": body.channel_ids, "channel_names": names, "status": "pending", "invited_by": admin["uid"],
            "invited_by_name": admin["name"], "invited_by_email": admin.get("email", "")}
    if body.org_role == "guest":
        fixed = workspaces.access_until(None, body.access_until) if body.access_until else None
        if not fixed and body.access_days is not None:
            workspaces.access_until(body.access_days, None)  # validates the range
        data.update({"guest": {"dm": body.guest_dm, "ai": body.guest_ai}, "access_until": fixed,
                     "access_days": None if fixed else body.access_days})
    again = ref is not None
    if again:
        if body.send_email and inv.recently_emailed(ref.get().to_dict()):
            raise HTTPException(429, "An invite email just went to this address. Give it a minute before sending again.")
        ref.update(data)
    else:
        ref = db.collection("invites").document(inv.new_id())
        ref.set({**data, "created_at": datetime.now(TZ)})
    path = inv.new_link(ref)
    org_name = (db.collection("orgs").document(admin["org_id"]).get().to_dict() or {}).get("name", "")
    delivery = inv.deliver(ref, org_name, path) if body.send_email else None
    audit(admin, "member.reinvited" if again else "member.invited", email, org_role=body.org_role, channels=names,
          email=(delivery or {}).get("status", "link"))
    return {"ok": True, "id": ref.id, "path": path, "again": again, "note": note, "delivery": _delivery(delivery)}


class LinkIn(BaseModel):
    send_email: bool = False


def _own_invite(invite_id: str, admin: dict):
    snap = db.collection("invites").document(invite_id).get()
    if not snap.exists or snap.to_dict().get("org_id") != admin["org_id"] or snap.to_dict().get("status") == "revoked":
        raise HTTPException(404, "Invite not found")
    return snap


@router.post("/invites/{invite_id}/link")
def invite_link(invite_id: str, body: LinkIn, admin=Depends(admin_user)):
    """A fresh personal link (optionally emailed). Renews an expired invite; links already sent keep working."""
    snap = _own_invite(invite_id, admin)
    d = snap.to_dict()
    if d.get("status") == "accepted":
        raise HTTPException(400, f"{inv.email_of(snap)} has already joined")
    if d.get("org_role") in ("admin", "owner"):
        demo.guard(admin)
    if body.send_email and inv.recently_emailed(d):
        raise HTTPException(429, "An invite email just went to this address. Give it a minute before sending again.")
    ref = _move_to_link_invite(snap)
    path = inv.new_link(ref)
    org_name = (db.collection("orgs").document(admin["org_id"]).get().to_dict() or {}).get("name", "")
    delivery = inv.deliver(ref, org_name, path) if body.send_email else None
    audit(admin, "member.invite_resent" if body.send_email else "member.invite_link", inv.email_of(snap), email=(delivery or {}).get("status", "link"))
    return {"ok": True, "id": ref.id, "path": path, "delivery": _delivery(delivery)}


@router.delete("/invites/{invite_id}")
def revoke_invite(invite_id: str, admin=Depends(admin_user)):
    snap = _own_invite(invite_id, admin)
    if snap.to_dict().get("status") == "accepted":
        raise HTTPException(400, "This invite was already accepted. Deactivate the person in Members instead.")
    if snap.to_dict().get("invited_by") not in demo.USERS:  # the demo admin withdraws only invites made from demo logins
        demo.guard(admin)
    snap.reference.update({"status": "revoked", "revoked_by": admin["uid"], "revoked_at": datetime.now(TZ)})  # kept so the link says "withdrawn"
    audit(admin, "member.invite_revoked", inv.email_of(snap))
    return {"ok": True}


@router.get("/channels")
def channels(admin=Depends(admin_user)):
    """Governance view: names, privacy and membership of every channel. No message content."""
    rows, groups, dms = [], 0, 0
    for s in db.collection("chats").where(filter=FieldFilter("org_id", "==", admin["org_id"])).stream():
        d = s.to_dict()
        if d.get("type") == "channel":
            rows.append({"id": s.id, "name": d.get("name"), "visibility": d.get("visibility", "public"), "members": len(d.get("members") or []),
                         "owners": [user_profile(o)["name"] for o in d.get("owners") or []], "created_by": user_profile(d["created_by"])["name"] if d.get("created_by") else "",
                         "last_activity": _ts(d.get("last_ts")), "ai_excluded": bool(d.get("ai_excluded"))})
        elif d.get("type") == "group":
            groups += 1
        else:
            dms += 1
    rows.sort(key=lambda r: r["last_activity"] or "", reverse=True)
    return {"channels": rows, "group_chats": groups, "direct_messages": dms}


@router.delete("/channels/{chat_id}")
def delete_channel(chat_id: str, admin=Depends(changing_admin)):
    from .main import delete_chat_everything

    snap = db.collection("chats").document(chat_id).get()
    if not snap.exists or snap.get("org_id") != admin["org_id"] or snap.get("type") != "channel":
        raise HTTPException(404, "Channel not found")
    delete_chat_everything(chat_id)
    audit(admin, "channel.deleted_by_admin", chat_id, name=snap.get("name"))
    return {"ok": True}


class OrgIn(BaseModel):
    name: str | None = None
    domains: list[str] | None = None
    channel_creation: str | None = None  # everyone | admins
    ai_enabled: bool | None = None
    integrations_google: bool | None = None
    voice_us: bool | None = None  # allow Saathi Voice (Gemini Live is served from us-central1 for this project)
    quality_team: list[str] | None = None  # uids who own/see every plant record (NCR, downtime, safety)
    qr_public: bool | None = None  # QR scans show current/obsolete without sign-in
    shifts: str | None = None  # "A 06:00, B 14:00, C 22:00" — shift handover timing


@router.patch("/org")
def update_org(body: OrgIn, admin=Depends(changing_admin)):
    ref = db.collection("orgs").document(admin["org_id"])
    org = ref.get().to_dict() or {}
    update: dict = {}
    if body.name is not None:
        name = re.sub(r"\s+", " ", body.name).strip()[:60]
        if len(name) < 2:
            raise HTTPException(400, "Workspace name is too short")
        update["name"] = name
    if body.domains is not None:
        doms = sorted({d.strip().lower().lstrip("@") for d in body.domains if d.strip()})
        for d in doms:
            if not re.fullmatch(r"[a-z0-9-]+(\.[a-z0-9-]+)+", d):
                raise HTTPException(400, f"“{d}” isn't a valid domain")
            if d in PUBLIC_DOMAINS:
                raise HTTPException(400, f"{d} is a public email provider and can't be claimed by a workspace")
            if d not in org.get("domains", []):
                if admin["email"].rsplit("@", 1)[-1] != d:
                    raise HTTPException(400, f"To claim {d}, sign in with an email address on that domain")
                taken = db.collection("orgs").where(filter=FieldFilter("domains", "array_contains", d)).limit(1).get()
                if taken and taken[0].id != admin["org_id"]:
                    raise HTTPException(409, f"{d} is already claimed by another workspace")
        update["domains"] = doms
    if body.channel_creation is not None:
        if body.channel_creation not in ("everyone", "admins"):
            raise HTTPException(400, "channel_creation must be everyone or admins")
        update["settings.channel_creation"] = body.channel_creation
    if body.ai_enabled is not None:
        update["settings.ai_enabled"] = body.ai_enabled
    if body.quality_team is not None:
        from .firebase import same_org

        # same_org keeps guests; a guest on the Quality team would see every record and could approve spec limits
        new_team = [u for u in same_org(admin, body.quality_team) if role_in(user_profile(u), admin["org_id"]) != "guest"]
        update["settings.quality_team"] = new_team
        team_set = set(new_team)
        for rsnap in db.collection("records").where(filter=FieldFilter("org_id", "==", admin["org_id"])).stream():
            rd = rsnap.to_dict() or {}
            base = ({rd["owner"]} if rd.get("owner") else set()) | (set() if rd.get("anonymous") or not rd.get("reporter") else {rd["reporter"]})
            parts = sorted(team_set | base)
            if parts != (rd.get("participants") or []):
                rsnap.reference.update({"participants": parts})
                crec = db.collection("chunks").document(f"rec_{rsnap.id}")
                if crec.get().exists:
                    crec.update({"members": parts})
    if body.qr_public is not None:
        update["settings.qr_public"] = body.qr_public
    if body.shifts is not None:
        rows = []
        for part in [p for p in re.split(r"[,;\n]+", body.shifts) if p.strip()]:
            m = re.fullmatch(r"\s*([A-Za-z0-9]{1,8})\s+([01]?\d|2[0-3]):([0-5]\d)\s*", part)
            if not m:
                raise HTTPException(400, f"“{part.strip()}” should look like “A 06:00”")
            rows.append({"name": m.group(1).upper(), "start": f"{int(m.group(2)):02d}:{m.group(3)}"})
        if not 1 <= len(rows) <= 4 or len({r["start"] for r in rows}) != len(rows) or len({r["name"] for r in rows}) != len(rows):
            raise HTTPException(400, "Give 1 to 4 shifts with different names and start times")
        update["settings.shifts"] = sorted(rows, key=lambda r: r["start"])
    if body.voice_us is not None:
        update["settings.voice_us"] = body.voice_us
    if body.integrations_google is not None:
        update["settings.integrations_google"] = body.integrations_google
        if not body.integrations_google:  # turning it off disconnects everyone in the workspace
            from .connectors import disconnect_user

            for c in db.collection("connections").where(filter=FieldFilter("org_id", "==", admin["org_id"])).stream():
                disconnect_user(c.get("uid"))
    if update:
        ref.update(update)
        audit(admin, "workspace.updated", admin["org_id"], **{k.replace("settings.", ""): v for k, v in update.items()})
    return {"ok": True}


@router.get("/audit")
def audit_log(admin=Depends(admin_user)):
    rows = []
    for s in db.collection("audit_log").where(filter=FieldFilter("org_id", "==", admin["org_id"])).stream():
        d = s.to_dict()
        if d.get("kind") == "security":
            rows.append({"ts": _ts(d.get("ts")), "actor": d.get("actor_name"), "action": d.get("action"), "target": d.get("target"), "meta": d.get("meta") or {}})
        elif d.get("kind") == "assistant":
            rows.append({"ts": _ts(d.get("ts")), "actor": user_profile(d["uid"])["name"], "action": "assistant.query", "target": "",
                         "meta": {"tools": d.get("tools", []), "latency_ms": d.get("latency_ms")}})
    rows.sort(key=lambda r: r["ts"] or "", reverse=True)
    return rows[:200]
