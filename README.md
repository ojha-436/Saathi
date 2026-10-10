# Saathi — the AI workspace that remembers

Team chat with a personal AI colleague built in. Saathi **finds any chat or file with a cited source**, **briefs you on what you missed**, and **turns promises made in conversation into tracked tasks and reminders**, with no bots to install. Built for the Google Cloud AI Builder Cup 2026 (Future of Work & Enterprise Productivity), with a Manufacturing Pack that reads engineering drawings, certificates and inspection reports.

- **Live app:** https://saathi-web-82398575445.asia-south1.run.app (landing → *Open live demo* → pick a colleague)
- **API health:** https://saathi-api-82398575445.asia-south1.run.app/health

## Evaluation (`agent/eval`)

| Metric | Result | Target |
| --- | --- | --- |
| Retrieval accuracy (answer cites the correct source) | 10/10 | ≥ 8/10 |
| Permission leaks (adversarial questions) | 0 | 0 |
| Plain-language task parsing (date + hour, English & Hinglish) | 4/4 | — |
| Promise detection precision / recall (20 labelled messages) | 1.0 / 1.0 | ≥ 0.80 precision |
| Median answer latency | 7.0 s | < 5 s (not yet met) |

Re-run with `uv run python -m eval.run_eval`, then `uv run python -m eval.export_web` to refresh the numbers shown on the landing page.

## Features

| Area | What it does |
| --- | --- |
| Ask Saathi | ADK agent (Gemini 3 Flash) with 6 permission-scoped tools; every claim cited as a clickable source chip |
| Catch-up | “Today / 3 days / This week” brief: decisions, asks for you, files, open promises |
| Promise capture | Commitments detected in any chat (English/Hinglish) → one-click tracked task → reminder via Cloud Scheduler |
| Tasks without apps | “Kal subah 10 baje … reminder” → drafted task the user confirms |
| Document intelligence | Document AI OCR + Gemini multimodal: drawing title blocks, revision tables, MTC values, OCR confidence |
| Chat tabs | Messages · Decisions (auto-logged timeline) · Files (extracted fields) |
| Privacy control | Per-chat “Hidden from AI” toggle removes the chat from the index |
| Insights | Personal 7-day view: tasks, overdue, promises, assistant usage, decisions |
| ⌘K palette | Jump to any chat or file, or send the query straight to Saathi |
| Audit | Every assistant question + tool call → Firestore audit log and BigQuery `saathi.assistant_events` |

## Architecture

```
web/   Next.js 16 on Cloud Run (saathi-web) — landing (/), sign-in (/login), workspace (/app)
       Firebase Auth; Firestore real-time listeners (read-only via firestore.rules)
       Runtime config: read from env vars at request time and injected into the page (nothing baked in)
  │ REST + Firebase ID token
agent/ FastAPI + Google ADK on Cloud Run (saathi-api, asia-south1)
  ├─ Saathi agent: search_workspace, get_message_context, catch_up, lookup_document, propose_task, list_tasks
  ├─ Ingest: gemini-embedding-001 → Firestore vector index (members pre-filter);
  │          promise/decision detection (regex pre-filter → Gemini 2.5 Flash-Lite, JSON schema);
  │          Document AI OCR (asia-south1) + Gemini 2.5 Flash extraction
  ├─ /api/insights, /api/chats/{id}/ai-exclude, /api/cron/reminders (Cloud Scheduler, secret from Secret Manager)
  └─ BigQuery streaming of assistant events
Data: Firestore + Cloud Storage + Document AI in asia-south1 (Mumbai)
```

## Configuration and secrets

No environment files or secrets are committed (`.env*` is git-ignored; only `web/.env.example` is tracked).

| Where | How |
| --- | --- |
| Web (local) | `cp web/.env.example web/.env.local` and fill in the Firebase web config + API URL |
| Web (Cloud Run) | `gcloud run deploy saathi-web --set-env-vars SAATHI_API_URL=…,FIREBASE_API_KEY=…,…` |
| API | Env vars on Cloud Run: `DOCAI_PROCESSOR`, `BQ_TABLE`, `ALLOWED_ORIGINS`, model overrides (`AGENT_MODEL`, …) |
| Cron secret | Secret Manager `saathi-cron-secret`, mounted as `CRON_SECRET` |

## Run locally

```bash
gcloud auth application-default login && gcloud auth application-default set-quota-project aibuildergc
cd agent && uv sync && uv run uvicorn app.main:app --port 8080
cd web && npm install && npm run dev          # http://localhost:3000
```

## Demo data

```bash
cd agent
uv run python seed/make_pdfs.py   # synthetic PDFs (drawings Rev B/C/D, MTC, quote, inspection report)
uv run python -m seed.seed        # full rebuild (wipes the workspace!)
uv run python -m seed.reset       # fast reset: clears assistant chats, tasks, alerts and messages added after seeding
```

## Deploy

```bash
cd agent && gcloud run deploy saathi-api --source . --region asia-south1   # keeps existing env vars and secrets
cd web   && gcloud run deploy saathi-web --source . --region asia-south1   # keeps existing env vars
```

## Team split

| Person A — frontend & demo | Person B — AI & backend |
| --- | --- |
| `web/` landing, workspace UX, accessibility | `agent/app/agent.py` tools and prompts, `agent/eval` |
| Insights, palette, chat tabs | Ingest pipeline, Document AI, BigQuery |
| Demo video and deck | Latency work (target < 5 s) |
