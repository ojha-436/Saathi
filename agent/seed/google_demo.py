"""Sample Google data for the shared demo logins (prince, amit, neha, rahul, suresh, kavya @saathi.demo): Calendar meetings
with Google Meet links, Gmail with vendor promises (which become trackable tasks), and Drive files Saathi can answer from.
Demo logins are shared, so they can't connect a real Google account; this shows the same features with fictional data.
Every item is tagged `demo_google` and removable. Meetings run from 2 days ago to 3 weeks ahead: re-run before recording.

Run:    uv run python -m seed.google_demo
Remove: uv run python -m seed.google_demo --remove"""
import sys
from datetime import datetime, timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app import archive  # noqa: E402
from app.config import TZ  # noqa: E402
from app.firebase import FieldFilter, db  # noqa: E402  (works offline too)
from app.ingest import _chunk_doc  # noqa: E402

# Sample data stays out of the BigQuery deep-research archive (its writer is a background buffer a short script would cut off)
archive.mirror = lambda *a, **k: None

PERSONAS = ["prince", "amit", "neha", "rahul", "suresh", "kavya"]
VENDOR = "rajesh.mehta@omcastings.example"
MEET = "https://meet.google.com/{}"  # fictional codes; the app shows Join, and says it's a sample when clicked

# (key, title, weekdays (0=Mon) or "today", start hh:mm, minutes, attendees, outside guests, meet code, location)
MEETINGS = [
    ("standup", "Daily production stand-up", [0, 1, 2, 3, 4], "09:30", 20, PERSONAS, [], "srk-dply-std", "Bay 2 office"),
    ("omqr", "Om Castings supplier quality review", [0, 3], "15:00", 45, ["neha", "rahul", "prince"], [VENDOR], "omc-qlty-rvw", ""),
    ("design", "Design review: SRC-BF-2041 side frame Rev C", [1], "11:00", 60, ["prince", "amit", "kavya", "neha"], [], "src-bfrv-cdr", "Design office"),
    ("proc", "Procurement sync: Kaveri Steels S355J2 plates", [2], "16:00", 30, ["rahul", "kavya"], ["anita.rao@kaveristeels.example"], "kvr-plts-syn", ""),
    ("rdso", "RDSO inspection readiness check", [4], "14:30", 45, ["kavya", "neha", "prince", "suresh"], [], "rds-insp-rdy", "Conference room"),
    ("ncr", "Job 4522 porosity NCR: containment call with Om Castings", "today", "+90", 30, ["neha", "rahul", "prince"], [VENDOR], "ncr-4522-cnt", ""),
]

# persona -> [(days ago, hh:mm, from name, from address, subject, body, promise (committer, action, due in days) or None)]
EMAILS = {
    "prince": [
        (1, "10:12", "Rajesh Mehta", VENDOR, "Re: Job 4522 side frame castings – replacement dispatch",
         "Dear Prince ji,\nWe have re-poured the 2 side frame castings rejected for porosity at the bolster pocket. We will dispatch the 2 replacement "
         "castings for job 4522 by 22 October, with the sand moisture check sheet attached to the MTC as agreed.\nRegards,\nRajesh Mehta, Om Castings",
         ("Rajesh Mehta (Om Castings)", "Dispatch 2 replacement side frame castings for job 4522 with the sand moisture check sheet", 6)),
        (2, "16:40", "Kavya Iyer", "kavya@saathi.demo", "RDSO visit on 20 Oct – documents needed",
         "Prince, for the RDSO inspection on 20 Oct please keep the released Rev C drawing set of SRC-BF-2041, weld procedure WPS-12 Rev 3 and the "
         "Detail A weld sheet ready in the Bogie Project channel. Neha is preparing the MTC pack.", None),
        (4, "11:05", "Anita Rao", "anita.rao@kaveristeels.example", "MTC for heat H-77812 (S355J2 plates)",
         "Hello Prince,\nAttached is the mill test certificate for heat H-77812. Charpy impact at -20°C averaged 21 J. Our lab will repeat the test "
         "and we will send the re-test report by 23 October.\nAnita Rao, Kaveri Steels",
         ("Anita Rao (Kaveri Steels)", "Send the Charpy re-test report for heat H-77812", 7)),
    ],
    "neha": [
        (1, "09:20", "Rajesh Mehta", VENDOR, "8D report: porosity NCR on job 4522",
         "Dear Neha madam,\nRoot cause so far: sand moisture above limit on 2 moulds during the night shift. We will submit the full 8D report with "
         "corrective actions by 24 October.\nRajesh Mehta, Om Castings", ("Rajesh Mehta (Om Castings)", "Submit the 8D report for the job 4522 porosity NCR", 8)),
        (2, "14:15", "TPI Services", "inspection@tpiservices.example", "UT inspection slot confirmed: weld W7, job 4521",
         "Your third-party UT inspection for weld W7 on job 4521 is confirmed for 19 October at 4 pm at the UT bay. Please keep the job and the WPS ready.",
         ("TPI Services", "Carry out the UT inspection of weld W7 on job 4521", 3)),
        (5, "12:30", "Anita Rao", "anita.rao@kaveristeels.example", "Re: Charpy re-test for heat H-77812",
         "Neha, the re-test is booked at our NABL lab on 21 October. Results will follow two days later.", None),
    ],
    "rahul": [
        (1, "17:05", "Rajesh Mehta", VENDOR, "Revised delivery schedule: PO-7781",
         "Rahul ji,\nFor the balance 40 side frame castings on PO-7781 we will deliver 20 by 28 October and 20 by 5 November. The 2 replacements "
         "for job 4522 go separately on 22 October.\nRajesh", ("Rajesh Mehta (Om Castings)", "Deliver 20 castings on PO-7781 by 28 October", 12)),
        (3, "10:45", "Anita Rao", "anita.rao@kaveristeels.example", "Quotation Q-2231: S355J2 plates, 40 t",
         "Dear Rahul,\nOur quotation Q-2231 for 40 t of S355J2 plates is Rs 68,500 per tonne ex-works, valid until 31 October. Delivery 3 weeks from PO.", None),
        (2, "08:50", "Shree Ganesh Logistics", "dispatch@sgl.example", "Truck placement for Om Castings pickup",
         "We will place one 20 ft truck at Om Castings, Rajkot on 22 October morning for the replacement castings.",
         ("Shree Ganesh Logistics", "Place a truck at Om Castings on 22 October morning", 6)),
    ],
    "kavya": [
        (2, "11:30", "Inspection Cell", "inspection.cell@railinspect.example", "RDSO inspection on 20 Oct – agenda",
         "Agenda for 20 October: drawing set SRC-BF-2041 Rev C, MTCs for all heats used, weld procedure qualification, UT reports for main welds, "
         "and the NCR log for side frame castings. Inspection starts 10:30 am.", None),
        (1, "18:10", "Prince Kumar", "prince@saathi.demo", "Re: Rev C drawing set",
         "Kavya, I'll upload the final Rev C drawing set and the Detail A weld sheet to the Bogie Project channel by Friday.",
         ("Prince Kumar", "Upload the final Rev C drawing set and Detail A weld sheet", 3)),
    ],
    "suresh": [
        (1, "15:25", "Precision Machine Services", "service@pms.example", "CNC-3 spindle chiller: service visit",
         "Suresh ji, our engineer will visit on 18 October at 10 am to replace the spindle chiller pump on CNC-3. Please keep the machine isolated.",
         ("Precision Machine Services", "Replace the CNC-3 spindle chiller pump", 2)),
        (3, "09:10", "EHS Team", "ehs@shaktirail.example", "Near miss follow-up: oil spill near grinding area",
         "Please put drip trays under the grinding coolant line and add the oil spill to the shift checklist. We will re-audit Bay 2 next week.", None),
    ],
    "amit": [
        (2, "13:40", "Stress Lab", "lab@stresslab.example", "FEA for lightening holes: report date",
         "Amit, the FEA run for the revised lightening holes is done. We will share the full report with the fatigue check by 21 October.",
         ("Stress Lab", "Share the FEA report for the lightening holes", 5)),
        (4, "10:00", "Coach design office", "design.cell@coachdesign.example", "Comments on SRC-BF-2041 Rev C",
         "Two comments on Rev C: increase the fillet radius at Detail A to 12 mm and add the weld symbol for W7 on sheet 2.", None),
    ],
}

# persona -> [(days ago, name, mime, owner, text)]
DOC, SHEET = "application/vnd.google-apps.document", "application/vnd.google-apps.spreadsheet"
FILES = {
    "prince": [
        (3, "SRC-BF-2041 Rev C – change note", DOC, "Prince Kumar",
         "Change note for side frame drawing SRC-BF-2041. Rev C supersedes Rev B (released 6 Oct). Changes: Detail A fillet weld increased from 8 mm to "
         "10 mm, bolster pocket draft angle 3 degrees, lightening hole pattern unchanged. Approved by Amit Sharma and Neha Verma."),
        (6, "Job 4522 incoming inspection plan", DOC, "Prince Kumar",
         "Job 4522, 24 side frame castings from Om Castings. 100% visual, dye penetrant at the bolster pocket, dimensional check on 5 per lot, "
         "MTC review against EN 10025 S355J2. Hold any casting with porosity and raise an NCR."),
    ],
    "neha": [
        (2, "NCR tracker – side frame castings 2026", SHEET, "Neha Verma",
         "NCR,Job,Vendor,Defect,Qty,Status\nNCR-2026-0007,4522,Om Castings,Porosity at bolster pocket,2,Contained\n"
         "NCR-2026-0004,4498,Om Castings,Shrinkage at centre pivot,1,Closed\nNCR-2026-0002,4471,Bharat Foundry,Dimensional (wall thickness),3,Closed"),
        (8, "Incoming inspection checklist – castings", DOC, "Neha Verma",
         "Checklist: MTC heat number matches casting marking; chemistry and Charpy within EN 10025 S355J2; sand moisture check sheet attached; "
         "visual for porosity and cracks; dye penetrant at the bolster pocket; dimensions per SRC-BF-2041 current revision."),
    ],
    "rahul": [
        (1, "PO-7781 Om Castings – delivery schedule", SHEET, "Rahul Singh",
         "Lot,Qty,Promised date,Status\nLot 1,20,10 Oct,Delivered\nReplacements job 4522,2,22 Oct,Re-poured\nLot 2,20,28 Oct,Planned\nLot 3,20,5 Nov,Planned"),
        (5, "Vendor comparison – side frame castings", SHEET, "Rahul Singh",
         "Vendor,Price per casting (Rs),Lead time,NCRs this year,Notes\nOm Castings,41500,4 weeks,2,Audit due; sand moisture control\n"
         "Bharat Foundry,44800,6 weeks,1,Backup vendor"),
    ],
    "kavya": [
        (1, "RDSO inspection 20 Oct – readiness tracker", SHEET, "Kavya Iyer",
         "Item,Owner,Status\nRev C drawing set,Prince,In progress\nMTC pack for all heats,Neha,Ready except H-77812 re-test\n"
         "UT report weld W7,Neha,Booked 19 Oct\nNCR log,Neha,Ready\nWeld procedure WPS-12 Rev 3,Amit,Ready"),
        (9, "BG coach bogie prototype – project plan", DOC, "Kavya Iyer",
         "Milestones: Rev C drawings released 6 Oct; first 2 side frames machined by 15 Oct; RDSO inspection 20 Oct; prototype assembly 3 Nov. "
         "Risk: casting porosity at Om Castings; mitigation: vendor audit and sand moisture check sheet with every MTC."),
    ],
    "suresh": [
        (1, "Bay 2 shift handover log – October", SHEET, "Suresh Yadav",
         "Date,Shift,Notes\n14 Oct,B,CNC-3 spindle alarm twice; chiller topped up\n15 Oct,C,Job 4522 machining on CNC-4\n16 Oct,A,Oil spill near grinding, cleaned"),
        (4, "CNC-3 maintenance history", SHEET, "Suresh Yadav",
         "Date,Issue,Action,Downtime (h)\n2 Sep,Spindle overheat,Chiller filter cleaned,3\n29 Sep,Spindle overheat,Coolant changed,5\n14 Oct,Spindle alarm,Pump replacement booked,8"),
    ],
    "amit": [
        (2, "FEA notes – lightening holes", DOC, "Amit Sharma",
         "Revised lightening holes: peak von Mises stress 182 MPa at the hole edge under the vertical load case, below the 235 MPa allowable. "
         "Fatigue check pending from Stress Lab (due 21 Oct)."),
        (5, "Detail A weld sheet – draft", DOC, "Amit Sharma",
         "Detail A: fillet weld 10 mm, process MAG 135, wire ER70S-6, preheat 100 °C for plates over 25 mm, WPS-12 Rev 3. UT for weld W7 after PWHT."),
    ],
}


def _users() -> dict[str, dict]:
    out = {}
    for p in PERSONAS:
        for s in db.collection("users").where(filter=FieldFilter("email", "==", f"{p}@saathi.demo")).limit(1).stream():
            out[p] = {"uid": s.id, **s.to_dict()}
    return out


def add():
    if list(db.collection("connections").where(filter=FieldFilter("demo_google", "==", True)).limit(1).stream()):
        print("sample Google data already present; run with --remove first")
        return
    users = _users()
    now = datetime.now(TZ)
    today = now.replace(hour=0, minute=0, second=0, microsecond=0)
    emails = {p: f"{p}@saathi.demo" for p in PERSONAS}
    n_ev = n_mail = n_file = 0
    for p, u in users.items():
        uid, org = u["uid"], u["org_id"]
        mine = 0
        # calendar
        for key, title, days, at, mins, people, guests, code, location in MEETINGS:
            if p not in people:
                continue
            if days == "today":
                start = (now + timedelta(minutes=int(at[1:]))).replace(minute=0 if now.minute < 30 else 30, second=0, microsecond=0)
                slots = [start] if start.date() == now.date() else []
            else:
                hh, mm = map(int, at.split(":"))
                slots = [today + timedelta(days=i, hours=hh, minutes=mm) for i in range(-2, 22) if (today + timedelta(days=i)).weekday() in days]
            for start in slots:
                db.collection("events").document(f"{uid}_demo_{key}_{start:%Y%m%d}").set({
                    "uid": uid, "org_id": org, "provider": "google", "title": title, "start": start, "end": start + timedelta(minutes=mins),
                    "location": location, "meet_url": MEET.format(code), "html_link": None, "organizer": emails[people[0]],
                    "attendee_emails": [emails[x] for x in people] + guests, "attendee_uids": [users[x]["uid"] for x in people if x in users],
                    "private": False, "updated_at": now, "demo_google": True})
                n_ev += 1
                mine += 1
        # gmail
        for i, (ago, at, name, addr, subject, body, promise) in enumerate(EMAILS.get(p, [])):
            hh, mm = map(int, at.split(":"))
            ts = today - timedelta(days=ago) + timedelta(hours=hh, minutes=mm)
            item_id = f"{uid}_gmail_demo{i}"
            item = {"uid": uid, "org_id": org, "provider": "gmail", "kind": "email", "subject": subject, "from": f"{name} <{addr}>", "from_name": name,
                    "to": emails[p], "ts": ts, "snippet": body.replace("\n", " ")[:300], "url": None, "promise": None, "task_id": None,
                    "dismissed": False, "demo_google": True}
            if promise:
                item["promise"] = {"committer": promise[0], "action": promise[1], "confidence": 0.9,
                                   "due_at": (today + timedelta(days=promise[2], hours=17))}
            db.collection("external_items").document(item_id).set(item)
            text = f"Email from {name} — {subject}\n{body}"
            _chunk_doc(f"mail_demo{i}_{uid}", text=text, embed_text=text, members=[uid], chat={"id": f"mail_{uid}", "name": "Email", "org_id": org},
                       recheck=False, extra={"source_type": "email", "sender_name": name, "ts": ts, "ref": f"mail:{item_id}", "file_name": subject,
                                             "demo_google": True})
            n_mail += 1
        # drive
        for i, (ago, name, mime, owner, text) in enumerate(FILES.get(p, [])):
            ts = now - timedelta(days=ago, hours=2)
            item_id = f"{uid}_drive_demo{i}"
            db.collection("external_items").document(item_id).set({
                "uid": uid, "org_id": org, "provider": "drive", "kind": "file", "name": name, "mime": mime, "ts": ts, "url": None, "icon": None,
                "owner": owner, "modified_by": owner, "shared": True, "size": 0, "indexed": True, "snippet": text.replace("\n", " ")[:280],
                "demo_google": True})
            head = f"Drive file: {name} (owner {owner})\n{text}"
            _chunk_doc(f"drv_demo{i}_{uid}_0", text=head, embed_text=head, members=[uid], chat={"id": f"drive_{uid}", "name": "Google Drive", "org_id": org},
                       recheck=False, extra={"source_type": "drive", "file_name": name, "sender_name": owner, "ts": ts, "ref": f"drive:{item_id}",
                                             "demo_google": True})
            n_file += 1
        db.collection("connections").document(f"{uid}_google").set({
            "uid": uid, "org_id": org, "provider": "google", "email": emails[p], "services": ["calendar", "gmail", "drive"], "status": "demo",
            "error": None, "created_at": now, "last_sync": now, "demo_google": True,
            "stats": {"events": mine, "emails": len(EMAILS.get(p, [])),
                      "email_promises": len([e for e in EMAILS.get(p, []) if e[6]]), "files": len(FILES.get(p, []))}})
        ref = db.collection("user_settings").document(uid)
        if ref.get().exists:
            ref.update({"connected": ["calendar", "gmail", "drive"]})
        else:
            ref.set({"org_id": org, "connected": ["calendar", "gmail", "drive"]})
    print(f"sample Google data for {len(users)} demo logins: {n_ev} meetings, {n_mail} emails, {n_file} Drive files")


def remove():
    n = 0
    users = _users()
    for col in ("events", "external_items", "connections"):
        for s in db.collection(col).where(filter=FieldFilter("demo_google", "==", True)).stream():
            s.reference.delete()
            n += 1
    for s in db.collection("chunks").where(filter=FieldFilter("demo_google", "==", True)).stream():
        s.reference.delete()
        n += 1
    for u in users.values():
        for cid in (f"mail_{u['uid']}", f"drive_{u['uid']}"):
            try:
                archive.delete_chunks(chat_id=cid)
            except Exception as e:
                print("archive cleanup skipped:", cid, str(e)[:120])
        ref = db.collection("user_settings").document(u["uid"])
        if ref.get().exists:
            ref.update({"connected": []})
    print("removed", n)


if __name__ == "__main__":
    remove() if "--remove" in sys.argv else add()
