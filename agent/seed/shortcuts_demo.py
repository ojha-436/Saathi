"""Example Saathi shortcuts for the shared demo logins (prince, amit, neha, rahul, suresh, kavya @saathi.demo): two per person,
fitted to their role and to data they can see, so the Shortcuts tab isn't empty for someone trying the demo. Every one is
tagged `demo: True` (a demo login can't change or delete them, and they survive the daily clear-out of visitors' shortcuts).
They start at 0 runs: the counters only move when someone runs them. Idempotent (fixed document ids).

Run:    uv run python -m seed.shortcuts_demo
Remove: uv run python -m seed.shortcuts_demo --remove"""
import sys
from datetime import datetime
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.config import TZ  # noqa: E402
from app.firebase import db, user_profile  # noqa: E402  (works offline too)
from app.shortcuts import validate  # noqa: E402

# persona -> [(name, command, steps, blanks, minutes saved per run)]
SHORTCUTS = {
    "prince": [
        ("Drawing revision check", "drawing-check",
         "1. Find the latest released revision of {drawing number} in the drawing register.\n2. Say who approved it and when.\n"
         "3. Summarise what changed from the previous revision.\n4. Present it briefly with citations.", ["drawing number"], 15),
        ("Heat certificate check", "heat-check",
         "1. Find the material test certificate for {heat number}.\n2. Check each value against the spec limits (Spec Check).\n"
         "3. List anything out of spec or missing, with the clause.\n4. Present it briefly with citations.", ["heat number"], 20),
    ],
    "amit": [
        ("Design decision trail", "decision-trail",
         "1. Find the decisions taken about {part or drawing}.\n2. For each, say what was decided, why, and what was rejected.\n"
         "3. Note any newer decision that replaced an older one.\n4. Present it in date order with citations.", ["part or drawing"], 20),
        ("Drawing revision check", "drawing-check",
         "1. Find the latest released revision of {drawing number} in the drawing register.\n2. Say who approved it and when.\n"
         "3. Summarise what changed from the previous revision.\n4. Present it briefly with citations.", ["drawing number"], 15),
    ],
    "neha": [
        ("Heat certificate check", "heat-check",
         "1. Find the material test certificate for {heat number}.\n2. Check each value against the spec limits (Spec Check).\n"
         "3. List anything out of spec or missing, with the clause.\n4. Present it briefly with citations.", ["heat number"], 20),
        ("Vendor quality status", "vendor-quality",
         "1. List the open NCRs for {vendor}.\n2. Find similar past problems with this vendor and what fixed them.\n"
         "3. Note any late promises from the vendor.\n4. Present it as a short list with citations.", ["vendor"], 25),
    ],
    "rahul": [
        ("Dispatch check", "dispatch-check",
         "1. Find when {vendor and part} will be dispatched.\n2. Check what the vendor promised and whether it is late.\n"
         "3. Present it briefly with citations.", ["vendor and part"], 15),
        ("Vendor promises", "vendor-promises",
         "1. List what {vendor} has promised me and whether each was kept or is late.\n2. Present it as a short list with citations.",
         ["vendor"], 15),
    ],
    "suresh": [
        ("Machine history", "machine-history",
         "1. Find the downtime history for {machine}.\n2. For each problem, say what fixed it.\n3. Note anything still open from the "
         "latest shift handover.\n4. Present it briefly with citations.", ["machine"], 20),
        ("Shift brief", "shift-brief",
         "1. Read the latest shift handover for {bay}.\n2. List open issues, machines down and safety points.\n"
         "3. Present it as a short brief with citations.", ["bay"], 10),
    ],
    "kavya": [
        ("Week in review", "week-review",
         "1. Collect what I missed this week: decisions, asks for me, files shared.\n2. List promises made to me that are late.\n"
         "3. Present it as a short brief with citations.", [], 30),
        ("Inspection prep", "inspection-prep",
         "1. Find what is still pending for the {inspection}.\n2. Check the drawing revisions and certificates involved.\n"
         "3. List open NCRs or tasks that could block it.\n4. Present it as a short checklist with citations.", ["inspection"], 30),
    ],
}


def _ref(uid: str, command: str):
    return db.collection("assistant").document(uid).collection("shortcuts").document(f"demo_{uid}_{command}")


def add() -> None:
    t = datetime.now(TZ)
    n = 0
    for persona, rows in SHORTCUTS.items():
        u = user_profile(persona)
        if not u["org_id"]:
            print(f"skipping {persona}: no workspace")
            continue
        for name, command, steps, blanks, minutes in rows:
            clean = validate({"name": name, "command": command, "instruction": steps, "inputs": blanks, "minutes_saved": minutes}, set())
            ref = _ref(persona, command)
            old = ref.get().to_dict() if ref.get().exists else {}
            ref.set({**clean, "runs": old.get("runs", 0), "last_run": old.get("last_run"), "org_id": u["org_id"], "demo": True,
                     "created_at": old.get("created_at", t), "updated_at": t})
            n += 1
    print(f"{n} demo shortcuts written")


def remove() -> None:
    n = 0
    for persona in SHORTCUTS:
        for s in db.collection("assistant").document(persona).collection("shortcuts").stream():
            if s.to_dict().get("demo"):
                s.reference.delete()
                n += 1
    print(f"{n} demo shortcuts removed")


if __name__ == "__main__":
    remove() if "--remove" in sys.argv else add()
