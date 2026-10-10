"""One-off migration to workspaces (Phase 2): puts all existing data in one workspace and sets roles + token claims.

    uv run python -m seed.migrate_orgs            # dry run: prints what would change
    uv run python -m seed.migrate_orgs --apply    # writes

Idempotent: re-running only fills gaps.
"""
import sys

from app.firebase import auth, db, set_claims

ORG_ID = "shakti-rail"
ORG = {"name": "Shakti Rail Components", "domains": ["saathi.demo"], "settings": {"channel_creation": "everyone", "ai_enabled": True}}
OWNER_EMAIL = "princeojha436@gmail.com"
ADMINS = {"prince"}  # demo account judges sign in with, so the admin console is visible
TENANT_COLLECTIONS = ("chats", "files", "notifications", "chunks", "audit_log", "meetings", "user_settings")


def main(apply: bool) -> None:
    changes = []
    org_ref = db.collection("orgs").document(ORG_ID)
    if not org_ref.get().exists:
        changes.append(("orgs", ORG_ID, ORG))
        if apply:
            org_ref.set({**ORG, "created_by": "migration"})

    users = list(db.collection("users").stream())
    for s in users:
        d = s.to_dict()
        role = d.get("org_role") or ("owner" if d.get("email") == OWNER_EMAIL else "admin" if s.id in ADMINS else "member")
        upd = {}
        if not d.get("org_id"):
            upd["org_id"] = ORG_ID
        if not d.get("org_role"):
            upd["org_role"] = role
        if upd:
            changes.append(("users", s.id, upd))
            if apply:
                s.reference.update(upd)
        if apply:
            try:
                set_claims(s.id, d.get("org_id") or ORG_ID, role)
            except auth.UserNotFoundError:
                pass

    for col in TENANT_COLLECTIONS:
        n = 0
        for s in db.collection(col).stream():
            if not s.to_dict().get("org_id"):
                n += 1
                if apply:
                    s.reference.update({"org_id": ORG_ID})
        if n:
            changes.append((col, f"{n} docs", {"org_id": ORG_ID}))

    n = 0
    for s in db.collection("tasks").stream():
        t = s.to_dict()
        if t.get("participants"):
            continue
        owner = t["owner"]
        n += 1
        if apply:
            s.reference.update({"assignee": owner, "creator": t.get("creator", owner), "watchers": [], "participants": [owner], "org_id": t.get("org_id", ORG_ID)})
    if n:
        changes.append(("tasks", f"{n} docs", "assignee/creator/participants/org_id"))

    print(("APPLIED" if apply else "DRY RUN") + f": {len(changes)} change groups")
    for c in changes:
        print("  ", *c)


if __name__ == "__main__":
    main("--apply" in sys.argv)
