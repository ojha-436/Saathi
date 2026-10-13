"""Fast demo reset (no AI calls): clears assistant chats, tasks, alerts, promise tracking and messages added after seeding.
Run before a demo: uv run python -m seed.reset   (use seed.seed for a full rebuild)"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from app.firebase import FieldFilter, bucket, db  # noqa: E402

for col in ["tasks", "notifications", "audit_log"]:
    for s in db.collection(col).stream():
        s.reference.delete()
for a in db.collection("assistant").list_documents():
    for m in a.collection("messages").stream():
        m.reference.delete()
for chat in db.collection("chats").stream():
    last = None
    for m in chat.reference.collection("messages").order_by("ts").stream():
        d = m.to_dict()
        if not m.id.startswith("seed"):  # added during a demo
            if d.get("file"):
                fid = d["file"]["id"]
                f = db.collection("files").document(fid).get()
                if f.exists:
                    bucket.blob(f.get("gcs_path")).delete()
                    f.reference.delete()
                for c in db.collection("chunks").where(filter=FieldFilter("file_id", "==", fid)).stream():
                    c.reference.delete()
            db.collection("chunks").document(f"m_{m.id}").delete()
            m.reference.delete()
            continue
        if d.get("promise"):
            m.reference.update({"promise.tracked_by": [], "promise.dismissed_by": []})
        last = d
    if last:
        chat.reference.update({"last_ts": last["ts"], "last_text": (last.get("text") or last.get("file", {}).get("name", ""))[:120], "last_sender": last["sender_name"]})
print("demo reset done")
