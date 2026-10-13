"""Workspace administration: members and roles, invites, channel governance, workspace settings, audit log.
Admins see channel names and membership for governance, never message content."""
import re
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from firebase_admin import auth
from google.cloud.firestore_v1.base_query import FieldFilter
from pydantic import BaseModel

from .config import TZ
from .firebase import ORG_ROLES, PUBLIC_DOMAINS, audit, current_user, db, forget_profile, require_admin, set_claims, user_profile

router = APIRouter(prefix="/api/admin")


def admin_user(user=Depends(current_user)) -> dict:
    require_admin(user)
    return user


def _member(uid: str, admin: dict) -> dict:
    p = user_profile(uid)
    if p["org_id"] != admin["org_id"]:
        raise HTTPException(404, "Member not found")
    return p


def _ts(v):
    return v.isoformat() if hasattr(v, "isoformat") else None


@router.get("/members")
def members(admin=Depends(admin_user)):
    rows = []
    for s in db.collection("users").where(filter=FieldFilter("org_id", "==", admin["org_id"])).stream():
        d = s.to_dict()
        rows.append({"id": s.id, "name": d.get("name"), "email": d.get("email"), "title": d.get("role", ""), "org_role": d.get("org_role", "member"),
                     "deactivated": bool(d.get("deactivated")), "provider": d.get("provider", ""), "last_active": _ts(d.get("last_active")),
                     "created_at": _ts(d.get("created_at"))})
    order = {r: i for i, r in enumerate(ORG_ROLES)}
    rows.sort(key=lambda r: (r["deactivated"], order.get(r["org_role"], 9), (r["name"] or "").lower()))
    return rows


class RoleIn(BaseModel):
    org_role: str


@router.post("/members/{uid}/role")
def set_role(uid: str, body: RoleIn, admin=Depends(admin_user)):
    if body.org_role not in ORG_ROLES:
        raise HTTPException(400, "Unknown role")
    target = _member(uid, admin)
    if (target["org_role"] == "owner" or body.org_role == "owner") and admin["org_role"] != "owner":
        raise HTTPException(403, "Only an owner can change owners")
    if target["org_role"] == "owner" and body.org_role != "owner":
        owners = db.collection("users").where(filter=FieldFilter("org_id", "==", admin["org_id"])).where(filter=FieldFilter("org_role", "==", "owner")).get()
        if len(owners) <= 1:
            raise HTTPException(400, "A workspace needs at least one owner")
    db.collection("users").document(uid).update({"org_role": body.org_role})
    set_claims(uid, admin["org_id"], body.org_role)
    auth.revoke_refresh_tokens(uid)  # new role applies on the next sign-in/refresh
    forget_profile(uid)
    audit(admin, "member.role_changed", uid, name=target["name"], old=target["org_role"], new=body.org_role)
    return {"ok": True}


class ActiveIn(BaseModel):
    active: bool


@router.post("/members/{uid}/active")
def set_active(uid: str, body: ActiveIn, admin=Depends(admin_user)):
    target = _member(uid, admin)
    if uid == admin["uid"]:
        raise HTTPException(400, "You can't deactivate yourself")
    if target["org_role"] == "owner" and admin["org_role"] != "owner":
        raise HTTPException(403, "Only an owner can deactivate an owner")
    try:
        auth.update_user(uid, disabled=not body.active)
        if not body.active:
            auth.revoke_refresh_tokens(uid)
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


@router.get("/invites")
def invites(admin=Depends(admin_user)):
    rows = []
    for s in db.collection("invites").where(filter=FieldFilter("org_id", "==", admin["org_id"])).stream():
        d = s.to_dict()
        rows.append({"email": s.id, "org_role": d.get("org_role"), "status": d.get("status"), "invited_by": d.get("invited_by_name"),
                     "channels": d.get("channel_names", []), "created_at": _ts(d.get("created_at"))})
    rows.sort(key=lambda r: (r["status"] != "pending", r["created_at"] or ""), reverse=False)
    return rows


@router.post("/invites")
def invite(body: InviteIn, admin=Depends(admin_user)):
    email = body.email.strip().lower()
    if not re.fullmatch(r"[^@\s]+@[^@\s]+\.[^@\s]+", email):
        raise HTTPException(400, "Enter a valid email address")
    if body.org_role not in ("admin", "member", "guest"):
        raise HTTPException(400, "Invite as admin, member or guest")
    if body.org_role == "guest" and not body.channel_ids:
        raise HTTPException(400, "Pick at least one channel for a guest")
    existing = db.collection("users").where(filter=FieldFilter("email", "==", email)).limit(1).get()
    if existing:
        raise HTTPException(409, "That person already has a Saathi account" + ("" if existing[0].get("org_id") == admin["org_id"] else " in another workspace"))
    names = []
    for cid in body.channel_ids:
        snap = db.collection("chats").document(cid).get()
        if not snap.exists or snap.get("org_id") != admin["org_id"] or snap.get("type") != "channel":
            raise HTTPException(400, "Unknown channel")
        names.append(snap.get("name"))
    db.collection("invites").document(email).set(
        {"org_id": admin["org_id"], "org_role": body.org_role, "channel_ids": body.channel_ids, "channel_names": names, "status": "pending",
         "invited_by": admin["uid"], "invited_by_name": admin["name"], "created_at": datetime.now(TZ)}
    )
    audit(admin, "member.invited", email, org_role=body.org_role, channels=names)
    return {"ok": True}


@router.delete("/invites/{email}")
def revoke_invite(email: str, admin=Depends(admin_user)):
    ref = db.collection("invites").document(email.lower())
    snap = ref.get()
    if not snap.exists or snap.get("org_id") != admin["org_id"]:
        raise HTTPException(404, "Invite not found")
    ref.delete()
    audit(admin, "member.invite_revoked", email)
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
def delete_channel(chat_id: str, admin=Depends(admin_user)):
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
def update_org(body: OrgIn, admin=Depends(admin_user)):
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

        update["settings.quality_team"] = same_org(admin, body.quality_team)
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
