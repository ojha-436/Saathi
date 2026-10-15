"""Background pipelines: index messages/files for search, detect promises and decisions, extract document fields."""
import logging
import re
from datetime import datetime, timedelta

from google.genai import types
from pydantic import BaseModel

from . import ai, archive
from .config import DOCAI_LOCATION, DOCAI_PROCESSOR, PROJECT, TZ, VISION_MODEL
from .firebase import db, user_profile, Vector

log = logging.getLogger("saathi.ingest")

# Cheap pre-filter so only likely commitments/decisions reach Gemini (English + Hinglish)
SIGNAL_HINT = re.compile(
    r"\b(i'?ll|i will|we will|we'?ll|will (send|share|dispatch|update|check|confirm|revert|complete|deliver)|"
    r"by (mon|tue|wed|thu|fri|sat|sun)\w*|by tomorrow|tomorrow|tonight|eod|by \d|on \d{1,2}(st|nd|rd|th)\b|next week|"
    r"kal|parso|aaj|bhej|de dunga|de denge|kar dunga|kar denge|ho jayega|dispatch|deadline|"
    r"approved|final|finali[sz]ed?|decided|decision|go ahead|let'?s go with|confirmed|freeze|frozen)\b",
    re.I,
)


class Signal(BaseModel):
    is_commitment: bool
    committer: str
    action: str
    due_at: str | None
    confidence: float
    is_decision: bool
    decision: str | None


class Revision(BaseModel):
    rev: str
    date: str | None
    description: str | None
    approved_by: str | None


class KeyField(BaseModel):
    name: str
    value: str


class DocExtract(BaseModel):
    doc_type: str
    title: str
    summary: str
    drawing_no: str | None
    revision: str | None
    approved_by: str | None
    job_no: str | None
    vendor: str | None
    heat_no: str | None
    po_no: str | None
    key_fields: list[KeyField]
    revisions: list[Revision]
    full_text: str


# ---------------- offline fallbacks (local mode without a Gemini key) ----------------

_FIRST_PERSON = re.compile(r"\b(i'?ll|i will|we'?ll|we will|kar dunga|bhej dunga|de dunga|batata hoon|bata dunga)\b", re.I)
_VENDOR_WILL = re.compile(r"\bwill be (dispatched|delivered|shipped|sent)\b|\bdispatch(ed)? on\b", re.I)
_REQUEST = re.compile(r"\b(please|can you|could you|kindly)\b|\?\s*$", re.I)
_DECISION = re.compile(r"\b(final decision|final:|approved|finali[sz]ed|decided|go ahead)\b", re.I)
_WEEKDAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"]


def _due_from_text(text: str, sent_at: datetime) -> str | None:
    t = text.lower()
    base = sent_at.astimezone(TZ)
    evening = {"hour": 18, "minute": 0, "second": 0, "microsecond": 0}
    m = re.search(r"\b(?:by|on) (mon|tue|wed|thu|fri|sat|sun)\w*", t)
    if m:
        ahead = (_WEEKDAYS.index(m.group(1)) - base.weekday()) % 7 or 7
        return (base + timedelta(days=ahead)).replace(**evening).isoformat()
    if re.search(r"\b(tomorrow|kal)\b", t):
        hour = 10 if re.search(r"subah|morning", t) else 18
        return (base + timedelta(days=1)).replace(hour=hour, minute=0, second=0, microsecond=0).isoformat()
    m = re.search(r"\bon (\d{1,2})(?:st|nd|rd|th)\b", t)
    if m:
        day = int(m.group(1))
        for add_month in (0, 1):
            month = base.month + add_month
            year = base.year + (month - 1) // 12
            month = (month - 1) % 12 + 1
            try:
                due = base.replace(year=year, month=month, day=day, **evening)
            except ValueError:
                continue
            if due > base:
                return due.isoformat()
    return None


def classify_offline(text: str, sender_name: str, sent_at: datetime) -> Signal:
    """Rule-based stand-in for the Gemini classifier."""
    mine = bool(_FIRST_PERSON.search(text))
    theirs = bool(_VENDOR_WILL.search(text))
    commit = (mine or theirs) and not _REQUEST.search(text)
    committer = sender_name
    if commit and theirs and not mine:
        m = re.search(r"\b([A-Z][\w&.]+(?: [A-Z][\w&.]+)*) (?:confirmed|will|has)", text)
        committer = m.group(1) if m else sender_name
    action = re.sub(r"^\w+, ", "", text).strip().rstrip(".")
    action = re.sub(r"^(i'?ll|i will|we'?ll|we will) ", "", action, flags=re.I)
    action = (action[:1].upper() + action[1:])[:140]
    decision = bool(_DECISION.search(text))
    return Signal(
        is_commitment=commit, committer=committer if commit else "", action=action if commit else "",
        due_at=_due_from_text(text, sent_at) if commit else None, confidence=0.8 if commit else 0.0,
        is_decision=decision, decision=text.strip()[:160] if decision else None,
    )


def _after(lines: list[str], label: str) -> str | None:
    for i, ln in enumerate(lines[:-1]):
        if ln.strip().rstrip(":").lower() == label.lower():
            return lines[i + 1].strip()
    return None


def extract_document_offline(data: bytes, mime: str, file_name: str) -> DocExtract:
    """Rule-based stand-in for Gemini document extraction, using the PDF text layer."""
    import io

    text = ""
    if mime == "application/pdf":
        from pypdf import PdfReader

        text = "\n".join((pg.extract_text() or "") for pg in PdfReader(io.BytesIO(data)).pages)
    lines = [ln.strip() for ln in text.splitlines() if ln.strip()]
    name = file_name.lower()
    if "quote" in name or "quotation" in text.lower()[:400]:
        doc_type = "vendor_quote"
    elif name.startswith("mtc") or "mill test certificate" in text.lower():
        doc_type = "test_certificate"
    elif "inspection" in name:
        doc_type = "inspection_report"
    elif _after(lines, "DRAWING No.") or "drawing" in name or re.search(r"\bSRC-[A-Z]{2}-\d+", file_name):
        doc_type = "engineering_drawing"
    else:
        doc_type = "other"

    def grab(pattern: str, haystack: str, flags: int = 0) -> str | None:
        m = re.search(pattern, haystack, flags)
        return (m.group(1) if m.groups() else m.group(0)) if m else None

    drawing_no = _after(lines, "DRAWING No.") or grab(r"\b[A-Z]{2,4}-[A-Z]{2}-\d{3,5}\b", file_name)
    revision = _after(lines, "REVISION") or grab(r"Rev([A-Z0-9]+)", file_name)
    approved = _after(lines, "APPROVED BY")
    job = grab(r"Job\s*(\d{3,})", file_name + " " + text, re.I)
    heat = _after(lines, "Heat No.") or grab(r"\bH-\d{4,}\b", file_name + " " + text)
    po = _after(lines, "Purchase Order") or grab(r"\bPO-[A-Z0-9-]+", text)
    vendor = grab(r"Issued by:\s*([^|]+)", text)
    if not vendor and doc_type == "vendor_quote" and lines:
        vendor = lines[0].title()

    revisions = []
    if "APPROVED" in lines and "COMPANY" in lines:
        rows = lines[lines.index("APPROVED") + 1 : lines.index("COMPANY")]
        for i in range(0, len(rows) - 3, 4):
            revisions.append(Revision(rev=rows[i], description=rows[i + 1], date=rows[i + 2], approved_by=rows[i + 3]))

    key_fields = []
    for label in ["TITLE", "MATERIAL", "APPROVAL DATE", "Material Grade", "Quantity", "Date of Issue", "Purchase Order"]:
        if v := _after(lines, label):
            key_fields.append(KeyField(name=label.title(), value=v[:120]))
    for ln in lines:
        if re.match(r"^(OVERALL RESULT|Delivery|Payment terms|Validity|TOTAL)\b", ln):
            key_fields.append(KeyField(name=ln.split(":")[0][:40], value=ln.split(":", 1)[-1].strip()[:140]))
    title = _after(lines, "TITLE") or (lines[0].title() if lines else file_name)
    summary = f"{doc_type.replace('_', ' ').title()}: {title}." + (f" Drawing {drawing_no} Rev {revision}." if drawing_no and revision else "")
    return DocExtract(
        doc_type=doc_type, title=title, summary=summary, drawing_no=drawing_no, revision=revision, approved_by=approved,
        job_no=job, vendor=vendor, heat_no=heat, po_no=po, key_fields=key_fields[:12], revisions=revisions, full_text=text[:4000],
    )


def _chunk_doc(chunk_id: str, *, text: str, embed_text: str, members: list[str], chat: dict, extra: dict, recheck: bool = True):
    vec = ai.embed([embed_text])[0]
    ref = db.collection("chunks").document(chunk_id)
    data = {
        "text": text,
        "embedding": Vector(vec),
        "members": members,
        "chat_id": chat["id"],
        "chat_name": chat.get("name", ""),
        "keywords": ai.keywords(embed_text),
        "org_id": chat.get("org_id") or extra.get("org_id", ""),
        **extra,
    }
    ref.set(data)
    archive.mirror(chunk_id, data, data["org_id"])  # BigQuery archive index for deep research
    if not recheck:
        return
    # Membership or the name may have changed while we were embedding (join, removal, rename). Re-read after the
    # write: a change committed before this point is fixed here, one committed after it is fixed by main.sync_members.
    now_chat = db.collection("chats").document(chat["id"]).get().to_dict() or {}
    if not now_chat or now_chat.get("ai_excluded"):
        ref.delete()
    elif now_chat.get("members") != members or now_chat.get("name", "") != chat.get("name", ""):
        ref.update({"members": now_chat.get("members", []), "chat_name": now_chat.get("name", "")})


def classify_signals(text: str, sender_name: str, sent_at: datetime, chat: dict) -> Signal | None:
    if not SIGNAL_HINT.search(text or ""):
        return None
    if ai.client is None:
        return classify_offline(text, sender_name, sent_at)
    member_names = ", ".join(user_profile(u)["name"] for u in chat.get("members", []))
    prompt = f"""You analyse one workplace chat message from an Indian manufacturing company.
Message sent at: {sent_at.astimezone(TZ).strftime('%A %d %B %Y %H:%M')} (Asia/Kolkata)
Sender: {sender_name}
Chat members: {member_names}
Message: \"\"\"{text}\"\"\"

1. is_commitment: true only if someone commits to do a concrete action (e.g. "I'll send the drawing by Friday", "vendor will dispatch on 15th", "kal bhej dunga"). Questions, requests and past actions are NOT commitments.
   committer: the person or party who will do it (use the sender's name for "I"/"we"; a vendor name if the vendor commits).
   action: short imperative phrase, e.g. "Send updated weld detail drawing".
   due_at: ISO 8601 with +05:30 offset resolved relative to the send time (kal = tomorrow, parso = day after, EOD/shaam = 18:00, morning/subah = 10:00, a bare day = 18:00 that day), or null if no time given.
   confidence: 0..1.
2. is_decision: true if the message records a final decision/approval (e.g. "Final: we go with S355J2", "Rev C approved"). decision: one-line summary or null.
If not a commitment, set committer and action to empty strings."""
    try:
        return ai.generate_json(prompt, Signal)
    except Exception:
        log.exception("signal classification failed")
        return None


def process_message(chat_id: str, msg_id: str) -> None:
    chat_snap = db.collection("chats").document(chat_id).get()
    chat = {"id": chat_id, **(chat_snap.to_dict() or {})}
    if chat.get("ai_excluded"):
        return
    ref = db.collection("chats").document(chat_id).collection("messages").document(msg_id)
    msg = ref.get().to_dict() or {}
    text = (msg.get("text") or "").strip()
    if not text or msg.get("system"):
        return
    sender = msg.get("sender_name", "")
    sent_at = msg.get("ts") or datetime.now(TZ)

    _chunk_doc(
        f"m_{msg_id}",
        text=text,
        embed_text=f"[{chat.get('name', '')}] {sender}: {text}",
        members=chat.get("members", []),
        chat=chat,
        extra={
            "source_type": "message",
            "message_id": msg_id,
            "sender_name": sender,
            "ts": sent_at,
            "ref": f"msg:{chat_id}/{msg_id}",
        },
    )

    sig = classify_signals(text, sender, sent_at, chat)
    if not sig:
        return
    update = {}
    if sig.is_commitment and sig.confidence >= 0.7 and sig.action:
        due = ai.parse_iso(sig.due_at)
        update["promise"] = {
            "committer": sig.committer,
            "action": sig.action,
            "due_at": due,
            "confidence": round(sig.confidence, 2),
            "tracked_by": [],
            "dismissed_by": [],
        }
    if sig.is_decision and sig.decision:
        update["decision"] = sig.decision
    if update:
        ref.update(update)
    if update.get("decision") and chat.get("org_id"):
        from .decisions import capture_from_message

        capture_from_message(chat, msg_id, msg, update["decision"])


def ocr_document(data: bytes, mime: str) -> dict | None:
    """Document AI OCR (layout-accurate text + confidence). Returns None when not configured or unsupported."""
    if not DOCAI_PROCESSOR or not (mime == "application/pdf" or mime.startswith("image/")):
        return None
    from google.cloud import documentai

    client = documentai.DocumentProcessorServiceClient(
        client_options={"api_endpoint": f"{DOCAI_LOCATION}-documentai.googleapis.com"}
    )
    name = client.processor_path(PROJECT, DOCAI_LOCATION, DOCAI_PROCESSOR)
    try:
        res = client.process_document(
            request=documentai.ProcessRequest(name=name, raw_document=documentai.RawDocument(content=data, mime_type=mime))
        )
    except Exception:
        log.exception("Document AI OCR failed")
        return None
    doc = res.document
    confs = [b.layout.confidence for p in doc.pages for b in p.blocks if b.layout and b.layout.confidence]
    return {
        "engine": "Document AI OCR",
        "pages": len(doc.pages),
        "confidence": round(sum(confs) / len(confs), 3) if confs else None,
        "text": (doc.text or "")[:12000],
    }


def extract_document(data: bytes, mime: str, file_name: str, ocr_text: str = "") -> DocExtract:
    if ai.client is None:
        return extract_document_offline(data, mime, file_name)
    prompt = f"""You are a document-intelligence engine for a railway rolling-stock component manufacturer.
File name: {file_name}
Classify the document (doc_type: engineering_drawing | test_certificate | inspection_report | vendor_quote | purchase_order | specification | other)
and extract fields. For engineering drawings read the TITLE BLOCK (drawing number, current revision, approved by) and the REVISION TABLE (every row).
Use null when a field is absent. key_fields: up to 12 most important name/value pairs (e.g. material grade, heat no, test results, price, delivery date).
summary: 2-3 sentences. full_text: the readable text content (max ~4000 characters)."""
    if ocr_text:
        prompt += f"\n\nOCR text from Document AI (use it to read small or scanned text accurately):\n{ocr_text[:8000]}"
    part = types.Part.from_bytes(data=data, mime_type=mime)
    return ai.generate_json(prompt, DocExtract, model=VISION_MODEL, parts=[part])


def process_file(chat_id: str, msg_id: str, file_id: str) -> None:
    chat_snap = db.collection("chats").document(chat_id).get()
    chat = {"id": chat_id, **(chat_snap.to_dict() or {})}
    file_ref = db.collection("files").document(file_id)
    if chat.get("ai_excluded"):
        file_ref.update({"status": "ready", "msg_id": msg_id})
        db.collection("chats").document(chat_id).collection("messages").document(msg_id).update({"file.status": "ready"})
        return
    f = file_ref.get().to_dict() or {}
    from .firebase import bucket

    data = bucket.blob(f["gcs_path"]).download_as_bytes()
    mime = f.get("mime") or "application/pdf"
    ocr = ocr_document(data, mime)
    if ocr and ocr.get("text"):
        try:  # certificates: start Spec Check now, in parallel with the slower full document extraction
            from .specs import early_check

            early_check(file_id, msg_id, ocr["text"])
        except Exception:
            log.exception("early spec check failed to start for %s", file_id)
    try:
        doc = extract_document(data, mime, f.get("name", ""), ocr["text"] if ocr else "")
    except Exception:
        log.exception("document extraction failed for %s", file_id)
        file_ref.update({"status": "failed"})
        return

    fields = doc.model_dump(exclude={"full_text"})
    ocr_meta = {k: v for k, v in (ocr or {}).items() if k != "text"} or None
    file_ref.update({"status": "ready", "doc": fields, "extracted_text": doc.full_text[:20000], "ocr": ocr_meta, "msg_id": msg_id})
    try:
        from .specs import maybe_check

        maybe_check(file_id, doc.doc_type)
    except Exception:
        log.exception("spec check enqueue failed for %s", file_id)
    msg_ref = db.collection("chats").document(chat_id).collection("messages").document(msg_id)
    msg_ref.update(
        {
            "file.doc": {
                "doc_type": doc.doc_type,
                "title": doc.title,
                "summary": doc.summary,
                "drawing_no": doc.drawing_no,
                "revision": doc.revision,
                "approved_by": doc.approved_by,
            },
            "file.status": "ready",
            "file.ocr": ocr_meta,
        }
    )

    from .drawings import rebuild_for_file

    rebuild_for_file(file_id)  # drawing register / Revision Guard (released state is workspace knowledge)
    if chat.get("ai_excluded"):
        return
    field_lines = "; ".join(f"{k.name}: {k.value}" for k in doc.key_fields)
    ident = " ".join(
        x for x in [doc.drawing_no, f"Rev {doc.revision}" if doc.revision else None, doc.job_no, doc.heat_no, doc.po_no, doc.vendor] if x
    )
    head = f"{f.get('name', '')} | {doc.doc_type} | {doc.title} | {ident}\n{doc.summary}\n{field_lines}"
    extra = {
        "source_type": "file",
        "file_id": file_id,
        "file_name": f.get("name", ""),
        "message_id": msg_id,
        "sender_name": f.get("uploaded_by_name", ""),
        "ts": f.get("ts"),
        "ref": f"file:{file_id}",
        "doc_type": doc.doc_type,
    }
    _chunk_doc(f"f_{file_id}_0", text=head, embed_text=head, members=chat.get("members", []), chat=chat, extra=extra)
    body = doc.full_text or ""
    for i in range(0, min(len(body), 6000), 1500):
        piece = body[i : i + 1500]
        _chunk_doc(
            f"f_{file_id}_{i // 1500 + 1}",
            text=piece,
            embed_text=f"{f.get('name', '')} {ident}\n{piece}",
            members=chat.get("members", []),
            chat=chat,
            extra=extra,
        )
