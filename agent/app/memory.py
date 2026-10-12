"""Plant memory (Phase 3b). "This happened before": when someone reports a defect or a breakdown, Saathi finds similar past
NCRs and downtime records and what fixed them, plus promise history for vendors and colleagues.

Lessons are shared across the workspace on purpose, but only as lessons: number, title, part/drawing, defect, root cause,
corrective action and who owned it. Photos, voice notes, reporter names and safety reports are never part of a lesson;
the full record stays visible only to its participants."""
import math
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from google.cloud.firestore_v1.base_query import FieldFilter
from pydantic import BaseModel

from . import ai
from .config import TZ
from .firebase import current_user, db, user_profile
from .search import user_chats

router = APIRouter()

LESSON_TYPES = ("ncr", "downtime")
MIN_SCORE = 0.70


def lesson_text(r: dict) -> str:
    f = r.get("fields") or {}
    capa = r.get("capa") or {}
    bits = [f.get("title"), f.get("description"), f.get("part_name"), f.get("drawing_no"), f.get("defect_type"), f.get("machine"),
            f.get("downtime_reason"), f.get("vendor"), capa.get("root_cause"), capa.get("corrective_action")]
    return " | ".join(str(b) for b in bits if b)


def _cos(a: list[float], b: list[float]) -> float:
    dot = sum(x * y for x, y in zip(a, b))
    na, nb = math.sqrt(sum(x * x for x in a)), math.sqrt(sum(y * y for y in b))
    return dot / (na * nb) if na and nb else 0.0


def _lesson(rid: str, r: dict, score: float) -> dict:
    f, capa = r.get("fields") or {}, r.get("capa") or {}
    closed = next((h["ts"] for h in reversed(r.get("history") or []) if h.get("status") == "closed"), None)
    return {"id": rid, "ref": f"rec:{rid}", "number": r["number"], "type": r["type"], "status": r["status"], "title": f.get("title"),
            "part_name": f.get("part_name"), "drawing_no": f.get("drawing_no"), "defect_type": f.get("defect_type"), "machine": f.get("machine"),
            "vendor": f.get("vendor"), "root_cause": capa.get("root_cause"), "corrective_action": capa.get("corrective_action"),
            "owner": user_profile(r["owner"])["name"] if r.get("owner") else None,
            "reported": r["created_at"].isoformat() if r.get("created_at") else None, "closed": closed.isoformat() if closed else None,
            "score": round(score, 3)}


def similar(org_id: str, text: str, *, exclude: str | None = None, limit: int = 3, fields: dict | None = None) -> list[dict]:
    """Past NCR/downtime records most like `text`. Identifier matches (same drawing, part, machine, defect) add to the score."""
    if not text.strip():
        return []
    qv = ai.embed([text[:2000]], task="RETRIEVAL_QUERY")[0]
    fields = fields or {}
    vecs = {s.id: s.get("vec") for s in db.collection("record_vecs").where(filter=FieldFilter("org_id", "==", org_id)).stream()}
    out = []
    for s in db.collection("records").where(filter=FieldFilter("org_id", "==", org_id)).stream():
        r = s.to_dict()
        if s.id == exclude or r.get("type") not in LESSON_TYPES or not vecs.get(s.id):
            continue
        score = _cos(qv, list(vecs[s.id]))
        rf = r.get("fields") or {}
        for k in ("drawing_no", "part_name", "machine", "defect_type", "vendor"):
            if fields.get(k) and rf.get(k) and str(fields[k]).strip().lower() == str(rf[k]).strip().lower():
                score += 0.05
        if (r.get("capa") or {}).get("corrective_action"):
            score += 0.02  # a known fix is worth more than an open twin
        if score >= MIN_SCORE:
            out.append((score, s.id, r))
    out.sort(key=lambda x: x[0], reverse=True)
    return [_lesson(i, r, sc) for sc, i, r in out[:limit]]


def lessons_for(user: dict, text: str, limit: int = 3, exclude: str | None = None, fields: dict | None = None) -> list[dict]:
    if user.get("org_role") == "guest":
        return []
    return similar(user["org_id"], text, exclude=exclude, limit=limit, fields=fields)


def promise_history(user: dict, who: str) -> dict:
    """Kept / late / open promises made by a person or vendor, from the chats the caller is in and the tasks they track."""
    uid, toks = user["uid"], set(ai.keywords(who))
    if not toks:
        return {"promises": [], "summary": None}
    now = datetime.now(TZ)
    outcome: dict[str, dict] = {}
    for s in db.collection("tasks").where(filter=FieldFilter("participants", "array_contains", uid)).stream():
        t = s.to_dict()
        if t.get("source_ref", "") and t.get("kind") == "promise":
            outcome.setdefault(t["source_ref"], t)
    rows = []
    for chat in user_chats(uid).values():
        if chat.get("ai_excluded"):
            continue
        for m in db.collection("chats").document(chat["id"]).collection("messages").where(filter=FieldFilter("promise.confidence", ">", 0)).stream():
            p = m.get("promise")
            if not (toks & set(ai.keywords(f"{p.get('committer', '')} {m.get('sender_name') or ''}"))):
                continue
            ref = f"msg:{chat['id']}/{m.id}"
            t = outcome.get(ref)
            due = p.get("due_at")
            done = t.get("done_at") if t and t.get("status") == "done" else None
            if done and due:
                slip = (done - due).total_seconds() / 86400
                state = "kept" if slip <= 0.5 else "late"
            elif done:
                slip, state = None, "kept"
            elif due and due < now:
                slip, state = (now - due).total_seconds() / 86400, "overdue"
            else:
                slip, state = None, "open"
            rows.append({"ref": ref, "committer": p.get("committer"), "action": p.get("action"), "due": ai.fmt_ist(due), "state": state,
                         "slip_days": round(slip, 1) if slip is not None and slip > 0 else 0, "_ts": m.get("ts")})
    rows.sort(key=lambda r: r.pop("_ts") or now, reverse=True)
    closed = [r for r in rows if r["state"] in ("kept", "late")]
    late = [r for r in rows if r["state"] in ("late", "overdue")]
    summary = None
    if rows:
        summary = {"total": len(rows), "kept_on_time": sum(r["state"] == "kept" for r in rows), "late": sum(r["state"] == "late" for r in rows),
                   "overdue_now": sum(r["state"] == "overdue" for r in rows), "open": sum(r["state"] == "open" for r in rows),
                   "on_time_rate": round(sum(r["state"] == "kept" for r in closed) / len(closed), 2) if closed else None,
                   "avg_slip_days": round(sum(r["slip_days"] for r in late) / len(late), 1) if late else 0}
    return {"promises": rows[:12], "summary": summary}


class SimilarIn(BaseModel):
    text: str
    fields: dict = {}
    exclude: str | None = None


@router.post("/api/memory/similar")
def similar_api(body: SimilarIn, user=Depends(current_user)):
    from .main import rate_limit

    if user.get("org_role") == "guest":
        raise HTTPException(403, "Not available to guests")
    rate_limit(user["uid"], "memory", 30)
    f = {k: v for k, v in (body.fields or {}).items() if isinstance(v, str)}
    text = " | ".join([body.text[:1500]] + [v for v in f.values() if v][:10])
    return {"lessons": lessons_for(user, text, limit=3, exclude=body.exclude, fields=f)}

