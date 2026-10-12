"""Stages a realistic shift in "Shop Floor - Bay 2" for demoing the AI shift handover: messages from the CURRENT shift, an
open CNC-3 downtime record and a contained porosity NCR, posted to the bay's group. Turns on automatic handovers for the bay.
Everything is tagged `demo_shift` and removable.

Run before recording:  uv run python -m seed.shift
Remove:                uv run python -m seed.shift --remove"""
import sys
from datetime import datetime, timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from google.cloud.firestore_v1.base_query import FieldFilter  # noqa: E402

from app import ingest, records  # noqa: E402
from app.config import TZ  # noqa: E402
from app.firebase import db, user_profile  # noqa: E402
from app.handover import current_shift  # noqa: E402

ORG, CHAT = "shakti-rail", "grp_bay2"

# minutes after shift start, sender, text
MESSAGES = [
    (25, "suresh", "CNC-3 pe phir se spindle alarm aaya, machine band hai. Maintenance (Ramesh) ko bola hai, chiller check kar rahe hain."),
    (70, "neha", "Job 4522 side frame castings (Om Castings) incoming inspection done: 2 pieces on HOLD for porosity at the bolster pocket. Tagged and moved to the quarantine rack, NCR raised."),
    (95, "suresh", "Job 4522 ke baaki 22 pieces machining me chale gaye, Rev C drawing ke saath. CNC-4 pe chal raha hai."),
    (130, "suresh", "Grinding area ke paas oil spill tha, kisi ka pair phisal gaya tha, chot nahi lagi. Saaf kar diya, near miss hai."),
    (160, "prince", "Suresh, I'll send the updated Detail A weld sheet by tomorrow 10 am."),
    (185, "neha", "For next shift: UT of weld W7 on job 4521 is still pending. UT operator comes at 4 pm, please keep the job ready at the UT bay."),
]


def add():
    shift = current_shift(ORG)
    start, now = shift["start"], datetime.now(TZ)
    span = max((now - start).total_seconds() / 60 - 5, 30)
    scale = min(1.0, span / 200)  # squeeze the shift's events into the time that has passed
    for i, (mins, sender, text) in enumerate(MESSAGES):
        ts = start + timedelta(minutes=mins * scale)
        mid = f"shift{i:02d}{shift['key'].replace('-', '')}"
        db.collection("chats").document(CHAT).collection("messages").document(mid).set(
            {"sender": sender, "sender_name": user_profile(sender)["name"], "text": text, "ts": ts, "demo_shift": True})
        ingest.process_message(CHAT, mid)
    team = sorted({"neha", "prince", "2YYb0LSmtrhu32pb3gCZCA0VBd13", "suresh"})
    t_dt, t_ncr = start + timedelta(minutes=25 * scale), start + timedelta(minutes=70 * scale)
    recs = [
        ("dt", "downtime", "suresh", "suresh", t_dt, "open", {
            "title": "CNC-3 spindle overheat alarm, machine stopped", "description": "Spindle temperature alarm on CNC-3 again. Machine stopped; maintenance checking the chiller.",
            "machine": "CNC-3", "location": "Bay 2", "downtime_reason": "breakdown"}, {}),
        ("ncr", "ncr", "neha", "neha", t_ncr, "contained", {
            "title": "Porosity at bolster pocket, job 4522 side frame castings", "description": "2 side frame castings from Om Castings on HOLD after incoming inspection: porosity at the bolster pocket.",
            "part_name": "Side frame casting", "drawing_no": "SRC-BF-2041", "revision": "C", "job_no": "4522", "vendor": "Om Castings", "defect_type": "porosity",
            "severity": "major", "quantity": "2 Nos", "location": "Bay 2"}, {"containment": "2 pieces tagged HOLD and moved to the quarantine rack."}),
    ]
    for kind, rtype, reporter, owner, created, status, fields, capa in recs:
        number = records._counter(ORG, rtype)
        rid = f"shift_{kind}_{shift['key'].replace('-', '')}"
        history = [{"status": "open", "by": reporter, "ts": created}] + ([{"status": status, "by": owner, "ts": created + timedelta(minutes=10)}] if status != "open" else [])
        db.collection("records").document(rid).set({
            "org_id": ORG, "type": rtype, "number": number, "status": status, "fields": {k: None for k in records.EDITABLE} | fields, "owner": owner,
            "reporter": reporter, "reporter_name": user_profile(reporter)["name"], "anonymous": False, "participants": sorted(set(team) | {owner, reporter}),
            "media": [], "chat_id": CHAT, "history": history, "links": {}, "capa": capa, "created_at": created, "updated_at": created, "capture_seconds": None,
            "demo_shift": True})
        records._index(rid)
        print(number, fields["title"])
    db.collection("chats").document(CHAT).update({"handover_enabled": True})
    print(f"staged shift {shift['name']} ({shift['start']:%H:%M}-{shift['end']:%H:%M})")


def remove():
    n = 0
    for s in db.collection("records").where(filter=FieldFilter("demo_shift", "==", True)).stream():
        db.collection("chunks").document(f"rec_{s.id}").delete()
        db.collection("record_vecs").document(s.id).delete()
        s.reference.delete()
        n += 1
    for s in db.collection("chats").document(CHAT).collection("messages").where(filter=FieldFilter("demo_shift", "==", True)).stream():
        db.collection("chunks").document(f"m_{s.id}").delete()
        s.reference.delete()
        n += 1
    for s in db.collection("handovers").where(filter=FieldFilter("chat_id", "==", CHAT)).stream():
        db.collection("chunks").document(f"ho_{s.id}").delete()
        for m in db.collection("chats").document(CHAT).collection("messages").where(filter=FieldFilter("handover_id", "==", s.id)).stream():
            m.reference.delete()
        s.reference.delete()
        n += 1
    print("removed", n, "(record counters are not rolled back)")


if __name__ == "__main__":
    remove() if "--remove" in sys.argv else add()
