"""Model resilience shared by every Saathi agent.

Gemini's shared quota can return 429 under bursts (several research agents at once, many users at once). Every agent model
call therefore (1) retries rate-limit and transient errors with exponential backoff and jitter, (2) falls back to a second
model if the primary is still unavailable, and (3) optionally ends that one agent's turn with a short note instead of
failing the whole workflow, so one busy call never sinks a report or a chat answer.
"""
import logging

from google.adk.models import Gemini
from google.adk.models.llm_response import LlmResponse
from google.genai import errors, types

from .config import AGENT_FALLBACK_MODEL, AGENT_MODEL

log = logging.getLogger("saathi.resilience")

TRANSIENT = (408, 429, 500, 502, 503, 504)
RETRY = types.HttpRetryOptions(attempts=5, initial_delay=1.0, max_delay=16.0, exp_base=2.0, jitter=1.0, http_status_codes=list(TRANSIENT))


def model(name: str = AGENT_MODEL) -> Gemini:
    """The ADK model object with retries (pass it as LlmAgent(model=...))."""
    return Gemini(model=name, retry_options=RETRY)


def transient(error: BaseException) -> bool:
    from .ai import transient as is_transient

    return is_transient(error)


def on_model_error(degrade_text: str | None = None):
    """An ADK on_model_error_callback: try the fallback model; if that fails too, return `degrade_text` (or re-raise)."""

    async def callback(callback_context, llm_request, error):
        if not transient(error):
            return None  # genuine bugs still surface
        primary = llm_request.model
        # a dropped connection usually succeeds on a fresh one: retry the primary once, then the fallback model
        for name in ([primary] if not isinstance(error, errors.APIError) else []) + [AGENT_FALLBACK_MODEL]:
            log.warning("model call failed (%s); retrying with %s", getattr(error, "code", type(error).__name__), name)
            try:
                llm_request.model = name
                last = None
                async for response in model(name).generate_content_async(llm_request, stream=False):
                    last = response
                if last is not None:
                    return last
            except Exception:
                log.exception("retry with %s failed", name)
        if degrade_text is None:
            return None
        return LlmResponse(content=types.Content(role="model", parts=[types.Part(text=degrade_text)]))

    return callback
