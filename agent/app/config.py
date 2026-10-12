import os
from zoneinfo import ZoneInfo

# SAATHI_LOCAL=1 runs everything on this machine: JSON "database", local file storage, local sign-in.
# Set GEMINI_API_KEY (Google AI Studio) to enable Gemini answers; without it offline fallbacks are used.
LOCAL_MODE = os.getenv("SAATHI_LOCAL") == "1"
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "")

PROJECT = os.getenv("GOOGLE_CLOUD_PROJECT", "aibuildergc")
GENAI_LOCATION = os.getenv("GENAI_LOCATION", "global")

# Models (all overridable per environment)
AGENT_MODEL = os.getenv("AGENT_MODEL", "gemini-3.8-flash")
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

FILES_BUCKET = os.getenv("FILES_BUCKET", "aibuildergc-saathi-files")
CRON_SECRET = os.getenv("CRON_SECRET", "dev-cron-secret")
ALLOWED_ORIGINS = [o.strip() for o in os.getenv("ALLOWED_ORIGINS", "http://localhost:3000").split(",") if o.strip()]

# Optional integrations (enabled when set)
DOCAI_PROCESSOR = os.getenv("DOCAI_PROCESSOR", "")  # Document AI OCR processor id
DOCAI_LOCATION = os.getenv("DOCAI_LOCATION", "asia-south1")
BQ_TABLE = os.getenv("BQ_TABLE", "")  # e.g. aibuildergc.saathi.assistant_events

COMPANY = os.getenv("COMPANY_NAME", "Shakti Rail Components")
# Optional allow-list of email domains for new accounts (comma-separated). Empty = anyone can sign up (demo mode).
SIGNUP_DOMAINS = {d.strip().lower() for d in os.getenv("SIGNUP_DOMAINS", "").split(",") if d.strip()}
TZ = ZoneInfo("Asia/Kolkata")

# ADK reads these to route Gemini calls (Vertex AI in the cloud, an AI Studio key in local mode)
if LOCAL_MODE:
    os.environ["GOOGLE_GENAI_USE_VERTEXAI"] = "FALSE"
    if GEMINI_API_KEY:
        os.environ["GOOGLE_API_KEY"] = GEMINI_API_KEY
else:
    os.environ.setdefault("GOOGLE_GENAI_USE_VERTEXAI", "TRUE")
    os.environ.setdefault("GOOGLE_CLOUD_PROJECT", PROJECT)
    os.environ.setdefault("GOOGLE_CLOUD_LOCATION", GENAI_LOCATION)

# Google connector (Calendar + Gmail, read-only). OAuth client JSON comes from Secret Manager (saathi-google-oauth),
# mounted as GOOGLE_OAUTH_CLIENT. Refresh tokens are encrypted with Cloud KMS before they're stored.
GOOGLE_OAUTH_CLIENT = os.getenv("GOOGLE_OAUTH_CLIENT", "")
KMS_KEY = os.getenv("KMS_KEY", f"projects/{PROJECT}/locations/asia-south1/keyRings/saathi/cryptoKeys/saathi-connectors")
PUBLIC_API_URL = os.getenv("PUBLIC_API_URL", "https://saathi-api-82398575445.asia-south1.run.app").rstrip("/")
WEB_URL = os.getenv("WEB_URL", "https://saathi-web-82398575445.asia-south1.run.app").rstrip("/")
