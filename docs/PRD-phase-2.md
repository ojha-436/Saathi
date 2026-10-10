# Saathi — Phase 2 PRD: Enterprise foundation, everyday workflows and connected workspace

| | |
|---|---|
| **Status** | Draft for review · 2026-10-10 |
| **Owners** | Person A (web, UX, demo) · Person B (API, AI, integrations) |
| **Hard deadline** | Prototype submission **2026-10-18** (deck + deployed app + ≤3 min video) · Internal P0 freeze **2026-10-15** |
| **Phase 1 PRD** | [Saathi PRD (Claude Doc)](https://claude.ai/code/artifact/26d14e21-a4a9-44d6-89a8-29b962c95bec) |
| **Builds on** | `main` @ `ba31202`: channels, Teams-style UI, Google SSO sign-up, Gemini 3.8 Flash, CI/CD |

---

## 1. Problem statement

Saathi already finds anything in chats and files, briefs people on what they missed and turns promises in chat into tracked tasks. But work at a manufacturer like Shakti Rail doesn't happen only in chat. Commitments are made in **meetings** (RDSO reviews, vendor calls) and in **email** (POs, dispatch confirmations), and documents live in **Drive/OneDrive**. Today those promises fall through the cracks, and Saathi can't see them.

Saathi is also not yet safe to run for more than one company. Anyone who signs up joins the same workspace. They can read the full people directory and join any public channel, and there are no roles, admin controls or organisation boundary. And it is missing the basics people expect from Teams or Google Chat in the first minute: presence/status, @mentions, notification controls, assignable tasks. Without them, the app feels like a demo rather than a tool.

**Cost of not solving it:** promises made outside chat stay invisible, which is the core value proposition. The product can't be piloted by a second company. It is also judged against Teams/Google Chat basics that it lacks: UX is 10% of the score, and table stakes affect the impression of everything else.

## 2. Goals

| # | Goal | Type | Measure |
|---|---|---|---|
| G1 | **Every commitment, wherever it was made, becomes a tracked task.** Meetings and email feed the same promise pipeline as chat. | User | ≥ 70% of action items in a demo meeting transcript and ≥ 80% of explicit commitments in a demo email thread become proposed tasks with the correct owner and due date (eval set, see §8) |
| G2 | **Start the day in one place.** "My Day" replaces checking calendar, inbox, chat and to-do list separately. | User | A user can answer "what do I owe today, what is owed to me, which meetings need prep" in **< 30 s** from opening the app (moderated test, 3/3 participants) |
| G3 | **Tenant isolation is a guarantee, not a convention.** | Business / security | **0** cross-organisation leaks across an adversarial eval (directory, channels, search, files, assistant, connector data); security rules unit tests pass in CI |
| G4 | **Feels like an enterprise messenger.** | User | All P0 basics in §5B present; a first-time user completes "set status → mention a colleague → assign them a task → mute a channel" without help |
| G5 | **Keep the assistant fast as data sources grow.** | Quality | Median assistant latency stays **≤ 7.5 s** (today 7.2 s) and retrieval accuracy stays **≥ 9/10** with email and meeting sources added |

## 3. Non-goals (Phase 2)

| Non-goal | Why |
|---|---|
| **Voice/video calling inside Saathi** | Teams/Meet/Zoom already do this well; Saathi's value is *after* the call (summary, promises). We integrate rather than rebuild. |
| **Sending email or posting into Teams/Zoom on the user's behalf** | Write scopes double the OAuth risk and the blast radius of prompt injection. Phase 2 is **read-only** for external systems; the user copies or clicks through. |
| **Full SAML/OIDC enterprise SSO per tenant, SCIM provisioning** | Needs Identity Platform multi-tenancy and customer IdPs we can't test before 10-18. Designed for (P2), not built. |
| **Mobile native apps / offline mode** | The responsive web app plus web push covers the pilot; native is a separate initiative. |
| **Microsoft Graph and Zoom connectors in the hackathon build** | One ecosystem done deeply beats three done shallowly. The connector framework is built so they plug in next (Phase 3). |
| **End-to-end encryption of messages** | It's incompatible with server-side AI indexing, which is the product. We offer encryption at rest, residency and a per-chat "Hidden from AI" control instead. |

## 4. Personas

- **Prince, design engineer (core user):** lives in chats and drawing revisions, attends 3–4 meetings a day, makes and receives many promises.
- **Rahul, procurement lead:** heavy email user (vendors, POs); needs vendor commitments tracked without forwarding everything into chat.
- **Kavya, project manager:** runs channels and meetings, assigns work, needs to see who owes what across the project.
- **Org admin (IT/Quality head):** controls who can join, which integrations are allowed, retention, and audit.
- **Guest (vendor contact, e.g. Om Castings):** invited to one channel only; must never see anything else.

## 5. User stories

### A. Enterprise foundation and security
1. As an **org admin**, I want everyone who signs up with `@shaktirail.in` to land in our organisation automatically, and everyone else to be refused or sent to their own org, so that our directory and channels are never visible to outsiders.
2. As an **org admin**, I want to assign roles (owner, admin, member, guest) and deactivate a leaver so that access ends the moment someone leaves.
3. As an **org admin**, I want to choose which integrations are allowed and whether AI features are on, so that I meet company policy.
4. As an **org admin**, I want an audit log of sign-ins, role changes, channel deletions, exports and assistant queries so that I can answer "who accessed what".
5. As a **channel owner**, I want to invite a **vendor guest** into one channel so that we can collaborate without exposing anything else.
6. As a **guest**, I see only the channels I was invited to; the directory, browse channels and the assistant's search stay scoped to those channels.
7. As any **user**, I want to sign out of all my sessions from settings so that a lost laptop isn't a risk.

### B. Messaging basics
8. As a **user**, I want to set my status (Available, Busy, Do not disturb, Away, Appear offline) with an optional message and expiry ("In RDSO review until 4 pm") so that colleagues know when to expect a reply.
9. As a **user**, I want my status to switch to *In a meeting* automatically while a calendar event is running, if I connected my calendar, so that I don't have to remember.
10. As a **user**, I want to @mention a colleague (or `@channel`) so that they're notified even if they've muted the channel.
11. As a **user**, I want to set per-chat notifications (All, Mentions only, Off) and quiet hours so that busy channels don't drown out what matters.
12. As a **user**, I want browser/phone push notifications for mentions, DMs, assigned tasks and reminders so that I don't need the tab open.
13. As a **user**, I want to edit or delete my own message so that I can fix mistakes; others see "edited", and a deleted message disappears from search and from Saathi's answers.
14. As a **user**, I want to reply in a thread so that side discussions don't bury the main conversation.
15. As a **user**, I want a profile with photo, title, department, phone, location and local time, and to see a colleague's profile card on click, so that I know who I'm talking to.

### C. Everyday workflows
16. As a **project manager**, I want to turn a message or a detected promise into a task **assigned to the person who made it**, with me as watcher, so that the commitment has an owner and I'm kept informed.
17. As an **assignee**, I want to see "Assigned to me", update status (To do, In progress, Blocked, Done) and get a nudge before the due time, so that nothing slips.
18. As a **user**, I want a **My Day** home: today's meetings with prep briefs, tasks due, promises owed to me, unread mentions and a morning digest, so that I can plan my day in one look.
19. As a **user**, I want to ask Saathi "what does Rahul owe me this week?" or "prep me for my 3 pm" and get a cited answer.

### D. Connected workspace (integrations)
20. As a **user**, I want to connect my Google account once (Calendar, Meet, Gmail, Drive) and see exactly what Saathi can read, with one-click disconnect, so that I stay in control.
21. As a **user**, after a Google Meet call I want a summary, decisions and action items with owners posted to me (and optionally to the linked channel), with each action item one click from becoming a task.
22. As a **procurement lead**, I want Saathi to spot commitments in my email ("we will dispatch on 15th") and propose follow-up tasks, without forwarding mail into chat.
23. As a **user**, when someone shares a Drive link in a channel I want Saathi to read the doc (if I have access) and answer questions about it with citations.
24. As a **user**, I want each meeting's prep brief to list related chats, files, open tasks and promises involving the attendees, so that I walk in prepared.
25. **Edge cases:**
    - Disconnecting an account deletes its indexed content within 5 minutes.
    - An expired or revoked token shows "Reconnect Google" rather than failing silently.
    - An email that contains instructions ("ignore previous instructions…") is treated as data.
    - A Drive doc the viewer can't open is never summarised for them.

## 6. Requirements

Effort: **S** ≤ ½ day · **M** ≈ 1 day · **L** ≈ 2 days (2 people, 8 days).

### 6A. Enterprise foundation and security

| ID | Pri | Requirement | Acceptance criteria | Effort |
|---|---|---|---|---|
| A1 | **P0** | **Organisations (tenancy).** New `orgs/{org_id}` collection with name, verified domains, settings. Every tenant-scoped document gets `org_id`: users, chats, files, tasks, notifications, chunks, audit_log, external items. | ☐ Sign-up with a domain listed on an org joins that org as member. ☐ Other domains create a new org (signer becomes owner) or are refused if `SIGNUP_DOMAINS` policy says so. ☐ Backfill script puts all existing data in org `shakti-rail` with no data loss (dry-run mode first). ☐ No API returns a document whose `org_id` differs from the caller's. | L |
| A2 | **P0** | **Custom claims for org + role.** The API sets Firebase custom claims `{org_id, role}` on join or role change and revokes refresh tokens on change. | ☐ `firestore.rules` checks `request.auth.token.org_id == resource.data.org_id` on every tenant collection (no `get()` reads needed). ☐ Role change takes effect on the next token refresh (≤ 1 h) or immediately after forced revoke. | M |
| A3 | **P0** | **Firestore rules hardening + rules tests in CI.** `users` readable only within the same org. Guests read only their own profile and the members of their channels. | ☐ `@firebase/rules-unit-testing` suite runs in the `check-web` job against the emulator. ☐ Covers: cross-org read of users/chats/messages/files/tasks denied; guest cannot list org users; removed member loses read. | M |
| A4 | **P0** | **Roles:** owner, admin, member, guest. Guests can't browse channels, can't create channels or DMs with non-channel members, and the assistant only searches their channels. | ☐ Search, `lookup_document` and catch-up return guest-visible content only (adversarial eval, §8). ☐ Guest badge shown next to their name everywhere. | M |
| A5 | **P0** | **Security baseline:** security headers on web (CSP, HSTS, `X-Frame-Options: DENY`, `Referrer-Policy`, `Permissions-Policy`); upload allow-list (PDF, PNG/JPEG/WebP, DOCX, XLSX, VTT/TXT transcripts) enforced on the **server**; per-user rate limits on assistant (20/min), uploads (10/min), sign-up and invites; `verify_id_token(check_revoked=True)` on admin and security endpoints. | ☐ securityheaders.com grade ≥ A. ☐ Uploading `.exe`/`.html` returns 415. ☐ 21st assistant call in a minute returns 429 with a friendly message. | M |
| A6 | **P0** | **Audit log v2:** extend `audit_log` to security events (sign-in, role change, deactivate, invite, channel create/delete, connector connect/disconnect, export). Stream to BigQuery (existing `saathi` dataset). | ☐ Each event has actor, org_id, action, target, ip/user-agent and ts. ☐ Admin can filter by user and action for the last 30 days. | S |
| A7 | **P1** | **Admin console** (`/app/admin`, owner/admin only): members and roles, deactivate (Firebase disable + revoke + remove from channels), invite by email, verified domains, integration allow-list, org-wide AI on/off, audit viewer. | ☐ A deactivated user's next API call returns 401, and they disappear from pickers. ☐ Turning an integration off disconnects all users' connections for it. | L |
| A8 | **P1** | **Email verification** required for password sign-ups before joining an org with verified domains; **"Sign out everywhere"** in settings. | ☐ An unverified user sees "Check your inbox"; the API returns 403 until verified. | S |
| A9 | **P1** | **Firebase App Check** (reCAPTCHA Enterprise) on web, enforced by the API. | ☐ Requests without a valid App Check token are rejected (monitor mode first, then enforce). | S |
| A10 | **P1** | **Data residency for AI:** move Gemini calls from `GENAI_LOCATION=global` to a regional endpoint (asia-south1, or the nearest region where the models are served) for orgs that require it. | ☐ Org setting `ai_region`, documented in the security note; eval re-run on the regional endpoint. | S |
| A11 | **P2** | Identity Platform upgrade: TOTP MFA, SAML/OIDC per org (Identity Platform tenants), SCIM, retention policies with legal hold, data export (DSAR). | Design note only. Org IDs must map 1:1 to Identity Platform tenants later. | — |

### 6B. Messaging basics

| ID | Pri | Requirement | Acceptance criteria | Effort |
|---|---|---|---|---|
| B1 | **P0** | **Profile:** photo (upload or Google picture), name, title, department, phone, location, timezone; profile card on avatar click (status, local time, "Message", "View shared files"). Builds on the existing `ProfileDialog` and `POST /api/me/profile`. | ☐ Edits appear for colleagues within 5 s (Firestore listener). ☐ Photos ≤ 2 MB, image types only, stored in GCS and served through the API. | M |
| B2 | **P0** | **Presence and status:** manual `available / busy / dnd / away / offline-appearing` plus status text and expiry ("Clear after: 30 min, 1 h, today, this week"). Automatic **Away** after 10 min of inactivity (client heartbeat `POST /api/presence` every 60 s; `last_active`), **In a meeting** from the calendar (D-series). | ☐ Status dot on avatars in the chat list, chat header, mentions picker and profile card. ☐ Expired status reverts to Available (checked by the existing per-minute scheduler). ☐ DND suppresses push except for P0 alerts the user chose to allow. | M |
| B3 | **P0** | **@mentions:** composer picker (people in the chat, `@channel` for owners/admins), `mentions: [uid]` stored on the message, mention highlight, Activity entry. | ☐ A mention notifies even if the chat is set to "Mentions only". ☐ Mentioning a non-member offers "Add to channel?". | M |
| B4 | **P0** | **Notification preferences:** per chat `all / mentions / off` (default: DMs all, channels mentions); global quiet hours; Activity feed shows mentions, assignments, reminders and connector summaries. Stored in a **private** `user_settings/{uid}` document (not on the shared chat doc). | ☐ Muted channels show no unread badge in the rail, only a subtle dot. ☐ Preferences survive reload and apply on every device. | M |
| B5 | **P1** | **Web push** via Firebase Cloud Messaging (service worker); tokens in `user_settings/{uid}.push_tokens`; respects B2 (DND) and B4 (preferences). | ☐ A mention while the tab is closed raises an OS notification within 10 s; clicking it opens the message. | M |
| B6 | **P1** | **Edit and delete own messages** (edit window 24 h; delete any time). Re-index or remove the chunk; re-run promise and decision detection on edit; tombstone "Message deleted". | ☐ After delete, the assistant can't cite the message (eval check). ☐ Audit entry for deletes in channels. | S |
| B7 | **P1** | **Threads:** reply in thread (`parent_id`, `reply_count`, `last_reply_ts` on the root), thread side panel, "Also send to channel". | ☐ Thread replies are indexed with `ref msg:chat/reply`; the citation opens the thread panel. | M |
| B8 | **P2** | Pinned messages, bookmarks/saved items, message search filters (from:, in:, has:file), read receipts in DMs, custom emoji, file previews. | — | — |

### 6C. Everyday workflows

| ID | Pri | Requirement | Acceptance criteria | Effort |
|---|---|---|---|---|
| C1 | **P0** | **Assignable tasks.** Extend `tasks`: `creator`, `assignee`, `watchers[]`, `participants[]` (used by rules and queries), `status` (`todo / in_progress / blocked / done / dismissed`), `priority`, `chat_id`, `source_ref`. The existing `owner` field maps to `assignee` (backfill). | ☐ Firestore rule: readable if `uid in participants`. ☐ Assignee gets an Activity entry plus push. ☐ The promise chip offers **Assign to {committer}** when the committer is a member (creator becomes watcher). ☐ Message action "Add to my tasks" becomes "Create task…" with an assignee picker. | M |
| C2 | **P0** | **Tasks views:** Assigned to me · Delegated (created by me, assigned to others) · Watching · per-chat **Tasks** tab next to Decisions and Files. | ☐ Overdue items sort first in each view. ☐ Status changes post a system line in the source chat ("Rahul marked 'Send PO' done"). | M |
| C3 | **P0** | **My Day** home (new default view): greeting, morning brief, *Today's meetings* (with "Prep me" per event once Calendar is connected), *Due today / overdue*, *Owed to me* (open tasks I created or watch, assigned to others), *Unread mentions*. | ☐ Empty states teach the next action (connect Calendar, set a reminder). ☐ Loads in < 1.5 s using existing listeners plus one `/api/my-day` call. | M |
| C4 | **P0** | **Assistant tools for workflows:** `assign_task` (proposes, user confirms; same pattern as `propose_task`), `get_my_day`, `who_owes(person?, range)`. | ☐ "Rahul ko PO bhejne ka task assign karo Friday tak" → proposed task assigned to Rahul with the correct due date (Hinglish case added to the eval). | M |
| C5 | **P1** | **Morning digest** at the user's chosen time (Cloud Scheduler → `/api/cron/digest`, 15-min granularity), delivered to Activity and push. | ☐ Skipped on weekends and holidays if the user chooses. ☐ Respects DND. | S |
| C6 | **P1** | **Recurring reminders** (daily, weekly) and **snooze** (1 h, tomorrow). | — | S |
| C7 | **P2** | Task comments and attachments, Kanban per channel, dependencies, export to Google Tasks / Microsoft To Do. | — | — |

### 6D. Connected workspace

**Design principle.** Every external source becomes **normalized items**. Those items flow through the **same pipeline as chat**: chunk + embed into `chunks` (permission field `members`), then `classify_signals`, then **proposed** tasks the user confirms. The agent gets one new citation family, and nothing in search or permissions has to be reinvented.

| ID | Pri | Requirement | Acceptance criteria | Effort |
|---|---|---|---|---|
| D1 | **P0** | **Connector framework** (`agent/app/connectors/`): a provider interface `auth_url()`, `exchange(code)`, `refresh()`, `sync(uid, since) -> list[Item]`, `revoke()`. `Item = {provider, kind (event/meeting/email/file), external_id, title, text, participants, ts, url, acl}`. Connection records in `connections/{uid}_{provider}` hold scopes, status, last_sync and error. **Refresh tokens are envelope-encrypted with Cloud KMS** (key `saathi-connectors`, asia-south1); the browser can never read the collection (rules deny). OAuth client secrets live in Secret Manager. | ☐ Settings → Connected apps lists each provider with scopes in plain language, last sync, Disconnect. ☐ Disconnect revokes at the provider, deletes the connection, items and chunks (≤ 5 min), and writes an audit entry. ☐ Org allow-list (A7) respected. | L |
| D2 | **P0** | **Sync scheduling:** Cloud Scheduler `saathi-sync` every 10 min → `/api/cron/sync` (cron secret, like reminders) → fan out per active connection (Cloud Tasks queue `saathi-sync` in P1; sequential with a time budget in P0). Incremental cursors (Calendar `syncToken`, Gmail `historyId`, Drive `changes.pageToken`). | ☐ Re-running sync creates no duplicates (idempotent on `provider + external_id`). ☐ A token error marks the connection `needs_reauth` and shows a banner, without crashing the batch. | M |
| D3 | **P0** | **Google Calendar (read):** next 14 days of events with attendees mapped to Saathi users by email. Drives My Day meetings, auto "In a meeting" status (B2) and **meeting prep** (agent tool `prep_meeting(event_id)`: related chats, files, open tasks and promises involving the attendees, cited). | ☐ The "Prep me" brief cites ≥ 1 relevant source for 3/3 demo meetings. ☐ Private events show only "Busy". | M |
| D4 | **P0** | **Meeting summaries (Google Meet):** after an event ends, fetch the transcript (Meet REST API `conferenceRecords.transcripts` for Workspace accounts, or the "Notes by Gemini"/transcript Doc in Drive). **Fallback for any platform: upload a transcript (.vtt/.txt/.docx) or paste notes on the event.** Gemini 3.8 Flash produces a summary, decisions and action items with owner and due date; action items become **proposed** tasks for the right assignee (C1), and the summary can be posted to a linked channel. | ☐ Eval: on 3 labelled transcripts, ≥ 70% of action items found with the right owner (G1). ☐ Nothing is posted to a channel without the organiser's click. ☐ Works on the demo with the upload fallback even if the Meet API is unavailable. | L |
| D5 | **P0** | **Gmail (read-only, `gmail.readonly`):** sync threads from the last 14 days, filtered to Inbox/Sent and excluding Promotions/Social. Run commitment detection on vendor/colleague threads and propose follow-up tasks (source_ref `mail:{id}`, "Open in Gmail" link). Email chunks are indexed with `members=[uid]` only, so only the connecting user can ever retrieve them. | ☐ G1 email target on the labelled set. ☐ The adversarial eval confirms another user can't retrieve the email through search or the assistant. ☐ An injected instruction in an email body doesn't change agent behaviour (prompt-injection test cases). | M |
| D6 | **P1** | **Google Drive:** when a Drive/Docs link is shared in a chat, the connecting user's token fetches the file (export to text/PDF) and runs the existing Document AI and Gemini extraction. **Index only for members who have Drive access** (check the file's permissions: anyone-in-domain, or each member's email) and store `acl` on the item. Also offer "Attach from Drive" in the composer (Google Picker). | ☐ A member without Drive access sees the link card but gets "You don't have access in Drive" from the assistant. | M |
| D7 | **P1** | **Agent citations for external sources:** `[mail:id]`, `[meet:id]`, `[event:id]`, `[drive:id]` render as source chips (provider icon) and open the original in a new tab. | ☐ The citation chip shows provider, title and date. | S |
| D8 | **P2 (Phase 3)** | **Microsoft 365 via Graph** (one Entra multi-tenant app): Outlook mail + calendar (`Mail.Read`, `Calendars.Read`), **Teams meeting transcripts** (`OnlineMeetingTranscript.Read.All`, *admin consent*), OneDrive/SharePoint files (`Files.Read`). Same interface as D1; MSAL token flow. | Spike only: auth + calendar list behind a feature flag. | — |
| D9 | **P2 (Phase 3)** | **Zoom:** Zoom Marketplace OAuth app (user-level), cloud recording transcripts (`recording:read`), meeting list. | — | — |
| D10 | **P2** | Write actions with explicit confirmation (send email reply draft, create calendar event, post a summary to Teams), deep links from Gmail/Outlook add-ons. | — | — |

## 7. Architecture alignment

Nothing in Phase 2 replaces a Phase 1 component. Each change extends an existing one.

| Concern | Phase 1 today | Phase 2 change |
|---|---|---|
| Web | Next.js 16 on Cloud Run (`saathi-web`), runtime config injection, Firestore read-only listeners | New views: My Day, Settings (Profile, Status, Notifications, Connected apps, Security), Admin. FCM service worker. Security headers in `next.config.ts`. |
| API | FastAPI + ADK on Cloud Run (`saathi-api`); every write goes through it | New routers: `/api/orgs`, `/api/admin/*`, `/api/presence`, `/api/settings`, `/api/tasks` v2, `/api/connectors/{provider}/{auth,callback,disconnect}`, `/api/cron/{sync,digest}`. Package `app/connectors/{google,microsoft,zoom}.py`. |
| Auth | Firebase Auth (email/password, Google) | + custom claims `{org_id, role}`, email verification, revoke; Identity Platform upgrade path for MFA/SAML (P2). Google sign-in and Google connector consent are **separate** (incremental scopes): signing in never grants Gmail access. |
| Data | Firestore: users, chats/messages, files, tasks, notifications, assistant, chunks (vector index, `members` pre-filter), audit_log | + `orgs`, `user_settings` (private), `connections` (server-only), `external_items`; `org_id` on all tenant docs; tasks v2 fields. The vector query keeps the `members array_contains uid` pre-filter. Personal sources use `members=[uid]`, so **retrieval permissions need no new mechanism**. |
| AI | Gemini 3.8 Flash agent (low thinking), 3.5 Flash-Lite signals, Document AI OCR, `gemini-embedding-001` | + tools `assign_task`, `get_my_day`, `who_owes`, `prep_meeting`, `summarize_meeting`. Long-context meeting summarisation on 3.8 Flash. Embedding model unchanged (a migration to `gemini-embedding-2` needs a re-index script that doesn't reset promise state, tracked separately). |
| Jobs | Cloud Scheduler `saathi-reminders` every minute | + `saathi-sync` (10 min), `saathi-digest` (15 min); Cloud Tasks queue for per-user sync (P1). Status expiry folded into the reminders job. |
| Secrets & keys | Secret Manager (`saathi-cron-secret`) | + OAuth client secrets (Google, later Microsoft and Zoom) in Secret Manager; **Cloud KMS** key ring `saathi` / key `saathi-connectors` for refresh tokens. |
| Analytics | BigQuery `saathi.assistant_events` | + `saathi.security_events`, `saathi.product_events` (status set, mention, task assigned, connector synced). |
| CI/CD | GitHub Actions + WIF → Cloud Run, per-folder deploys | + Firestore rules unit tests (emulator) in CI; `firebase deploy --only firestore:rules,firestore:indexes` step (the `github-deployer` SA needs `roles/firebaserules.admin` and `roles/datastore.indexAdmin`). |
| Residency | Firestore, GCS, Document AI in asia-south1; Gemini via `global` | Connector data stays in asia-south1; regional Gemini endpoint option (A10). |

**Invariants every PR must keep:**
1. The browser never writes Firestore directly.
2. Every query filters by `org_id` *and* membership/participants.
3. External content is data, never instructions; the agent never acts externally without a user click.
4. Every new collection gets rules **and** a rules test.

## 8. Success metrics

| Metric | Type | Target (success / stretch) | How measured |
|---|---|---|---|
| Commitments captured from meetings | Leading | 70% / 85% of labelled action items, correct owner | `eval/run_eval.py` new section: 3 transcripts |
| Commitments captured from email | Leading | 80% / 90%, precision ≥ 0.8 | 20 labelled emails (EN + Hinglish) |
| Cross-org / guest leaks | Guardrail | 0 | Adversarial eval (directory, channels, search, files, assistant, mail) + rules tests in CI |
| Prompt-injection resistance | Guardrail | 0 tool calls caused by injected instructions | 5 malicious email/doc fixtures |
| Assistant latency (median) | Guardrail | ≤ 7.5 s / ≤ 5 s | BigQuery `assistant_events.latency_ms` |
| Activation: status set or mention sent in first session | Leading | 60% of new users | `product_events` |
| Connector adoption | Leading | 50% of active pilot users connect Google within 7 days | `connections` count |
| Tasks assigned to others per active user per week | Lagging | ≥ 3 | `tasks` where `creator != assignee` |
| Overdue rate of tracked promises | Lagging | ↓ 30% after 4 weeks of pilot | `tasks` overdue/open ratio |

## 9. Open questions

| # | Question | Owner | Blocking? |
|---|---|---|---|
| Q1 | Our test Google accounts are consumer `@gmail.com`; the **Meet transcripts API needs a Workspace edition with transcripts on**. Do we have a Workspace tenant for the demo, or do we demo D4 with the upload / Drive-notes fallback? | Stakeholder | **Yes, by 10-12** |
| Q2 | `gmail.readonly` and Drive are **restricted/sensitive scopes**. In *Testing* mode the consent screen is limited to 100 named test users and shows "unverified app". Acceptable for judging (add the judges' emails as test users)? Verification starts after the hackathon. | Stakeholder / legal | **Yes, by 10-12** |
| Q3 | Default policy for unknown domains after A1: create a new org (self-serve) or refuse (invite-only)? It affects the judging flow. | Product | Yes |
| Q4 | Should meeting summaries post to a channel automatically when an event is linked to one, or always need the organiser's confirmation? (Draft: always confirm.) | Product / design | No |
| Q5 | Retention for connector data (emails, transcripts): 30 / 90 days / follow the org policy? | Legal | No |
| Q6 | Gemini regional availability in or near asia-south1 for 3.8 Flash and 3.5 Flash-Lite (A10). | Engineering | No |
| Q7 | Presence on Firestore has no `onDisconnect`. Is heartbeat plus a 10-min away rule enough, or do we add Realtime Database presence? (Draft: heartbeat is enough for the pilot.) | Engineering | No |

## 10. Timeline and phasing

Today is 2026-10-10. The P0 freeze is **10-15**, and **10-16 → 10-18** is for eval, the deck and the video. Two people, in parallel tracks:

| Days | Person A (web / UX) | Person B (API / AI / integrations) |
|---|---|---|
| **10-11 → 10-12** | B1 profile + profile card, B2 status UI, B4 notification settings page | A1 orgs + backfill script (dry run first), A2 custom claims, A3 rules + emulator tests in CI |
| **10-13** | C1/C2 task assignment UI, Tasks tab, B3 mention picker | A4 guest scoping in search/agent, A5 security baseline, A6 audit v2, C4 agent tools |
| **10-14** | C3 My Day + empty states | D1 connector framework + KMS + Google OAuth (Calendar + Gmail scopes), D2 sync job, D3 Calendar |
| **10-15 (P0 freeze)** | Connected apps settings, meeting card with "Upload transcript" | D4 meeting summaries (upload fallback first, then the Meet API if Q1 = yes), D5 Gmail commitments |
| **10-16** | Polish, accessibility pass, mobile | Eval: G1 sets, leak and injection suites, latency check; fix |
| **10-17 → 10-18** | Deck + video (demo script: My Day → Prep me → meeting summary → assign to Rahul → Rahul's Assigned-to-me) | Deploy, smoke test, keep `main` frozen except fixes |

**Cut line if we slip:**
- Drop D5 before D4: the meeting story demos better.
- Drop B7 threads and B5 push before any A-series item: security is never cut.

**Phase 3 (after 10-18):** D6 Drive ACL-aware indexing, D8 Microsoft Graph (Outlook, Teams transcripts, OneDrive), D9 Zoom, A7 full admin console, A11 Identity Platform (MFA, SAML), Google OAuth app verification, embedding migration.

**Dependencies:**
- Google OAuth consent screen and client (Q2).
- KMS key ring creation.
- Firebase Google provider enabled (pending console toggle).
- Firestore composite indexes for `tasks.participants` + `status`/`due_at` and `chunks` `org_id` filters (deploy before code).
- The `github-deployer` SA needs rules/index admin roles for the new CI step.
