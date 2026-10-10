import os
from zoneinfo import ZoneInfo

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

# ADK reads these to route Gemini calls through Vertex AI
os.environ.setdefault("GOOGLE_GENAI_USE_VERTEXAI", "TRUE")
os.environ.setdefault("GOOGLE_CLOUD_PROJECT", PROJECT)
os.environ.setdefault("GOOGLE_CLOUD_LOCATION", GENAI_LOCATION)
