"""Revision control: the drawing register, Revision Guard and QR-stamped controlled copies (Phase 3a: B1–B3).

- The register is rebuilt from document extraction (today) and will be fed by PDM/PLM when connected (Phase 3d).
- Released revisions are workspace knowledge (controlled drawings are meant for the floor); drafts / in-work revisions
  are only visible to people who can open their file. File links are only returned when the caller can open them.
- The public QR verdict shows drawing number, revision and current/superseded only: no file, no names.
"""
import hashlib
import io
import logging
import re
import secrets
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import Response
from google.cloud.firestore_v1.base_query import FieldFilter
from pydantic import BaseModel

from .config import TZ, WEB_URL
from .firebase import audit, bucket, current_user, db, require_admin, role_in, user_profile

router = APIRouter()
log = logging.getLogger("saathi.drawings")

_NOT_RELEASED = re.compile(r"not\s+approved|draft|not\s+released|pending|for\s+review|in[-\s]?work|preliminary", re.I)


def norm_no(no: str) -> str:
    return re.sub(r"[^A-Z0-9]", "", (no or "").upper())


def norm_rev(rev: str | None) -> tuple[str, bool]:
    """'D (DRAFT)' -> ('D', True); 'Rev C' -> ('C', False)."""
    raw = (rev or "").strip()
    draft = bool(_NOT_RELEASED.search(raw))
    core = re.sub(r"\(.*?\)", "", raw)
    core = re.sub(r"(?i)\brev(ision)?\.?\s*", "", core).strip().upper()
    core = re.split(r"[\s/,;]+", core)[0] if core else ""
    return core, draft


def rev_key(rev: str) -> tuple:
    """Orders A < B < … < Z < AA and 1 < 2 < 10; mixed values sort by numeric part then letters."""
    if rev.isdigit():
        return (1, int(rev), "")
    if rev.isalpha():
        return (0, len(rev), rev)
    m = re.match(r"([A-Z]*)(\d*)", rev)
    return (2, m.group(1) if m else rev, int(m.group(2)) if m and m.group(2) else 0)


def _released(approved_by: str | None, draft_flag: bool, *texts: str) -> bool:
    if draft_flag or not approved_by or _NOT_RELEASED.search(approved_by):
        return False
    return not any(_NOT_RELEASED.search(t or "") for t in texts)


def drawing_id(org_id: str, drawing_no: str) -> str:
    return f"{org_id}__{norm_no(drawing_no)}"


def rebuild(org_id: str, drawing_no: str) -> dict | None:
    """Recomputes one drawing's register entry from every extracted drawing file in the workspace."""
    key = norm_no(drawing_no)
    if not key:
        return None
    revs: dict[str, dict] = {}
    chat_cache: dict[str, dict] = {}
    title = ""
    for s in db.collection("files").where(filter=FieldFilter("org_id", "==", org_id)).stream():
        f = s.to_dict()
        doc = f.get("doc") or {}
        if doc.get("doc_type") != "engineering_drawing" or norm_no(doc.get("drawing_no")) != key:
            continue
        cid = f.get("chat_id") or ""
        if cid and cid not in chat_cache:
            chat_cache[cid] = db.collection("chats").document(cid).get().to_dict() or {}
        if chat_cache.get(cid, {}).get("ai_excluded"):
            continue
        if f.get("uploaded_by") and role_in(user_profile(f["uploaded_by"]), org_id) == "guest":
            continue
        title = title or doc.get("title") or ""
        rev, draft = norm_rev(doc.get("revision"))
        if not rev:
            continue
        released = _released(doc.get("approved_by"), draft, doc.get("title"), f.get("name"), doc.get("summary"))
        entry = {"rev": rev, "status": "released" if released else "in_work", "approved_by": doc.get("approved_by") if released else None,
                 "date": next((r.get("date") for r in doc.get("revisions") or [] if norm_rev(r.get("rev"))[0] == rev), None),
                 "file_id": s.id, "file_name": f.get("name"), "chat_id": f.get("chat_id"), "source": "saathi", "ts": f.get("ts")}
        old = revs.get(rev)
        # a file-backed entry beats a revision-table row; a released file beats a draft file of the same rev
        if not old or not old.get("file_id") or (entry["status"] == "released" and old["status"] != "released"):
            revs[rev] = entry
        # earlier revisions listed (and approved) in a released drawing's revision table
        if released:
            for r in doc.get("revisions") or []:
                rr, rdraft = norm_rev(r.get("rev"))
                if rr and rr not in revs and _released(r.get("approved_by"), rdraft, r.get("description")):
                    revs[rr] = {"rev": rr, "status": "released", "approved_by": r.get("approved_by"), "date": r.get("date"),
                                "file_id": None, "file_name": None, "chat_id": None, "source": "saathi", "ts": None}
    ref = db.collection("drawings").document(drawing_id(org_id, drawing_no))
    if not revs:
        ref.delete()
        return None
    overrides = (ref.get().to_dict() or {}).get("overrides") or {}
    for rev, status in overrides.items():
        if rev in revs:
            revs[rev]["status"] = status
            revs[rev]["overridden"] = True
    released = sorted((r for r in revs.values() if r["status"] == "released"), key=lambda r: rev_key(r["rev"]))
    current = released[-1]["rev"] if released else None
    for r in revs.values():
        if r["status"] == "released" and current and rev_key(r["rev"]) < rev_key(current):
            r["status"] = "superseded"
    data = {"org_id": org_id, "drawing_no": drawing_no.strip().upper(), "key": key, "title": title, "current_rev": current,
            "revisions": sorted(revs.values(), key=lambda r: rev_key(r["rev"]), reverse=True), "overrides": overrides,
            "source": "saathi", "updated_at": datetime.now(TZ)}
    ref.set(data)
    return data


def rebuild_for_file(file_id: str) -> None:
    f = db.collection("files").document(file_id).get().to_dict() or {}
    doc = f.get("doc") or {}
    if doc.get("doc_type") == "engineering_drawing" and doc.get("drawing_no") and f.get("org_id"):
        try:
            rebuild(f["org_id"], doc["drawing_no"])
        except Exception:
            log.exception("register rebuild failed for %s", file_id)


def visible(d: dict, uid: str) -> dict:
    """Filters a register entry for one person: drafts only with file access; file links only when they can open them."""
    file_ids = [r["file_id"] for r in d["revisions"] if r.get("file_id")]
    access = {fid: uid in ((db.collection("files").document(fid).get().to_dict() or {}).get("members") or []) for fid in file_ids}
    revs = []
    for r in d["revisions"]:
        can_open = bool(r.get("file_id")) and access.get(r["file_id"], False)
        if r["status"] == "in_work" and not can_open:
            continue
        revs.append({**{k: v for k, v in r.items() if k not in ("ts",)}, "file_id": r["file_id"] if can_open else None,
                     "file_name": r.get("file_name") if can_open else None,
                     "chat_id": r["chat_id"] if can_open else None, "can_open": can_open})
    return {"id": f"{d['org_id']}__{d['key']}", "drawing_no": d["drawing_no"], "title": d.get("title", ""), "current_rev": d.get("current_rev"),
            "revisions": revs, "source": d.get("source", "saathi"), "updated_at": d["updated_at"].isoformat() if d.get("updated_at") else None}


def lookup(org_id: str, drawing_no: str, uid: str) -> dict | None:
    snap = db.collection("drawings").document(drawing_id(org_id, drawing_no)).get()
    return visible(snap.to_dict(), uid) if snap.exists else None


# ---------------- register API ----------------

@router.get("/api/drawings")
def list_register(user=Depends(current_user)):
    if user.get("org_role") == "guest":
        return []
    rows = [visible(s.to_dict(), user["uid"]) for s in db.collection("drawings").where(filter=FieldFilter("org_id", "==", user["org_id"])).stream()]
    rows = [r for r in rows if r["revisions"]]
    rows.sort(key=lambda r: r["drawing_no"])
    return rows


class OverrideIn(BaseModel):
    rev: str
    status: str | None  # released | superseded | in_work | None (clear)


@router.post("/api/drawings/{did}/override")
def override(did: str, body: OverrideIn, user=Depends(current_user)):
    """QA/admin correction when the extraction got the release state wrong."""
    require_admin(user)
    ref = db.collection("drawings").document(did)
    d = ref.get().to_dict()
    if not d or d["org_id"] != user["org_id"]:
        raise HTTPException(404, "Drawing not found")
    if body.status not in (None, "released", "superseded", "in_work"):
        raise HTTPException(400, "Unknown status")
    ov = dict(d.get("overrides") or {})
    rev = norm_rev(body.rev)[0]
    if body.status:
        ov[rev] = body.status
    else:
        ov.pop(rev, None)
    ref.update({"overrides": ov})
    rebuild(user["org_id"], d["drawing_no"])
    audit(user, "drawing.override", did, rev=rev, status=body.status)
    return {"ok": True}


# ---------------- controlled copies (QR) ----------------

class StampIn(BaseModel):
    rev: str


def _stamp(pdf_or_image: bytes, mime: str, qr_png: bytes, lines: list[str]) -> bytes:
    from pypdf import PdfReader, PdfWriter
    from reportlab.lib.utils import ImageReader
    from reportlab.pdfgen import canvas

    if mime != "application/pdf":  # images become a one-page PDF first
        img = ImageReader(io.BytesIO(pdf_or_image))
        w, h = img.getSize()
        buf = io.BytesIO()
        c = canvas.Canvas(buf, pagesize=(w, h))
        c.drawImage(img, 0, 0, w, h)
        c.save()
        pdf_or_image = buf.getvalue()
    reader = PdfReader(io.BytesIO(pdf_or_image))
    writer = PdfWriter()
    for i, page in enumerate(reader.pages):
        pw, ph = float(page.mediabox.width), float(page.mediabox.height)
        box = max(60.0, min(pw, ph) * 0.09)
        buf = io.BytesIO()
        c = canvas.Canvas(buf, pagesize=(pw, ph))
        text_w = max(c.stringWidth(line, "Helvetica", 6.5) for line in lines)
        block_w = max(box, text_w, c.stringWidth("CONTROLLED COPY", "Helvetica-Bold", 7.5))
        block_h = 12 + box + 4 + 9 * len(lines)
        # top-left corner: usually free on drawing sheets (title block and revision table sit on the right)
        x, top = 14, ph - 14
        c.setFillColorRGB(1, 1, 1)
        c.setStrokeColorRGB(0.75, 0.05, 0.05)
        c.setLineWidth(0.8)
        c.rect(x - 5, top - block_h - 5, block_w + 10, block_h + 8, stroke=1, fill=1)
        c.setFillColorRGB(0.75, 0.05, 0.05)
        c.setFont("Helvetica-Bold", 7.5)
        c.drawString(x, top - 9, "CONTROLLED COPY")
        c.drawImage(ImageReader(io.BytesIO(qr_png)), x, top - 12 - box, box, box)
        c.setFillColorRGB(0, 0, 0)
        c.setFont("Helvetica", 6.5)
        for j, line in enumerate(lines):
            c.drawString(x, top - 12 - box - 9 * (j + 1), line)
        c.save()
        page.merge_page(PdfReader(buf).pages[0])
        writer.add_page(page)
    out = io.BytesIO()
    writer.write(out)
    return out.getvalue()


@router.post("/api/drawings/{did}/stamp")
def stamp(did: str, body: StampIn, user=Depends(current_user)):
    """Generates a controlled-copy PDF with a QR that anyone can scan to check the revision is still current."""
    import segno

    d = db.collection("drawings").document(did).get().to_dict()
    if not d or d["org_id"] != user["org_id"] or user.get("org_role") == "guest":
        raise HTTPException(404, "Drawing not found")
    v = visible(d, user["uid"])
    rev = norm_rev(body.rev)[0]
    r = next((x for x in v["revisions"] if x["rev"] == rev), None)
    if not r or not r.get("can_open"):
        raise HTTPException(404, "You can only print revisions you can open")
    if r["status"] != "released" or rev != d.get("current_rev"):
        raise HTTPException(409, f"Only the current released revision ({d.get('current_rev') or 'none'}) can be printed as a controlled copy")
    f = db.collection("files").document(r["file_id"]).get().to_dict()
    data = bucket.blob(f["gcs_path"]).download_as_bytes()
    token = secrets.token_urlsafe(9)
    url = f"{WEB_URL}/r/{token}"
    qr = io.BytesIO()
    segno.make(url, error="m").save(qr, kind="png", scale=8, border=1)
    now = datetime.now(TZ)
    lines = [f"{d['drawing_no']}  Rev {rev}", f"Printed {now.strftime('%d %b %Y %H:%M')} by {user['name'][:28]}", "Scan to check it is current"]
    try:
        pdf = _stamp(data, f.get("mime") or "application/pdf", qr.getvalue(), lines)
    except Exception:
        log.exception("stamp failed for %s", did)
        raise HTTPException(422, "Couldn't stamp this file. Controlled copies need a PDF or image drawing.")
    db.collection("qr_tokens").document(token).set({"org_id": user["org_id"], "drawing_id": did, "drawing_no": d["drawing_no"], "rev": rev,
                                                   "file_id": r["file_id"], "printed_by": user["uid"], "printed_by_name": user["name"], "printed_at": now})
    audit(user, "drawing.controlled_copy_printed", did, rev=rev, token=token)
    name = f"{d['drawing_no']}_Rev{rev}_CONTROLLED.pdf"
    return Response(pdf, media_type="application/pdf", headers={"Content-Disposition": f'attachment; filename="{name}"', "X-Content-Type-Options": "nosniff"})


_scan_hits: dict[str, list[float]] = {}


@router.get("/api/qr/{token}")
def verify(token: str, request: Request):
    """Public verdict for a printed controlled copy. Never returns file content or people's names."""
    import time

    ip = (request.headers.get("x-forwarded-for") or (request.client.host if request.client else "")).split(",")[0].strip()
    t = time.monotonic()
    hits = [h for h in _scan_hits.get(ip, []) if t - h < 60]
    if len(hits) >= 30:
        raise HTTPException(429, "Too many scans. Wait a minute.")
    _scan_hits[ip] = hits + [t]
    if not re.fullmatch(r"[A-Za-z0-9_-]{6,40}", token):
        return {"verdict": "invalid"}
    q = db.collection("qr_tokens").document(token).get().to_dict()
    if not q:
        return {"verdict": "invalid"}
    org = db.collection("orgs").document(q["org_id"]).get().to_dict() or {}
    if not (org.get("settings") or {}).get("qr_public", True):
        return {"verdict": "login_required", "drawing_no": q["drawing_no"]}
    d = db.collection("drawings").document(q["drawing_id"]).get().to_dict()
    if not d or not d.get("current_rev"):
        verdict, current = "unknown", None
    else:
        current = d["current_rev"]
        verdict = "current" if q["rev"] == current else "superseded"
        stale = (datetime.now(TZ) - d["updated_at"]).total_seconds() > 86400 if d.get("source") == "plm" and d.get("updated_at") else False
        if stale:
            verdict = "unknown"
    db.collection("qr_scans").add({"token": token, "org_id": q["org_id"], "drawing_id": q["drawing_id"], "rev": q["rev"], "verdict": verdict,
                                   "ip_hash": hashlib.sha256(ip.encode()).hexdigest()[:16], "ts": datetime.now(TZ)})
    return {"verdict": verdict, "drawing_no": q["drawing_no"], "rev": q["rev"], "current_rev": current if verdict == "superseded" else None,
            "title": (d or {}).get("title", "")[:80], "checked_at": datetime.now(TZ).isoformat()}
