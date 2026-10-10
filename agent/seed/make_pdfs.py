"""Generates synthetic, realistic demo documents for a fictional rolling-stock component maker."""
from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.pagesizes import A3, A4, landscape
from reportlab.lib.units import mm
from reportlab.pdfgen import canvas

OUT = Path(__file__).parent / "files"
COMPANY = "SHAKTI RAIL COMPONENTS PVT. LTD."


def _table(c, x, y, widths, rows, h=6 * mm, font=7.5):
    c.setFont("Helvetica", font)
    for r, row in enumerate(rows):
        cx = x
        for w, cell in zip(widths, row):
            c.rect(cx, y - (r + 1) * h, w, h)
            c.setFont("Helvetica-Bold" if r == 0 else "Helvetica", font)
            c.drawString(cx + 1.5 * mm, y - (r + 1) * h + 2 * mm, str(cell))
            cx += w
    return y - len(rows) * h


def drawing(fname, drg_no, title, rev, revisions, approved_by, approved_date, notes, draft=False):
    W, H = landscape(A3)
    c = canvas.Canvas(str(OUT / fname), pagesize=(W, H))
    c.setLineWidth(1.2)
    c.rect(10 * mm, 10 * mm, W - 20 * mm, H - 20 * mm)

    # simplified side-frame geometry
    c.setLineWidth(0.8)
    x0, y0 = 50 * mm, 140 * mm
    c.rect(x0, y0, 250 * mm, 45 * mm)
    c.rect(x0 + 95 * mm, y0 - 25 * mm, 60 * mm, 25 * mm)  # bolster pocket
    c.circle(x0 + 30 * mm, y0 + 22 * mm, 14 * mm)
    c.circle(x0 + 220 * mm, y0 + 22 * mm, 14 * mm)
    c.setDash(4, 2)
    c.line(x0 - 10 * mm, y0 + 22 * mm, x0 + 260 * mm, y0 + 22 * mm)
    c.setDash()
    c.setFont("Helvetica", 8)
    c.drawString(x0, y0 + 50 * mm, "SIDE FRAME - GENERAL ARRANGEMENT (ALL DIMENSIONS IN mm)")
    c.drawString(x0 + 100 * mm, y0 - 32 * mm, "BOLSTER POCKET - SEE DETAIL 'A'")
    c.drawString(x0 + 110 * mm, y0 + 47 * mm, "2470")
    c.line(x0, y0 + 46 * mm, x0 + 250 * mm, y0 + 46 * mm)

    # notes
    c.setFont("Helvetica-Bold", 9)
    c.drawString(30 * mm, 115 * mm, "NOTES:")
    c.setFont("Helvetica", 8)
    for i, n in enumerate(notes):
        c.drawString(30 * mm, (108 - i * 6) * mm, f"{i + 1}. {n}")

    if draft:
        c.saveState()
        c.setFillColor(colors.Color(0.85, 0.1, 0.1, alpha=0.25))
        c.setFont("Helvetica-Bold", 70)
        c.translate(W / 2, H / 2)
        c.rotate(25)
        c.drawCentredString(0, 0, "DRAFT - NOT RELEASED")
        c.restoreState()

    # revision table (top right)
    rows = [["REV", "DESCRIPTION", "DATE", "APPROVED"]] + revisions
    _table(c, W - 200 * mm, H - 15 * mm, [14 * mm, 110 * mm, 30 * mm, 36 * mm], rows)

    # title block (bottom right)
    tb_x, tb_y = W - 200 * mm, 75 * mm
    _table(
        c, tb_x, tb_y, [50 * mm, 140 * mm],
        [
            ["COMPANY", COMPANY],
            ["TITLE", title],
            ["DRAWING No.", drg_no],
            ["REVISION", rev],
            ["DRAWN BY", "Amit Sharma"],
            ["CHECKED BY", "Prince Kumar"],
            ["APPROVED BY", approved_by],
            ["APPROVAL DATE", approved_date],
            ["MATERIAL", "EN 10025 S355J2 (cast steel equivalent per RDSO spec)"],
            ["SCALE / SHEET", "1:10  /  SHEET 1 OF 1"],
        ],
        h=6.2 * mm, font=8,
    )
    c.showPage()
    c.save()


def test_certificate():
    c = canvas.Canvas(str(OUT / "MTC_H-77812_Ladle_Analysis.pdf"), pagesize=A4)
    W, H = A4
    c.setFont("Helvetica-Bold", 13)
    c.drawCentredString(W / 2, H - 25 * mm, "MILL TEST CERTIFICATE  (EN 10204 TYPE 3.1)")
    c.setFont("Helvetica", 9)
    c.drawCentredString(W / 2, H - 31 * mm, "Issued by: Om Steel & Castings Ltd., Raipur  |  Certificate No. OSC/MTC/2026/1184")
    y = _table(c, 20 * mm, H - 40 * mm, [55 * mm, 115 * mm], [
        ["Customer", COMPANY],
        ["Purchase Order", "PO-SRC-2026-0412"],
        ["Item", "Side frame casting for BG bogie (Drg SRC-BF-2041)"],
        ["Heat No.", "H-77812"],
        ["Material Grade", "EN 10025 S355J2"],
        ["Quantity", "24 Nos"],
        ["Date of Issue", "02 Oct 2026"],
    ], h=7 * mm, font=9)
    c.setFont("Helvetica-Bold", 10)
    c.drawString(20 * mm, y - 10 * mm, "CHEMICAL COMPOSITION (%)")
    y = _table(c, 20 * mm, y - 13 * mm, [24 * mm] * 7, [
        ["Element", "C", "Si", "Mn", "P", "S", "CEV"],
        ["Spec max", "0.20", "0.55", "1.60", "0.025", "0.025", "0.47"],
        ["Actual", "0.18", "0.41", "1.42", "0.018", "0.012", "0.44"],
    ], h=7 * mm, font=9)
    c.setFont("Helvetica-Bold", 10)
    c.drawString(20 * mm, y - 10 * mm, "MECHANICAL PROPERTIES")
    y = _table(c, 20 * mm, y - 13 * mm, [42 * mm, 42 * mm, 42 * mm, 42 * mm], [
        ["Property", "Specified", "Actual", "Result"],
        ["Yield strength (MPa)", ">= 355", "372", "PASS"],
        ["Tensile strength (MPa)", "470 - 630", "528", "PASS"],
        ["Elongation (%)", ">= 22", "25", "PASS"],
        ["Charpy -20C (J)", ">= 27", "41", "PASS"],
    ], h=7 * mm, font=9)
    c.setFont("Helvetica-Bold", 11)
    c.drawString(20 * mm, y - 15 * mm, "OVERALL RESULT: ACCEPTED - conforms to EN 10025 S355J2")
    c.setFont("Helvetica", 9)
    c.drawString(20 * mm, y - 25 * mm, "Witnessed by: RDSO Inspector (Mr. V. Rao)      QA Head: S. Mishra")
    c.save()


def vendor_quote():
    c = canvas.Canvas(str(OUT / "Quote_OmCastings_AxleBoxHousing_Q-2219.pdf"), pagesize=A4)
    W, H = A4
    c.setFont("Helvetica-Bold", 14)
    c.drawString(20 * mm, H - 25 * mm, "OM STEEL & CASTINGS LTD.")
    c.setFont("Helvetica", 9)
    c.drawString(20 * mm, H - 31 * mm, "Industrial Area Phase II, Raipur, Chhattisgarh  |  GSTIN 22AAACO1234F1Z5")
    c.setFont("Helvetica-Bold", 12)
    c.drawString(20 * mm, H - 45 * mm, "QUOTATION No. Q-2219   Date: 29 Sep 2026")
    c.setFont("Helvetica", 9)
    c.drawString(20 * mm, H - 52 * mm, f"To: {COMPANY} - Attn: Rahul Singh (Procurement)")
    y = _table(c, 20 * mm, H - 60 * mm, [10 * mm, 70 * mm, 20 * mm, 30 * mm, 40 * mm], [
        ["#", "Item", "Qty", "Unit Rate (INR)", "Amount (INR)"],
        ["1", "Axle box housing casting, Drg SRC-AB-1107 Rev A", "48", "18,450", "8,85,600"],
        ["2", "Pattern & tooling (one time)", "1", "1,20,000", "1,20,000"],
        ["", "GST @18%", "", "", "1,81,008"],
        ["", "TOTAL", "", "", "11,86,608"],
    ], h=7 * mm, font=8.5)
    c.setFont("Helvetica", 9)
    for i, line in enumerate([
        "Delivery: First lot of 24 Nos to be dispatched on 15 Oct 2026; balance within 3 weeks.",
        "Payment terms: 30% advance, balance against dispatch documents.",
        "Validity: 30 days. Inspection: stage inspection by customer QA at our works.",
        "Contact: Mr. Deepak Agarwal, +91 98xxxxxx21",
    ]):
        c.drawString(20 * mm, y - (12 + 7 * i) * mm, line)
    c.save()


def inspection_report():
    c = canvas.Canvas(str(OUT / "Inspection_Report_Job4521_Welding.pdf"), pagesize=A4)
    W, H = A4
    c.setFont("Helvetica-Bold", 13)
    c.drawCentredString(W / 2, H - 25 * mm, "STAGE INSPECTION REPORT - WELDING")
    c.setFont("Helvetica", 9)
    c.drawCentredString(W / 2, H - 31 * mm, f"{COMPANY}  |  Quality Assurance  |  Report No. QA/IR/2026/377")
    y = _table(c, 20 * mm, H - 40 * mm, [55 * mm, 115 * mm], [
        ["Job No.", "4521"],
        ["Component", "Bogie side frame assembly (Drg SRC-BF-2041 Rev C)"],
        ["Inspection Date", "08 Oct 2026"],
        ["Inspector", "Neha Verma (QA Manager)"],
        ["Bay / Line", "Bay 2, Fabrication"],
    ], h=7 * mm, font=9)
    y = _table(c, 20 * mm, y - 10 * mm, [60 * mm, 40 * mm, 35 * mm, 35 * mm], [
        ["Check", "Requirement", "Observed", "Status"],
        ["Fillet weld size, bolster pocket", "10 mm (Rev C)", "10 mm", "OK"],
        ["Visual - undercut", "< 0.5 mm", "0.3 mm", "OK"],
        ["MPI on critical welds", "No linear indications", "No indications", "OK"],
        ["Dimensional - wheelbase", "2470 +/- 1.5", "2470.8", "OK"],
        ["UT of butt weld W7", "Level 2 acceptance", "Pending", "OPEN"],
    ], h=7 * mm, font=8.5)
    c.setFont("Helvetica-Bold", 10)
    c.drawString(20 * mm, y - 12 * mm, "RESULT: CONDITIONALLY ACCEPTED - UT of weld W7 pending (target 11 Oct 2026)")
    c.save()


def main():
    OUT.mkdir(exist_ok=True)
    revs_ab = [
        ["A", "First issue for prototype", "12 Aug 2026", "N. Verma"],
        ["B", "Bolster pocket radius R25 -> R30; note 4 added", "18 Sep 2026", "N. Verma"],
    ]
    notes = [
        "All welds to IS 9595 / ISO 5817 level B.",
        "Fillet weld at bolster pocket: 8 mm unless otherwise noted.",
        "Remove all sharp edges, 1 x 45 deg chamfer.",
        "Stress relieve after welding per RDSO spec.",
    ]
    drawing("SRC-BF-2041_RevB_SideFrame_GA.pdf", "SRC-BF-2041", "BOGIE SIDE FRAME - GENERAL ARRANGEMENT", "B",
            revs_ab, "Neha Verma (QA)", "18 Sep 2026", notes)
    revs_c = revs_ab + [["C", "Bolster pocket fillet weld 8 mm -> 10 mm (fatigue review)", "06 Oct 2026", "N. Verma"]]
    notes_c = notes[:1] + ["Fillet weld at bolster pocket: 10 mm (changed in Rev C)."] + notes[2:]
    drawing("SRC-BF-2041_RevC_SideFrame_GA.pdf", "SRC-BF-2041", "BOGIE SIDE FRAME - GENERAL ARRANGEMENT", "C",
            revs_c, "Neha Verma (QA)", "06 Oct 2026", notes_c)
    revs_d = revs_c + [["D", "DRAFT: lightening holes in web (under study, not released)", "-", "-"]]
    drawing("SRC-BF-2041_RevD_DRAFT_internal.pdf", "SRC-BF-2041", "BOGIE SIDE FRAME - GENERAL ARRANGEMENT", "D (DRAFT)",
            revs_d, "NOT APPROVED", "-", notes_c + ["Lightening holes 4 x dia 80 in web - under FEA study."], draft=True)
    test_certificate()
    vendor_quote()
    inspection_report()
    print("written:", sorted(p.name for p in OUT.iterdir()))


if __name__ == "__main__":
    main()
