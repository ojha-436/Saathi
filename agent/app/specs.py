"""Spec Check and the Standards Library.

Standards (company material specs, SOPs, checklists) are uploaded once per workspace. Each is indexed in Agent Search (Vertex AI
Search) so Saathi can answer questions from it, and Gemini extracts its acceptance limits into `spec_limits` as *proposed*; a
QA admin approves them. When a mill test certificate (MTC) arrives, Gemini extracts its values and DETERMINISTIC CODE compares
them with the approved limits for the grade on the drawing's current revision. The model never decides pass or fail.
"""
import logging
import re
import uuid
from datetime import datetime

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from google.adk.tools import ToolContext
from google.cloud import firestore
from google.cloud.firestore_v1.base_query import FieldFilter
from google.genai import types
from pydantic import BaseModel, Field

from . import ai, jobs
from .config import FAST_MODEL, PROJECT, TZ, VISION_MODEL
from .firebase import audit, bucket, current_user, db, get_chat_for_member, user_profile

log = logging.getLogger("saathi.specs")
router = APIRouter()

STANDARDS_LOCATION = "global"  # Agent Search data stores live in global/us/eu; standards are workspace-wide reference documents
COLLECTION = f"projects/{PROJECT}/locations/{STANDARDS_LOCATION}/collections/default_collection"

PROPS = {
    "C": "Carbon", "Si": "Silicon", "Mn": "Manganese", "P": "Phosphorus", "S": "Sulphur", "Cu": "Copper", "Cr": "Chromium", "Ni": "Nickel",
    "Mo": "Molybdenum", "V": "Vanadium", "Nb": "Niobium", "Ti": "Titanium", "Al": "Aluminium", "N": "Nitrogen", "CEV": "Carbon equivalent (CEV)",
    "yield_strength": "Yield strength", "tensile_strength": "Tensile strength", "elongation": "Elongation", "impact_energy": "Impact energy (Charpy)",
    "hardness": "Hardness",
}
UNIT = {"yield_strength": "MPa", "tensile_strength": "MPa", "elongation": "%", "impact_energy": "J", "hardness": "HB"}
# Properties every certificate must report for these grades; unreported residual elements (Cu, Cr, Ni, …) are noted, not failed
REQUIRED = {"C", "Si", "Mn", "P", "S", "CEV", "yield_strength", "tensile_strength", "elongation", "impact_energy"}


# ---------------- Agent Search (Standards Library index) ----------------

def _ids(org_id: str) -> tuple[str, str]:
    base = "saathi-standards-" + re.sub(r"[^a-z0-9-]+", "-", org_id.lower()).strip("-")[:40]
    return base, base + "-app"


def ensure_store(org_id: str) -> tuple[str, str]:
    """One Agent Search data store (layout parser + chunking) and search app per workspace; created on first upload."""
    from google.cloud import discoveryengine_v1 as de

    ds_id, eng_id = _ids(org_id)
    dsc = de.DataStoreServiceClient()
    try:
        dsc.get_data_store(name=f"{COLLECTION}/dataStores/{ds_id}")
    except Exception:
        dsc.create_data_store(parent=COLLECTION, data_store_id=ds_id, data_store=de.DataStore(
            display_name=f"Saathi standards — {org_id}", industry_vertical=de.IndustryVertical.GENERIC,
            solution_types=[de.SolutionType.SOLUTION_TYPE_SEARCH], content_config=de.DataStore.ContentConfig.CONTENT_REQUIRED,
            document_processing_config=de.DocumentProcessingConfig(
                default_parsing_config=de.DocumentProcessingConfig.ParsingConfig(
                    layout_parsing_config=de.DocumentProcessingConfig.ParsingConfig.LayoutParsingConfig()),
                chunking_config=de.DocumentProcessingConfig.ChunkingConfig(
                    layout_based_chunking_config=de.DocumentProcessingConfig.ChunkingConfig.LayoutBasedChunkingConfig(
                        chunk_size=400, include_ancestor_headings=True))))).result(timeout=300)
    ec = de.EngineServiceClient()
    try:
        ec.get_engine(name=f"{COLLECTION}/engines/{eng_id}")
    except Exception:
        ec.create_engine(parent=COLLECTION, engine_id=eng_id, engine=de.Engine(
            display_name=f"Saathi standards app — {org_id}", solution_type=de.SolutionType.SOLUTION_TYPE_SEARCH, data_store_ids=[ds_id],
            search_engine_config=de.Engine.SearchEngineConfig(search_tier=de.SearchTier.SEARCH_TIER_ENTERPRISE,
                                                              search_add_ons=[de.SearchAddOn.SEARCH_ADD_ON_LLM]))).result(timeout=300)
    return ds_id, eng_id


def _index_document(org_id: str, sid: str, name: str, data: bytes) -> None:
    from google.cloud import discoveryengine_v1 as de

    ds_id, _ = ensure_store(org_id)
    branch = f"{COLLECTION}/dataStores/{ds_id}/branches/default_branch"
    doc = de.Document(id=sid, struct_data={"title": name, "org_id": org_id, "standard_id": sid},
                      content=de.Document.Content(raw_bytes=data, mime_type="application/pdf"))
    client = de.DocumentServiceClient()
    try:
        client.create_document(parent=branch, document_id=sid, document=doc)
    except Exception:
        doc.name = f"{branch}/documents/{sid}"
        client.update_document(document=doc, allow_missing=True)


def search_library(org_id: str, query: str, k: int = 5) -> list[dict]:
    """Chunk-level search over the workspace's standards, with page numbers for citations."""
    from google.cloud import discoveryengine_v1 as de

    _, eng_id = _ids(org_id)
    mode = de.SearchRequest.ContentSearchSpec.SearchResultMode.CHUNKS
    try:
        resp = de.SearchServiceClient().search(de.SearchRequest(
            serving_config=f"{COLLECTION}/engines/{eng_id}/servingConfigs/default_search", query=query[:300], page_size=k,
            content_search_spec=de.SearchRequest.ContentSearchSpec(search_result_mode=mode)))
    except Exception:
        log.exception("standards search failed")
        return []
    out, names = [], {}
    for r in resp.results:
        ch = r.chunk
        if not ch or not ch.content:
            continue
        sid = (ch.document_metadata.uri or "").rsplit("/", 1)[-1] if ch.document_metadata else ""
        sid = sid or ch.name.split("/documents/")[-1].split("/")[0]
        page = ch.page_span.page_start if ch.page_span else None
        if sid not in names:
            d = db.collection("standards").document(sid).get().to_dict() or {}
            names[sid] = d.get("title") or d.get("name") if d.get("org_id") == org_id else None
        if not names[sid]:
            continue  # not a live standard of this workspace (deleted, or another workspace's)
        out.append({"ref": f"std:{sid}", "title": names[sid],
                    "page": page, "text": ch.content[:3000]})
    return out


# ---------------- limit extraction (proposed → approved) ----------------

class LimitRow(BaseModel):
    grade: str = Field(description="Steel grade exactly as written, e.g. S355J2")
    property: str = Field(description=f"One of: {', '.join(PROPS)}")
    min: float | None
    max: float | None
    unit: str = Field(description="% for chemistry, MPa, %, J or HB")
    thickness_min_mm: float | None = Field(description="Lower bound of the thickness band (exclusive), or null")
    thickness_max_mm: float | None = Field(description="Upper bound of the thickness band (inclusive), or null")
    test_temp_c: float | None = Field(description="Impact test temperature in °C, only for impact_energy")
    clause: str = Field(description="Clause or table reference, e.g. '2.1 Table 1'")
    page: int


class LimitsOut(BaseModel):
    doc_no: str
    title: str
    rows: list[LimitRow]


LIMITS_PROMPT = f"""Extract every numeric ACCEPTANCE LIMIT for steel grades from this company standard (a PDF). One row per grade, property
and thickness band. Properties must be one of: {', '.join(PROPS)} (chemistry symbols as written; yield_strength = ReH/Rp0.2,
tensile_strength = Rm, elongation = A%, impact_energy = Charpy KV). Chemistry limits are usually maxima (%). Ranges such as
"470 - 630" give both min and max. Copy numbers exactly; never invent a limit. If the document has no limits (a procedure or
checklist), return an empty rows list."""


def extract_limits(data: bytes) -> LimitsOut:
    return ai.generate_json(LIMITS_PROMPT, LimitsOut, model=VISION_MODEL, parts=[types.Part.from_bytes(data=data, mime_type="application/pdf")])


def norm_grade(g: str | None) -> str:
    """'EN 10025 S355J2', 'S355 J2', 's355j2+n' → 'S355J2' (standard prefix and delivery condition dropped)."""
    up = re.sub(r"\b(S\d{3})\s+([A-Z]{1,2}\d?)\b", r"\1\2", (g or "").upper())
    m = re.search(r"\b(S\d{3}[A-Z0-9]*)", up)
    return m.group(1) if m else up.strip()


def norm_prop(p: str) -> str | None:
    p = (p or "").strip()
    for k in PROPS:
        if p.lower() == k.lower():
            return k
    alias = {"ceq": "CEV", "carbon equivalent": "CEV", "reh": "yield_strength", "rp0.2": "yield_strength", "yield": "yield_strength",
             "rm": "tensile_strength", "tensile": "tensile_strength", "a": "elongation", "elongation %": "elongation", "kv": "impact_energy",
             "charpy": "impact_energy", "impact": "impact_energy"}
    return alias.get(p.lower())


def reindex(sid: str, s: dict, data: bytes | None = None) -> bool:
    """Sends the document to Agent Search, retrying transient errors (network, 5xx) with backoff."""
    import time

    data = data or bucket.blob(s["gcs_path"]).download_as_bytes()
    ref = db.collection("standards").document(sid)
    for attempt in range(4):
        try:
            _index_document(s["org_id"], sid, s["name"], data)
            ref.update({"indexed_at": datetime.now(TZ), "index_error": None})
            return True
        except Exception as e:
            if attempt == 3:
                log.exception("agent search indexing failed for %s", sid)
                ref.update({"index_error": str(e)[:200]})
                return False
            time.sleep(2 ** attempt * 2)
    return False


async def index_standard(sid: str) -> None:
    ref = db.collection("standards").document(sid)
    snap = ref.get()
    if not snap.exists or snap.get("status") not in ("processing", "retrying"):
        return
    s = snap.to_dict()
    data = bucket.blob(s["gcs_path"]).download_as_bytes()
    reindex(sid, s, data)
    try:
        out = extract_limits(data)
    except Exception as e:
        log.exception("limit extraction failed for %s", sid)
        ref.update({"status": "failed", "error": "Couldn't read limits from this document."})
        return
    batch = db.batch()
    n = 0
    for r in out.rows:
        prop = norm_prop(r.property)
        if not prop or (r.min is None and r.max is None):
            continue
        batch.set(db.collection("spec_limits").document(f"{sid}_{n:03d}"), {
            "org_id": s["org_id"], "standard_id": sid, "standard": out.doc_no or s["name"], "grade": norm_grade(r.grade), "property": prop,
            "min": r.min, "max": r.max, "unit": UNIT.get(prop, "%") if prop in UNIT else "%", "thickness_min_mm": r.thickness_min_mm,
            "thickness_max_mm": r.thickness_max_mm, "test_temp_c": r.test_temp_c if prop == "impact_energy" else None,
            "clause": r.clause[:60], "page": r.page, "status": "proposed", "created_at": datetime.now(TZ)})
        n += 1
    batch.commit()
    ref.update({"status": "ready", "doc_no": out.doc_no, "title": out.title or s["name"], "limits": n, "error": None})


jobs.register("spec-index", index_standard)


# ---------------- certificate extraction and the comparator ----------------

class MtcValue(BaseModel):
    property: str = Field(description=f"One of: {', '.join(PROPS)}")
    value: float | None
    unit: str
    test_temp_c: float | None = Field(description="Charpy test temperature in °C, only for impact_energy")


class MtcOut(BaseModel):
    is_certificate: bool
    certificate_no: str
    heat_no: str
    grade: str
    thickness_mm: float | None
    vendor: str
    po_no: str
    drawing_no: str
    values: list[MtcValue]


MTC_PROMPT = f"""This is a material test certificate (mill test certificate, EN 10204 3.1) from a supplier. Extract the ACTUAL measured
values only (not the 'specified' columns). Properties must be one of: {', '.join(PROPS)}. For Charpy/impact results give the test
temperature. thickness_mm only if stated. drawing_no only if written on the certificate. Copy numbers exactly; null when absent."""


def _mpa(v: float, unit: str) -> float:
    u = (unit or "").lower().replace(" ", "")
    if u in ("ksi",):
        return v * 6.894757
    return v  # MPa and N/mm² are the same unit


def _applies(limit: dict, t: float | None) -> bool:
    lo, hi = limit.get("thickness_min_mm"), limit.get("thickness_max_mm")
    if t is None:
        return True
    return (lo is None or t > lo) and (hi is None or t <= hi)


def compare(values: list[dict], limits: list[dict], thickness: float | None) -> tuple[str, list[dict], list[str]]:
    """Deterministic verdict: fail > incomplete (a required property not reported) > pass. Unknown thickness → strictest band."""
    by_prop: dict[str, list[dict]] = {}
    for lim in limits:
        if _applies(lim, thickness):
            by_prop.setdefault(lim["property"], []).append(lim)
    rows, notes = [], []
    banded = False
    for prop, cands in by_prop.items():
        if prop == "impact_energy":
            lim = min(cands, key=lambda x: x.get("test_temp_c") if x.get("test_temp_c") is not None else 99)
        elif thickness is None and len(cands) > 1:
            banded = True
            lim = {**cands[0], "min": max((c["min"] for c in cands if c.get("min") is not None), default=None),
                   "max": min((c["max"] for c in cands if c.get("max") is not None), default=None)}
        else:
            lim = cands[0]
        found = [v for v in values if v.get("property") == prop and v.get("value") is not None]
        if prop == "impact_energy" and lim.get("test_temp_c") is not None:
            need = lim["test_temp_c"]
            ok_temp = [v for v in found if v.get("test_temp_c") is not None and v["test_temp_c"] <= need]
            if not ok_temp and found:
                temps = ", ".join(f"{v['test_temp_c']:g} °C" for v in found if v.get("test_temp_c") is not None) or "an unstated temperature"
                rows.append({**_row(prop, lim), "value": found[0]["value"], "status": "missing",
                             "note": f"Reported at {temps}; the specification requires the test at {need:g} °C."})
                continue
            found = ok_temp
        if not found:
            required = prop in REQUIRED
            rows.append({**_row(prop, lim), "value": None, "status": "missing" if required else "info",
                         "note": "Required, but not reported on the certificate." if required else "Residual element not reported; confirm with the vendor if needed."})
            continue
        v = found[0]
        val = _mpa(v["value"], v.get("unit", "")) if prop in ("yield_strength", "tensile_strength") else v["value"]
        fail = (lim.get("min") is not None and val < lim["min"]) or (lim.get("max") is not None and val > lim["max"])
        rows.append({**_row(prop, lim), "value": round(val, 4), "status": "fail" if fail else "pass", "note": ""})
    if banded:
        notes.append("Section thickness isn't stated on the certificate, so the strictest thickness band was applied.")
    order = list(PROPS)
    rows.sort(key=lambda r: order.index(r["property"]) if r["property"] in order else 99)
    if any(r["status"] == "fail" for r in rows):
        verdict = "fail"
    elif any(r["status"] == "missing" for r in rows):
        verdict = "incomplete"
    else:
        verdict = "pass"
    return verdict, rows, notes


def _row(prop: str, lim: dict) -> dict:
    return {"property": prop, "label": PROPS.get(prop, prop), "unit": lim.get("unit") or UNIT.get(prop, "%"), "min": lim.get("min"), "max": lim.get("max"),
            "test_temp_c": lim.get("test_temp_c"), "source": {"standard_id": lim["standard_id"], "standard": lim.get("standard"),
                                                               "clause": lim.get("clause"), "page": lim.get("page"),
                                                               "ref": f"std:{lim['standard_id']}"}}


def _drawing_grade(org_id: str, drawing_no: str, uid: str) -> dict | None:
    """Material grade from the drawing's CURRENT released revision (drawing register → its file's extracted fields)."""
    # The register's released revision and its material are workspace-level master data (not chat content), so read the
    # register record directly instead of the per-user view, which hides files in chats the uploader isn't part of.
    from .drawings import drawing_id

    snap = db.collection("drawings").document(drawing_id(org_id, drawing_no)).get() if drawing_no else None
    d = snap.to_dict() if snap is not None and snap.exists else None
    if not d or not d.get("current_rev"):
        return None
    cur = next((r for r in d["revisions"] if r["rev"] == d["current_rev"]), None)
    if not cur or not cur.get("file_id"):
        return {"drawing_no": d["drawing_no"], "rev": d["current_rev"], "grade": None}
    f = db.collection("files").document(cur["file_id"]).get().to_dict() or {}
    doc = f.get("doc") or {}
    hay = " ".join([str(k.get("value", "")) for k in doc.get("key_fields") or [] if "material" in str(k.get("name", "")).lower()]
                   + [doc.get("summary") or "", f.get("extracted_text", "")[:4000]])
    grade = norm_grade(hay) if re.search(r"\bS\d{3}", hay.upper()) else None
    return {"drawing_no": d["drawing_no"], "rev": d["current_rev"], "grade": grade, "ref": f"file:{cur['file_id']}"}


async def run_check(file_id: str) -> None:
    fref = db.collection("files").document(file_id)
    f = fref.get().to_dict()
    if not f:
        return
    t0 = datetime.now(TZ)
    org_id = f.get("org_id", "")
    text = f.get("ocr_text") or f.get("extracted_text") or ""
    mtc = None
    if len(text) > 200:  # fast path: structured extraction from the OCR text (seconds); vision only if that comes back thin
        try:
            mtc = ai.generate_json(MTC_PROMPT + f"\n\nCertificate text (OCR):\n{text[:8000]}", MtcOut, model=FAST_MODEL)
            if mtc.is_certificate and len([v for v in mtc.values if v.value is not None]) < 4:
                mtc = None
        except Exception:
            log.warning("text extraction failed for %s, using vision", file_id)
            mtc = None
    if mtc is None:
        data = bucket.blob(f["gcs_path"]).download_as_bytes()
        try:
            mtc = ai.generate_json(MTC_PROMPT + (f"\n\nOCR text:\n{text[:6000]}" if text else ""), MtcOut,
                                   model=VISION_MODEL, parts=[types.Part.from_bytes(data=data, mime_type=f.get("mime") or "application/pdf")])
        except Exception:
            log.exception("certificate extraction failed for %s", file_id)
            return
    if not mtc.is_certificate:
        return
    grade = norm_grade(mtc.grade)
    drawing_no = mtc.drawing_no or (f.get("doc") or {}).get("drawing_no") or ""
    if not drawing_no:
        m = re.search(r"\b([A-Z]{2,5}-[A-Z]{1,4}-\d{3,5})\b", (f.get("extracted_text") or "") + " " + f.get("name", ""))
        drawing_no = m.group(1) if m else ""
    dwg = _drawing_grade(org_id, drawing_no, f.get("uploaded_by", "")) if drawing_no else None
    mismatch = bool(dwg and dwg.get("grade") and grade and dwg["grade"] != grade)
    target = (dwg.get("grade") if dwg and dwg.get("grade") else None) or grade or ""
    limits = [s.to_dict() for s in db.collection("spec_limits").where(filter=FieldFilter("org_id", "==", org_id))
              .where(filter=FieldFilter("grade", "==", target)).where(filter=FieldFilter("status", "==", "approved")).stream()] if target else []
    values = [v.model_dump() | {"property": norm_prop(v.property) or v.property} for v in mtc.values]
    if limits:
        verdict, rows, notes = compare(values, limits, mtc.thickness_mm)
    else:
        verdict, rows, notes = "no_limits", [], [f"No approved limits for {target or 'this grade'} in the Standards Library yet."]
    if mismatch:
        verdict = "fail"
        notes = [f"Grade mismatch: drawing {dwg['drawing_no']} Rev {dwg['rev']} requires {dwg['grade']}, but certificate states {grade}."] + notes
    check = {"org_id": org_id, "file_id": file_id, "chat_id": f.get("chat_id"), "file_name": f.get("name"), "verdict": verdict, "grade": target,
             "certificate_no": mtc.certificate_no, "heat_no": mtc.heat_no, "vendor": mtc.vendor, "po_no": mtc.po_no, "thickness_mm": mtc.thickness_mm,
             "drawing": dwg, "grade_mismatch": mismatch, "rows": rows, "notes": notes, "values": values, "ts": datetime.now(TZ),
             "check_ms": int((datetime.now(TZ) - t0).total_seconds() * 1000),
             "upload_to_verdict_ms": int((datetime.now(TZ) - f["ts"]).total_seconds() * 1000) if f.get("ts") else None}
    db.collection("spec_checks").document(file_id).set(check)
    summary = {"verdict": verdict, "fails": sum(r["status"] == "fail" for r in rows), "missing": sum(r["status"] == "missing" for r in rows),
               "grade": target, "heat_no": mtc.heat_no, "grade_mismatch": mismatch}
    fref.update({"spec": summary})
    msg_id = f.get("msg_id")
    if not msg_id and f.get("chat_id"):  # files shared before message ids were recorded: find the message that carries it
        hit = db.collection("chats").document(f["chat_id"]).collection("messages").where(filter=FieldFilter("file.id", "==", file_id)).limit(1).get()
        msg_id = hit[0].id if hit else None
        if msg_id:
            fref.update({"msg_id": msg_id})
    if msg_id and f.get("chat_id"):
        try:
            db.collection("chats").document(f["chat_id"]).collection("messages").document(msg_id).update({"file.spec": summary})
        except Exception:
            log.warning("could not attach spec verdict to message %s", msg_id)


jobs.register("spec-check", run_check)


CERT_HINT = re.compile(r"(mill\s+test\s+certificate|material\s+test\s+certificate|test\s+certificate|inspection\s+certificate|EN\s*10204|\bMTC\b)", re.I)


def early_check(file_id: str, msg_id: str, ocr_text: str) -> None:
    """Right after OCR: if the text looks like a certificate, start the check without waiting for full extraction."""
    if CERT_HINT.search(ocr_text or "") and re.search(r"\bheat\b", ocr_text, re.I):
        db.collection("files").document(file_id).update({"msg_id": msg_id, "spec_started": True, "ocr_text": ocr_text[:12000]})
        jobs.enqueue("spec-check", file_id)


def maybe_check(file_id: str, doc_type: str | None) -> None:
    """After document extraction: certificates the OCR step didn't recognise are checked now."""
    if doc_type == "test_certificate" and not (db.collection("files").document(file_id).get().to_dict() or {}).get("spec_started"):
        jobs.enqueue("spec-check", file_id)


# ---------------- API ----------------

def _can_manage(user: dict) -> bool:
    if user.get("org_role") == "guest":  # even if listed in an old quality_team
        return False
    if user.get("org_role") in ("owner", "admin"):
        return True
    org = db.collection("orgs").document(user["org_id"]).get().to_dict() or {}
    return user["uid"] in ((org.get("settings") or {}).get("quality_team") or [])


@router.get("/api/standards")
def list_standards(user=Depends(current_user)):
    if user.get("org_role") == "guest":
        raise HTTPException(403, "Not available to guests")
    docs = []
    for s in db.collection("standards").where(filter=FieldFilter("org_id", "==", user["org_id"])).stream():
        d = s.to_dict()
        docs.append({"id": s.id, "name": d["name"], "title": d.get("title"), "doc_no": d.get("doc_no"), "status": d["status"], "limits": d.get("limits", 0),
                     "uploaded_by_name": d.get("uploaded_by_name"), "ts": d["ts"].isoformat() if d.get("ts") else None,
                     "indexed": bool(d.get("indexed_at")), "error": d.get("error")})
    limits = [{"id": s.id, **{k: v for k, v in s.to_dict().items() if k not in ("created_at", "approved_at")}}
              for s in db.collection("spec_limits").where(filter=FieldFilter("org_id", "==", user["org_id"])).stream()]
    docs.sort(key=lambda d: d["ts"] or "", reverse=True)
    return {"documents": docs, "limits": limits, "can_manage": _can_manage(user)}


@router.post("/api/standards")
async def upload_standard(file: UploadFile = File(...), user=Depends(current_user)):
    if not _can_manage(user):
        raise HTTPException(403, "Only admins and the quality team can add standards")
    name = re.sub(r"[^\w.\- ()]+", "_", file.filename or "standard.pdf")[:120]
    if not name.lower().endswith(".pdf"):
        raise HTTPException(415, "Upload the standard as a PDF")
    data = await file.read()
    if len(data) > 20 * 1024 * 1024:
        raise HTTPException(413, "File too large (max 20 MB)")
    sid = "std" + uuid.uuid4().hex[:17]
    path = f"standards/{user['org_id']}/{sid}/{name}"
    bucket.blob(path).upload_from_string(data, content_type="application/pdf")
    db.collection("standards").document(sid).set({"org_id": user["org_id"], "name": name, "gcs_path": path, "status": "processing",
                                                  "uploaded_by": user["uid"], "uploaded_by_name": user["name"], "ts": datetime.now(TZ)})
    audit(user, "standard.uploaded", sid, name=name)
    jobs.enqueue("spec-index", sid)
    return {"id": sid}


class ApproveIn(BaseModel):
    ids: list[str] = []  # empty = every proposed limit from this document


@router.post("/api/standards/{sid}/approve")
def approve_limits(sid: str, body: ApproveIn, user=Depends(current_user)):
    if not _can_manage(user):
        raise HTTPException(403, "Only admins and the quality team can approve limits")
    snap = db.collection("standards").document(sid).get()
    if not snap.exists or snap.get("org_id") != user["org_id"]:
        raise HTTPException(404, "Standard not found")
    n = 0
    for s in db.collection("spec_limits").where(filter=FieldFilter("standard_id", "==", sid)).stream():
        if (not body.ids or s.id in body.ids) and s.get("status") == "proposed":
            s.reference.update({"status": "approved", "approved_by": user["uid"], "approved_by_name": user["name"], "approved_at": datetime.now(TZ)})
            n += 1
    audit(user, "spec_limits.approved", sid, count=n)
    return {"approved": n}


class LimitPatch(BaseModel):
    min: float | None = None
    max: float | None = None
    status: str | None = None


@router.patch("/api/spec-limits/{lid}")
def update_limit(lid: str, body: LimitPatch, user=Depends(current_user)):
    if not _can_manage(user):
        raise HTTPException(403, "Only admins and the quality team can edit limits")
    ref = db.collection("spec_limits").document(lid)
    snap = ref.get()
    if not snap.exists or snap.get("org_id") != user["org_id"]:
        raise HTTPException(404, "Limit not found")
    update = {k: v for k, v in body.model_dump(exclude_unset=True).items() if k in ("min", "max")}
    if body.status in ("approved", "rejected", "proposed"):
        update["status"] = body.status
    update |= {"edited_by": user["uid"], "edited_at": datetime.now(TZ)}
    ref.update(update)
    return {"ok": True}


@router.delete("/api/standards/{sid}")
def delete_standard(sid: str, user=Depends(current_user)):
    if not _can_manage(user):
        raise HTTPException(403, "Only admins and the quality team can remove standards")
    ref = db.collection("standards").document(sid)
    snap = ref.get()
    if not snap.exists or snap.get("org_id") != user["org_id"]:
        raise HTTPException(404, "Standard not found")
    for s in db.collection("spec_limits").where(filter=FieldFilter("standard_id", "==", sid)).stream():
        s.reference.delete()
    try:
        from google.cloud import discoveryengine_v1 as de

        ds_id, _ = _ids(user["org_id"])
        de.DocumentServiceClient().delete_document(name=f"{COLLECTION}/dataStores/{ds_id}/branches/default_branch/documents/{sid}")
    except Exception:
        log.warning("could not remove %s from Agent Search", sid)
    try:
        bucket.blob(snap.get("gcs_path")).delete()
    except Exception:
        pass
    ref.delete()
    audit(user, "standard.deleted", sid)
    return {"ok": True}


def _file_for(file_id: str, user: dict) -> dict:
    snap = db.collection("files").document(file_id).get()
    if not snap.exists or user["uid"] not in (snap.get("members") or []):
        raise HTTPException(404, "File not found")
    f = snap.to_dict()
    get_chat_for_member(f["chat_id"], user["uid"])
    return f


def _limit_text(r: dict) -> str:
    unit = r.get("unit") or ""
    temp = f" at {r['test_temp_c']} °C" if r.get("test_temp_c") is not None else ""
    if r.get("min") is not None and r.get("max") is not None:
        return f"{r['min']}–{r['max']} {unit}{temp}".strip()
    if r.get("max") is not None:
        return f"≤ {r['max']} {unit}{temp}".strip()
    if r.get("min") is not None:
        return f"≥ {r['min']} {unit}{temp}".strip()
    return "the required value"


def _guest_notes(c: dict) -> list[str]:
    """Plain-language next steps for the vendor, written from the rows only (never our internal notes)."""
    dwg = c.get("drawing") or {}
    out = []
    if c.get("grade_mismatch") and dwg.get("grade"):
        out.append(f"The certificate's grade doesn't match drawing {dwg.get('drawing_no')} Rev {dwg.get('rev')}, which requires {dwg['grade']}.")
    for r in c.get("rows", []):
        if r.get("status") == "fail":
            value = f"{r.get('value')} {r.get('unit') or ''}".strip()
            out.append(f"{r.get('label')}: {value} is outside the required {_limit_text(r)}.")
        elif r.get("status") == "missing":
            temp = f" at {r['test_temp_c']} °C" if r.get("test_temp_c") is not None else ""
            out.append(f"{r.get('label')}: not reported{temp}.")
    if c.get("verdict") == "no_limits":
        out.append("This certificate can't be checked automatically yet. The buyer's Quality team will review it.")
    elif c.get("verdict") == "pass":
        out.append("All reported values meet the requirements.")
    elif out:
        out.append("Correct the certificate or re-test, then upload the new certificate in this channel.")
    return out


# What a guest (a vendor) may see of a check: enough to fix their own certificate, nothing about our standards library,
# internal drawings, other grades or the workspace. Limits are shown only for the rows of this certificate (Phase 5, S0).
_GUEST_ROW = ("property", "label", "unit", "value", "min", "max", "test_temp_c", "status")


def guest_view(c: dict) -> dict:
    dwg = c.get("drawing") or {}
    return {
        "file_id": c.get("file_id"), "file_name": c.get("file_name"), "verdict": c.get("verdict"), "grade": c.get("grade"),
        "certificate_no": c.get("certificate_no"), "heat_no": c.get("heat_no"), "vendor": c.get("vendor"), "po_no": c.get("po_no"),
        "thickness_mm": c.get("thickness_mm"), "grade_mismatch": bool(c.get("grade_mismatch")),
        "drawing": {"drawing_no": dwg.get("drawing_no"), "rev": dwg.get("rev"), "grade": dwg.get("grade")} if dwg.get("drawing_no") else None,
        "rows": [{**{k: r.get(k) for k in _GUEST_ROW}, "note": None, "source": {}} for r in c.get("rows", [])],
        "notes": _guest_notes(c),
    }


@router.get("/api/files/{file_id}/spec-check")
def get_check(file_id: str, user=Depends(current_user)):
    _file_for(file_id, user)
    snap = db.collection("spec_checks").document(file_id).get()
    if not snap.exists:
        return {"status": "none"}
    c = snap.to_dict()
    ts = c["ts"].isoformat() if c.get("ts") else None
    if user.get("org_role") == "guest":
        return {"status": "done", **guest_view(c), "ts": ts}
    c["ts"] = ts
    return {"status": "done", **c}


@router.post("/api/files/{file_id}/spec-check")
def rerun_check(file_id: str, user=Depends(current_user)):
    if user.get("org_role") == "guest":
        raise HTTPException(403, "Upload a corrected certificate instead; the buyer's Quality team re-checks existing ones.")
    f = _file_for(file_id, user)
    if (f.get("doc") or {}).get("doc_type") != "test_certificate":
        raise HTTPException(400, "Only test certificates can be spec-checked")
    jobs.enqueue("spec-check", file_id)
    return {"ok": True}


@router.get("/api/spec-checks")
def recent_checks(user=Depends(current_user)):
    """Incoming material: recent certificate checks in chats the user is in."""
    from .search import user_chats

    if user.get("org_role") == "guest":
        raise HTTPException(403, "Not available to guests")
    chats = set(user_chats(user["uid"]))
    rows = []
    for s in db.collection("spec_checks").where(filter=FieldFilter("org_id", "==", user["org_id"])).stream():
        c = s.to_dict()
        if c.get("chat_id") in chats:
            rows.append({"file_id": s.id, "file_name": c.get("file_name"), "verdict": c["verdict"], "grade": c.get("grade"), "heat_no": c.get("heat_no"),
                         "vendor": c.get("vendor"), "fails": sum(r["status"] == "fail" for r in c.get("rows", [])),
                         "missing": sum(r["status"] == "missing" for r in c.get("rows", [])), "ts": c["ts"].isoformat() if c.get("ts") else None})
    rows.sort(key=lambda r: r["ts"] or "", reverse=True)
    return rows[:50]


# ---------------- agent tools ----------------

def spec_check(heat_or_file: str, tool_context: ToolContext) -> dict:
    """Spec Check: whether a mill test certificate (by heat number, certificate number or file name) meets the approved limits
    for its steel grade, property by property, with the clause each limit comes from. Use for "is heat H-77812 within spec",
    "did the MTC pass", incoming material and readiness questions.

    Args:
        heat_or_file: Heat number (e.g. "H-77812"), certificate number or file name.
    """
    from .search import user_chats

    uid = tool_context.state["uid"]
    user = user_profile(uid)
    chats = set(user_chats(uid))
    q = heat_or_file.strip().lower()
    guest = user.get("org_role") == "guest"
    hits = []
    for s in db.collection("spec_checks").where(filter=FieldFilter("org_id", "==", user["org_id"])).stream():
        c = s.to_dict()
        if c.get("chat_id") not in chats:
            continue
        if guest and (q in (c.get("heat_no") or "").lower() or q in (c.get("certificate_no") or "").lower() or q in (c.get("file_name") or "").lower()):
            g = guest_view(c)
            hits.append({"ref": f"file:{s.id}", **{k: g[k] for k in ("file_name", "verdict", "grade", "heat_no", "drawing", "grade_mismatch", "notes")},
                         "rows": [{k: r[k] for k in ("label", "value", "unit", "min", "max", "test_temp_c", "status")} for r in g["rows"]]})
            continue
        if guest:
            continue
        if not q or q in (c.get("heat_no") or "").lower() or q in (c.get("certificate_no") or "").lower() or q in (c.get("file_name") or "").lower():
            hits.append({"ref": f"file:{s.id}", "file_name": c.get("file_name"), "verdict": c["verdict"], "grade": c.get("grade"),
                         "heat_no": c.get("heat_no"), "vendor": c.get("vendor"), "drawing": c.get("drawing"), "grade_mismatch": c.get("grade_mismatch"),
                         "rows": [{"property": r["label"], "value": r.get("value"), "unit": r.get("unit"), "min": r.get("min"), "max": r.get("max"),
                                   "status": r["status"], "note": r.get("note"), "source_ref": r["source"]["ref"],
                                   "clause": r["source"].get("clause")} for r in c.get("rows", [])]})
    if not hits:
        return {"checks": [], "note": "No spec check found for that certificate. It may not be uploaded, or it is in a chat the user isn't in."}
    if guest:
        return {"checks": hits[:4], "note": "The user is an external supplier. Cite the certificate [file:...] only; explain the failing values "
                "and the next steps. Don't mention standards documents, clauses or internal drawings."}
    return {"checks": hits[:4], "note": "Cite the certificate [file:...] and the limit's source [std:...]. pass/fail is computed in code from approved limits."}


def standards_library(query: str, tool_context: ToolContext) -> dict:
    """The workspace Standards Library (company specifications, procedures, checklists) via Agent Search: returns the most
    relevant passages with page numbers. Use for questions about requirements, limits, procedures and acceptance criteria.

    Args:
        query: What to look up, e.g. "S355J2 impact test temperature" or "how to quarantine non-conforming castings".
    """
    user = user_profile(tool_context.state["uid"])
    if user.get("org_role") == "guest":
        return {"passages": [], "note": "Not available to guests."}
    hits = search_library(user["org_id"], query)
    return {"passages": hits, "note": "Cite passages as [std:...]. If empty, the library has no matching passage yet."}
