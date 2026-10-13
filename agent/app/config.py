import os
from zoneinfo import ZoneInfo

PROJECT = os.getenv("GOOGLE_CLOUD_PROJECT", "aibuildergc")
GENAI_LOCATION = os.getenv("GENAI_LOCATION", "global")

# Models (all overridable per environment)
AGENT_MODEL = os.getenv("AGENT_MODEL", "gemini-3.8-flash")
# Used when the primary model is rate-limited or unavailable after retries (see resilience.py)
AGENT_FALLBACK_MODEL = os.getenv("AGENT_FALLBACK_MODEL", "gemini-3.5-flash")
FAST_MODEL = os.getenv("FAST_MODEL", "gemini-3.5-flash-lite")
VISION_MODEL = os.getenv("VISION_MODEL", "gemini-3.8-flash")
# "low" kept retrieval 10/10 and 0 leaks while answering ~2 s faster than the default (high) in eval
AGENT_THINKING = os.getenv("AGENT_THINKING", "low")
# Changing the embedding model needs a full re-index of `chunks` (vectors from different models are not comparable)
EMBED_MODEL = os.getenv("EMBED_MODEL", "gemini-embedding-001")
EMBED_DIM = 768
# Embeddings run on the regional endpoint next to Cloud Run (asia-south1): ~0.4 s per call vs ~1-2 s on global
EMBED_LOCATION = os.getenv("EMBED_LOCATION", "asia-south1")
# Streaming speech-to-text for Saathi Live and the voice for its recording notice
LIVE_STT_MODEL = os.getenv("LIVE_STT_MODEL", "gemini-3.5-transcribe-live-preview")
TTS_MODEL = os.getenv("TTS_MODEL", "gemini-2.5-flash-tts")
# Saathi Voice: native-audio Live model with tool calling. Verified 2026-10-12: served from us-central1 for this project
# (not global or asia-south1), so voice audio is processed in the US; workspaces opt in (settings.voice_us).
VOICE_MODEL = os.getenv("VOICE_MODEL", "gemini-3.8-live")
VOICE_LOCATION = os.getenv("VOICE_LOCATION", "us-central1")

FILES_BUCKET = os.getenv("FILES_BUCKET", "aibuildergc-saathi-files")
CRON_SECRET = os.getenv("CRON_SECRET", "dev-cron-secret")
ALLOWED_ORIGINS = [o.strip() for o in os.getenv("ALLOWED_ORIGINS", "http://localhost:3000").split(",") if o.strip()]

# Optional integrations (enabled when set)
DOCAI_PROCESSOR = os.getenv("DOCAI_PROCESSOR", "")  # Document AI OCR processor id
DOCAI_LOCATION = os.getenv("DOCAI_LOCATION", "asia-south1")
BQ_TABLE = os.getenv("BQ_TABLE", "")  # e.g. aibuildergc.saathi.assistant_events

# Background jobs (research runs, spec checks). "cloudtasks" in production: Cloud Tasks → the private saathi-worker service.
# "inline" runs jobs in a thread of the same process (local development).
TASKS_MODE = os.getenv("TASKS_MODE", "inline")
TASKS_LOCATION = os.getenv("TASKS_LOCATION", "asia-south1")
TASKS_SA = os.getenv("TASKS_SA", f"saathi-agent@{PROJECT}.iam.gserviceaccount.com")
WORKER_URL = os.getenv("WORKER_URL", "").rstrip("/")
# Which routes this instance serves: "api" (public REST + WebSockets), "worker" (job endpoints only), "all" (local dev)
SAATHI_ROLE = os.getenv("SAATHI_ROLE", "all")

COMPANY = os.getenv("COMPANY_NAME", "Shakti Rail Components")
# Optional allow-list of email domains for new accounts (comma-separated). Empty = anyone can sign up (demo mode).
SIGNUP_DOMAINS = {d.strip().lower() for d in os.getenv("SIGNUP_DOMAINS", "").split(",") if d.strip()}
TZ = ZoneInfo("Asia/Kolkata")

# ADK reads these to route Gemini calls through Vertex AI
os.environ.setdefault("GOOGLE_GENAI_USE_VERTEXAI", "TRUE")
os.environ.setdefault("GOOGLE_CLOUD_PROJECT", PROJECT)
os.environ.setdefault("GOOGLE_CLOUD_LOCATION", GENAI_LOCATION)

# Google connector (Calendar + Gmail, read-only). OAuth client JSON comes from Secret Manager (saathi-google-oauth),
# mounted as GOOGLE_OAUTH_CLIENT. Refresh tokens are encrypted with Cloud KMS before they're stored.
GOOGLE_OAUTH_CLIENT = os.getenv("GOOGLE_OAUTH_CLIENT", "")
KMS_KEY = os.getenv("KMS_KEY", f"projects/{PROJECT}/locations/asia-south1/keyRings/saathi/cryptoKeys/saathi-connectors")
PUBLIC_API_URL = os.getenv("PUBLIC_API_URL", "https://saathi-api-82398575445.asia-south1.run.app").rstrip("/")
WEB_URL = os.getenv("WEB_URL", "https://saathi-web-82398575445.asia-south1.run.app").rstrip("/")
