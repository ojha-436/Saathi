"""Phase 4 evaluation: Spec Check (comparator + certificate extraction) and Saathi Research (gap recall, citations, leaks).

uv run python -m eval.phase4_eval            # everything (research takes a few minutes)
uv run python -m eval.phase4_eval --quick    # Spec Check only
Writes eval/results_phase4.json and eval/results_phase4.md.
"""
import asyncio
import json
import sys
import time
import uuid
from datetime import datetime
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from google.genai import types  # noqa: E402

from app import ai, research  # noqa: E402
from app.config import FAST_MODEL, TZ, VISION_MODEL  # noqa: E402
from app.firebase import db, user_profile  # noqa: E402
from app.specs import MTC_PROMPT, MtcOut, compare, norm_prop  # noqa: E402

HERE = Path(__file__).parent
SEED = HERE.parent / "seed" / "files"


def L(prop, mn, mx, tmin=None, tmax=None, temp=None):
    return {"property": prop, "min": mn, "max": mx, "thickness_min_mm": tmin, "thickness_max_mm": tmax, "test_temp_c": temp, "unit": "%",
            "standard_id": "std", "standard": "SRC-SPEC-MAT-01", "clause": "2.1", "page": 1}


LIMITS = [L("C", None, 0.20, None, 30), L("C", None, 0.22, 30, 100), L("Si", None, 0.55), L("Mn", None, 1.60), L("P", None, 0.025),
          L("S", None, 0.025), L("Cu", None, 0.55), L("CEV", None, 0.45, None, 30), L("CEV", None, 0.47, 30, 100),
          L("yield_strength", 355, None, None, 16), L("yield_strength", 345, None, 16, 40), L("yield_strength", 335, None, 40, 63),
          L("tensile_strength", 470, 630), L("elongation", 22, None, None, 40), L("elongation", 21, None, 40, 63), L("impact_energy", 27, None, temp=-20)]
GOOD = {"C": 0.18, "Si": 0.41, "Mn": 1.42, "P": 0.018, "S": 0.012, "CEV": 0.44, "yield_strength": 372, "tensile_strength": 528, "elongation": 25,
        "impact_energy": (41, -20)}


def vals(over: dict | None = None, drop: tuple = (), unit: dict | None = None):
    d = {**GOOD, **(over or {})}
    out = []
    for k, v in d.items():
        if k in drop:
            continue
        value, temp = (v if isinstance(v, tuple) else (v, None))
        out.append({"property": k, "value": value, "unit": (unit or {}).get(k, "MPa" if "strength" in k else "%"), "test_temp_c": temp})
    return out


SPEC_CASES = [
    ("all good, thickness unknown", vals(), None, "pass"),
    ("all good, 20 mm", vals({"yield_strength": 350}), 20, "pass"),
    ("C over strict band, unknown thickness", vals({"C": 0.21}), None, "fail"),
    ("C 0.21 allowed at 32 mm", vals({"C": 0.21, "CEV": 0.46}), 32, "pass"),
    ("C 0.23 over thick band", vals({"C": 0.23}), 32, "fail"),
    ("CEV 0.46 at 20 mm", vals({"CEV": 0.46}), 20, "fail"),
    ("P over max", vals({"P": 0.031}), 20, "fail"),
    ("S exactly at max", vals({"S": 0.025}), 20, "pass"),
    ("yield below 355 at 10 mm", vals({"yield_strength": 350}), 10, "fail"),
    ("yield 340 at 45 mm (min 335)", vals({"yield_strength": 340}), 45, "pass"),
    ("tensile above range", vals({"tensile_strength": 640}), 20, "fail"),
    ("tensile below range", vals({"tensile_strength": 460}), 20, "fail"),
    ("elongation 21 at 50 mm", vals({"elongation": 21}), 50, "pass"),
    ("elongation 21 at 20 mm", vals({"elongation": 21}), 20, "fail"),
    ("impact at 0 °C for J2", vals({"impact_energy": (45, 0)}), 20, "incomplete"),
    ("impact 25 J at -20 °C", vals({"impact_energy": (25, -20)}), 20, "fail"),
    ("impact at -30 °C (colder) passes", vals({"impact_energy": (30, -30)}), 20, "pass"),
    ("impact missing", vals(drop=("impact_energy",)), 20, "incomplete"),
    ("residual Cu missing only", vals(), 20, "pass"),
    ("yield in ksi (52 ksi = 358.5 MPa)", vals({"yield_strength": 52}, unit={"yield_strength": "ksi"}), 10, "pass"),
]

CERT_TRUTH = {
    "MTC_H-77812_Ladle_Analysis.pdf": {"heat_no": "H-77812", "C": 0.18, "CEV": 0.44, "yield_strength": 372, "tensile_strength": 528, "elongation": 25,
                                       "impact_energy": 41},
    "MTC_H-78120_SideFrame_Lot2.pdf": {"heat_no": "H-78120", "C": 0.23, "CEV": 0.49, "yield_strength": 361, "tensile_strength": 541, "elongation": 23,
                                       "impact_energy": 31, "thickness_mm": 32},
}


def spec_eval() -> dict:
    out = {"cases": [], "extraction": []}
    for name, v, t, want in SPEC_CASES:
        got, rows, _ = compare(v, LIMITS, t)
        out["cases"].append({"case": name, "want": want, "got": got, "pass": got == want})
    for fname, truth in CERT_TRUTH.items():
        data = (SEED / fname).read_bytes()
        t0 = time.monotonic()
        m = ai.generate_json(MTC_PROMPT, MtcOut, model=VISION_MODEL, parts=[types.Part.from_bytes(data=data, mime_type="application/pdf")])
        got = {norm_prop(x.property) or x.property: x.value for x in m.values}
        fields = [k for k in truth if k not in ("heat_no", "thickness_mm")]
        correct = sum(1 for k in fields if got.get(k) is not None and abs(float(got[k]) - truth[k]) < 1e-6)
        ok_meta = m.heat_no == truth["heat_no"] and (truth.get("thickness_mm") is None or m.thickness_mm == truth["thickness_mm"])
        out["extraction"].append({"file": fname, "fields_correct": f"{correct}/{len(fields)}", "meta_ok": ok_meta,
                                  "seconds": round(time.monotonic() - t0, 1), "pass": correct == len(fields) and ok_meta})
    return out


RESEARCH_GOALS = [
    {"goal": "Are we ready for the RDSO inspection of the BG coach bogie prototype on 20 Oct?", "template": "readiness",
     "context": {"due_date": "2026-10-20T10:00:00+05:30", "product": "BG coach bogie prototype"},
     "gold": [("UT / weld W7", ["w7", "ultrasonic"]), ("NCR-0007 castings on hold", ["0007"]), ("SRC-AB-1107 not in register", ["1107"]),
              ("first article after the visit", ["first article", "30 oct"]), ("Om Castings audit / sand moisture", ["sand moisture", "audit"])]},
    {"goal": "Compare Om Castings and Bharat Foundry for bogie side frame castings", "template": "vendor", "context": {},
     "gold": [("Om Castings porosity NCRs", ["porosity"]), ("on-time rate / late promises", ["on-time", "late", "slip", "%"]),
              ("price or lead time", ["lead time", "rs", "price", "₹", "cost"]), ("decision to switch to Bharat", ["bharat"])]},
]
FORBIDDEN_REFS = ["dm_amit_neha", "file:file008"]


async def research_eval() -> list[dict]:
    rows = []
    user = user_profile("prince")
    for g in RESEARCH_GOALS:
        run_id = "eval_" + uuid.uuid4().hex[:10]
        ref = db.collection("research_runs").document(run_id)
        ref.set({"uid": user["uid"], "org_id": user["org_id"], "user_name": user["name"], "goal": g["goal"], "template": g["template"], "context": g["context"],
                 "status": "planning", "auto_run": False, "created_at": datetime.now(TZ), "eval": True})
        t0 = time.monotonic()
        await research.plan_job(run_id)
        ref.update({"status": "queued"})
        await research.execute(run_id)
        run = ref.get().to_dict()
        rep = run.get("report") or {}
        blob = json.dumps(rep, ensure_ascii=False).lower()
        hits = [name for name, kws in g["gold"] if any(k in blob for k in kws)]
        refs = {r for k in ("checklist", "findings", "gaps") for x in rep.get(k, []) for r in x.get("refs", [])}
        claims = rep.get("checklist", []) + rep.get("findings", [])
        cited = sum(1 for c in claims if c.get("refs") or c.get("status") == "gap")
        leaks = [r for r in refs if any(f in r for f in FORBIDDEN_REFS)]
        rows.append({"goal": g["goal"], "status": run["status"], "seconds": round(time.monotonic() - t0), "gold_recall": f"{len(hits)}/{len(g['gold'])}",
                     "missed": [n for n, _ in g["gold"] if n not in hits], "claims_cited": f"{cited}/{len(claims)}", "sources": len(refs),
                     "gaps": len(rep.get("gaps", [])), "leaks": leaks, "metrics": run.get("metrics")})
        for e in ref.collection("events").stream():
            e.reference.delete()
        ref.delete()  # keep the demo workspace clean
    return rows


def main():
    quick = "--quick" in sys.argv
    out = {"ran_at": datetime.now(TZ).isoformat(), "spec": spec_eval()}
    if not quick:
        out["research"] = asyncio.run(research_eval())
    cases = out["spec"]["cases"]
    ext = out["spec"]["extraction"]
    summary = {"spec_comparator": f"{sum(c['pass'] for c in cases)}/{len(cases)}",
               "certificate_extraction": f"{sum(e['pass'] for e in ext)}/{len(ext)}"}
    if not quick:
        r = out["research"]
        summary |= {"research_gold_recall": ", ".join(x["gold_recall"] for x in r), "research_claims_cited": ", ".join(x["claims_cited"] for x in r),
                    "research_leaks": sum(len(x["leaks"]) for x in r), "research_seconds": ", ".join(str(x["seconds"]) for x in r)}
    out["summary"] = summary
    (HERE / "results_phase4.json").write_text(json.dumps(out, indent=2, ensure_ascii=False, default=str))
    lines = [f"# Saathi Phase 4 evaluation — {out['ran_at'][:16]}", "", "| Metric | Result | Target |", "| --- | --- | --- |",
             f"| Spec Check comparator (deterministic cases) | {summary['spec_comparator']} | 100% |",
             f"| Certificate value extraction (real PDFs) | {summary['certificate_extraction']} | 100% |"]
    if not quick:
        lines += [f"| Research gold-gap recall (readiness, vendor) | {summary['research_gold_recall']} | ≥ 80% |",
                  f"| Research claims with a verified source | {summary['research_claims_cited']} | 100% |",
                  f"| Research permission leaks | {summary['research_leaks']} | 0 |",
                  f"| Research end-to-end seconds | {summary['research_seconds']} | ≤ 240 |"]
    (HERE / "results_phase4.md").write_text("\n".join(lines) + "\n")
    print(json.dumps(summary, indent=1, ensure_ascii=False))
    for c in cases:
        if not c["pass"]:
            print("SPEC FAIL:", c)


if __name__ == "__main__":
    main()
