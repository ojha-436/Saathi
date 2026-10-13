import hashlib
import math
import random
import re
import time
from datetime import datetime

from google import genai
from google.genai import types

from concurrent.futures import ThreadPoolExecutor

from .config import EMBED_DIM, EMBED_LOCATION, EMBED_MODEL, FAST_MODEL, GEMINI_API_KEY, GENAI_LOCATION, LOCAL_MODE, PROJECT, TZ

if LOCAL_MODE:
    # AI Studio key if provided, otherwise None: embeddings then use the offline hashing model below.
    client = genai.Client(api_key=GEMINI_API_KEY) if GEMINI_API_KEY else None
    embed_client = client
else:
    client = genai.Client(vertexai=True, project=PROJECT, location=GENAI_LOCATION)
    embed_client = genai.Client(vertexai=True, project=PROJECT, location=EMBED_LOCATION)
_pool = ThreadPoolExecutor(max_workers=16, thread_name_prefix="embed")

NO_LLM = "Gemini is not configured. Set GEMINI_API_KEY (Google AI Studio) to enable AI features."


def _hash_embed(text: str) -> list[float]:
    """Offline embedding: hashed bag of words + bigrams, L2-normalised. Good enough for keyword-ish local search."""
    vec = [0.0] * EMBED_DIM
    words = re.findall(r"[a-z0-9]+", text.lower())
    for tok in words + [f"{a}_{b}" for a, b in zip(words, words[1:])]:
        h = int.from_bytes(hashlib.md5(tok.encode()).digest()[:8], "big")
        vec[h % EMBED_DIM] += 1.0 if h & (1 << 40) else -1.0
    norm = math.sqrt(sum(v * v for v in vec)) or 1.0
    return [v / norm for v in vec]


def _network_errors() -> tuple:
    import httpx

    kinds: list = [httpx.TransportError, ConnectionError, TimeoutError]
    try:
        from google.auth.exceptions import TransportError as AuthTransportError  # token refresh hit a dropped connection

        kinds.append(AuthTransportError)
    except ImportError:
        pass
    try:
        import requests

        kinds += [requests.exceptions.ConnectionError, requests.exceptions.Timeout]
    except ImportError:
        pass
    try:
        from websockets.exceptions import ConnectionClosedError  # Gemini Live sessions run over websockets

        kinds.append(ConnectionClosedError)
    except ImportError:
        pass
    return tuple(kinds)


_NETWORK = _network_errors()


def transient(e: BaseException) -> bool:
    """Rate limits, 5xx and dropped connections (HTTP, auth refresh, websockets) are worth retrying; everything else is a real error."""
    if isinstance(e, genai.errors.APIError):
        return e.code in (408, 429, 500, 502, 503, 504)
    return isinstance(e, _NETWORK)


def _retry(fn, attempts: int = 6):
    """Retries rate-limit, transient server and network errors with exponential backoff and jitter."""
    for i in range(attempts):
        try:
            return fn()
        except Exception as e:
            if not transient(e) or i == attempts - 1:
                raise
            time.sleep(min(30, 2 ** i) + random.random())


def _embed_one(text: str, task: str, title: str | None) -> list[float]:
    cfg = types.EmbedContentConfig(task_type=task, output_dimensionality=EMBED_DIM, title=title if task == "RETRIEVAL_DOCUMENT" and title else None)
    r = _retry(lambda: embed_client.models.embed_content(model=EMBED_MODEL, contents=text[:6000] or " ", config=cfg))
    return list(r.embeddings[0].values)


def embed(texts: list[str], task: str = "RETRIEVAL_DOCUMENT", title: str | None = None) -> list[list[float]]:
    """gemini-embedding-001 on Vertex takes one input per request, so batches fan out in parallel (order kept)."""
    if embed_client is None:
        return [_hash_embed(t[:6000]) for t in texts]
    if len(texts) == 1:
        return [_embed_one(texts[0], task, title)]
    return list(_pool.map(lambda t: _embed_one(t, task, title), texts))


def generate_json(prompt: str, schema, model: str = FAST_MODEL, parts: list | None = None, quick: bool = False):
    """quick=True turns thinking down to minimal: ~30% faster for short extraction and live answers."""
    if client is None:
        raise RuntimeError(NO_LLM)
    r = _retry(lambda: client.models.generate_content(
        model=model,
        contents=[*(parts or []), prompt],
        config=types.GenerateContentConfig(
            response_mime_type="application/json", response_schema=schema, temperature=0.1,
            thinking_config=types.ThinkingConfig(thinking_level="minimal") if quick else None,
        ),
    ))
    return r.parsed


def generate_json_hedged(prompt: str, schema, model: str = FAST_MODEL, hedge_after: float = 3.5, limit: float = 20.0):
    """Tail-latency guard for live answers: if the first call hasn't returned after `hedge_after` seconds, send an identical
    second call and use whichever finishes first."""
    from concurrent.futures import FIRST_COMPLETED, wait

    first = _pool.submit(generate_json, prompt, schema, model, None, True)
    done, _ = wait([first], timeout=hedge_after)
    if done:
        return first.result()
    second = _pool.submit(generate_json, prompt, schema, model, None, True)
    done, _ = wait([first, second], timeout=limit, return_when=FIRST_COMPLETED)
    if not done:
        raise TimeoutError("answer took too long")
    return next(iter(done)).result()


def generate_text(prompt: str, model: str = FAST_MODEL) -> str:
    if client is None:
        raise RuntimeError(NO_LLM)
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
