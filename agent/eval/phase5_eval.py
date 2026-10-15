"""Phase 5 evaluation (docs/PRD-phase-5-close-the-loop.md §9). Starts with the supplier (guest) Spec Check view, S0.

uv run python -m eval.phase5_eval
Writes eval/results_phase5.json and eval/results_phase5.md. The supplier cases are pure functions: no live data, no model calls.
"""
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.specs import guest_view  # noqa: E402

HERE = Path(__file__).parent


def _row(prop, label, unit, value, mn, mx, status, temp=None, clause="4.2"):
    return {"property": prop, "label": label, "unit": unit, "value": value, "min": mn, "max": mx, "test_temp_c": temp, "status": status,
            "note": f"internal note for {prop}", "source": {"standard_id": "std1", "standard": "SRC-SPEC-MAT-01", "clause": clause, "page": 3,
                                                          "ref": "std:std1"}}


# The Lot 2 side-frame certificate as Spec Check stores it (agent/seed/make_standards.py): C and CEV fail, impact at 0 °C.
LOT2 = {
    "org_id": "shakti-rail", "file_id": "f_lot2", "chat_id": "grp_supplier", "file_name": "MTC_H-78120_SideFrame_Lot2.pdf", "verdict": "fail",
    "grade": "S355J2", "certificate_no": "OSC/MTC/2210", "heat_no": "H-78120", "vendor": "Om Steel & Castings", "po_no": "PO-SRC-2026-0412",
    "thickness_mm": 32, "drawing": {"drawing_no": "SRC-BF-2041", "rev": "C", "grade": "S355J2", "ref": "file:file006"}, "grade_mismatch": False,
    "rows": [_row("c", "Carbon (C)", "%", 0.23, None, 0.22, "fail"), _row("cev", "CEV", "", 0.49, None, 0.47, "fail"),
             _row("impact", "Impact energy", "J", 31, 27, None, "missing", temp=-20), _row("ys", "Yield strength", "MPa", 360, 345, None, "pass")],
    "notes": ["No approved limits for S355J0 in the Standards Library yet.", "Thickness band 16-40 mm from SRC-SPEC-MAT-01 table 2."],
    "values": [{"property": "c", "value": 0.23}], "ts": None, "check_ms": 900, "upload_to_verdict_ms": 14000,
}
NO_LIMITS = {**LOT2, "verdict": "no_limits", "grade": "S275", "rows": [], "notes": ["No approved limits for S275 in the Standards Library yet."]}
MISMATCH = {**LOT2, "grade_mismatch": True, "grade": "S355J0", "notes": ["Grade mismatch: drawing SRC-BF-2041 Rev C requires S355J2, but certificate states S355J0."]}
PASS = {**LOT2, "verdict": "pass", "rows": [_row("ys", "Yield strength", "MPa", 360, 345, None, "pass")], "notes": []}

ALLOWED_TOP = {"file_id", "file_name", "verdict", "grade", "certificate_no", "heat_no", "vendor", "po_no", "thickness_mm", "grade_mismatch",
               "drawing", "rows", "notes"}
ALLOWED_ROW = {"property", "label", "unit", "value", "min", "max", "test_temp_c", "status", "note", "source"}
# Internal facts a supplier must never see: our standards library, clauses, internal drawing files, workspace ids, internal notes.
FORBIDDEN = ["std:", "SRC-SPEC-MAT-01", "clause", "file:file006", "shakti-rail", "grp_supplier", "internal note", "Standards Library",
             "S355J0 in the", "S275 in the", "Thickness band", "upload_to_verdict_ms"]


def supplier_eval() -> list[dict]:
    cases = []

    def case(name, ok, detail=""):
        cases.append({"case": name, "ok": bool(ok), "detail": detail})

    for label, check in (("fail", LOT2), ("no_limits", NO_LIMITS), ("grade mismatch", MISMATCH), ("pass", PASS)):
        g = guest_view(check)
        blob = json.dumps(g, ensure_ascii=False)
        leaks = [f for f in FORBIDDEN if f in blob]
        extra_top = set(g) - ALLOWED_TOP
        extra_row = set().union(*(set(r) - ALLOWED_ROW for r in g["rows"])) if g["rows"] else set()
        sources = [r["source"] for r in g["rows"] if r["source"] or r["note"]]
        case(f"{label}: whitelist only", not extra_top and not extra_row and not sources, f"extra={sorted(extra_top | extra_row)}")
        case(f"{label}: no internal facts", not leaks, f"leaks={leaks}")

    notes = " ".join(guest_view(LOT2)["notes"])
    case("fail: next steps name each failing value", all(s in notes for s in ("Carbon (C): 0.23 % is outside the required ≤ 0.22 %",
                                                                             "CEV: 0.49 is outside the required ≤ 0.47",
                                                                             "Impact energy: not reported at -20 °C")), notes)
    case("fail: tells the supplier what to do", "upload the new certificate" in notes, notes)
    case("no_limits: doesn't reveal which grades the library holds", "can't be checked automatically yet" in " ".join(guest_view(NO_LIMITS)["notes"]))
    case("mismatch: names the required grade", "requires S355J2" in " ".join(guest_view(MISMATCH)["notes"]))
    case("drawing: number and revision only, no file ref", guest_view(LOT2)["drawing"] == {"drawing_no": "SRC-BF-2041", "rev": "C", "grade": "S355J2"})
    return cases


def main():
    sup = supplier_eval()
    passed = sum(c["ok"] for c in sup)
    out = {"supplier": {"passed": passed, "total": len(sup), "cases": sup}}
    (HERE / "results_phase5.json").write_text(json.dumps(out, indent=2, ensure_ascii=False))
    lines = ["# Phase 5 evaluation", "", f"## Supplier view of Spec Check (S0): {passed}/{len(sup)}", "", "| Case | Result | Detail |", "|---|---|---|"]
    lines += [f"| {c['case']} | {'✅' if c['ok'] else '❌'} | {c['detail'][:120].replace('|', '/')} |" for c in sup]
    (HERE / "results_phase5.md").write_text("\n".join(lines) + "\n")
    print(f"supplier view: {passed}/{len(sup)}")
    for c in sup:
        if not c["ok"]:
            print("  FAIL", c["case"], c["detail"])
    return 0 if passed == len(sup) else 1


if __name__ == "__main__":
    raise SystemExit(main())
