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
| Median answer latency (retrieval-first + streaming) | 3.8 s (first words 2.8 s) | ≤ 4 s |
| Spec Check comparator / certificate extraction | 20/20 · 2/2 | 100% |
| Saathi Research gold-gap recall · claims with a verified source · leaks | 5/5 + 4/4 · 100% · 0 | ≥ 80% · 100% · 0 |

Re-run with `uv run python -m eval.run_eval` and `uv run python -m eval.phase4_eval`, then `uv run python -m eval.export_web` to refresh the numbers shown on the landing page.

## Features

| Area | What it does |
| --- | --- |
| Ask Saathi | ADK agent (Gemini 3.8 Flash, low thinking level) with permission-scoped tools; retrieval-first (one model turn for most questions), answers stream as they're written; every claim cited as a clickable source chip; "How Saathi got this" under every answer |
| Saathi Research | Give a goal (e.g. *"Are we ready for the RDSO inspection on 20 Oct?"*): a planner proposes questions you can edit, research agents run in parallel (ADK `ParallelAgent`) over your permission-scoped tools, a verifying agent writes the report and code re-checks every citation; live progress; every gap becomes a task in one click; sharing checks each source against the chat's members. Templates: inspection readiness, vendor comparison, custom |
| Spec Check & Standards Library | Company specs, procedures and checklists indexed in **Agent Search**; Gemini extracts acceptance limits for QA approval. Every mill test certificate is checked automatically a few seconds after upload: Gemini reads the values, **code decides** pass/fail against the approved limits for the grade on the drawing's current revision (thickness bands, impact test temperature, units); a failure drafts the NCR |
| Catch-up | “Today / 3 days / This week” brief: decisions, asks for you, files, open promises |
| Promise capture | Commitments detected in any chat (English/Hinglish) → one-click tracked task → reminder via Cloud Scheduler |
| Tasks without apps | “Kal subah 10 baje … reminder” → drafted task the user confirms |
| Document intelligence | Document AI OCR + Gemini multimodal: drawing title blocks, revision tables, MTC values, OCR confidence |
| Workspaces & admin | Every account belongs to one workspace (invite → verified company domain → new workspace). Invites are personal links (emailed over SMTP, or copied / shared on WhatsApp) that only the invited address can accept; they expire after 14 days, beat the `SIGNUP_DOMAINS` allow-list, and move an account out of an empty solo workspace after the person confirms. Roles: owner, admin, member, guest (vendors see only invited channels). Admin console: members & roles, deactivate, invites, channel governance (no message access), workspace settings, audit log. Firestore rules enforce workspace + membership via token claims |
| Threads & push | Reply in thread (side panel, reply counts, followers notified), web push via Firebase Cloud Messaging + service worker (mentions, replies, DMs/chats per notification level, tasks, reminders; respects DND and quiet hours; click opens the message) |
| Messaging basics | Presence & status (available/busy/DND/away/offline, message + expiry), @mentions with notifications, per-chat notification levels + quiet hours, profile cards, settings, sign out everywhere |
| Work management | Tasks assignable to colleagues with watchers and status (to do / in progress / blocked / done); My Day home; meeting notes/transcripts → summary, decisions, action items → assigned tasks; Saathi tools `assign_task`, `who_owes` |
| Google connector | Settings → Connected apps: Google Calendar + Gmail, read-only. Server-side OAuth (one-time state), refresh tokens encrypted with Cloud KMS (`saathi/saathi-connectors`, asia-south1), client in Secret Manager (`saathi-google-oauth`). Today's meetings on My Day with "Prep me", join and notes; colleagues see "In a meeting" from free/busy only; email commitments → trackable tasks; Saathi tool `get_calendar`, emails searchable by their owner only; sync every 10 min (`saathi-sync` scheduler job); disconnect revokes and deletes synced data; admins can turn it off per workspace |
| Sign-in & accounts | Continue with Google (Firebase Auth SSO), email sign-up with password rules, password reset, first-run profile (name + job title); optional `SIGNUP_DOMAINS` allow-list for company domains |
| Channels | Create public or private channels, browse and join public ones, add/remove members, owners rename or delete; search index and file access follow membership instantly |
| Enterprise chat UX | Teams-style app rail, one list for chats and channels (Favorites · Channels · Chats) with Unread/Channels/Chats filters, unread markers, reactions, hover actions (add to tasks, ask Saathi), members & details panel, mobile bottom navigation |
| Chat tabs | Messages/Posts · Decisions (auto-logged timeline) · Files (extracted fields) |
| Privacy control | Per-chat “Hidden from AI” toggle removes the chat from the index |
| Insights | Personal 7-day view: tasks, overdue, promises, assistant usage, decisions |
| ⌘K palette | Jump to any chat or file, or send the query straight to Saathi |
| Audit | Every assistant question + tool call → Firestore audit log and BigQuery `saathi.assistant_events` |

## Architecture

```
web/   Next.js 16 on Cloud Run (saathi-web) — landing (/), sign-in (/login), sign-up (/signup), workspace (/app)
       Firebase Auth; Firestore real-time listeners (read-only via firestore.rules)
       Runtime config: read from env vars at request time and injected into the page (nothing baked in)
  │ REST + Firebase ID token
agent/ FastAPI + Google ADK on Cloud Run (saathi-api, asia-south1)
  ├─ Saathi agent: search_workspace, get_message_context, catch_up, lookup_document, propose_task, list_tasks
  ├─ Ingest: gemini-embedding-001 → Firestore vector index (members pre-filter);
  │          promise/decision detection (regex pre-filter → Gemini 3.5 Flash-Lite, JSON schema);
  │          Document AI OCR (asia-south1) + Gemini 3.8 Flash extraction
  ├─ Channels: /api/channels (create, browse, join), /api/chats/{id}/members, PATCH/DELETE /api/chats/{id}
  ├─ /api/insights, /api/chats/{id}/ai-exclude, /api/cron/reminders (Cloud Scheduler, secret from Secret Manager)
  ├─ Research API (/api/research …) and Spec Check / Standards API (/api/standards, /api/files/{id}/spec-check)
  └─ BigQuery streaming of assistant events
  │ Cloud Tasks (queues saathi-research, saathi-jobs: retries, rate limits, survives restarts)
saathi-worker  same image, private (Cloud Run IAM + OIDC), only the /tasks/* job routes:
  ├─ Saathi Research: ADK SequentialAgent[ ParallelAgent waves of researchers → verifying critic ]; progress → Firestore
  └─ Spec Check: certificate values (Gemini) vs approved limits (deterministic code); standards → Agent Search + limit extraction
Resilience: every agent model call retries (backoff + jitter, incl. dropped connections), then falls back to a second model;
            a research agent that still fails degrades to "unknown" instead of failing the report
Data: Firestore (hot data + vector index) + Cloud Storage + Document AI in asia-south1 (Mumbai);
      BigQuery saathi_archive.chunks (every chunk, VECTOR_SEARCH with query-time permissions) for deep research;
      Agent Search (global) for the workspace Standards Library; Firestore PITR (7 days), delete protection, daily backups (14 days)
```

## Configuration and secrets

No environment files or secrets are committed (`.env*` is git-ignored; only `web/.env.example` is tracked).

| Where | How |
| --- | --- |
| Web (local) | `cp web/.env.example web/.env.local` and fill in the Firebase web config + API URL |
| Web (Cloud Run) | `gcloud run deploy saathi-web --set-env-vars SAATHI_API_URL=…,FIREBASE_API_KEY=…,…` |
| API | Env vars on Cloud Run: `DOCAI_PROCESSOR`, `BQ_TABLE`, `ALLOWED_ORIGINS`, `SIGNUP_DOMAINS` (optional), model overrides (`AGENT_MODEL`, `AGENT_FALLBACK_MODEL`, `FAST_MODEL`, `VISION_MODEL`, `AGENT_THINKING`); jobs: `SAATHI_ROLE` (api/worker), `TASKS_MODE=cloudtasks`, `WORKER_URL` (set by CI) |
| Invite email (optional) | Env vars on saathi-api: `SMTP_HOST`, `SMTP_PORT` (587 STARTTLS or 465), `SMTP_USER`, `MAIL_FROM` (e.g. `Saathi <invites@yourdomain>`); password in Secret Manager `saathi-smtp-password`, mounted as `SMTP_PASSWORD`. Any SMTP provider works (Google Workspace/Gmail app password, SendGrid, Brevo). Without `SMTP_HOST` invites still work: admins copy the personal link or share it on WhatsApp |
| Cron secret | Secret Manager `saathi-cron-secret`, mounted as `CRON_SECRET` |
| Google OAuth client | Secret Manager `saathi-google-oauth` (asia-south1), mounted as `GOOGLE_OAUTH_CLIENT`. Redirect URI `…/api/connectors/google/callback`. Consent screen in Testing: add each user as a test user |

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

## Deploy (CI/CD)

Merging to `main` deploys automatically through GitHub Actions (`.github/workflows/ci-cd.yml`):

1. Open a pull request into `main`. CI builds and type-checks `web/` and installs and compiles `agent/` (only the folders the PR touches).
2. Merge it. The push to `main` re-runs the checks, then deploys only what changed: `firestore.rules` → Firestore security rules (first), `agent/**` → **saathi-api**, `web/**` → **saathi-web** (API first when both change), followed by a health check.
3. Watch it under **Actions** or **Deployments → production** on GitHub. Each Cloud Run revision is labelled with the commit SHA.

To redeploy without a code change: **Actions → CI/CD → Run workflow** (choose api, web or both) on `main`.

Auth is keyless: GitHub OIDC → Workload Identity Federation (pool `github`, provider `saathi-repo`) → service account `github-deployer`. The provider only trusts workflows from `ojha-436/Saathi` running on `refs/heads/main`, so branches and forks can't deploy. Deploys keep the existing Cloud Run env vars and secrets; change those with `gcloud run services update`.

Manual deploy (fallback):

```bash
cd agent && gcloud run deploy saathi-api --source . --region asia-south1
cd web   && gcloud run deploy saathi-web --source . --region asia-south1
```

## Team split

| Person A — frontend & demo | Person B — AI & backend |
| --- | --- |
| `web/` landing, workspace UX, accessibility | `agent/app/agent.py` tools and prompts, `agent/eval` |
| Insights, palette, chat tabs | Ingest pipeline, Document AI, BigQuery |
| Demo video and deck | Latency work (target < 5 s) |
