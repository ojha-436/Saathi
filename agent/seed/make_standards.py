"""Synthetic company standards for the Standards Library (Spec Check demo) and a failing mill test certificate.

Run: uv run python seed/make_standards.py  → agent/seed/files/standards/*.pdf and agent/seed/files/MTC_H-78120_*.pdf
The limit values summarise EN 10025-2 S355J0/J2 as a company material specification would; they are demo data.
"""
from pathlib import Path

from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.pdfgen import canvas

from make_pdfs import COMPANY, _table

OUT = Path(__file__).parent / "files"
STD = OUT / "standards"


def _header(c, title, doc_no, rev, page="1 of 1"):
    W, H = A4
    c.setLineWidth(0.8)
    c.rect(15 * mm, H - 38 * mm, W - 30 * mm, 23 * mm)
    c.setFont("Helvetica-Bold", 10)
    c.drawString(18 * mm, H - 21 * mm, COMPANY)
    c.setFont("Helvetica-Bold", 12)
    c.drawString(18 * mm, H - 28 * mm, title)
    c.setFont("Helvetica", 8.5)
    c.drawString(18 * mm, H - 34 * mm, f"Doc No. {doc_no}   Rev {rev}   Page {page}   Controlled copy — Quality Assurance")
    return H - 46 * mm


def _para(c, x, y, lines, size=9, lead=4.6 * mm):
    c.setFont("Helvetica", size)
    for line in lines:
        c.drawString(x, y, line)
        y -= lead
    return y


def material_spec():
    c = canvas.Canvas(str(STD / "SRC-SPEC-MAT-01_RevB_Structural_Steel_S355.pdf"), pagesize=A4)
    y = _header(c, "MATERIAL SPECIFICATION — STRUCTURAL STEEL S355 (BOGIE SIDE FRAMES, BOLSTERS)", "SRC-SPEC-MAT-01", "B")
    y = _para(c, 18 * mm, y, [
        "1. SCOPE. This specification sets the acceptance limits for steel grades S355J0 and S355J2 (EN 10025-2) used for bogie side",
        "   frames, bolsters and welded brackets on drawings SRC-BF-2041, SRC-AB-1107 and derivatives. Limits apply to the ladle analysis",
        "   and to mechanical tests reported on the mill test certificate (EN 10204 type 3.1).",
        "2. CHEMICAL COMPOSITION — ladle analysis, maximum % by mass (clause 2.1, Table 1).",
    ])
    y = _table(c, 18 * mm, y - 1 * mm, [34 * mm, 22 * mm, 16 * mm, 16 * mm, 16 * mm, 16 * mm, 16 * mm, 20 * mm, 20 * mm], [
        ["Grade / thickness t", "C", "Si", "Mn", "P", "S", "Cu", "CEV", "N"],
        ["S355J2, t <= 30 mm", "0.20", "0.55", "1.60", "0.025", "0.025", "0.55", "0.45", "-"],
        ["S355J2, 30 < t <= 100", "0.22", "0.55", "1.60", "0.025", "0.025", "0.55", "0.47", "-"],
        ["S355J0, t <= 30 mm", "0.20", "0.55", "1.60", "0.030", "0.030", "0.55", "0.45", "0.012"],
        ["S355J0, 30 < t <= 100", "0.22", "0.55", "1.60", "0.030", "0.030", "0.55", "0.47", "0.012"],
    ], h=6.5 * mm, font=8)
    y = _para(c, 18 * mm, y - 6 * mm, [
        "   CEV = C + Mn/6 + (Cr+Mo+V)/5 + (Ni+Cu)/15. Where the certificate does not state the section thickness, the t <= 30 mm row applies.",
        "3. MECHANICAL PROPERTIES — tensile test, longitudinal (clause 3.1, Table 2).",
    ])
    y = _table(c, 18 * mm, y - 1 * mm, [44 * mm, 42 * mm, 42 * mm, 42 * mm], [
        ["Thickness t", "Yield ReH min (MPa)", "Tensile Rm (MPa)", "Elongation A min (%)"],
        ["t <= 16 mm", "355", "470 - 630", "22"],
        ["16 < t <= 40 mm", "345", "470 - 630", "22"],
        ["40 < t <= 63 mm", "335", "470 - 630", "21"],
    ], h=6.5 * mm, font=8)
    y = _para(c, 18 * mm, y - 6 * mm, [
        "4. IMPACT TEST — Charpy V-notch, average of three specimens (clause 3.2, Table 3).",
    ])
    y = _table(c, 18 * mm, y - 1 * mm, [44 * mm, 52 * mm, 52 * mm], [
        ["Grade", "Test temperature", "Minimum energy KV"],
        ["S355J2", "-20 C", "27 J"],
        ["S355J0", "0 C", "27 J"],
    ], h=6.5 * mm, font=8)
    _para(c, 18 * mm, y - 7 * mm, [
        "   An impact result at a higher temperature than specified does not demonstrate conformity (e.g. 0 C results for S355J2).",
        "5. ACCEPTANCE. Every heat must be covered by a type 3.1 certificate. Any value outside these limits, or a required test not",
        "   reported, makes the heat non-conforming: quarantine the material and raise an NCR (see SRC-QP-07). Concessions require the",
        "   QA Head's written approval.",
        "Approved: N. Verma (QA Manager)   Date: 14 Aug 2026",
    ])
    c.save()


def incoming_procedure():
    c = canvas.Canvas(str(STD / "SRC-QP-07_RevD_Incoming_Material_Inspection.pdf"), pagesize=A4)
    y = _header(c, "QUALITY PROCEDURE — INCOMING MATERIAL INSPECTION AND CERTIFICATE VERIFICATION", "SRC-QP-07", "D")
    _para(c, 18 * mm, y, [
        "1. PURPOSE. Ensure every lot of castings, plates and forgings conforms to the drawing material grade before use.",
        "2. RESPONSIBILITY. Stores receives; Quality (incoming inspection) verifies; QA Manager approves concessions.",
        "3. CERTIFICATE VERIFICATION (clause 3).",
        "   3.1 Check the certificate is EN 10204 type 3.1 and lists heat number, PO, quantity and material grade.",
        "   3.2 Confirm the material grade matches the CURRENT revision of the drawing (drawing register). Superseded revisions",
        "       must not be used for acceptance.",
        "   3.3 Compare every chemical and mechanical value with SRC-SPEC-MAT-01 for the grade and section thickness.",
        "   3.4 Confirm required tests are reported at the specified conditions (e.g. Charpy at -20 C for J2 grades).",
        "   3.5 Record the verdict against the heat number in the incoming inspection log.",
        "4. NON-CONFORMANCE (clause 4).",
        "   4.1 Quarantine the lot with a HOLD tag within 2 hours of the finding.",
        "   4.2 Raise an NCR citing the certificate, the failed property, the specified limit and the source clause.",
        "   4.3 Inform the vendor and Purchase the same day; request a corrective action report within 7 days.",
        "5. SAMPLING. Castings for bogie side frames: first 3 pieces of each new heat to radiography (RT) and dimensional check.",
        "6. RECORDS. Certificates and verdicts are retained for 10 years (RDSO audit requirement).",
        "Approved: N. Verma (QA Manager)   Date: 02 Jul 2026",
    ])
    c.save()


def rdso_checklist():
    c = canvas.Canvas(str(STD / "SRC-QA-CL-12_RDSO_Inspection_Readiness_Checklist.pdf"), pagesize=A4)
    y = _header(c, "CHECKLIST — CUSTOMER / RDSO INSPECTION READINESS (PROTOTYPE BOGIES)", "SRC-QA-CL-12", "A")
    y = _table(c, 18 * mm, y, [10 * mm, 120 * mm, 44 * mm], [
        ["#", "Item to be available at the inspection", "Owner"],
        ["1", "Drawing pack at CURRENT released revisions; superseded copies withdrawn", "Design"],
        ["2", "Type 3.1 certificate for every heat, verified against SRC-SPEC-MAT-01", "Quality"],
        ["3", "NDT reports: UT for all butt welds, MPI for fillet welds (Level 2 signed)", "Quality"],
        ["4", "Dimensional reports and first article inspection (FAI) report", "Quality"],
        ["5", "All NCRs closed or dispositioned with approved concessions", "Quality"],
        ["6", "Calibration certificates for gauges and the UT set (in date)", "Quality"],
        ["7", "Vendor audit reports for casting suppliers (within 12 months)", "Purchase"],
        ["8", "Weld procedure (WPS/PQR) and welder qualification records", "Production"],
    ], h=7 * mm, font=8.5)
    _para(c, 18 * mm, y - 8 * mm, ["Approved: K. Iyer (Programme Lead)   Date: 20 Sep 2026"])
    c.save()


def failing_certificate():
    c = canvas.Canvas(str(OUT / "MTC_H-78120_SideFrame_Lot2.pdf"), pagesize=A4)
    W, H = A4
    c.setFont("Helvetica-Bold", 13)
    c.drawCentredString(W / 2, H - 25 * mm, "MILL TEST CERTIFICATE  (EN 10204 TYPE 3.1)")
    c.setFont("Helvetica", 9)
    c.drawCentredString(W / 2, H - 31 * mm, "Issued by: Om Steel & Castings Ltd., Raipur  |  Certificate No. OSC/MTC/2026/1241")
    y = _table(c, 20 * mm, H - 40 * mm, [55 * mm, 115 * mm], [
        ["Customer", COMPANY],
        ["Purchase Order", "PO-SRC-2026-0412"],
        ["Item", "Side frame casting for BG bogie (Drg SRC-BF-2041) - lot 2, Job 4522"],
        ["Heat No.", "H-78120"],
        ["Material Grade", "EN 10025 S355J2"],
        ["Section thickness", "32 mm"],
        ["Quantity", "22 Nos"],
        ["Date of Issue", "11 Oct 2026"],
    ], h=7 * mm, font=9)
    c.setFont("Helvetica-Bold", 10)
    c.drawString(20 * mm, y - 10 * mm, "CHEMICAL COMPOSITION (%)")
    y = _table(c, 20 * mm, y - 13 * mm, [24 * mm] * 7, [
        ["Element", "C", "Si", "Mn", "P", "S", "CEV"],
        ["Actual", "0.23", "0.38", "1.48", "0.021", "0.011", "0.49"],
    ], h=7 * mm, font=9)
    c.setFont("Helvetica-Bold", 10)
    c.drawString(20 * mm, y - 10 * mm, "MECHANICAL PROPERTIES")
    y = _table(c, 20 * mm, y - 13 * mm, [56 * mm, 42 * mm, 42 * mm], [
        ["Property", "Actual", "Result"],
        ["Yield strength ReH (MPa)", "361", "OK"],
        ["Tensile strength Rm (MPa)", "541", "OK"],
        ["Elongation A (%)", "23", "OK"],
        ["Charpy V-notch at 0 C (J)", "31", "OK"],
    ], h=7 * mm, font=9)
    c.setFont("Helvetica-Bold", 11)
    c.drawString(20 * mm, y - 15 * mm, "OVERALL RESULT: ACCEPTED")
    c.setFont("Helvetica", 9)
    c.drawString(20 * mm, y - 25 * mm, "QA Head: S. Mishra")
    c.save()


if __name__ == "__main__":
    STD.mkdir(parents=True, exist_ok=True)
    material_spec()
    incoming_procedure()
    rdso_checklist()
    failing_certificate()
    print("wrote", sorted(p.name for p in STD.iterdir()), "and MTC_H-78120_SideFrame_Lot2.pdf")
