"""Inspection Dossier: turns a finished readiness report into the evidence pack an inspector receives (Phase 5 PRD §6A).

The pack only repeats what is already verified. The cover and summary pages use the report and stored records verbatim (no
new model text). Every drawing is re-checked against the register when the pack is built, so a superseded or in-work
revision is swapped for the current one. Every item is re-checked against the builder's access. Every page carries a
footer naming its source, and drawings carry the controlled-copy QR that shows their live status when scanned.
"""
import io
import logging
import secrets
import time
import uuid
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response
from pydantic import BaseModel

from . import jobs
from .config import TZ, WEB_URL
from .drawings import _stamp, lookup as register_lookup, norm_rev
from .firebase import audit, bucket, current_user, db, user_profile
from .research import _own, ref_visible_to

router = APIRouter()
log = logging.getLogger("saathi.dossier")

SECTIONS = {"drawings": "Drawings", "certificates": "Material certificates", "reports": "Inspection and test reports",
            "records": "Non-conformances", "decisions": "Decisions and concessions", "other": "Other documents",
            "commercial": "Commercial documents"}
MERGEABLE = {"application/pdf", "image/png", "image/jpeg", "image/webp"}
MAX_ITEMS = 40
MAX_BYTES = 25 * 1024 * 1024  # Cloud Run caps a response at 32 MiB
STALE_S = 180  # a build with no heartbeat for this long is treated as dead
READINESS = {"ready": "Ready", "at_risk": "At risk", "not_ready": "Not ready", "not_applicable": "Not applicable"}
VERDICT = {"pass": "PASS", "fail": "FAIL", "incomplete": "INCOMPLETE", "no_limits": "NO LIMITS"}


# ---------------- manifest: report refs -> pack items ----------------

def _report_refs(report: dict) -> list[str]:
    seen, out = set(), []
    for key in ("checklist", "findings", "gaps"):
        for x in report.get(key) or []:
            for r in x.get("refs") or []:
                if r not in seen:
                    seen.add(r)
                    out.append(r)
    return out


def _item(ref: str, section: str, title: str, detail: str = "", *, include: bool = True, blocked: str | None = None,
          note: str | None = None, **extra) -> dict:
    return {"id": ref, "ref": ref, "section": section, "section_label": SECTIONS[section], "title": title[:160], "detail": detail,
            "include": include and not blocked, "default_include": include and not blocked, "blocked": blocked, "note": note, **extra}


def _fmt_day(v) -> str:
    if not v:
        return ""
    if isinstance(v, str):
        try:
            v = datetime.fromisoformat(v)
        except ValueError:
            return v
    return v.astimezone(TZ).strftime("%d %b %Y") if v.tzinfo else v.strftime("%d %b %Y")


def _file_item(ref: str, fid: str, org_id: str, uid: str, drawings_seen: set) -> dict | None:
    f = db.collection("files").document(fid).get().to_dict()
    if not f or f.get("org_id") != org_id:
        return _item(ref, "other", "A cited file", blocked="The file no longer exists")
    if not ref_visible_to(ref, {uid}, org_id):
        return _item(ref, "other", "A cited file", blocked="You can no longer open this file")
    doc = f.get("doc") or {}
    dt, name, mime = doc.get("doc_type"), f.get("name") or "file", f.get("mime") or ""
    fmt_block = None if mime in MERGEABLE else "This format can't be added to a PDF pack yet"

    if dt == "engineering_drawing" and doc.get("drawing_no"):
        reg = register_lookup(org_id, doc["drawing_no"], uid)
        current = (reg or {}).get("current_rev")
        if not reg or not current:
            return _item(ref, "drawings", f"{doc['drawing_no']} {doc.get('title') or ''}".strip(), f"Rev {doc.get('revision') or '?'}",
                         blocked=fmt_block, note="Not in the drawing register, so its revision can't be confirmed as current",
                         file_id=fid, mime=mime, footer=f"{doc['drawing_no']} Rev {doc.get('revision') or '?'} (not in register)")
        if reg["id"] in drawings_seen:
            return None  # the same drawing cited twice (e.g. Rev B and Rev C): one current copy is enough
        drawings_seen.add(reg["id"])
        cited, draft = norm_rev(doc.get("revision"))
        note = None if cited == current and not draft else f"The report cited Rev {cited or '?'}{' (in work)' if draft else ''}; Rev {current} is current"
        cur = next((r for r in reg["revisions"] if r["rev"] == current), None)
        title = f"{reg['drawing_no']} {reg.get('title') or ''}".strip()
        if not cur or not cur.get("file_id") or not cur.get("can_open"):
            return _item(ref, "drawings", title, f"Rev {current} · current", blocked=f"Current Rev {current} has no file you can open", note=note)
        f2 = db.collection("files").document(cur["file_id"]).get().to_dict() or {}
        mime2 = f2.get("mime") or ""
        return _item(ref, "drawings", title, f"Rev {current} · current", blocked=None if mime2 in MERGEABLE else "This format can't be added to a PDF pack yet",
                     note=note, file_id=cur["file_id"], mime=mime2, drawing={"drawing_id": reg["id"], "drawing_no": reg["drawing_no"], "rev": current},
                     footer=f"{reg['drawing_no']} Rev {current}")

    if dt == "test_certificate":
        c = db.collection("spec_checks").document(fid).get().to_dict() or {}
        verdict = c.get("verdict")
        heat = c.get("heat_no") or doc.get("heat_no") or ""
        detail = f"Heat {heat} · Spec Check {VERDICT.get(verdict, 'not run')}" if heat else f"Spec Check {VERDICT.get(verdict, 'not run')}"
        ok = verdict == "pass"
        return _item(ref, "certificates", name, detail, include=ok, blocked=fmt_block,
                     note=None if ok else ("Failed Spec Check: left out by default" if verdict == "fail" else "No passing Spec Check: left out by default"),
                     file_id=fid, mime=mime, spec=bool(c), footer=f"MTC heat {heat or '?'} · Spec Check {VERDICT.get(verdict, 'not run')}")
    if dt == "inspection_report":
        return _item(ref, "reports", name, _fmt_day(f.get("ts")), blocked=fmt_block, file_id=fid, mime=mime, footer=name)
    if dt in ("vendor_quote", "purchase_order"):
        return _item(ref, "commercial", name, "Quote" if dt == "vendor_quote" else "Purchase order", include=False, blocked=fmt_block,
                     note="Commercial document: left out by default", file_id=fid, mime=mime, footer=name)
    if dt == "specification":
        return {"standard": name}
    return _item(ref, "other", name, _fmt_day(f.get("ts")), blocked=fmt_block, file_id=fid, mime=mime, footer=name)


def build_manifest(run: dict) -> dict:
    """Resolves the report's citations into pack items with the run owner's access and the register as they are now."""
    org_id, uid = run["org_id"], run["uid"]
    items, standards, drawings_seen = [], [], set()
    for ref in _report_refs(run.get("report") or {}):
        kind, _, rid = ref.partition(":")
        try:
            if kind == "file":
                it = _file_item(ref, rid, org_id, uid, drawings_seen)
                if it and "standard" in it:
                    standards.append(it["standard"])
                elif it:
                    items.append(it)
            elif kind == "rec":
                r = db.collection("records").document(rid).get().to_dict()
                if not r or not ref_visible_to(ref, {uid}, org_id):
                    items.append(_item(ref, "records", "A cited record", blocked="You can no longer open this record"))
                    continue
                fl = r.get("fields") or {}
                is_ncr = r.get("type") == "ncr"
                items.append(_item(ref, "records", f"{r.get('number') or 'Record'} · {fl.get('title') or r.get('type', '').upper()}",
                                   (r.get("status") or "").replace("_", " "), include=is_ncr,
                                   note=None if is_ncr else "Internal record: left out by default", record=True,
                                   footer=f"{r.get('number') or 'Record'} · {(r.get('status') or '').replace('_', ' ')}"))
            elif kind == "dec":
                d = db.collection("decisions").document(rid).get().to_dict()
                if not d or not ref_visible_to(ref, {uid}, org_id):
                    items.append(_item(ref, "decisions", "A cited decision", blocked="You can no longer open this decision"))
                    continue
                items.append(_item(ref, "decisions", d.get("title") or "Decision", f"Decided {_fmt_day(d.get('decided_at'))}".strip(),
                                   note="Superseded by a later decision" if d.get("status") == "superseded" else None, decision=True,
                                   footer=f"Decision · {(d.get('title') or '')[:60]}"))
            elif kind == "std":
                s = db.collection("standards").document(rid).get().to_dict() or {}
                if s.get("org_id") == org_id and s.get("name"):
                    standards.append(s["name"])
        except Exception:
            log.exception("manifest: couldn't resolve %s", ref)
            items.append(_item(ref, "other", "A cited source", blocked="Couldn't read this source"))
    order = list(SECTIONS)
    items.sort(key=lambda i: order.index(i["section"]))
    return {"items": items, "standards": sorted(set(standards)), "open_items": len(_open_items(run, items))}


def _open_items(run: dict, items: list[dict]) -> list[dict]:
    """Everything an inspector would ask about that the pack doesn't settle: gaps, risks, unknowns and left-out items."""
    rep = run.get("report") or {}
    out = [{"kind": "Gap", "title": g.get("title") or "", "detail": g.get("detail") or "", "owner": g.get("owner_name") or g.get("owner") or "",
            "due": _fmt_day(g.get("due_at") or g.get("due")), "status": "Task created" if g.get("task_id") else "No task yet"} for g in rep.get("gaps") or []]
    out += [{"kind": "Risk" if c.get("status") == "risk" else "Gap", "title": c.get("item") or "", "detail": c.get("detail") or "", "owner": "", "due": "",
             "status": "From the readiness checklist"} for c in rep.get("checklist") or [] if c.get("status") in ("risk", "gap")]
    out += [{"kind": "Unknown", "title": u, "detail": "", "owner": "", "due": "", "status": "Not found in the sources"} for u in rep.get("unknowns") or []]
    out += [{"kind": "Not included", "title": i["title"], "detail": i.get("blocked") or i.get("note") or "Left out of this pack", "owner": "", "due": "",
             "status": i["section_label"]} for i in items if not i["include"]]
    return out


def _apply_selection(items: list[dict], include: list[str], exclude: list[str]) -> list[dict]:
    inc, exc = set(include or []), set(exclude or [])
    for i in items:
        if i["blocked"]:
            i["include"] = False
        elif i["id"] in exc:
            i["include"] = False
            i["note"] = i.get("note") or "Left out by the person who built the pack"
        elif i["id"] in inc:
            i["include"] = True
    return items


# ---------------- PDF building ----------------

def _t(s) -> str:
    """Helvetica (WinAnsi) can't draw some symbols; keep the meaning."""
    return (str(s or "").replace("≤", "max ").replace("≥", "min ").replace("−", "-").replace("→", "->").replace("✓", "OK")
            .replace("’", "'").replace("“", '"').replace("”", '"'))


def _x(s) -> str:
    """Text for a reportlab Paragraph, which parses markup: "Om Steel & Castings" must be escaped."""
    from xml.sax.saxutils import escape

    return escape(_t(s))


def _styles():
    from reportlab.lib import colors
    from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet

    ss = getSampleStyleSheet()
    return {"h1": ParagraphStyle("h1", parent=ss["Title"], fontSize=20, leading=24, alignment=0, spaceAfter=6),
            "h2": ParagraphStyle("h2", parent=ss["Heading2"], fontSize=13, leading=16, spaceBefore=6, spaceAfter=6),
            "body": ParagraphStyle("body", parent=ss["BodyText"], fontSize=9.5, leading=13),
            "small": ParagraphStyle("small", parent=ss["BodyText"], fontSize=8, leading=10.5),
            "muted": ParagraphStyle("muted", parent=ss["BodyText"], fontSize=8.5, leading=11, textColor=colors.HexColor("#555555"))}


def _doc(flow) -> bytes:
    from reportlab.lib.pagesizes import A4
    from reportlab.platypus import SimpleDocTemplate

    buf = io.BytesIO()
    SimpleDocTemplate(buf, pagesize=A4, leftMargin=42, rightMargin=42, topMargin=46, bottomMargin=46).build(flow)
    return buf.getvalue()


def _table(rows: list[list], widths: list[float], header: bool = True):
    from reportlab.lib import colors
    from reportlab.platypus import Paragraph, Table, TableStyle

    st = _styles()
    data = [[Paragraph(_x(c), st["small"]) for c in r] for r in rows]
    t = Table(data, colWidths=widths, repeatRows=1 if header else 0)
    style = [("GRID", (0, 0), (-1, -1), 0.4, colors.HexColor("#c8ccd2")), ("VALIGN", (0, 0), (-1, -1), "TOP"),
             ("TOPPADDING", (0, 0), (-1, -1), 3), ("BOTTOMPADDING", (0, 0), (-1, -1), 3)]
    if header:
        style += [("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#eef1f5"))]
    t.setStyle(TableStyle(style))
    return t


def _pages(pdf: bytes) -> int:
    from pypdf import PdfReader

    return len(PdfReader(io.BytesIO(pdf)).pages)


def _cover(run: dict, org_name: str, dossier_id: str, n_items: int, n_open: int, total_pages: int, built: datetime) -> bytes:
    from reportlab.platypus import Paragraph, Spacer

    st, rep, ctx = _styles(), run.get("report") or {}, run.get("context") or {}
    rows = [["Workspace", org_name], ["Goal", run.get("goal") or ""], ["Inspection date", _fmt_day(ctx.get("due_date")) or "Not given"],
            ["Readiness (from the report)", READINESS.get(rep.get("readiness"), "Not stated")], ["Prepared by", run.get("user_name") or ""],
            ["Generated", built.strftime("%d %b %Y %H:%M IST")], ["Dossier", dossier_id],
            ["Contents", f"{n_items} items · {n_open} open items · {total_pages} pages"]]
    flow = [Paragraph("Inspection evidence pack", st["h1"]), Paragraph(_x(rep.get("title") or run.get("title") or run.get("goal") or ""), st["h2"]),
            Spacer(1, 6), _table(rows, [150, 361], header=False), Spacer(1, 14), Paragraph("Verdict (from the readiness report)", st["h2"]),
            Paragraph(_x(rep.get("verdict") or ""), st["body"]), Spacer(1, 14),
            Paragraph("Every page carries a footer naming its source. Drawings are included at the revision that was current when this pack "
                      "was generated; scan the QR code on a drawing to check it is still current. Items that could not be included, gaps "
                      "and unknowns are listed under Open items at the end.", st["muted"])]
    return _doc(flow)


def _index(entries: list[dict], standards: list[str], open_page: int, n_open: int) -> bytes:
    from reportlab.platypus import Paragraph, Spacer

    st = _styles()
    rows = [["#", "Section", "Document", "Revision / verdict", "Pages"]]
    rows += [[str(k + 1), e["section_label"], e["title"], e["detail"], f"{e['start']}–{e['end']}" if e["end"] > e["start"] else str(e["start"])]
             for k, e in enumerate(entries)]
    rows.append(["", "Open items", f"{n_open} gaps, risks, unknowns and left-out items", "", str(open_page)])
    flow = [Paragraph("Index", st["h1"]), _table(rows, [22, 92, 205, 140, 52])]
    if standards:
        flow += [Spacer(1, 12), Paragraph("Standards and specifications referenced (not reproduced)", st["h2"])]
        flow += [Paragraph(_x(f"• {s}"), st["body"]) for s in standards]
    return _doc(flow)


def _spec_page(c: dict) -> bytes:
    from reportlab.platypus import Paragraph, Spacer

    st = _styles()
    dwg = c.get("drawing") or {}

    def lim(r):
        temp = f" at {r['test_temp_c']} °C" if r.get("test_temp_c") is not None else ""
        if r.get("min") is not None and r.get("max") is not None:
            return f"{r['min']}–{r['max']} {r.get('unit') or ''}{temp}"
        if r.get("max") is not None:
            return f"max {r['max']} {r.get('unit') or ''}{temp}"
        if r.get("min") is not None:
            return f"min {r['min']} {r.get('unit') or ''}{temp}"
        return "—"

    head = [["Verdict", VERDICT.get(c.get("verdict"), str(c.get("verdict") or ""))], ["Heat / certificate", f"{c.get('heat_no') or '?'} / {c.get('certificate_no') or '—'}"],
            ["Vendor / PO", f"{c.get('vendor') or '—'} / {c.get('po_no') or '—'}"], ["Grade checked", c.get("grade") or "—"],
            ["Drawing", f"{dwg.get('drawing_no')} Rev {dwg.get('rev')} requires {dwg.get('grade') or 'an unstated grade'}" if dwg.get("drawing_no") else "Not linked"]]
    rows = [["Property", "Certificate", "Requirement", "Result", "Source"]]
    rows += [[r.get("label") or r.get("property"), f"{r.get('value')} {r.get('unit') or ''}".strip() if r.get("value") is not None else "not reported",
              lim(r), (r.get("status") or "").upper(), f"{(r.get('source') or {}).get('standard') or ''} {(r.get('source') or {}).get('clause') or ''}".strip()]
             for r in c.get("rows") or []]
    flow = [Paragraph("Spec Check", st["h1"]), Paragraph(_x(c.get("file_name") or ""), st["muted"]), Spacer(1, 6), _table(head, [120, 391], header=False),
            Spacer(1, 10), _table(rows, [130, 90, 120, 55, 116]), Spacer(1, 10),
            Paragraph("Values were read from the certificate; pass/fail was computed by rules against the approved limits for the grade on the "
                      "drawing's current revision. The certificate follows this page.", st["muted"])]
    return _doc(flow)


def _record_page(r: dict) -> bytes:
    from reportlab.platypus import Paragraph, Spacer

    st, fl, capa = _styles(), r.get("fields") or {}, r.get("capa") or {}
    rows = [["Number", r.get("number") or ""], ["Type", (r.get("type") or "").upper()], ["Status", (r.get("status") or "").replace("_", " ")],
            ["Title", fl.get("title") or ""], ["Part / drawing", " · ".join(x for x in (fl.get("part_name"), fl.get("drawing_no"), fl.get("revision") and f"Rev {fl['revision']}") if x)],
            ["Heat / vendor", " · ".join(x for x in (fl.get("heat_no"), fl.get("vendor")) if x)], ["Severity", fl.get("severity") or ""],
            ["Raised", _fmt_day(r.get("created_at"))], ["Closed", _fmt_day(r.get("closed_at")) or "Open"],
            ["Description", fl.get("description") or ""], ["Containment", capa.get("containment") or ""], ["Root cause", capa.get("root_cause") or ""],
            ["Corrective action", capa.get("corrective_action") or ""], ["Verification", capa.get("verification") or ""]]
    return _doc([Paragraph("Non-conformance summary", st["h1"]), Spacer(1, 6), _table([x for x in rows if x[1]], [120, 391], header=False)])


def _decision_page(d: dict) -> bytes:
    from reportlab.platypus import Paragraph, Spacer

    st = _styles()
    rows = [["Decision", d.get("title") or ""], ["Topic", d.get("topic") or ""], ["Decided", f"{_fmt_day(d.get('decided_at'))} by {d.get('decided_by') or 'not recorded'}"],
            ["Rationale", d.get("rationale") or ""], ["Alternatives considered", "; ".join(d.get("alternatives") or [])],
            ["Status", "Superseded by a later decision" if d.get("status") == "superseded" else "Active"]]
    return _doc([Paragraph("Decision summary", st["h1"]), Spacer(1, 6), _table([x for x in rows if x[1]], [120, 391], header=False)])


def _open_page(items: list[dict]) -> bytes:
    from reportlab.platypus import Paragraph

    st = _styles()
    if not items:
        return _doc([Paragraph("Open items", st["h1"]), Paragraph("None: every cited item is included and the report lists no gaps.", st["body"])])
    rows = [["Type", "Item", "Detail", "Owner / due", "Status"]]
    rows += [[o["kind"], o["title"], o["detail"], " · ".join(x for x in (o["owner"], o["due"]) if x), o["status"]] for o in items]
    return _doc([Paragraph("Open items", st["h1"]), Paragraph("Gaps, risks and unknowns from the readiness report, and cited items that are not in this pack.", st["muted"]),
                 _table(rows, [55, 130, 170, 80, 76])])


def _as_pdf(data: bytes, mime: str) -> bytes:
    if mime == "application/pdf":
        return data
    from reportlab.lib.utils import ImageReader
    from reportlab.pdfgen import canvas

    img = ImageReader(io.BytesIO(data))
    w, h = img.getSize()
    buf = io.BytesIO()
    c = canvas.Canvas(buf, pagesize=(w, h))
    c.drawImage(img, 0, 0, w, h)
    c.save()
    return buf.getvalue()


def _upright(pdf: bytes) -> bytes:
    """Bakes any /Rotate into the page content, so stamps and footers land where a reader sees them (landscape A3 scans
    are often stored as rotated portrait pages)."""
    from pypdf import PdfReader, PdfWriter

    r = PdfReader(io.BytesIO(pdf))
    if not any(p.get("/Rotate") for p in r.pages):
        return pdf
    w = PdfWriter()
    for p in r.pages:
        if p.get("/Rotate"):
            p.transfer_rotation_to_content()
        w.add_page(p)
    out = io.BytesIO()
    w.write(out)
    return out.getvalue()


def _readable(pdf: bytes) -> bytes:
    from pypdf import PdfReader

    r = PdfReader(io.BytesIO(pdf))
    if r.is_encrypted and not r.decrypt(""):
        raise ValueError("password-protected PDF")
    return pdf


def _footer_overlay(page, left: str, right: str):
    from pypdf import PdfReader
    from reportlab.pdfgen import canvas

    box = page.mediabox
    x0, y0, pw, ph = float(box.left), float(box.bottom), float(box.width), float(box.height)
    buf = io.BytesIO()
    c = canvas.Canvas(buf, pagesize=(x0 + pw, y0 + ph))
    c.setFillColorRGB(1, 1, 1)
    c.rect(x0, y0, pw, 13, stroke=0, fill=1)
    c.setFillColorRGB(0.33, 0.33, 0.33)
    c.setFont("Helvetica", 6.5)
    text, room = _t(left), pw - 90
    while text and c.stringWidth(text, "Helvetica", 6.5) > room:
        text = text[:-2]
    c.drawString(x0 + 10, y0 + 4, text)
    c.drawRightString(x0 + pw - 10, y0 + 4, _t(right))
    c.save()
    return PdfReader(io.BytesIO(buf.getvalue())).pages[0]


def _drawing_pdf(item: dict, data: bytes, owner: dict, org_id: str, dossier_id: str, now: datetime) -> bytes:
    """The current drawing with the controlled-copy QR (same token format as Quality → Print controlled copy)."""
    import segno

    d = item["drawing"]
    token = secrets.token_urlsafe(9)
    qr = io.BytesIO()
    segno.make(f"{WEB_URL}/r/{token}", error="m").save(qr, kind="png", scale=8, border=1)
    if (item.get("mime") or "application/pdf") == "application/pdf":
        data = _upright(_readable(data))
    pdf = _stamp(data, item.get("mime") or "application/pdf", qr.getvalue(),
                 [f"{d['drawing_no']}  Rev {d['rev']}", f"Dossier {dossier_id} · {now.strftime('%d %b %Y %H:%M')}", "Scan to check it is current"])
    db.collection("qr_tokens").document(token).set({"org_id": org_id, "drawing_id": d["drawing_id"], "drawing_no": d["drawing_no"], "rev": d["rev"],
                                                    "file_id": item["file_id"], "printed_by": owner["uid"], "printed_by_name": owner["name"],
                                                    "printed_at": now, "dossier_id": dossier_id})
    return pdf


def assemble(run: dict, items: list[dict], standards: list[str], dossier_id: str, progress=lambda text: None) -> tuple[bytes, dict]:
    from pypdf import PdfReader, PdfWriter

    now = datetime.now(TZ)
    owner = user_profile(run["uid"])
    org_name = (db.collection("orgs").document(run["org_id"]).get().to_dict() or {}).get("name") or ""
    chosen = [i for i in items if i["include"]]
    for i in chosen[MAX_ITEMS:]:
        i["include"] = False
        i["note"] = f"Over the {MAX_ITEMS}-item limit for one pack"
    chosen = chosen[:MAX_ITEMS]
    parts: list[tuple[dict, bytes]] = []
    for k, it in enumerate(chosen):
        progress(f"Adding {k + 1} of {len(chosen)}: {it['title'][:60]}")
        try:
            if it.get("record"):
                pdf = _record_page(db.collection("records").document(it["ref"][4:]).get().to_dict() or {})
            elif it.get("decision"):
                pdf = _decision_page(db.collection("decisions").document(it["ref"][4:]).get().to_dict() or {})
            else:
                f = db.collection("files").document(it["file_id"]).get().to_dict() or {}
                data = bucket.blob(f["gcs_path"]).download_as_bytes()
                if it.get("drawing"):
                    pdf = _drawing_pdf(it, data, owner, run["org_id"], dossier_id, now)
                else:
                    pdf = _readable(_as_pdf(data, it.get("mime") or ""))
                if it.get("spec"):
                    c = db.collection("spec_checks").document(it["file_id"]).get().to_dict() or {}
                    spec = _spec_page(c)
                    merged = PdfWriter()
                    for p in [*PdfReader(io.BytesIO(spec)).pages, *PdfReader(io.BytesIO(pdf)).pages]:
                        merged.add_page(p)
                    buf = io.BytesIO()
                    merged.write(buf)
                    pdf = buf.getvalue()
            parts.append((it, pdf))
        except Exception as e:
            log.exception("dossier %s: couldn't add %s", dossier_id, it["ref"])
            it["include"] = False
            it["note"] = f"Couldn't be added ({str(e)[:80]})"

    progress("Writing the index and open items")
    included = [it for it, _ in parts]
    open_items = _open_items(run, items)
    open_pdf = _open_page(open_items)
    counts = [_pages(p) for _, p in parts]

    def index_for(first_item_page: int) -> tuple[bytes, list[dict]]:
        entries, page = [], first_item_page
        for it, n in zip(included, counts):
            entries.append({**it, "start": page, "end": page + n - 1})
            page += n
        return _index(entries, standards, page, len(open_items)), entries

    idx, entries = index_for(3)
    n_index = _pages(idx)
    if n_index != 1:
        idx, entries = index_for(2 + n_index)
    total = 1 + _pages(idx) + sum(counts) + _pages(open_pdf)
    cover = _cover(run, org_name, dossier_id, len(included), len(open_items), total, now)

    progress("Stamping pages")
    writer = PdfWriter()
    labels: list[str] = []
    for pdf, label in [(cover, ""), (idx, "Index")] + [(p, f"Item {k + 1}/{len(parts)} · {it.get('footer') or it['title']}") for k, (it, p) in enumerate(parts)] \
            + [(open_pdf, "Open items")]:
        for page in PdfReader(io.BytesIO(pdf)).pages:
            writer.add_page(page)
            labels.append(label)
    stamp_time = now.strftime("%d %b %Y %H:%M IST")
    for n, page in enumerate(writer.pages):
        if page.get("/Rotate"):
            page.transfer_rotation_to_content()
        left = f"Saathi dossier {dossier_id} · {stamp_time}" + (f" · {labels[n]}" if labels[n] else "")
        page.merge_page(_footer_overlay(page, left, f"page {n + 1}/{len(writer.pages)}"))
    out = io.BytesIO()
    writer.write(out)
    pdf = out.getvalue()
    summary = {"pages": len(writer.pages), "bytes": len(pdf), "item_count": len(included), "open_count": len(open_items),
               "items": [{"title": e["title"], "section": e["section_label"], "detail": e["detail"], "pages": [e["start"], e["end"]]} for e in entries]}
    return pdf, summary


# ---------------- job + API ----------------

def _set(ref, **fields) -> None:
    ref.update({f"dossier.{k}": v for k, v in fields.items()})


async def build_job(run_id: str) -> None:
    ref = db.collection("research_runs").document(run_id)
    run = ref.get().to_dict() or {}
    d = run.get("dossier") or {}
    if d.get("status") not in ("queued", "building"):
        return
    hb = d.get("heartbeat")
    if d.get("status") == "building" and hb and (datetime.now(TZ) - hb).total_seconds() < STALE_S:
        return  # another worker is on it
    started = time.monotonic()
    _set(ref, status="building", progress="Re-checking revisions and access", heartbeat=datetime.now(TZ))

    def progress(text: str) -> None:
        _set(ref, progress=text, heartbeat=datetime.now(TZ))

    try:
        man = build_manifest(run)
        items = _apply_selection(man["items"], d.get("include") or [], d.get("exclude") or [])
        pdf, summary = assemble(run, items, man["standards"], d["id"], progress)
        if len(pdf) > MAX_BYTES:
            raise ValueError(f"The pack is {len(pdf) // (1024 * 1024)} MB; the limit is {MAX_BYTES // (1024 * 1024)} MB. Leave out some large files.")
        progress("Saving")
        path = f"dossiers/{run['org_id']}/{run_id}/{d['id']}.pdf"
        bucket.blob(path).upload_from_string(pdf, content_type="application/pdf")
        old = d.get("gcs_path")
        _set(ref, status="ready", progress="", gcs_path=path, built_at=datetime.now(TZ), build_ms=int((time.monotonic() - started) * 1000),
             error=None, **summary)
        if old and old != path:
            try:
                bucket.blob(old).delete()
            except Exception:
                pass
        audit(user_profile(run["uid"]), "dossier.built", run_id, dossier_id=d["id"], pages=summary["pages"], items=summary["item_count"])
    except Exception as e:
        log.exception("dossier build failed for %s", run_id)
        _set(ref, status="failed", progress="", error=str(e)[:300] if isinstance(e, ValueError) else "Couldn't build the pack. Try again.")


jobs.register("dossier-build", build_job)


def _readiness_run(run_id: str, user: dict):
    ref, run = _own(run_id, user)
    if run.get("status") != "done" or run.get("template") != "readiness" or not run.get("report"):
        raise HTTPException(400, "A dossier can be built from a finished readiness report")
    return ref, run


@router.get("/api/research/{run_id}/dossier/manifest")
def manifest(run_id: str, user=Depends(current_user)):
    _, run = _readiness_run(run_id, user)
    return build_manifest(run)


class BuildIn(BaseModel):
    include: list[str] = []
    exclude: list[str] = []


@router.post("/api/research/{run_id}/dossier")
def build(run_id: str, body: BuildIn, user=Depends(current_user)):
    ref, run = _readiness_run(run_id, user)
    d = run.get("dossier") or {}
    hb = d.get("heartbeat") or d.get("requested_at")
    if d.get("status") in ("queued", "building") and hb and (datetime.now(TZ) - hb).total_seconds() < STALE_S:
        raise HTTPException(409, "This dossier is already being built")
    did = "D-" + uuid.uuid4().hex[:8].upper()
    ref.update({"dossier": {**{k: v for k, v in d.items() if k in ("gcs_path",)}, "id": did, "status": "queued", "progress": "Queued",
                            "include": body.include[:100], "exclude": body.exclude[:100], "requested_at": datetime.now(TZ), "heartbeat": datetime.now(TZ)}})
    jobs.enqueue("dossier-build", run_id)
    audit(user, "dossier.requested", run_id, dossier_id=did)
    return {"ok": True, "id": did}


@router.get("/api/research/{run_id}/dossier.pdf")
def download(run_id: str, user=Depends(current_user)):
    _, run = _own(run_id, user)
    d = run.get("dossier") or {}
    if d.get("status") != "ready" or not d.get("gcs_path"):
        raise HTTPException(404, "No dossier has been built for this report yet")
    data = bucket.blob(d["gcs_path"]).download_as_bytes()
    audit(user, "dossier.downloaded", run_id, dossier_id=d.get("id"))
    name = f"Saathi_dossier_{d.get('id')}.pdf"
    return Response(data, media_type="application/pdf", headers={"Content-Disposition": f'attachment; filename="{name}"', "X-Content-Type-Options": "nosniff"})
