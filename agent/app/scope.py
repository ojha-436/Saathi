"""Keeps Saathi on the job: it answers about the user's work in this workspace, not general knowledge, code or essays.

Two layers. This check runs before the assistant starts (at the same time as the up-front workspace search, so it adds no
wait) and turns away questions that are plainly not about work, before any answer streams. The assistant's own
instructions carry the same rule, for anything the check lets through. When the check can't decide (or fails), the
question goes through: the cost of a wrong refusal in front of a colleague is higher than a short off-topic answer."""
import logging
import re
from typing import Literal

from pydantic import BaseModel

from . import ai

log = logging.getLogger("saathi.scope")

# Plainly about the user's own work, no need to ask a model: a cited source, a workspace id (drawing SRC-BF-2041, NCR-1023,
# heat H-77812, PO-7781, Job 4521) or a reminder/task request (as agent._TASKY)
_WORKY = re.compile(r"\[(?:msg|file|meet|dec|rec|ho|kn|std|mail|drive):|\b[A-Z]{2,5}-[A-Z]{0,4}-?\d{3,6}\b|\bH-\d{4,6}\b|\bPO-?\d{3,}\b|"
                    r"\bjob\s?\d{3,}\b|\b(remind|reminder|task|todo|to-do|kal subah|parso|laga do|assign|owe)\b", re.I)


class Verdict(BaseModel):
    about_work: bool
    kind: Literal["work", "greeting", "about_saathi", "general_knowledge", "coding", "writing", "personal", "other"]
    hinglish: bool


PROMPT = """You screen messages sent to Saathi, the AI work assistant inside {company}'s team workspace{about}. Saathi answers
ONLY from this workspace: chats, files, engineering drawings and revisions, materials and test certificates, company standards,
quality and plant records (NCRs, downtime, safety), machines, vendors, purchase orders, meetings, shift handovers, decisions,
tasks and reminders, colleagues, and the user's connected email, calendar and Drive.

about_work = true when the message could be about the user's job here, even if vague or very short: questions about any of the
above, drafting a short work message or summary from it, follow-ups to the earlier conversation, greetings, thanks, and
questions about what Saathi can do. Engineering questions about the company's own parts, materials, processes or standards are
work (Saathi will look them up). Questions about colleagues, what they said, sent or decided are work too, even private ones:
Saathi's permission checks decide what can be shown, not you.

about_work = false when the message asks for something no workspace source is needed for: general knowledge or current affairs
(politics, leaders, sports, celebrities, geography, history, weather, news), writing or fixing software code, scripts, SQL, HTML
or web pages, school or homework problems, poems, stories, jokes or essays not about this work, personal advice (health,
money, relationships), or topics about other companies or the wider world.

If unsure, about_work = true. hinglish = true if the message is in Hindi or Hinglish (Hindi in Latin script).

User: {user} ({role})
{history}Message: {text}"""


def refusal(company: str, kind: str, hinglish: bool) -> str:
    if hinglish:
        what = {"coding": "Main code ya web pages nahi likhta.", "general_knowledge": "Main general knowledge ke sawaalon ka jawab nahi deta."}.get(kind, "")
        return (f"{what} Main Saathi hoon, {company} mein aapke kaam ka assistant. Main sirf is workspace se jawab deta hoon: aapke chats, "
                "files, drawings, records, decisions, tasks, meetings aur connected email, calendar aur Drive. Kisi drawing, vendor, "
                "defect ya pichhli shift ke baare mein poochiye.").strip()
    what = {"coding": "I don't write code or web pages.", "general_knowledge": "I don't answer general-knowledge questions."}.get(kind, "I can't help with that.")
    return (f"{what} I'm Saathi, your work assistant at {company}, and I only answer from this workspace: your chats, files, drawings, "
            "records, decisions, tasks, meetings and connected email, calendar and Drive. Try asking about a drawing, a vendor, a defect "
            "or what happened last shift.")


def check(text: str, history: list[dict], *, company: str, about: str, user: str, role: str) -> dict:
    """{"about_work": bool, "kind": str, "hinglish": bool}. Fails open."""
    if len(text.strip()) < 4 or _WORKY.search(text):
        return {"about_work": True, "kind": "work", "hinglish": False}
    convo = "".join(f"{h['role']}: {h['text'][:300]}\n" for h in history[-2:])
    try:
        v = ai.generate_json(PROMPT.format(company=company, about=about, user=user, role=role or "employee", text=text[:1500],
                                           history=f"Earlier in the conversation:\n{convo}" if convo else ""), Verdict, quick=True)
        return v.model_dump()
    except Exception:
        log.exception("scope check failed; letting the question through")
        return {"about_work": True, "kind": "work", "hinglish": False}
