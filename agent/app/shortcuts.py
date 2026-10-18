"""Shortcuts: anyone's own saved Saathi jobs. A shortcut is a name, a /command, plain-language steps and the blanks that change
each time ("Dispatch check", /dispatch-check, "1. Find the {PO number} delivery schedule…", ["PO number"]). Typing
`/dispatch-check PO-7781` in the Saathi box runs it through the ordinary assistant: same scope check, same tools, same
permissions and citations, and anything it proposes is still a draft the person confirms.

Shortcuts are private to the person and the workspace (assistant/{uid}/shortcuts, read only through this API). Gemini drafts
one from a description or from an answer the person liked; nothing is saved until they press Save."""
import logging
import re
import uuid
from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from . import demo
from .config import TZ
from .firebase import current_user, db, firestore

log = logging.getLogger("saathi.shortcuts")
router = APIRouter(prefix="/api/shortcuts")

CMD = re.compile(r"[a-z0-9][a-z0-9-]{1,29}")
TYPED = re.compile(r"/([A-Za-z0-9][A-Za-z0-9-]{1,29})(?:\s+(.*))?", re.S)
RESERVED = {"clear", "help", "new"}
LIMIT = 20
MAX_NAME, MAX_INSTRUCTION, MAX_INPUTS, MAX_INPUT = 60, 1500, 4, 40
DEMO_RULE = "Demo logins are shared by everyone trying Saathi, so they can change only the shortcuts made today."


class ShortcutIn(BaseModel):
    name: str
    command: str
    instruction: str
    inputs: list[str] = []
    minutes_saved: int = 10


class ShortcutPatch(BaseModel):
    name: str | None = None
    command: str | None = None
    instruction: str | None = None
    inputs: list[str] | None = None
    minutes_saved: int | None = None


def _col(uid: str):
    return db.collection("assistant").document(uid).collection("shortcuts")


def _here(d: dict, org_id: str) -> bool:
    return d.get("org_id") == org_id


def _iso(v):
    return v.isoformat() if isinstance(v, datetime) else None


def _row(sid: str, d: dict) -> dict:
    return {"id": sid, "name": d.get("name", ""), "command": d.get("command", ""), "instruction": d.get("instruction", ""),
            "inputs": d.get("inputs") or [], "minutes_saved": int(d.get("minutes_saved") or 0), "runs": int(d.get("runs") or 0),
            "last_run": _iso(d.get("last_run")), "demo": bool(d.get("demo"))}


def slug(text: str) -> str:
    s = re.sub(r"[^a-z0-9]+", "-", (text or "").lower())[:30].strip("-")
    return s if len(s) >= 2 else "shortcut"


def parse(text: str) -> tuple[str, str] | None:
    m = TYPED.fullmatch((text or "").strip())
    return (m.group(1).lower(), (m.group(2) or "").strip()) if m else None


def mine(user: dict) -> list[dict]:
    rows = [_row(s.id, s.to_dict()) for s in _col(user["uid"]).stream() if _here(s.to_dict(), user["org_id"])]
    return sorted(rows, key=lambda r: (-r["runs"], r["name"].lower()))


def _inputs(values: list[str]) -> list[str]:
    out: list[str] = []
    for v in values or []:
        v = re.sub(r"\s+", " ", str(v)).strip()[:MAX_INPUT]
        if v and v.lower() not in {o.lower() for o in out}:
            out.append(v)
    return out


def _minutes(v) -> int:
    try:
        n = 10 if v is None else int(v)
    except (TypeError, ValueError):
        n = 10
    return max(1, min(240, n))


def fixup(d: dict, taken: set[str]) -> dict:
    """A Gemini draft made safe to show in the editor: never raises, the command is free to use."""
    base = slug(d.get("command") or d.get("name") or "")
    command, n = base, 1
    while command in taken or command in RESERVED:
        n += 1
        command = f"{base[: 30 - len(str(n)) - 1]}-{n}"
    return {"name": re.sub(r"\s+", " ", d.get("name") or "").strip()[:MAX_NAME] or "My shortcut", "command": command,
            "instruction": (d.get("instruction") or "").strip()[:MAX_INSTRUCTION], "inputs": _inputs(d.get("inputs") or [])[:MAX_INPUTS],
            "minutes_saved": _minutes(d.get("minutes_saved"))}


def validate(d: dict, taken: set[str]) -> dict:
    """A shortcut as the person saves it: clear errors instead of silent changes."""
    name = re.sub(r"\s+", " ", d.get("name") or "").strip()
    command = (d.get("command") or "").strip().lstrip("/").lower()
    instruction = (d.get("instruction") or "").strip()
    raw_inputs = [v for v in (d.get("inputs") or []) if str(v).strip()]
    if not name:
        raise HTTPException(400, "Give the shortcut a name")
    if len(name) > MAX_NAME:
        raise HTTPException(400, f"Keep the name under {MAX_NAME} characters")
    if not CMD.fullmatch(command):
        raise HTTPException(400, "The command can use lowercase letters, numbers and hyphens (2 to 30), like dispatch-check")
    if command in RESERVED:
        raise HTTPException(400, f"/{command} is built into Saathi. Pick another command")
    if command in taken:
        raise HTTPException(400, f"You already have a shortcut called /{command}")
    if not instruction:
        raise HTTPException(400, "Write the steps Saathi should follow")
    if len(instruction) > MAX_INSTRUCTION:
        raise HTTPException(400, f"Keep the steps under {MAX_INSTRUCTION} characters")
    if len(raw_inputs) > MAX_INPUTS:
        raise HTTPException(400, f"A shortcut can have up to {MAX_INPUTS} blanks")
    if any(len(str(v).strip()) > MAX_INPUT for v in raw_inputs):
        raise HTTPException(400, f"Keep each blank's name under {MAX_INPUT} characters")
    return {"name": name, "command": command, "instruction": instruction, "inputs": _inputs(raw_inputs),
            "minutes_saved": _minutes(d.get("minutes_saved"))}


def prompt_for(sc: dict, given: str) -> str:
    needs = ", ".join(sc.get("inputs") or []) or "nothing"
    return (f"Run the person's saved shortcut \"{sc['name']}\". Steps: {sc['instruction']}. It needs: {needs}. "
            f"The person gave: \"{given}\". If something it needs is missing or unclear, ask for it briefly instead of guessing.")


def expand(user: dict, text: str) -> dict | None:
    """What the Saathi box should do with a /command: None (not one), the shortcut's prompt, or a reply with no model call."""
    typed = parse(text)
    if not typed or typed[0] in RESERVED:
        return None
    command, given = typed
    have = mine(user)
    sc = next((s for s in have if s["command"] == command), None)
    if sc:
        return {"prompt": prompt_for(sc, given), "shortcut": {"id": sc["id"], "name": sc["name"]}}
    if not have:
        return {"reply": "You don't have any shortcuts yet. Make one on the Shortcuts tab: describe a job you repeat and Saathi drafts it."}
    return {"reply": f"You don't have a shortcut called /{command}. Yours are: " + ", ".join(f"/{s['command']}" for s in have) + "."}


def record_run(uid: str, shortcut_id: str) -> None:
    try:
        ref = _col(uid).document(shortcut_id)
        if ref.get().exists:
            ref.update({"runs": firestore.Increment(1), "last_run": datetime.now(TZ)})
    except Exception:
        log.warning("couldn't count a run of shortcut %s", shortcut_id)


def source_from_message(user: dict, message_id: str) -> str:
    """The question and answer behind "Save as shortcut", from the person's own Saathi history only."""
    msgs = db.collection("assistant").document(user["uid"]).collection("messages")
    snap = msgs.document(message_id).get() if re.fullmatch(r"[A-Za-z0-9_-]{1,64}", message_id or "") else None
    d = snap.to_dict() if snap and snap.exists else None
    if not d or d.get("role") != "assistant" or d.get("org_id") not in (None, "", user["org_id"]):
        raise HTTPException(404, "Answer not found")
    sid, ts = d.get("session_id"), d.get("ts")
    earlier = [x.to_dict() for x in msgs.stream()]
    earlier = [x for x in earlier if x.get("role") == "user" and x.get("session_id") == sid and isinstance(x.get("ts"), datetime)
               and isinstance(ts, datetime) and x["ts"] <= ts]
    question = max(earlier, key=lambda x: x["ts"])["text"] if earlier else ""
    return f"Question: {question}\nAnswer: {(d.get('text') or '')[:600]}"


def _own(user: dict, sc_id: str):
    ref = _col(user["uid"]).document(sc_id)
    snap = ref.get() if re.fullmatch(r"[A-Za-z0-9_-]{1,64}", sc_id or "") else None
    if not snap or not snap.exists or not _here(snap.to_dict(), user["org_id"]):
        raise HTTPException(404, "Shortcut not found")
    d = snap.to_dict()
    made = d.get("created_at")
    if d.get("demo") or not (isinstance(made, datetime) and datetime.now(TZ) - made < timedelta(days=1)):
        demo.guard(user, DEMO_RULE)  # the next person trying the demo login still finds the examples
    return ref, d


@router.get("")
def list_shortcuts(user=Depends(current_user)):
    rows = mine(user)
    return {"shortcuts": rows, "total_runs": sum(r["runs"] for r in rows),
            "total_minutes_saved": sum(r["runs"] * r["minutes_saved"] for r in rows)}


@router.post("")
def create(body: ShortcutIn, user=Depends(current_user)):
    have = mine(user)
    if len(have) >= LIMIT:
        raise HTTPException(400, f"You can keep up to {LIMIT} shortcuts. Delete one you no longer use first.")
    clean = validate(body.model_dump(), {s["command"] for s in have})
    sid = "sc_" + uuid.uuid4().hex[:16]
    t = datetime.now(TZ)
    doc = {**clean, "runs": 0, "last_run": None, "org_id": user["org_id"], "created_at": t, "updated_at": t}
    _col(user["uid"]).document(sid).set(doc)
    return _row(sid, doc)


@router.patch("/{sc_id}")
def update(sc_id: str, body: ShortcutPatch, user=Depends(current_user)):
    ref, d = _own(user, sc_id)
    merged = {**d, **{k: v for k, v in body.model_dump().items() if v is not None}}
    clean = validate(merged, {s["command"] for s in mine(user) if s["id"] != sc_id})
    ref.update({**clean, "updated_at": datetime.now(TZ)})
    return _row(sc_id, {**d, **clean})


@router.delete("/{sc_id}")
def remove(sc_id: str, user=Depends(current_user)):
    ref, _ = _own(user, sc_id)
    ref.delete()
    return {"ok": True}
