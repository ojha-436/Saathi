"""Impact panel (Phase 3b). Measured workspace numbers for admins: how much work Saathi captured, answered and prevented.
Everything here is counted from real data; the time-saved estimate is the only derived figure, and its assumptions are
returned alongside it so the UI shows them."""
from datetime import datetime, timedelta
from statistics import median

from fastapi import APIRouter, Depends
from google.cloud.firestore_v1.base_query import FieldFilter

from .admin import admin_user
from .config import TZ
from .firebase import db

router = APIRouter(prefix="/api/admin")

# Stated assumptions (minutes) behind the time-saved estimate. Shown in the UI next to the number.
ASSUME = {
    "paper_record_min": 15,   # filling and filing a paper NCR / downtime form
    "search_min": 6,          # finding a fact in chats, files and email by hand
    "catchup_min": 10,        # reading back through channels after time away
    "brief_min": 30,          # assembling the evidence for a decision by hand
}


def _org_q(col: str, org: str):
    return db.collection(col).where(filter=FieldFilter("org_id", "==", org))


@router.get("/impact")
def impact(days: int = 30, admin=Depends(admin_user)):
    org = admin["org_id"]
    days = max(7, min(int(days), 365))
    since = datetime.now(TZ) - timedelta(days=days)

    recs = [s.to_dict() for s in _org_q("records", org).stream()]
    recent = [r for r in recs if r.get("created_at") and r["created_at"] >= since and not r.get("demo_history")]
    capture = [r["capture_seconds"] for r in recent if r.get("capture_seconds")]
    closed = [r for r in recs if r.get("status") == "closed" and r.get("type") == "ncr" and r.get("closed_at") and r.get("created_at")]
    close_days = [(r["closed_at"] - r["created_at"]).total_seconds() / 86400 for r in closed]

    asks = [s.to_dict() for s in _org_q("audit_log", org).where(filter=FieldFilter("kind", "==", "assistant")).stream()]
    asks = [a for a in asks if a.get("ts") and a["ts"] >= since]
    tools = [t for a in asks for t in (a.get("tools") or [])]
    cited = [a for a in asks if a.get("cited")]
    measured = [a for a in asks if "cited" in a]  # citation counts are logged from Phase 3b on
    lat = [a["latency_ms"] for a in asks if a.get("latency_ms")]

    decisions = [s.to_dict() for s in _org_q("decisions", org).stream()]
    dec_recent = [d for d in decisions if d.get("decided_at") and d["decided_at"] >= since]
    tasks = [s.to_dict() for s in _org_q("tasks", org).stream()]
    promises_tracked = [t for t in tasks if t.get("kind") == "promise" and t.get("created_at") and t["created_at"] >= since]

    scans = [s.to_dict() for s in _org_q("qr_scans", org).stream() if s.get("ts") and s.get("ts") >= since]
    drawings = [s.to_dict() for s in _org_q("drawings", org).stream()]
    superseded_revs = sum(1 for d in drawings for r in d.get("revisions", []) if r.get("status") == "superseded")

    n = {
        "records": len(recent),
        "cited_answers": len(cited),
        "catch_ups": tools.count("catch_up"),
        "briefs": sum(1 for a in asks if {"find_decisions", "promise_record"} <= set(a.get("tools") or []) or "decision brief" in (a.get("query") or "").lower()),
    }
    capture_med = median(capture) if capture else None
    saved_min = (n["records"] * max(ASSUME["paper_record_min"] - (capture_med or 60) / 60, 0) + n["cited_answers"] * ASSUME["search_min"]
                 + n["catch_ups"] * ASSUME["catchup_min"] + n["briefs"] * ASSUME["brief_min"])

    return {
        "window_days": days,
        "capture": {"records_filed": len(recent), "median_capture_seconds": round(capture_med) if capture_med else None,
                    "by_type": {t: sum(1 for r in recent if r.get("type") == t) for t in ("ncr", "downtime", "safety")},
                    "ncr_median_days_to_close": round(median(close_days), 1) if close_days else None, "ncrs_closed_total": len(closed),
                    "includes_imported_history": sum(1 for r in closed if r.get("demo_history"))},
        "knowledge": {"questions": len(asks), "answered_with_citations": len(cited),
                      "citation_rate": round(len(cited) / len(measured), 2) if measured else None,
                      "median_latency_s": round(median(lat) / 1000, 1) if lat else None,
                      "lessons_lookups": tools.count("similar_incidents"), "decision_lookups": tools.count("find_decisions"),
                      "data_questions": tools.count("plant_data")},
        "decisions": {"captured_total": len(decisions), "captured_in_window": len(dec_recent),
                      "with_rationale": sum(1 for d in decisions if d.get("rationale")),
                      "superseded": sum(1 for d in decisions if d.get("status") == "superseded")},
        "work": {"promises_tracked": len(promises_tracked),
                 "tasks_done": sum(1 for t in tasks if t.get("status") == "done" and t.get("done_at") and t["done_at"] >= since)},
        "drawing_control": {"qr_scans": len(scans), "blocked_scans": sum(1 for s in scans if s.get("verdict") == "superseded"),
                            "superseded_revisions_guarded": superseded_revs, "drawings_in_register": len(drawings)},
        "time_saved": {"hours": round(saved_min / 60, 1), "assumptions_min": ASSUME, "counts": n},
    }
