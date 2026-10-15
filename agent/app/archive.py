"""Archive index on BigQuery: every search chunk across the full history, for Saathi Research's deep recall.

Interactive answers use the Firestore vector index (milliseconds). Research can afford a second or two per query in exchange for
recall over everything ever indexed, so every chunk is also streamed into `saathi_archive.chunks` and searched with BigQuery
VECTOR_SEARCH. Permissions are applied at query time from the caller's CURRENT chats (a query parameter), so membership changes,
chats hidden from AI and deleted channels take effect immediately even if old rows are still in the table.
"""
import logging
import threading
import time
from datetime import datetime, timedelta

from google.adk.tools import ToolContext
from google.cloud import bigquery

from . import ai
from .config import PROJECT, TZ

log = logging.getLogger("saathi.archive")

DATASET = f"{PROJECT}.saathi_archive"
TABLE = f"{DATASET}.chunks"
LOCATION = "asia-south1"
PERSONAL = ("meeting", "email", "drive", "record", "knowledge")  # filtered by the row's members, like search.py
SCHEMA = [
    bigquery.SchemaField("chunk_id", "STRING", mode="REQUIRED"),
    bigquery.SchemaField("org_id", "STRING"),
    bigquery.SchemaField("chat_id", "STRING"),
    bigquery.SchemaField("ref", "STRING"),
    bigquery.SchemaField("source_type", "STRING"),
    bigquery.SchemaField("chat_name", "STRING"),
    bigquery.SchemaField("sender_name", "STRING"),
    bigquery.SchemaField("file_name", "STRING"),
    bigquery.SchemaField("text", "STRING"),
    bigquery.SchemaField("ts", "TIMESTAMP"),
    bigquery.SchemaField("members", "STRING", mode="REPEATED"),
    bigquery.SchemaField("embedding", "FLOAT64", mode="REPEATED"),
    bigquery.SchemaField("ingested_at", "TIMESTAMP", mode="REQUIRED"),
]

_client: bigquery.Client | None = None
_buf: list[dict] = []
_lock = threading.Lock()
_flusher: threading.Thread | None = None


def client() -> bigquery.Client:
    global _client
    if _client is None:
        _client = bigquery.Client(project=PROJECT, location=LOCATION)
    return _client


def ensure_table() -> None:
    c = client()
    c.create_dataset(_dataset(), exists_ok=True)
    t = bigquery.Table(TABLE, schema=SCHEMA)
    t.time_partitioning = bigquery.TimePartitioning(field="ingested_at")
    t.clustering_fields = ["org_id", "chat_id", "source_type"]
    c.create_table(t, exists_ok=True)
    try:  # trains once the table has enough rows; until then VECTOR_SEARCH scans (fine at small scale)
        c.query(f"""CREATE VECTOR INDEX IF NOT EXISTS chunks_embedding_idx ON `{TABLE}`(embedding)
                    STORING(org_id, chat_id, source_type, ts, members)
                    OPTIONS(index_type = 'IVF', distance_type = 'COSINE')""").result()
    except Exception as e:
        log.info("vector index not created yet: %s", str(e)[:160])


def _dataset() -> bigquery.Dataset:
    d = bigquery.Dataset(DATASET)
    d.location = LOCATION
    d.description = "Saathi archive index: every search chunk, for deep research (VECTOR_SEARCH with query-time permissions)"
    return d


def _vec(v) -> list[float]:
    v = getattr(v, "value", v)
    return [float(x) for x in (list(v) if v is not None else [])]


def row(chunk_id: str, data: dict, org_id: str) -> dict:
    ts = data.get("ts")
    return {"chunk_id": chunk_id, "org_id": org_id, "chat_id": data.get("chat_id"), "ref": data.get("ref"), "source_type": data.get("source_type"),
            "chat_name": data.get("chat_name"), "sender_name": data.get("sender_name"), "file_name": data.get("file_name"),
            "text": (data.get("text") or "")[:4000], "ts": ts.isoformat() if hasattr(ts, "isoformat") else None,
            "members": list(data.get("members") or []), "embedding": _vec(data.get("embedding")), "ingested_at": datetime.now(TZ).isoformat()}


def mirror(chunk_id: str, data: dict, org_id: str) -> None:
    """Called next to every Firestore chunk write. Buffered and streamed in small batches; never blocks ingestion."""
    global _flusher
    from .config import LOCAL_MODE

    if LOCAL_MODE or not org_id or not data.get("embedding"):  # offline mode has no BigQuery
        return
    with _lock:
        _buf[:] = [b for b in _buf if b.get("chunk_id") != chunk_id]
        _buf.append(row(chunk_id, data, org_id))
        if _flusher is None or not _flusher.is_alive():
            _flusher = threading.Thread(target=_flush_loop, daemon=True, name="archive-flush")
            _flusher.start()


def delete_chunks(*, chunk_ids: list[str] | None = None, chat_id: str | None = None, ref: str | None = None) -> None:
    """Purges deleted/excluded chunks from the BigQuery archive table and pending buffer."""
    from .config import LOCAL_MODE

    if LOCAL_MODE:
        return
    ids_set = set(chunk_ids or [])
    with _lock:
        _buf[:] = [
            b for b in _buf
            if not (
                (ids_set and b.get("chunk_id") in ids_set)
                or (chat_id and b.get("chat_id") == chat_id)
                or (ref and b.get("ref") == ref)
            )
        ]

    def _run():
        try:
            where, params = [], []
            if ids_set:
                where.append("chunk_id IN UNNEST(@ids)")
                params.append(bigquery.ArrayQueryParameter("ids", "STRING", list(ids_set)))
            if chat_id:
                where.append("chat_id = @cid")
                params.append(bigquery.ScalarQueryParameter("cid", "STRING", chat_id))
            if ref:
                where.append("ref = @ref")
                params.append(bigquery.ScalarQueryParameter("ref", "STRING", ref))
            if where:
                client().query(f"DELETE FROM `{TABLE}` WHERE " + " OR ".join(where),
                               job_config=bigquery.QueryJobConfig(query_parameters=params)).result(timeout=30)
        except Exception:
            log.debug("archive delete skipped (rows may still be in streaming buffer)")

    threading.Thread(target=_run, daemon=True).start()


def _flush_loop() -> None:
    idle = 0
    while idle < 30:  # the thread exits after ~60 s without work and restarts on the next write
        time.sleep(2)
        with _lock:
            batch, _buf[:] = list(_buf), []
        if not batch:
            idle += 1
            continue
        idle = 0
        for attempt in range(3):
            try:
                errors = client().insert_rows_json(TABLE, batch)
                if errors:
                    log.warning("archive insert errors: %s", str(errors)[:300])
                break
            except Exception:
                if attempt == 2:
                    log.exception("archive insert failed; %d rows dropped (Firestore stays the source of truth)", len(batch))
                time.sleep(2 * (attempt + 1))


def search(user: dict, query: str, since_days: int = 0, k: int = 10) -> list[dict]:
    from .search import _result, user_chats

    chats = [c for c, d in user_chats(user["uid"]).items() if not d.get("ai_excluded")]
    qv = ai.embed([query[:2000]], task="RETRIEVAL_QUERY")[0]
    since = f"AND ts >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL {int(since_days)} DAY)" if since_days and since_days > 0 else ""
    sql = f"""
      SELECT base.chunk_id, base.ref, base.source_type, base.chat_name, base.sender_name, base.file_name, base.text, base.ts, distance
      FROM VECTOR_SEARCH(
        (SELECT * FROM `{TABLE}`
         WHERE org_id = @org {since}
           AND ((source_type IN UNNEST(@personal) OR STARTS_WITH(chat_id, 'meeting_')) AND @uid IN UNNEST(members)
                OR (source_type NOT IN UNNEST(@personal) AND NOT STARTS_WITH(chat_id, 'meeting_') AND chat_id IN UNNEST(@chats)))),
        'embedding', (SELECT @qv AS embedding), top_k => {max(k * 3, 20)}, distance_type => 'COSINE')
      ORDER BY distance"""
    cfg = bigquery.QueryJobConfig(query_parameters=[
        bigquery.ScalarQueryParameter("org", "STRING", user["org_id"]),
        bigquery.ScalarQueryParameter("uid", "STRING", user["uid"]),
        bigquery.ArrayQueryParameter("chats", "STRING", chats or ["-"]),
        bigquery.ArrayQueryParameter("personal", "STRING", list(PERSONAL)),
        bigquery.ArrayQueryParameter("qv", "FLOAT64", qv),
    ], maximum_bytes_billed=5 * 10**9)
    rows = client().query(sql, job_config=cfg).result(timeout=30)
    best: dict[str, tuple[float, dict]] = {}
    for r in rows:
        d = dict(r)
        score = 1.0 - float(d["distance"])
        if d["ref"] and (d["ref"] not in best or score > best[d["ref"]][0]):
            best[d["ref"]] = (score, d)
    ranked = sorted(best.values(), key=lambda x: x[0], reverse=True)[:k]
    return [_result(d, s) for s, d in ranked]


def backfill(batch_size: int = 500) -> int:
    """One-time (idempotent per run) copy of every Firestore chunk into the archive with a load job."""
    from .firebase import db

    ensure_table()
    org_of_chat: dict[str, str] = {s.id: (s.to_dict() or {}).get("org_id", "") for s in db.collection("chats").stream()}
    org_of_user: dict[str, str] = {}

    def org_for(d: dict) -> str:
        if d.get("org_id"):
            return d["org_id"]
        if d.get("chat_id") in org_of_chat and org_of_chat[d["chat_id"]]:
            return org_of_chat[d["chat_id"]]
        for m in d.get("members") or []:
            if m not in org_of_user:
                org_of_user[m] = (db.collection("users").document(m).get().to_dict() or {}).get("org_id", "")
            if org_of_user[m]:
                return org_of_user[m]
        return ""

    rows = []
    for s in db.collection("chunks").stream():
        d = s.to_dict() or {}
        org = org_for(d)
        if org and d.get("embedding") is not None:
            rows.append(row(s.id, d, org))
    if rows:
        job = client().load_table_from_json(rows, TABLE, job_config=bigquery.LoadJobConfig(schema=SCHEMA, write_disposition="WRITE_TRUNCATE"))
        job.result(timeout=300)
    return len(rows)


def archive_search(query: str, since_days: int, tool_context: ToolContext) -> dict:
    """Deep search across the FULL history of the user's chats, files, meetings and records (BigQuery archive index).
    Slower than search_workspace (about a second or two) but broader: use for history, trends, older discussions and anything
    search_workspace didn't find.

    Args:
        query: What to look for; keep identifiers (drawing, heat, job numbers, vendor names).
        since_days: Only look at the last N days (e.g. 180), or 0 for all history.
    """
    from .firebase import user_profile

    user = user_profile(tool_context.state["uid"])
    if user.get("org_role") == "guest":
        return {"results": [], "note": "Not available to guests."}
    try:
        return {"results": search(user, query, since_days=since_days), "note": "Cite results as [ref]. Same permissions as search_workspace."}
    except Exception:
        log.exception("archive search failed")
        return {"results": [], "error": "The archive search is unavailable right now; use search_workspace."}
