"""Resets and seeds the demo workspace. Run: uv run python -m seed.seed"""
import mimetypes
import sys
from datetime import datetime, timedelta
from pathlib import Path

from firebase_admin import auth

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app import ingest  # noqa: E402
from app.config import TZ  # noqa: E402
from app.firebase import bucket, db  # noqa: E402

FILES = Path(__file__).parent / "files"
PASSWORD = "Saathi@2026"

USERS = {
    "prince": ("Prince Kumar", "Design Engineer"),
    "amit": ("Amit Sharma", "Senior Design Engineer"),
    "neha": ("Neha Verma", "QA Manager"),
    "rahul": ("Rahul Singh", "Procurement Lead"),
    "suresh": ("Suresh Yadav", "Shop Floor Supervisor, Bay 2"),
    "kavya": ("Kavya Iyer", "Project Manager"),
}

CHATS = {
    "dm_amit_prince": ("dm", "", ["amit", "prince"]),
    "dm_neha_prince": ("dm", "", ["neha", "prince"]),
    "dm_prince_rahul": ("dm", "", ["prince", "rahul"]),
    "dm_amit_neha": ("dm", "", ["amit", "neha"]),
    "grp_bogie": ("channel", "Bogie Project - BG Coach", ["prince", "amit", "neha", "kavya", "rahul"]),
    "grp_bay2": ("group", "Shop Floor - Bay 2", ["prince", "suresh", "neha"]),
}

NOW = datetime.now(TZ)


def at(days_ago: int, hh: int, mm: int) -> datetime:
    return (NOW - timedelta(days=days_ago)).replace(hour=hh, minute=mm, second=0, microsecond=0)


# (chat, sender, when, text, file)
MESSAGES = [
    ("dm_prince_rahul", "rahul", at(11, 15, 10), "Prince, quotation from Om Castings for the axle box housing is attached. Rate looks ~6% lower than last PO.", "Quote_OmCastings_AxleBoxHousing_Q-2219.pdf"),
    ("dm_amit_prince", "amit", at(9, 11, 0), "Prince, sharing the side frame GA Rev B for your check.", "SRC-BF-2041_RevB_SideFrame_GA.pdf"),
    ("dm_amit_prince", "prince", at(9, 15, 30), "Checked. Looks fine except note 2 - 8 mm weld at the bolster pocket feels low for fatigue. Let's discuss with Neha.", None),
    ("grp_bogie", "kavya", at(8, 10, 0), "Kick-off for the BG coach bogie prototype. Target: first article inspection by 30 Oct. Please keep all drawing and QA updates in this group.", None),
    ("dm_neha_prince", "neha", at(6, 14, 0), "MTC for heat H-77812 received from Om Steel, all chemical and mechanical values pass.", "MTC_H-77812_Ladle_Analysis.pdf"),
    ("grp_bogie", "kavya", at(5, 17, 15), "Final decision: side frame material stays EN 10025 S355J2, no change to the cast grade. Thanks all for the inputs.", None),
    ("dm_amit_prince", "amit", at(4, 10, 15), "Fatigue review done, bolster pocket weld increased to 10 mm. Rev C attached - Neha approved it today.", "SRC-BF-2041_RevC_SideFrame_GA.pdf"),
    ("grp_bogie", "neha", at(4, 12, 40), "Rev C of SRC-BF-2041 is approved. Shop floor to use Rev C from today; Rev B is superseded.", None),
    ("dm_amit_neha", "amit", at(3, 18, 5), "Neha, internal draft Rev D with lightening holes in the web. FEA still running - please don't circulate yet.", "SRC-BF-2041_RevD_DRAFT_internal.pdf"),
    ("grp_bay2", "suresh", at(3, 9, 20), "Job 4521 ka welding complete ho gaya, inspection aaj dopahar hoga.", None),
    ("dm_neha_prince", "neha", at(3, 16, 20), "Job 4521 stage inspection done. Conditionally accepted - UT of weld W7 is pending.", "Inspection_Report_Job4521_Welding.pdf"),
    ("dm_neha_prince", "neha", at(3, 16, 22), "I'll share the UT report for weld W7 by Saturday.", None),
    ("grp_bay2", "suresh", at(2, 10, 5), "Rev C wala drawing mil gaya, ab 10 mm weld ke saath kaam chal raha hai.", None),
    ("dm_prince_rahul", "rahul", at(2, 11, 30), "Om Castings confirmed on call - first lot of 24 axle box housings will be dispatched on 15th.", None),
    ("dm_prince_rahul", "rahul", at(2, 11, 32), "Prince, please confirm drawing SRC-AB-1107 Rev A is still valid for this lot before they start machining.", None),
    ("dm_amit_prince", "amit", at(2, 17, 40), "Prince, I'll send the updated weld detail sheet (Detail A) by Friday.", None),
    ("grp_bogie", "kavya", at(1, 11, 0), "Customer (RDSO) inspection visit confirmed for 20 Oct. Prince, please prepare the complete drawing pack by 17 Oct.", None),
    ("grp_bogie", "amit", at(1, 11, 25), "I'll update the drawing register with Rev C tomorrow.", None),
    ("dm_amit_prince", "amit", at(1, 12, 5), "Also, can you review the FEA summary for the lightening holes when you're back? Need your comments by Monday.", None),
    ("grp_bay2", "suresh", at(1, 16, 45), "Job 4522 ke liye castings kal tak aa jayengi, aate hi batata hoon.", None),
    ("grp_bogie", "rahul", at(0, 9, 10), "PO-SRC-2026-0412 side frame castings: 24 Nos received at stores with MTC. Moving to incoming inspection.", None),
]


def wipe():
    for col in ["chunks", "files", "tasks", "notifications", "audit_log"]:
        for s in db.collection(col).stream():
            s.reference.delete()
    for chat in db.collection("chats").stream():
        for m in chat.reference.collection("messages").stream():
            m.reference.delete()
        chat.reference.delete()
    for a in db.collection("assistant").list_documents():
        for m in a.collection("messages").stream():
            m.reference.delete()


def ensure_users():
    for uid, (name, role) in USERS.items():
        email = f"{uid}@saathi.demo"
        try:
            auth.get_user(uid)
            auth.update_user(uid, email=email, password=PASSWORD, display_name=name)
        except auth.UserNotFoundError:
            auth.create_user(uid=uid, email=email, password=PASSWORD, display_name=name)
        db.collection("users").document(uid).set({"name": name, "role": role, "email": email})


def main():
    print("wiping...")
    wipe()
    print("users...")
    ensure_users()
    names = {u: v[0] for u, v in USERS.items()}
    for cid, (ctype, cname, members) in CHATS.items():
        chat = {"type": ctype, "name": cname, "members": sorted(members), "last_ts": at(30, 9, 0), "last_text": "", "ai_excluded": False}
        if ctype == "channel":
            chat |= {"name_key": cname.lower(), "visibility": "public", "owners": ["kavya"], "created_by": "kavya",
                     "description": "BG coach bogie prototype: drawings, QA and vendor updates"}
        db.collection("chats").document(cid).set(chat)
    for i, (cid, sender, ts, text, fname) in enumerate(MESSAGES):
        ctype, cname, members = CHATS[cid]
        msg_id = f"seed{i:03d}"
        body = {"sender": sender, "sender_name": names[sender], "text": text, "ts": ts}
        file_id = None
        if fname:
            file_id = f"file{i:03d}"
            data = (FILES / fname).read_bytes()
            mime = mimetypes.guess_type(fname)[0] or "application/pdf"
            path = f"chats/{cid}/{file_id}/{fname}"
            bucket.blob(path).upload_from_string(data, content_type=mime)
            db.collection("files").document(file_id).set(
                {"name": fname, "mime": mime, "size": len(data), "gcs_path": path, "chat_id": cid, "chat_name": cname,
                 "members": sorted(members), "uploaded_by": sender, "uploaded_by_name": names[sender], "ts": ts, "status": "processing"}
            )
            body["file"] = {"id": file_id, "name": fname, "mime": mime, "size": len(data), "status": "processing"}
        db.collection("chats").document(cid).collection("messages").document(msg_id).set(body)
        db.collection("chats").document(cid).update({"last_ts": ts, "last_text": (text or fname)[:120], "last_sender": names[sender]})
        print(f"[{i + 1}/{len(MESSAGES)}] {cid} {names[sender]}: {text[:50]}")
        ingest.process_message(cid, msg_id)
        if file_id:
            ingest.process_file(cid, msg_id, file_id)
    print("done. Login: prince@saathi.demo /", PASSWORD)


if __name__ == "__main__":
    main()
