"""Ask your plant data (Phase 3b). Plant records and promises are mirrored to BigQuery; questions like "NCRs by vendor this
quarter" become a query and a chart.

Safety: the model never writes SQL. Gemini fills a small query spec (metric, grouping, filters) from fixed choices; the
server builds a parameterised query that always filters to the caller's workspace and, unless they are an admin or on
the quality team, to the records and chats they are part of."""
import logging
import re
import threading
import time
from datetime import datetime
from typing import Literal

from google.cloud import bigquery
from google.cloud.firestore_v1.base_query import FieldFilter
from pydantic import BaseModel

from . import ai
from .config import PROJECT, TZ
from .firebase import db, user_profile

log = logging.getLogger("saathi.plantdata")
DATASET = f"{PROJECT}.saathi"
RECORDS_TABLE = f"{DATASET}.plant_records"
PROMISES_TABLE = f"{DATASET}.plant_promises"

RECORDS_SCHEMA = [
    bigquery.SchemaField(n, t, mode=m) for n, t, m in [
        ("org_id", "STRING", "REQUIRED"), ("id", "STRING", "REQUIRED"), ("number", "STRING", "NULLABLE"), ("type", "STRING", "NULLABLE"),
        ("status", "STRING", "NULLABLE"), ("severity", "STRING", "NULLABLE"), ("title", "STRING", "NULLABLE"), ("part_name", "STRING", "NULLABLE"),
        ("drawing_no", "STRING", "NULLABLE"), ("vendor", "STRING", "NULLABLE"), ("machine", "STRING", "NULLABLE"), ("defect_type", "STRING", "NULLABLE"),
        ("downtime_reason", "STRING", "NULLABLE"), ("created_at", "TIMESTAMP", "NULLABLE"), ("closed_at", "TIMESTAMP", "NULLABLE"),
        ("days_to_close", "FLOAT", "NULLABLE"), ("downtime_hours", "FLOAT", "NULLABLE"), ("capture_seconds", "FLOAT", "NULLABLE"),
        ("owner_name", "STRING", "NULLABLE"), ("participants", "STRING", "REPEATED")]
]
PROMISES_SCHEMA = [
    bigquery.SchemaField(n, t, mode=m) for n, t, m in [
        ("org_id", "STRING", "REQUIRED"), ("ref", "STRING", "REQUIRED"), ("committer", "STRING", "NULLABLE"), ("action", "STRING", "NULLABLE"),
        ("made_at", "TIMESTAMP", "NULLABLE"), ("due_at", "TIMESTAMP", "NULLABLE"), ("done_at", "TIMESTAMP", "NULLABLE"), ("state", "STRING", "NULLABLE"),
        ("slip_days", "FLOAT", "NULLABLE"), ("members", "STRING", "REPEATED")]
]

_client: bigquery.Client | None = None
_lock = threading.Lock()
_last = 0.0


def client() -> bigquery.Client:
    global _client
    if _client is None:
        _client = bigquery.Client(project=PROJECT, location="asia-south1")
    return _client


def _ts(v):
    return v.isoformat() if isinstance(v, datetime) else None


def _days(a, b):
    return round((b - a).total_seconds() / 86400, 2) if isinstance(a, datetime) and isinstance(b, datetime) else None


def record_rows() -> list[dict]:
    rows = []
    for s in db.collection("records").stream():
        r = s.to_dict()
        f = r.get("fields") or {}
        closed = r.get("closed_at") or next((h["ts"] for h in reversed(r.get("history") or []) if h.get("status") == "closed"), None)
        closed = closed if r.get("status") == "closed" else None
        rows.append({
            "org_id": r.get("org_id", ""), "id": s.id, "number": r.get("number"), "type": r.get("type"), "status": r.get("status"),
            "severity": f.get("severity"), "title": f.get("title"), "part_name": f.get("part_name"), "drawing_no": f.get("drawing_no"),
            "vendor": f.get("vendor"), "machine": f.get("machine"), "defect_type": f.get("defect_type"), "downtime_reason": f.get("downtime_reason"),
            "created_at": _ts(r.get("created_at")), "closed_at": _ts(closed), "days_to_close": _days(r.get("created_at"), closed),
            "downtime_hours": round(_days(r.get("created_at"), closed) * 24, 2) if r.get("type") == "downtime" and closed else None,
            "capture_seconds": r.get("capture_seconds"), "owner_name": user_profile(r["owner"])["name"] if r.get("owner") else None,
            "participants": r.get("participants") or [],
        })
    return rows


def promise_rows() -> list[dict]:
    now = datetime.now(TZ)
    outcome = {}
    for s in db.collection("tasks").where(filter=FieldFilter("kind", "==", "promise")).stream():
        t = s.to_dict()
        if t.get("source_ref"):
            prev = outcome.get(t["source_ref"])
            if not prev or t.get("status") == "done":
                outcome[t["source_ref"]] = t
    rows = []
    for c in db.collection("chats").stream():
        chat = c.to_dict()
        if not chat.get("org_id") or chat.get("ai_excluded"):
            continue
        for m in c.reference.collection("messages").where(filter=FieldFilter("promise.confidence", ">", 0)).stream():
            p = m.get("promise")
            ref = f"msg:{c.id}/{m.id}"
            t = outcome.get(ref) or {}
            due = p.get("due_at")
            done = t.get("done_at") if t.get("status") == "done" else None
            if done:
                slip = _days(due, done) if due else None
                state = "kept" if slip is None or slip <= 0.5 else "late"
            elif due and due < now:
                slip, state = _days(due, now), "overdue"
            else:
                slip, state = None, "open"
            rows.append({"org_id": chat["org_id"], "ref": ref, "committer": p.get("committer"), "action": p.get("action"),
                         "made_at": _ts(m.get("ts")), "due_at": _ts(due), "done_at": _ts(done), "state": state,
                         "slip_days": max(slip, 0) if slip is not None else None, "members": chat.get("members") or []})
    return rows


def refresh(force: bool = False) -> None:
    """Rebuilds both tables (small at plant scale). Debounced so bursts of edits cost one load job."""
    global _last
    if not force and time.monotonic() - _last < 20:
        return
    if not _lock.acquire(blocking=False):
        return
    try:
        _last = time.monotonic()
        for table, schema, rows in ((RECORDS_TABLE, RECORDS_SCHEMA, record_rows()), (PROMISES_TABLE, PROMISES_SCHEMA, promise_rows())):
            cfg = bigquery.LoadJobConfig(schema=schema, write_disposition="WRITE_TRUNCATE", source_format="NEWLINE_DELIMITED_JSON")
            client().load_table_from_json(rows, table, job_config=cfg).result(timeout=120)
    except Exception:
        log.exception("plant data refresh failed")
    finally:
        _lock.release()


# ---------------- questions → spec → SQL ----------------

class PlantQuery(BaseModel):
    dataset: Literal["records", "promises"]
    metric: Literal["count", "downtime_hours", "avg_days_to_close", "open_count", "on_time_rate", "avg_slip_days"]
    group_by: Literal["none", "vendor", "drawing_no", "part_name", "machine", "defect_type", "downtime_reason", "type", "status", "severity",
                      "owner_name", "month", "week", "committer", "state"]
    record_type: Literal["any", "ncr", "downtime", "safety"]
    status: Literal["any", "open", "closed"]
    filter_field: Literal["none", "vendor", "drawing_no", "part_name", "machine", "defect_type", "committer"]
    filter_value: str | None
    since_days: int
    limit: int
    title: str


SPEC_PROMPT = """Turn a question about plant data into a query spec. Today is {today}.
Tables:
- records: plant records (type ncr = quality non-conformance, downtime = machine breakdown, safety = near miss) with vendor, drawing_no,
  part_name, machine, defect_type, downtime_reason, severity, status, owner_name, created_at, days_to_close, downtime_hours.
- promises: commitments people and vendors made in chat (committer, action, due date, state kept/late/overdue/open, slip_days).
Metrics: count (records or promises), open_count (not closed / not kept), downtime_hours (records, downtime only), avg_days_to_close
(records), on_time_rate (promises: kept on time / finished), avg_slip_days (promises).
group_by "month"/"week" = trend over time. since_days: 7 week, 30 month, 90 quarter, 365 year, 0 all time. limit 3-15.
filter_field/filter_value: a single equality filter when the question names one vendor, drawing, part, machine, defect or person.
title: short chart title.
Question: {question}"""

GROUP_SQL = {"month": "FORMAT_TIMESTAMP('%Y-%m', {t}, 'Asia/Kolkata')", "week": "FORMAT_TIMESTAMP('%Y-W%V', {t}, 'Asia/Kolkata')"}


def build(spec: PlantQuery, user: dict, privileged: bool) -> tuple[str, list]:
    recs = spec.dataset == "records"
    table, tcol, who = (RECORDS_TABLE, "created_at", "participants") if recs else (PROMISES_TABLE, "made_at", "members")
    metric = spec.metric
    if recs and metric in ("on_time_rate", "avg_slip_days"):
        metric = "count"
    if not recs and metric in ("downtime_hours", "avg_days_to_close"):
        metric = "count"
    value = {
        "count": "COUNT(*)",
        "open_count": "COUNTIF(status != 'closed')" if recs else "COUNTIF(state IN ('open', 'overdue'))",
        "downtime_hours": "ROUND(SUM(IFNULL(downtime_hours, 0)), 1)",
        "avg_days_to_close": "ROUND(AVG(days_to_close), 1)",
        "on_time_rate": "ROUND(SAFE_DIVIDE(COUNTIF(state = 'kept'), COUNTIF(state IN ('kept', 'late'))) * 100, 0)",
        "avg_slip_days": "ROUND(AVG(IF(state IN ('late', 'overdue'), slip_days, NULL)), 1)",
    }[metric]
    valid_groups = ({"vendor", "drawing_no", "part_name", "machine", "defect_type", "downtime_reason", "type", "status", "severity", "owner_name"}
                    if recs else {"committer", "state"}) | {"none", "month", "week"}
    group = spec.group_by if spec.group_by in valid_groups else "none"
    label = GROUP_SQL[group].format(t=tcol) if group in GROUP_SQL else ("'All'" if group == "none" else f"IFNULL({group}, '(not recorded)')")
    where, params = ["org_id = @org"], [bigquery.ScalarQueryParameter("org", "STRING", user["org_id"])]
    if not (privileged and recs):
        where.append(f"@uid IN UNNEST({who})")
        params.append(bigquery.ScalarQueryParameter("uid", "STRING", user["uid"]))
    if recs and spec.record_type != "any":
        where.append("type = @rtype")
        params.append(bigquery.ScalarQueryParameter("rtype", "STRING", spec.record_type))
    if metric == "downtime_hours":
        where.append("type = 'downtime'")
    if recs and spec.status != "any":
        where.append("status = 'closed'" if spec.status == "closed" else "status != 'closed'")
    ffields = {"vendor", "drawing_no", "part_name", "machine", "defect_type"} if recs else {"committer"}
    if spec.filter_field in ffields and (spec.filter_value or "").strip():
        # word by word and singular, so "side frame castings" still matches "Side frame casting"
        words = [w[:-1] if len(w) > 3 and w.endswith("s") else w for w in re.findall(r"[a-z0-9-]+", spec.filter_value.lower())][:4]
        for i, w in enumerate(words):
            where.append(f"LOWER({spec.filter_field}) LIKE @f{i}")
            params.append(bigquery.ScalarQueryParameter(f"f{i}", "STRING", f"%{w}%"))
    if spec.since_days > 0:
        where.append(f"{tcol} >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL @days DAY)")
        params.append(bigquery.ScalarQueryParameter("days", "INT64", min(int(spec.since_days), 3650)))
    order = "label" if group in GROUP_SQL else "value DESC"
    limit = max(1, min(int(spec.limit or 10), 20))
    sql = (f"SELECT {label} AS label, {value} AS value, COUNT(*) AS n\nFROM `{table}`\nWHERE " + "\n  AND ".join(where)
           + f"\nGROUP BY label\nORDER BY {order}\nLIMIT {limit}")
    return sql, params


def is_privileged(user: dict) -> bool:
    if user.get("org_role") in ("owner", "admin"):
        return True
    org = db.collection("orgs").document(user["org_id"]).get().to_dict() or {}
    return user["uid"] in ((org.get("settings") or {}).get("quality_team") or [])


def ask(user: dict, question: str) -> dict:
    if user.get("org_role") == "guest":
        return {"error": "Plant data isn't available to guests."}
    spec = ai.generate_json(SPEC_PROMPT.format(today=datetime.now(TZ).strftime("%d %B %Y"), question=question[:500]), PlantQuery)
    privileged = is_privileged(user)
    sql, params = build(spec, user, privileged)
    try:
        rows = [dict(r) for r in client().query(sql, job_config=bigquery.QueryJobConfig(query_parameters=params, maximum_bytes_billed=10**9)).result(timeout=30)]
    except Exception:
        log.exception("plant data query failed")
        return {"error": "The plant data query failed. Try asking differently."}
    unit = {"count": "", "open_count": "", "downtime_hours": " h", "avg_days_to_close": " days", "on_time_rate": "%", "avg_slip_days": " days"}[spec.metric]
    chart = {"title": spec.title[:80], "unit": unit.strip(), "metric": spec.metric,
             "rows": [{"label": str(r["label"]), "value": float(r["value"]) if r["value"] is not None else None, "n": int(r["n"])} for r in rows],
             "scope": "whole workspace" if (privileged and spec.dataset == "records") else "records and chats you're part of", "source": "BigQuery"}
    return {"chart": chart, "sql": sql, "note": "The chart is shown to the user automatically under your answer. Summarise the key numbers in 2-4 bullets; "
            "say what scope the numbers cover; don't invent causes. If rows are empty, say there is no matching data yet."}
