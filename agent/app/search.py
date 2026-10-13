"""Permission-aware hybrid retrieval. Every query is filtered to chats the caller is a member of."""
from concurrent.futures import ThreadPoolExecutor

from . import ai
from .firebase import db, DistanceMeasure, FieldFilter, Vector


def user_chats(uid: str) -> dict[str, dict]:
    q = db.collection("chats").where(filter=FieldFilter("members", "array_contains", uid))
    return {s.id: {"id": s.id, **s.to_dict()} for s in q.stream()}


def _result(d: dict, score: float) -> dict:
    return {
        "ref": d.get("ref"),
        "type": d.get("source_type"),
        "chat": d.get("chat_name"),
        "sender": d.get("sender_name"),
        "when": ai.fmt_ist(d.get("ts")),
        "file_name": d.get("file_name"),
        "doc_type": d.get("doc_type"),
        "text": (d.get("text") or "")[:700],
        "score": round(score, 3),
    }


PERSONAL = ("meeting", "email", "drive", "record", "knowledge")
_pool = ThreadPoolExecutor(max_workers=16, thread_name_prefix="search")


def _nearest(base, qv: list[float], limit: int = 14) -> list:
    return list(base.find_nearest(vector_field="embedding", query_vector=Vector(qv), distance_measure=DistanceMeasure.COSINE,
                                  limit=limit, distance_result_field="distance").stream())


def search(uid: str, query: str, k: int = 8, qv: list[float] | None = None) -> list[dict]:
    """qv: the query's embedding when the caller already has it (saves one embedding call).

    Permissions are resolved at query time: chat content is pre-filtered by the caller's CURRENT chats (chat_id IN batches of 30,
    queried in parallel), so joining or leaving a chat never rewrites its indexed content; personal sources (meetings, knowledge,
    email, Drive, records) are pre-filtered by their member list. Results are re-checked against current membership below."""
    qv = qv or ai.embed([query], task="RETRIEVAL_QUERY")[0]
    chats = user_chats(uid)
    allowed = set(chats)
    searchable = [c for c, d in chats.items() if not d.get("ai_excluded")]
    scored: dict[str, tuple[float, dict]] = {}

    col = db.collection("chunks")
    jobs = [_pool.submit(_nearest, col.where(filter=FieldFilter("chat_id", "in", searchable[i:i + 30])), qv) for i in range(0, len(searchable), 30)]
    jobs.append(_pool.submit(_nearest, col.where(filter=FieldFilter("members", "array_contains", uid)), qv))
    for job in jobs:
        for snap in job.result():
            d = snap.to_dict()
            score = 1.0 - float(d.get("distance", 1.0))
            if snap.id not in scored or score > scored[snap.id][0]:
                scored[snap.id] = (score, d)

    toks = ai.keywords(query)
    org = next((d.get("org_id") for d in chats.values() if d.get("org_id")), None)
    if toks and org:
        kq = (db.collection("chunks").where(filter=FieldFilter("org_id", "==", org))
              .where(filter=FieldFilter("keywords", "array_contains_any", toks[:30])).limit(40))
        for snap in kq.stream():
            d = snap.to_dict()  # permissions: the current-membership check below
            hits = len(set(toks) & set(d.get("keywords") or []))
            base = scored.get(snap.id, (0.35, d))[0]
            scored[snap.id] = (base + 0.12 * hits, d)

    # Defence in depth: only chats the caller is a member of right now (covers any stale chunk permissions)

    # one result per source (a file has several chunks)
    best: dict[str, tuple[float, dict]] = {}
    for score, d in scored.values():
        if d.get("source_type") in PERSONAL or str(d.get("chat_id", "")).startswith("meeting_"):
            # meeting participants are fixed when the summary is created; emails belong to the person who connected Gmail
            if uid not in (d.get("members") or []):
                continue
        elif d.get("chat_id") not in allowed or chats[d["chat_id"]].get("ai_excluded"):
            continue
        key = d.get("ref")
        if key not in best or score > best[key][0]:
            best[key] = (score, d)
    ranked = sorted(best.values(), key=lambda x: x[0], reverse=True)[:k]
    return [_result(d, s) for s, d in ranked]
