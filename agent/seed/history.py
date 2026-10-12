"""Adds six months of believable plant history to the demo workspace WITHOUT wiping anything: closed NCRs and downtime
records with root causes and fixes, a vendor decision thread, and vendor promises with outcomes. Every item is tagged
`demo_history` so it can be removed again.

Messages go through the real pipeline (promise/decision extraction, indexing), so what Saathi shows is what it extracted.

Run:    uv run python -m seed.history
Remove: uv run python -m seed.history --remove"""
import sys
from datetime import datetime, timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from google.cloud import firestore  # noqa: E402
from google.cloud.firestore_v1.base_query import FieldFilter  # noqa: E402

from app import ingest, records  # noqa: E402
from app.config import TZ  # noqa: E402
from app.firebase import db, user_profile  # noqa: E402

ORG = "shakti-rail"
YEAR = 2026


def d(month: int, day: int, hh: int = 11, mm: int = 0) -> datetime:
    return datetime(YEAR, month, day, hh, mm, tzinfo=TZ)


# number, type, reporter, owner, created, closed, fields, capa
RECORDS = [
    ("NCR-2026-0001", "ncr", "suresh", "neha", d(4, 8), d(4, 20), {
        "title": "Gas porosity at bolster pocket, side frame casting SRC-BF-2041",
        "description": "Pin-hole porosity found after shot blasting at the bolster pocket of 3 side frame castings from lot 1. Visible on the machined face.",
        "part_name": "Side frame casting", "drawing_no": "SRC-BF-2041", "revision": "A", "vendor": "Om Castings", "defect_type": "porosity",
        "severity": "major", "quantity": "3 Nos"},
     {"containment": "Lot 1 on hold, 100% visual + RT on the bolster pocket.",
      "root_cause": "Moist moulding sand at Om Castings during pre-monsoon humidity; no sand moisture check per heat.",
      "corrective_action": "Om Castings added a sand moisture check every heat; RT on the first 3 pieces of every lot.",
      "verification": "Lots 2 and 3 RT clear."}),
    ("DT-2026-0001", "downtime", "suresh", "suresh", d(5, 2, 9, 30), d(5, 2, 15, 30), {
        "title": "CNC-3 spindle overheat alarm, machine stopped",
        "description": "Spindle temperature alarm on CNC-3 during axle box housing boring. Machine stopped for 6 hours.",
        "machine": "CNC-3", "location": "Bay 2", "downtime_reason": "breakdown", "part_name": "Axle box housing"},
     {"root_cause": "Spindle chiller filter clogged with coolant sludge.",
      "corrective_action": "Chiller filter cleaning added to the weekly PM checklist for CNC-3 and CNC-4."}),
    ("NCR-2026-0002", "ncr", "suresh", "neha", d(5, 14), d(5, 23), {
        "title": "Undercut on bolster pocket weld, job 4310",
        "description": "Undercut up to 0.8 mm along the vertical bolster pocket weld on job 4310, above the 0.5 mm limit.",
        "part_name": "Side frame", "drawing_no": "SRC-BF-2041", "job_no": "4310", "defect_type": "undercut", "severity": "minor", "quantity": "2 Nos"},
     {"root_cause": "4 mm electrode at high current used on a vertical-up joint.",
      "corrective_action": "WPS-SF-07 amended to 3.15 mm electrode for vertical joints; welder Ravi retrained and requalified."}),
    ("NCR-2026-0003", "ncr", "suresh", "neha", d(6, 10), d(6, 18), {
        "title": "Bore oversize on axle box housing SRC-AB-1107",
        "description": "Bearing bore measured 0.04 mm oversize on 5 axle box housings machined on VMC-2 in the second shift.",
        "part_name": "Axle box housing", "drawing_no": "SRC-AB-1107", "revision": "A", "machine": "VMC-2", "defect_type": "dimensional",
        "severity": "major", "quantity": "5 Nos"},
     {"root_cause": "Worn boring insert; no tool-life counter, insert ran 210 parts.",
      "corrective_action": "Tool-life counter set to 120 parts on VMC-2 boring tool; first-piece check after every insert change."}),
    ("DT-2026-0002", "downtime", "suresh", "suresh", d(7, 21, 14, 0), d(7, 21, 17, 30), {
        "title": "CNC-3 spindle alarm again, coolant low",
        "description": "Spindle overheat alarm on CNC-3 again. Chiller coolant level found low. 3.5 hours lost.",
        "machine": "CNC-3", "location": "Bay 2", "downtime_reason": "breakdown"},
     {"root_cause": "Chiller coolant leak at the return hose clamp; level not checked daily.",
      "corrective_action": "Hose clamp replaced; coolant level added to the daily start-up checklist; low-level sensor ordered."}),
    ("NCR-2026-0004", "ncr", "neha", "neha", d(7, 30), d(8, 12), {
        "title": "Shrinkage cavity in axle box housing casting, heat H-70211",
        "description": "UT found a shrinkage cavity under the bearing seat of 2 axle box housing castings from Om Castings, heat H-70211.",
        "part_name": "Axle box housing casting", "drawing_no": "SRC-AB-1107", "heat_no": "H-70211", "vendor": "Om Castings",
        "defect_type": "shrinkage", "severity": "major", "quantity": "2 Nos"},
     {"root_cause": "Riser undersized on the new pattern made by Om Castings in July.",
      "corrective_action": "Om Castings enlarged the riser and re-simulated; 100% UT on the next 2 lots."}),
    ("NCR-2026-0005", "ncr", "neha", "neha", d(8, 22), d(8, 29), {
        "title": "Side frame machined to superseded drawing SRC-BF-2033 Rev A",
        "description": "4 side frames machined to Rev A of SRC-BF-2033; Rev B (changed hole pattern) was released on 12 Aug. Old print was at the Bay 2 workstation.",
        "part_name": "Side frame", "drawing_no": "SRC-BF-2033", "revision": "A", "defect_type": "wrong revision", "severity": "critical",
        "quantity": "4 Nos", "location": "Bay 2"},
     {"root_cause": "Superseded printed drawing still at the workstation; no control of printed copies.",
      "corrective_action": "All printed drawings withdrawn from Bay 2; only QA-issued controlled copies allowed; parts reworked to Rev B."}),
    ("NCR-2026-0006", "ncr", "suresh", "neha", d(9, 18), d(10, 3), {
        "title": "Gas porosity again in side frame castings, Om Castings lot 3",
        "description": "Porosity at the bolster pocket on 4 side frame castings from Om Castings lot 3. Same defect as NCR-2026-0001.",
        "part_name": "Side frame casting", "drawing_no": "SRC-BF-2041", "vendor": "Om Castings", "defect_type": "porosity",
        "severity": "major", "quantity": "4 Nos"},
     {"root_cause": "Sand moisture check skipped on the night shift at Om Castings (introduced after NCR-2026-0001).",
      "corrective_action": "Vendor audit done 29 Sep; signed sand check sheet per heat now sent with every MTC."}),
]

# chat, sender, when, text
MESSAGES = [
    ("dm_prince_rahul", "rahul", d(6, 2, 10, 15), "Om Castings will dispatch the axle box housing lot 1 by 10 June."),
    ("dm_prince_rahul", "rahul", d(7, 1, 11, 40), "Om Castings will send the lot 2 axle box housing castings by 8 July."),
    ("dm_prince_rahul", "rahul", d(8, 5, 12, 5), "Om Castings will dispatch lot 3 side frame castings by 20 Aug."),
    ("grp_bay2", "neha", d(8, 23, 9, 30), "After NCR-2026-0005: decided that all printed drawings at Bay 2 are withdrawn today. Only QA-issued controlled copies are allowed at workstations from now on."),
    ("dm_prince_rahul", "rahul", d(9, 2, 16, 20), "Om Steel will send the MTCs for heat H-75530 by 5 Sep."),
    ("grp_bogie", "neha", d(9, 19, 10, 5), "Porosity again on Om Castings side frame lot 3 (NCR-2026-0006). That's the second porosity NCR from them this year."),
    ("grp_bogie", "rahul", d(9, 19, 10, 20), "Options: keep Om Castings with a vendor audit, or move side frame castings to Bharat Foundry. Bharat is about 8% costlier and their lead time is 6 weeks vs 4."),
    ("grp_bogie", "amit", d(9, 19, 10, 32), "Switching foundry now means new pattern trials. That alone is 2 weeks on the prototype."),
    ("grp_bogie", "kavya", d(9, 19, 11, 0), "Decision: we stay with Om Castings for now, conditional on a vendor audit by 30 Sep and a signed sand moisture check sheet with every MTC. If there is one more porosity NCR, we move side frames to Bharat Foundry. Reason: switching now delays the prototype by 2 weeks."),
    ("dm_prince_rahul", "rahul", d(9, 25, 15, 10), "Om Castings will share the vendor audit report and the sand check sheets by 30 Sep."),
]

# message index -> (task done at, assignee)
OUTCOMES = {0: d(6, 14, 17, 0), 1: d(7, 8, 16, 0), 2: d(8, 27, 12, 0), 4: d(9, 5, 11, 0), 9: d(10, 3, 18, 0)}


def add():
    if any(True for _ in db.collection("records").where(filter=FieldFilter("demo_history", "==", True)).limit(1).stream()):
        print("history already present; run with --remove first")
        return
    team = sorted({"neha", "prince", "2YYb0LSmtrhu32pb3gCZCA0VBd13"})
    for number, kind, reporter, owner, created, closed, fields, capa in RECORDS:
        rid = f"hist_{number.lower().replace('-', '_')}"
        steps = records.STATUS_FLOW[kind]
        span = (closed - created) / max(len(steps) - 1, 1)
        history = [{"status": st, "by": owner if i else reporter, "ts": created + span * i} for i, st in enumerate(steps)]
        full = {k: None for k in records.EDITABLE} | fields
        db.collection("records").document(rid).set({
            "org_id": ORG, "type": kind, "number": number, "status": "closed", "fields": full, "owner": owner, "reporter": reporter,
            "reporter_name": user_profile(reporter)["name"], "anonymous": False, "participants": sorted(set(team) | {owner, reporter}), "media": [],
            "chat_id": None, "history": history, "links": {}, "capa": capa, "created_at": created, "updated_at": closed, "closed_at": closed,
            "capture_seconds": None, "demo_history": True})
        records._index(rid)
        print("record", number)
    for kind, n in (("ncr", 6), ("downtime", 2)):
        ref = db.collection("counters").document(f"{ORG}_{kind}_{YEAR}")
        snap = ref.get()
        if not snap.exists or snap.get("n") < n:
            ref.set({"n": n, "org_id": ORG})

    ids = []
    for i, (chat_id, sender, ts, text) in enumerate(MESSAGES):
        mid = f"hist{i:02d}{chat_id[-6:]}"
        db.collection("chats").document(chat_id).collection("messages").document(mid).set(
            {"sender": sender, "sender_name": user_profile(sender)["name"], "text": text, "ts": ts, "demo_history": True})
        ids.append((chat_id, mid))
    for chat_id, mid in ids:  # oldest first, so a later decision can supersede an earlier one
        ingest.process_message(chat_id, mid)
        print("message", mid)
    from app.decisions import backfill

    print("decisions backfilled:", backfill(ORG))
    for i, done in OUTCOMES.items():
        chat_id, mid = ids[i]
        msg = db.collection("chats").document(chat_id).collection("messages").document(mid).get().to_dict()
        p = msg.get("promise")
        if not p:
            print("  no promise extracted for", mid)
            continue
        rahul = user_profile("rahul")
        db.collection("tasks").document(f"hist_task_{mid}").set({
            "owner": "rahul", "assignee": "rahul", "creator": "rahul", "creator_name": rahul["name"], "watchers": ["prince"],
            "participants": ["prince", "rahul"], "title": f"Follow up: {p['committer']} — {p['action']}", "due_at": p.get("due_at"),
            "kind": "promise", "status": "done", "done_at": done, "updated_at": done, "source_ref": f"msg:{chat_id}/{mid}", "chat_id": chat_id,
            "counterparty": p.get("committer"), "notified": True, "org_id": ORG, "created_at": msg["ts"], "demo_history": True})
        db.collection("chats").document(chat_id).collection("messages").document(mid).update({"promise.tracked_by": firestore.ArrayUnion(["rahul"])})
    from app.plantdata import refresh

    refresh(force=True)
    print("done")


def remove():
    n = 0
    for s in db.collection("records").where(filter=FieldFilter("demo_history", "==", True)).stream():
        for col in ("chunks",):
            db.collection(col).document(f"rec_{s.id}").delete()
        db.collection("record_vecs").document(s.id).delete()
        s.reference.delete()
        n += 1
    for s in db.collection("tasks").where(filter=FieldFilter("demo_history", "==", True)).stream():
        s.reference.delete()
        n += 1
    for chat_id in {m[0] for m in MESSAGES}:
        for s in db.collection("chats").document(chat_id).collection("messages").where(filter=FieldFilter("demo_history", "==", True)).stream():
            db.collection("chunks").document(f"m_{s.id}").delete()
            dec = db.collection("decisions").document(f"m_{s.id}")
            if dec.get().exists:
                db.collection("chunks").document(f"dec_m_{s.id}").delete()
                for later in db.collection("decisions").where(filter=FieldFilter("superseded_by", "==", f"m_{s.id}")).stream():
                    later.reference.update({"status": "active", "superseded_by": None})
                dec.delete()
            s.reference.delete()
            n += 1
    print("removed", n)


if __name__ == "__main__":
    remove() if "--remove" in sys.argv else add()
