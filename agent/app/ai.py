import random
import re
import time
from datetime import datetime

from google import genai
from google.genai import types

from .config import EMBED_DIM, EMBED_MODEL, FAST_MODEL, GENAI_LOCATION, PROJECT, TZ

client = genai.Client(vertexai=True, project=PROJECT, location=GENAI_LOCATION)


def _retry(fn, attempts: int = 6):
    """Retries rate-limit / transient Vertex errors with exponential backoff."""
    for i in range(attempts):
        try:
            return fn()
        except genai.errors.APIError as e:
            if e.code not in (429, 500, 503) or i == attempts - 1:
                raise
            time.sleep(min(30, 2 ** i) + random.random())


def embed(texts: list[str], task: str = "RETRIEVAL_DOCUMENT") -> list[list[float]]:
    # gemini-embedding-001 on Vertex accepts one input per request
    out = []
    for t in texts:
        r = _retry(lambda: client.models.embed_content(
            model=EMBED_MODEL,
            contents=t[:6000] or " ",
            config=types.EmbedContentConfig(task_type=task, output_dimensionality=EMBED_DIM),
        ))
        out.append(list(r.embeddings[0].values))
    return out


def generate_json(prompt: str, schema, model: str = FAST_MODEL, parts: list | None = None):
    r = _retry(lambda: client.models.generate_content(
        model=model,
        contents=[*(parts or []), prompt],
        config=types.GenerateContentConfig(
            response_mime_type="application/json", response_schema=schema, temperature=0.1
        ),
    ))
    return r.parsed


def generate_text(prompt: str, model: str = FAST_MODEL) -> str:
    r = _retry(lambda: client.models.generate_content(
        model=model, contents=prompt, config=types.GenerateContentConfig(temperature=0.3)
    ))
    return r.text or ""


_CODE = re.compile(r"\b[A-Za-z]{1,6}(?:[-/][A-Za-z0-9]+)+\b|\b\d{3,}\b")
_WORD = re.compile(r"[a-z0-9]+")
_STOP = set("the a an and or of to in on for is are was were be by with at from this that it i you we he she they me my our your what which who when where how did do does find show tell about latest last".split())


def keywords(text: str) -> list[str]:
    """Identifiers (drawing numbers, job numbers, heat numbers) plus meaningful words, lowercased."""
    toks = {m.group(0).lower() for m in _CODE.finditer(text)}
    for code in list(toks):
        toks.update(p for p in re.split(r"[-/]", code) if len(p) >= 3)
    toks.update(w for w in _WORD.findall(text.lower()) if len(w) >= 4 and w not in _STOP)
    return sorted(toks)[:40]


def fmt_ist(dt: datetime | None) -> str:
    if not dt:
        return ""
    return dt.astimezone(TZ).strftime("%a %d %b %Y, %I:%M %p IST")


def parse_iso(value: str | None) -> datetime | None:
    if not value:
        return None
    try:
        dt = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None
    return dt if dt.tzinfo else dt.replace(tzinfo=TZ)
