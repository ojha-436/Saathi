"""Permission-aware hybrid retrieval. Every query is filtered to chats the caller is a member of."""
from google.cloud.firestore_v1.base_query import FieldFilter
from google.cloud.firestore_v1.base_vector_query import DistanceMeasure
from google.cloud.firestore_v1.vector import Vector

from . import ai
from .firebase import db


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


def search(uid: str, query: str, k: int = 8) -> list[dict]:
    qv = ai.embed([query], task="RETRIEVAL_QUERY")[0]
    scored: dict[str, tuple[float, dict]] = {}

    vq = (
        db.collection("chunks")
        .where(filter=FieldFilter("members", "array_contains", uid))
        .find_nearest(
            vector_field="embedding",
            query_vector=Vector(qv),
            distance_measure=DistanceMeasure.COSINE,
            limit=14,
            distance_result_field="distance",
        )
    )
    for snap in vq.stream():
        d = snap.to_dict()
        scored[snap.id] = (1.0 - float(d.get("distance", 1.0)), d)

    toks = ai.keywords(query)
    if toks:
        kq = db.collection("chunks").where(filter=FieldFilter("keywords", "array_contains_any", toks[:30])).limit(40)
        for snap in kq.stream():
            d = snap.to_dict()
            if uid not in (d.get("members") or []):
                continue  # permission filter for the keyword path
            hits = len(set(toks) & set(d.get("keywords") or []))
            base = scored.get(snap.id, (0.35, d))[0]
            scored[snap.id] = (base + 0.12 * hits, d)

    # Defence in depth: only chats the caller is a member of right now (covers any stale chunk permissions)
    allowed = set(user_chats(uid))

    # one result per source (a file has several chunks)
    best: dict[str, tuple[float, dict]] = {}
    for score, d in scored.values():
        if d.get("chat_id") not in allowed:
            continue
        key = d.get("ref")
        if key not in best or score > best[key][0]:
            best[key] = (score, d)
    ranked = sorted(best.values(), key=lambda x: x[0], reverse=True)[:k]
    return [_result(d, s) for s, d in ranked]
