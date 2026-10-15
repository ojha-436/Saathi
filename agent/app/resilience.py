"""Model resilience shared by every Saathi agent.

Gemini's shared quota can return 429 under bursts (several research agents at once, many users at once). Every agent model
call therefore (1) retries rate-limit and transient errors with exponential backoff and jitter, (2) falls back to a second
model if the primary is still unavailable, and (3) optionally ends that one agent's turn with a short note instead of
failing the whole workflow, so one busy call never sinks a report or a chat answer.

Interactive answers (Ask Saathi) can't wait out a busy quota: a 429 can sit in Google's queue for ~25 s before it comes
back, so five patient retries once kept a user waiting 157 s. There the primary model must send its first response within
FIRST_RESPONSE_S (retries included), or Saathi switches to the fallback model straight away.
"""
import asyncio
import logging

from google.adk.models import Gemini
from google.adk.models.llm_response import LlmResponse
from google.genai import errors, types

from .config import AGENT_FALLBACK_MODEL, AGENT_MODEL

log = logging.getLogger("saathi.resilience")

TRANSIENT = (408, 429, 500, 502, 503, 504)
RETRY = types.HttpRetryOptions(attempts=5, initial_delay=1.0, max_delay=16.0, exp_base=2.0, jitter=1.0, http_status_codes=list(TRANSIENT))
FAST_RETRY = types.HttpRetryOptions(attempts=3, initial_delay=0.5, max_delay=2.0, exp_base=2.0, jitter=0.5, http_status_codes=list(TRANSIENT))
FIRST_RESPONSE_S = 8.0  # normal first response is ~2-3 s; past 8 s the fallback is the faster answer
FALLBACK_S = 20.0  # an interactive fallback that is also stuck ends with the "busy" note instead of a spinner


class FirstResponseTimeout(Exception):
    """The primary model sent nothing within the interactive deadline (usually 429s queued behind a busy shared quota)."""


class DeadlineGemini(Gemini):
    """Gemini whose first response must arrive within `first_response_s`, SDK retries included; otherwise the call fails
    fast so on_model_error moves to the fallback model. Later chunks of a streamed answer are not time-limited."""

    first_response_s: float = FIRST_RESPONSE_S

    async def generate_content_async(self, llm_request, stream=False):
        responses = super().generate_content_async(llm_request, stream=stream)
        try:
            first = await asyncio.wait_for(responses.__anext__(), self.first_response_s)
        except StopAsyncIteration:
            return
        except asyncio.TimeoutError:
            try:
                await responses.aclose()
            except Exception:
                pass
            raise FirstResponseTimeout(f"{self.model} sent nothing within {self.first_response_s:.0f} s") from None
        yield first
        async for response in responses:
            yield response


def model(name: str = AGENT_MODEL) -> Gemini:
    """The ADK model object with retries (pass it as LlmAgent(model=...))."""
    return Gemini(model=name, retry_options=RETRY)


def interactive_model(name: str = AGENT_MODEL) -> Gemini:
    """For answers a person is waiting on: short retries under a first-response deadline."""
    return DeadlineGemini(model=name, retry_options=FAST_RETRY)


def transient(error: BaseException) -> bool:
    from .ai import transient as is_transient

    return is_transient(error)


def on_model_error(degrade_text: str | None = None, *, interactive: bool = False):
    """An ADK on_model_error_callback: try the fallback model; if that fails too, return `degrade_text` (or re-raise).
    `interactive` gives the fallback short retries and a time limit, because a person is waiting on the answer."""

    async def callback(callback_context, llm_request, error):
        timed_out = isinstance(error, FirstResponseTimeout)
        if not (timed_out or transient(error)):
            return None  # genuine bugs still surface
        primary = llm_request.model
        # a dropped connection usually succeeds on a fresh one: retry the primary once, then the fallback model.
        # A rate limit, or a primary that missed the interactive deadline, goes straight to the fallback.
        retry_primary = not timed_out and not isinstance(error, errors.APIError)

        async def attempt(name: str):
            last = None
            llm = Gemini(model=name, retry_options=FAST_RETRY if interactive else RETRY)
            async for response in llm.generate_content_async(llm_request, stream=False):
                last = response
            return last

        for name in ([primary] if retry_primary else []) + [AGENT_FALLBACK_MODEL]:
            log.warning("model call failed (%s); retrying with %s", getattr(error, "code", type(error).__name__), name)
            try:
                llm_request.model = name
                last = await asyncio.wait_for(attempt(name), FALLBACK_S if interactive else None)
                if last is not None:
                    if name != primary:
                        callback_context.state["fallback_model"] = name  # shown in "How Saathi got this"
                    return last
            except Exception:
                log.exception("retry with %s failed", name)
        if degrade_text is None:
            return None
        return LlmResponse(content=types.Content(role="model", parts=[types.Part(text=degrade_text)]))

    return callback
