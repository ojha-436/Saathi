# Saathi — Phase 4 PRD: Saathi Research, Spec Check and Saathi Voice, on an enterprise-grade platform

| | |
|---|---|
| **Status** | Draft for review · 2026-10-12 |
| **Owners** | Person A (web, UX, demo) · Person B (API, AI, platform) |
| **Hard deadline** | Hackathon submission **Sun 2026-10-18**. Both phases land before it (§10). |
| **Builds on** | Phases 2–3 on `main` (`069a71a`): workspaces, channels, Saathi agent (ADK, 15 tools), Saathi Live, decision log, plant memory, BigQuery plant data, drawing register, records, handover |
| **Decision** | 2026-10-12, after the brainstorm: **"go with both"**. Phase 1 = Research + Spec Check (coverage and technical depth). Phase 2 = Saathi Voice (innovation), plus the scale work that makes all of it production-grade. |
| **Strategy in one line** | **Agents that finish the work, for every employee, at any scale.** Saathi stops at "here is the answer" today; Phase 4 makes it assemble the dossier, verify the certificate and take the report by voice, on a platform built for thousands of concurrent users. |

---

## 0. Summary

- **Saathi Research**: give a goal (*"Are we ready for the RDSO inspection on 20 Oct?"*). A multi-agent ADK workflow plans, researches in parallel through Saathi's permission-scoped tools (plus a BigQuery archive index and the standards library), verifies every claim has a source, and writes a cited readiness report. **Every gap becomes a drafted task** for the right person.
- **Spec Check**: every mill test certificate (MTC) is checked against the material grade on the **current** drawing revision, using limits from a **Standards Library on Agent Search**. Gemini extracts; **deterministic code decides** pass/fail. A failure drafts the NCR.
- **Answer provenance**: every answer shows how it was produced (plan, tools, sources, model, time).
- **Saathi Voice**: hands-free, Hindi-first assistant for the shop floor on **Gemini 3.8 Live** with tool calling: "no source, no answer", nothing filed without confirmation.
- **Enterprise platform**: queue-based async (Pub/Sub, Cloud Tasks) instead of in-process background tasks, separate API / worker / realtime services, ACLs by chat instead of copied member lists, streaming answers, model fallback, caching, BigQuery as the archive and analytics index, SLOs, load and chaos tests, backups.

### Alignment with the problem statement

| Feature | Verb it strengthens | Suggested direction | Suggested technology | Measurable gain |
|---|---|---|---|---|
| Saathi Research | access knowledge · make decisions · complete work | **Research assistant** (only uncovered direction) | ADK multi-agent, **Agent Engine** (P1), BigQuery vector search | Dossier prep ≤ 10 min vs 1–2 days |
| Spec Check + Standards Library | complete everyday work · decide | Document intelligence (verify, not just read) | **Agent Search**, Document AI, Gemini | ≤ 30 s vs 10–15 min per certificate |
| Answer provenance | access knowledge (trust) | Knowledge assistant | Cloud Trace, BigQuery | 100% of answers explainable |
| Saathi Voice | collaborate · complete everyday work | AI copilot (frontline) | Gemini Live API | Report capture ≤ 45 s, hands-free |
| Enterprise platform | all | — | Cloud Run, Pub/Sub, Cloud Tasks, BigQuery, Firestore | p50 answer ≤ 4 s; no lost work under load |

After Phase 4, Saathi covers **all seven suggested directions** and **all suggested technologies** except AlloyDB, which is documented as the scale-out path (ADR-1).

---

## 1. Problem statement

**Evidence takes days to assemble.** Before a customer or RDSO inspection, or a vendor or material decision, someone collects evidence from chats, drawings, certificates, NCRs, decisions, promises and plant data. Phase 3 set the baseline at **1–2 days per dossier**. Gaps are usually found by the inspector, not by the plant.

**Certificates are checked by eye.** Receiving staff compare MTC chemistry and mechanical values with the drawing's material grade by hand. A vendor case study puts this at **10–15 minutes per certificate**. For safety-critical rail components, one miss lets out-of-spec material into production. Saathi already *reads* MTCs (Document AI + Gemini) but does not *check* them.

**Frontline workers are left out.** Operators, supervisors and inspectors work with gloves, noise and Hindi or regional languages. Frontline workers use AI about **3× less** than desk staff (Workvivo). In a vendor survey, 53% of manufacturing workers lose ≥ 24 minutes a shift waiting for information or approvals (Weavix, US).

**Today's architecture would fail at enterprise scale.** A code review on 2026-10-12 found:

| # | Finding | Failure mode at scale |
|---|---|---|
| F1 | ~45 call sites run async work (ingest, extraction, sync, push) as in-process FastAPI `BackgroundTasks` | Work is lost when an instance is recycled; no retries, no backpressure, no dead-letter; one slow PDF delays everything on that instance |
| F2 | Chat member lists are copied onto every chunk, file, decision and handover; `sync_members` rewrites all of them on each join or leave | A 5,000-member channel with 50,000 chunks means 50,000 writes per join, plus index entries per array element |
| F3 | `read_at.{uid}` map and `last_*` fields live on the chat document | Hot document: every read and message in a busy channel writes the same doc (~1 write/s sustained guidance); the map grows with members |
| F4 | One `saathi-api` service (max 12 instances × 80 concurrency) serves REST, hour-long Live WebSockets (session affinity) and background work | Live sessions consume concurrency that REST needs; one workload's spike degrades the others |
| F5 | Assistant answers are not streamed (pending doc, then the final text); median **9.3 s** in the current eval | Slow perceived response; long-held requests reduce capacity |
| F6 | No model fallback; Gemini `429 RESOURCE_EXHAUSTED` observed during testing | A quota spike surfaces as a user-facing failure |
| F7 | BigQuery plant data is reloaded with full `WRITE_TRUNCATE` loads | Cost and latency grow with history; data is stale between reloads |
| F8 | Firestore point-in-time recovery **disabled**, delete protection **disabled** | One bad script or bug cannot be rolled back |
| F9 | No cache (ACL sets, embeddings), no per-user rate limits | Every search re-reads the user's chats; one user can exhaust shared quota |

---

## 2. Goals

| # | Goal | Target (success / stretch) |
|---|---|---|
| G1 | **Dossier in minutes, not days**: a readiness report with every claim cited | p50 ≤ 4 min / 2 min end to end; citation precision ≥ 95% / 98%; known-gap recall ≥ 80% / 90% |
| G2 | **Certificates verified on arrival** | Verdict ≤ 30 s / 15 s after upload; **100%** correct on the 20-case eval; every FAIL offers a pre-filled NCR |
| G3 | **Frontline workers served by voice** | ≥ 85% / 95% task success on 20 Hinglish scenarios; **0** ungrounded plant facts on 10 adversarial prompts |
| G4 | **Faster Saathi** | Time to first token p50 ≤ 1.5 s; full answer p50 ≤ 4 s, p95 ≤ 8 s (from 9.3 s median) |
| G5 | **Production-grade under load** | Pass the §7.4 load test (scaled slice) with ≤ 1% errors and **zero lost ingest jobs** in the chaos test; SLOs and alerts live |

---

## 3. Non-goals

| Non-goal | Why |
|---|---|
| Replace Firestore with BigQuery for **interactive** retrieval | BigQuery queries carry seconds of overhead; interactive answers need ~100 ms retrieval. BigQuery becomes the archive and analytics index instead (ADR-1). |
| Depend on Google's Deep Research agent | It is in preview, Google advises against sending confidential data during preview, it is single-turn, and our test call did not return. Revisit at GA (P2). |
| Autonomous actions | Research does not send messages or emails; Voice does not file records; Spec Check does not raise NCRs. Everything is drafted and a person confirms (existing principle). |
| Redistribute copyrighted standards | The library holds company-owned spec sheets, SOPs and approved limit tables, with citations to clause numbers, not the licensed text. |
| A generic no-code automation builder | Parity with Copilot Studio and Gemini Enterprise; low innovation for the time it takes. Approvals stay planned (Phase 3, A2). |
| Multi-region active-active, on-device voice, languages beyond Live's list | Out of scope for 18 Oct. Voice supports Hindi, English (India), Marathi, Tamil and Telugu. |

---

## 4. Personas

| Persona | Example | Phase 4 job to be done |
|---|---|---|
| Plant head / QA head | Kavya (project lead) | "When an inspection is coming, I want to know what's missing while there's still time to fix it." |
| QA / receiving engineer | Neha | "When an MTC arrives, I want an instant pass/fail against the right spec so I can accept or quarantine." |
| Design engineer | Amit, Prince | "When a decision needs evidence, I want it assembled and cited for me." |
| Shift supervisor / operator (deskless) | Suresh | "With gloves on, I want to ask and report by voice, in Hindi." |
| Workspace admin / IT | — | "I want it to stay fast and correct for thousands of users, and to see where data is processed." |

---

## 5. User stories (priority order)

### A. Saathi Research
1. As a **plant head**, I want to ask "Are we ready for the RDSO inspection on 20 Oct?" and get a cited readiness report, so I can fix gaps before the visit.
2. As a **plant head**, I want each gap to come with a drafted task for the right owner and a due date before the inspection, so the report turns into work in one click.
3. As a **requester**, I want to see and edit the research plan before it runs, so it checks what I care about.
4. As a **requester**, I want to watch progress live (which drawing, which certificate, which records it is checking), so I trust the result and can stop it early.
5. As a **purchase manager**, I want a vendor comparison (quality record, promise record, open NCRs, prices from quotes), so the choice is backed by evidence.
6. As a **requester**, I want to share the report into a channel without leaking sources that channel's members cannot see, so sharing is safe.
7. As a **requester**, I want to re-run a report later and see what changed ("2 gaps closed since Monday").
8. *Edge:* when sources are missing or conflicting, the report says so ("No UT report found for weld W7") instead of guessing.

### B. Spec Check and Standards Library
9. As a **QA engineer**, I want every uploaded MTC checked automatically against the drawing's current material grade, so out-of-spec material is caught on arrival.
10. As a **QA engineer**, I want a per-property table (value, limit, source clause, pass/fail), so I can trust and audit the verdict.
11. As a **QA engineer**, I want a FAIL to offer a pre-filled NCR (vendor, heat number, PO, failed properties, evidence), so containment starts immediately.
12. As a **QA head**, I want to upload our spec sheets and approve the limits Saathi extracts, so verdicts use approved master data only.
13. As **anyone**, I want to ask Saathi "Is heat H-77812 within spec for SRC-BF-2041?" and get the verdict with sources.
14. *Edge:* when no approved limits exist for a grade, Saathi says so and offers to add them; it never invents a limit.
15. *Edge:* when the MTC grade differs from the grade on the drawing's current revision, Saathi flags a grade mismatch.

### C. Answer provenance
16. As **any user**, I want to open "How Saathi got this" under an answer and see the steps, tools, sources and time taken.

### D. Saathi Voice
17. As a **supervisor on the floor**, I want to hold one button and ask in Hindi, so I don't have to type with gloves on.
18. As a **supervisor**, I want to report "CNC-3 band hai, chiller fault" by voice and have a downtime record drafted that I confirm by voice or tap.
19. As an **operator**, I want to ask "Ye drawing current hai?" after scanning a QR code and hear the answer.
20. As **any voice user**, I want spoken answers backed by visible sources on screen, and an honest "source nahi mila" when Saathi doesn't know.
21. As an **admin**, I want to control whether voice may be processed outside India, so we meet our data policy.
22. *Edge:* on a weak network, Voice says so and offers text; interrupting Saathi while it speaks (barge-in) works.

### E. Enterprise platform
23. As an **admin**, I want Saathi to stay fast and correct when thousands of people use it at once.
24. As an **admin**, I want no message, file or record to be silently dropped, even if servers restart.
25. As an **admin**, I want to see where each kind of data is processed and stored.

---

## 6. Requirements

### 6A. Saathi Research

| ID | Pri | Requirement | Acceptance criteria |
|---|---|---|---|
| R1 | P0 | **Start a run** from Saathi ("Research" mode) or a template: *Inspection readiness*, *Vendor comparison*, *Custom goal*. Optional context: a channel, a drawing number, a date. | ☐ Run is created in ≤ 1 s and appears with status *planning*. ☐ One running research run per user and 5 per workspace; further runs are queued with position shown. |
| R2 | P0 | **Plan**: a planner agent proposes 4–8 sub-questions, each with the tools it will use. The user can approve, edit, remove or add items, or "Run as is". | ☐ Plan appears in ≤ 10 s. ☐ Edits are respected. ☐ Plan never includes a tool the user cannot use (e.g. guests get no plant data). |
| R3 | P0 | **Research in parallel**: researcher agents (bounded concurrency 4) answer sub-questions with the **user's** permission-scoped tools: `search_workspace`, `archive_search` (R9), `lookup_document`, `revision_status`, `spec_check` (6B), `find_decisions`, `similar_incidents`, `promise_record`, `plant_data`, `standards_library` (6B). | ☐ Every tool call is filtered exactly as in chat (same ACL code paths). ☐ Leak eval: a run by `prince` never cites `dm_amit_neha` or the Rev D draft. |
| R4 | P0 | **Live progress**: a timeline of steps ("Checking revision status of SRC-BF-2041… Rev C is current") streamed to the client as they happen. **Stop** cancels the run. | ☐ First progress event ≤ 3 s after approval. ☐ The report survives the user closing the tab (runs server-side). ☐ Stop halts within 5 s and keeps partial findings. |
| R5 | P0 | **Verify**: a critic step checks every claim against tool output. Unsupported claims are removed or marked *unverified*; numbers must match the cited source. | ☐ Citation precision ≥ 95% on the research eval. ☐ Zero claims without a source in the final report. |
| R6 | P0 | **Report**: verdict, readiness checklist (✅ / ⚠️ / ❌), evidence, gaps and risks, recommended actions. Every line has citation chips; plant-data answers include their chart. | ☐ Renders on mobile. ☐ Citations open the source (message, file, record, decision, standards clause). |
| R7 | P0 | **Gaps → tasks**: each gap carries a suggested owner (from the source: record owner, promise committer, uploader) and a due date (before the inspection date if given). "Create tasks" drafts them for confirmation, one by one or all at once. | ☐ Tasks link back to the report and source. ☐ Nothing is assigned without confirmation. |
| R8 | P0 | **Safe sharing**: share to a chat or channel. Before sharing, Saathi checks every citation against that chat's members; sections relying on sources some members can't see are removed (with a notice) or sharing is blocked. | ☐ A shared report never exposes a source to someone without access (eval case). |
| R9 | P0 | **Archive index on BigQuery**: all chunks are mirrored to `saathi_archive.chunks` (partitioned by day, clustered by org and chat) with a vector index; `archive_search` runs `VECTOR_SEARCH` pre-filtered by the user's chats via a membership table, for deep recall across the full history. | ☐ Archive freshness p95 ≤ 2 min. ☐ ACL join tested: no rows outside the user's chats. ☐ Used by Research only (seconds of latency are acceptable there). |
| R10 | P0 | **Budgets and safety**: ≤ 40 tool calls and ≤ 5 min per run; per-run token cap; tool outputs are treated as data, not instructions. | ☐ Over-budget runs finish with what they have and say so. |
| R11 | P1 | **Re-run with delta**: re-run a saved report; show what changed. | ☐ Closed gaps are struck through with the evidence that closed them. |
| R12 | P1 | **Agent Engine runtime**: the same ADK workflow deployed to Agent Engine (Agent Runtime) with Sessions, behind a flag `RESEARCH_RUNTIME=agent_engine|worker`. | ☐ Identical eval results on both runtimes. ☐ Fallback to worker within one deploy. Attempt only if R1–R10 are done by Wed 14 Oct noon. |
| R13 | P1 | **Export PDF** with citations as footnotes. | |
| R14 | P2 | Memory Bank (per-user research preferences); A2A agent card so other agents (e.g. Gemini Enterprise) can request Saathi Research; optional public-web section via Deep Research once GA. | Design so the workflow is callable without the UI. |

**Agent design.** ADK workflow agents: `SequentialAgent[ Planner → ParallelAgent[Researcher × N] → Critic → Writer ]`. Planner and Writer use `gemini-3.8-flash` (medium thinking); Researchers and Critic use `gemini-3.8-flash` (low thinking). State lives in Firestore `research_runs/{id}` with events in `research_runs/{id}/events`, so the client reuses the real-time listener pattern.

### 6B. Spec Check and Standards Library

| ID | Pri | Requirement | Acceptance criteria |
|---|---|---|---|
| S1 | P0 | **Standards Library**: admins upload company spec sheets, SOPs and limit tables (PDF). Files go to GCS and are indexed in an **Agent Search** data store (layout-aware parsing), one per workspace. | ☐ Searchable within 15 min of upload. ☐ Visible to all workspace members, never to other workspaces. |
| S2 | P0 | **Limit extraction with approval**: Gemini extracts per-grade limits (property, min, max, unit, conditions such as thickness band, source page and clause) into `spec_limits` as *proposed*; a QA head or admin approves them. | ☐ Only *approved* limits are used for verdicts. ☐ Each limit links to its source page. |
| S3 | P0 | **Automatic check on MTC upload**: after extraction, determine the grade (MTC and the linked drawing's **current** revision from the drawing register), fetch approved limits, compare in **deterministic code**: unit normalisation (MPa = N/mm², %, ppm), ranges, thickness bands, missing values. | ☐ 100% correct on the 20-case eval (10 pass, 10 fail; includes unit and thickness cases). ☐ Verdict ≤ 30 s after upload. ☐ The LLM never decides pass/fail. |
| S4 | P0 | **Verdict UI**: badge on the file card (PASS / FAIL n / INCOMPLETE / NO LIMITS) and a detail table (property, value, limit, result, source clause). | ☐ Same visibility as the file (follows the chat's members). |
| S5 | P0 | **FAIL → NCR draft** pre-filled with vendor, heat number, PO, failed properties and evidence links; plus "post quarantine note" to the channel. | ☐ Drafted, never filed without confirmation. |
| S6 | P0 | **Grade mismatch**: MTC grade ≠ grade on the drawing's current revision → flagged, linked to Revision Guard. | ☐ Eval case passes. |
| S7 | P0 | **Agent tools**: `spec_check(heat_or_file, drawing_no?)` and `standards_library(query)` (Agent Search) for the Saathi agent and Research. | ☐ Answers cite the standards clause and the certificate. |
| S8 | P1 | **Incoming material view** in Quality: checks by vendor, fail rate trend (BigQuery). | |
| S9 | P2 | Vendor scorecard combining Spec Check fail rate, NCRs and promise record. | |

**Principle: the LLM extracts, code decides.** Extraction errors are visible in the table and correctable; the verdict is reproducible and auditable.

### 6C. Answer provenance

| ID | Pri | Requirement | Acceptance criteria |
|---|---|---|---|
| P1 | P0 | "How Saathi got this" on every assistant answer and research report: steps, tools and arguments (sanitised), sources cited, model, time per stage. | ☐ Available on 100% of new answers. ☐ Never reveals that inaccessible sources exist: it says "Searched only the chats and files you can access", without counts of hidden items. |
| P2 | P1 | Trace link for admins (Cloud Trace span id) in the Admin console. | |

### 6D. Saathi Voice (Phase 2)

| ID | Pri | Requirement | Acceptance criteria |
|---|---|---|---|
| V1 | P0 | **Hold-to-talk** voice sheet on mobile and desktop (Saathi, home, QR result page when signed in): live captions, language chip, barge-in, start/stop earcons. | ☐ Works on Android Chrome and iOS Safari (installed web app). |
| V2 | P0 | **Gemini 3.8 Live** (`gemini-3.8-live`, native audio) with function calling over the user's permission-scoped tools: `revision_status`, `search_workspace` (short answers), `shift_handover`, needs-you/tasks, `promise_record`, `similar_incidents`, `draft_record` (downtime / NCR / safety), `draft_reminder`. | ☐ First audio ≤ 1.5 s after end of speech without tools; ≤ 3 s with one tool call (p50). |
| V3 | P0 | **No source, no answer**: plant facts come only from tool results; otherwise it says it couldn't find a source. | ☐ 0 ungrounded plant facts on 10 adversarial prompts (the untooled probe on 2026-10-12 invented a CNC-3 status, which shows why this is P0). |
| V4 | P0 | **Confirm before filing**: drafts appear as cards; voice "haan, file karo" or a tap confirms. | ☐ No record filed without an explicit confirmation turn. |
| V5 | P0 | **Languages**: Hindi, Hinglish, English (India), Marathi, Tamil, Telugu; replies in the user's language. | ☐ 20-scenario eval ≥ 85% task success. |
| V6 | P0 | **Residency control**: the Live model is available to us only in `us-central1`. Org setting "Allow voice processing in the US" (default **off** in production, **on** in the demo workspace) with a privacy notice. Transcripts are stored in asia-south1, private to the user, 30-day retention; audio is never stored. | ☐ Voice disabled cleanly when the setting is off. |
| V7 | P1 | Session resumption on network drops; "connection weak, switch to text". | |
| V8 | P2 | Expert knowledge capture: Saathi interviews a retiring expert by voice and drafts an SOP into the knowledge hub. | |

### 6E. Enterprise platform: scale, reliability, performance

| ID | Pri | Phase | Requirement | Acceptance criteria |
|---|---|---|---|---|
| E1 | P0 | 1 | **`saathi-worker` service + Cloud Tasks** for research runs and spec checks: queue with retries (exponential backoff), max concurrency (protects Gemini quota), dead-letter handling; OIDC-authenticated push. | ☐ Killing a worker mid-run resumes or fails the run cleanly, never hangs. |
| E2 | P0 | 1 | **Streaming answers**: assistant tokens stream to the client (SSE) and the final message is persisted; **retrieval-first**: hybrid search starts in parallel with the first model call, so most answers skip a tool round-trip. | ☐ TTFT p50 ≤ 1.5 s, full answer p50 ≤ 4 s on the 40-question latency eval. |
| E3 | P0 | 1 | **Model fallback and degradation**: on 429/5xx retry once with jitter, then fall back (`gemini-3.8-flash` → `gemini-3.5-flash`; `gemini-3.5-flash-lite` → `gemini-2.5-flash-lite`); if generation is unavailable, return cited search results with "AI summary unavailable". | ☐ Fault-injection test passes. |
| E4 | P0 | 1 | **Backups**: enable Firestore PITR (7 days), delete protection and daily scheduled backups. | ☐ Restore drill documented. |
| E5 | P0 | 2 | **Event bus**: message/file/membership/record events on Pub/Sub (`saathi-events`, ordering key = chat id) with push subscriptions to the worker; migrate ingest, extraction, sync and push off `BackgroundTasks`. Handlers are idempotent (keys = message/file id). Pub/Sub **BigQuery subscription** mirrors events and chunks to BigQuery without custom code. | ☐ Chaos test: kill instances during a 1,000-message burst → every message indexed exactly once. |
| E6 | P0 | 2 | **Service split**: `saathi-api` (REST, stateless), `saathi-worker` (async), `saathi-realtime` (WebSockets for Live and Voice, session affinity), each with its own scaling. | ☐ A voice or Live load test does not raise REST p95. |
| E7 | P0 | 2 | **ACL by chat, not copied member lists**: chunks, files, decisions and handovers carry `chat_id`/`acl` tokens; the user's chat set is resolved at query time and cached (TTL 60 s, invalidated by membership events). Joins and leaves no longer rewrite content. A 2-hour spike first confirms Firestore vector pre-filtering with `in`/`array-contains-any` batches (fallback: keep member arrays for chats ≤ 500 members and route larger channels through the ACL-join path). | ☐ Join in a 5,000-member channel = O(1) writes. ☐ Permission suite still 0 leaks. |
| E8 | P0 | 2 | **Read state off the chat document**: per-user read markers (`users/{uid}/reads/{chatId}`); `last_*` updates coalesced to ≤ 1 write/s per chat. | ☐ No contention errors in the message burst test. |
| E9 | P0 | 2 | **Observability and SLOs**: OpenTelemetry tracing (ADK → Cloud Trace), structured logs with trace ids, dashboards and alerts (§7.5). | ☐ Alert fires on a synthetic SLO breach. |
| E10 | P0 | 2 | **Load and chaos tests** (§7.4) run and published (numbers go into the deck). | ☐ Pass criteria met or gaps documented with fixes. |
| E11 | P1 | 2 | **Memorystore for Valkey** for ACL sets, embedding cache and per-user rate limits (in-process TTL cache is the fallback). | |
| E12 | P1 | 2 | **Model Armor** screening of tool outputs, uploaded documents and voice transcripts for prompt injection and sensitive data. | |
| E13 | P1 | 2 | **Incremental BigQuery** for plant data (Storage Write API / Pub/Sub) instead of full reloads. | |
| E14 | P1 | 2 | **Data residency panel** in Admin: where each workload is processed and stored. | |
| E15 | P2 | — | **AlloyDB AI (ScaNN)** as the interactive vector index once a workspace outgrows Firestore pre-filtering; **Provisioned Throughput** for guaranteed Gemini capacity. | Design the retrieval layer behind one interface so the store can be swapped. |

---

## 7. Architecture

### 7.1 Target state

```
 Browser / installed web app (Next.js on Cloud Run: saathi-web)
   │ REST + SSE (answers stream)            │ WebSocket (Live meetings, Voice)
   ▼                                         ▼
 saathi-api (Cloud Run, stateless)        saathi-realtime (Cloud Run, session affinity)
   │  auth, ACL cache, fast path              │  Gemini 3.5 Transcribe Live (global)
   │  Saathi agent (ADK), streaming            │  Gemini 3.8 Live (us-central1, tools via API)
   │                                          │
   ├── Cloud Tasks ── research / spec-check ─►┐
   └── Pub/Sub saathi-events ─────────────────┤
                                              ▼
                                   saathi-worker (Cloud Run)
                                   ingest · extraction · membership · push
                                   Research workflow (ADK)  ──► Agent Engine (P1, flag)
                                   Spec Check (code comparator)
        ┌───────────────┬──────────────┬───────────────────┬──────────────────┐
        ▼               ▼              ▼                   ▼                  ▼
   Firestore        BigQuery        Agent Search       Cloud Storage      Gemini on Vertex AI
   (hot data +      saathi_archive  Standards Library  files, standards   3.8 Flash · 3.5 Flash-Lite
   vector index,    chunks + vector (per workspace)                       embeddings (asia-south1)
   ACL by chat)     index, events,                                        Document AI (asia-south1)
                    plant data
 (Pub/Sub BigQuery subscription mirrors events and chunks to BigQuery; Memorystore caches ACLs, P1)
```

### 7.2 Decision records

**ADR-1: Where BigQuery fits for indexing and answering.**
- **Use BigQuery for:**
  - the **archive index**: every chunk, full history, `VECTOR_SEARCH` with an ACL join on a membership table. This serves Research (R9), which needs recall over millions of chunks and tolerates seconds of latency.
  - plant data and Spec Check analytics.
  - product events, eval results and impact metrics (one source for the Admin Impact tab and the deck).
- **Don't use BigQuery for:** the interactive hot path. Each query carries job overhead of roughly a second or more, a chat answer makes 1–3 retrievals, and G4 needs ~100–300 ms per retrieval. That path stays on Firestore vector search (pre-filtered, regional embeddings), behind a retrieval interface.
- **Scale-out path (E15):** AlloyDB AI with a ScaNN index (SQL ACL joins at millisecond latency), also a suggested technology.
- *Trade-off accepted:* two indexes fed by one pipeline (E5), so they cannot drift.

**ADR-2: ACLs by chat, resolved at query time (E7).** Copying member lists onto content does not scale (F2) and caused the stale-permission race fixed on 2026-10-10. Content carries the chat id; the user's chat set is cached and invalidated on membership events. Defence in depth stays: results are re-checked against current membership.

**ADR-3: Queues over in-process background tasks (E1, E5).** Cloud Tasks for targeted, rate-limited jobs (research, spec check); Pub/Sub for fan-out events (index, classify, mirror, notify). Retries, dead letters, idempotency keys and ordering per chat replace "fire and hope".

**ADR-4: Our own research agent on ADK, not Google's Deep Research agent.** Ours uses the same permission-scoped tools as chat, streams steps, runs in our region and is testable with our eval. Deep Research is preview, single-turn and minutes long; Google advises against sending confidential data while in preview. Agent Engine is used as the managed runtime (R12) rather than replacing the agent.

**ADR-5: Agent Search for the workspace-wide reference library (S1).** Standards, SOPs and manuals are visible to the whole workspace and benefit from Google's layout-aware parsing and ranking. Conversations and files stay in the membership-filtered index, because chat membership changes constantly. The verdict is computed by code from **approved** limits, never by the model.

**ADR-6: Voice on Gemini 3.8 Live in `us-central1` (V6).** Verified on 2026-10-12: the model answers by voice in Hinglish there but is not available in `global` or `asia-south1` for this project. `saathi-realtime` runs in asia-south1 (tools and data stay close to Firestore) and bridges audio to us-central1. Admins control this with the residency setting; audio is never stored.

### 7.3 Latency budget: one Saathi answer (target p50)

| Stage | Today | Target | How |
|---|---|---|---|
| Auth + user's chat set | read all chats per search | ≤ 20 ms | Cached ACL set (E7, E11) |
| Query embedding | per tool call | ≤ 100 ms, once | Regional embeddings (asia-south1), reused across tools |
| Retrieval | after the model asks for it | ≤ 300 ms, **in parallel** with the first model call | Retrieval-first prefetch (E2) |
| Model first token | — (not streamed) | ≤ 1.2 s | `gemini-3.8-flash`, low thinking, stable cacheable prompt prefix |
| Tool round-trips | 1–3 | 0–1 | Prefetch answers most questions; parallel function calls when needed |
| **Time to first token** | ~9 s (no streaming) | **≤ 1.5 s** | Streaming (E2) |
| **Full answer** | 9.3 s median | **≤ 4 s p50, ≤ 8 s p95** | All of the above |

### 7.4 Load profile, capacity and tests

**Design target (production):** 50 workspaces; the largest has 10,000 users; 100,000 users in total. Peak: 10,000 concurrent signed-in users, **30 assistant questions/s**, 300 messages/s ingest bursts, 50 concurrent research runs, 300 concurrent voice sessions, 5 spec checks/s.

| Tier | Scaling approach |
|---|---|
| `saathi-api` | Async, streaming; ~250 concurrent streams at 30 q/s → 4–6 instances at concurrency 80; max 50, min 2 |
| `saathi-realtime` | ~250 WebSockets per instance (I/O-bound); max 20, min 1 |
| `saathi-worker` | Driven by Cloud Tasks/Pub/Sub; dispatch rates cap Gemini usage; max 30 |
| Firestore | Writes well under database limits; hot documents removed (E8) |
| BigQuery | Archive queries only from Research; partitioned and clustered; vector index |
| Gemini | Global endpoint (dynamic shared quota) + fallback models (E3); Provisioned Throughput for guaranteed capacity (E15) |

**Test plan (run before submission, at a 1/10 slice for quota and cost):**
- **Load (Locust):** 3 assistant q/s + 30 msg/s + 10 research runs + 30 voice sessions for 15 minutes. Pass if the error rate is ≤ 1%, answer p95 ≤ 8 s, and message-to-searchable p95 ≤ 30 s.
- **Chaos:** kill worker and API instances during a 1,000-message burst. Pass if every message is indexed exactly once and no research run hangs.
- **Fault injection:** force Gemini 429s. Pass if fallback models answer and search-only degradation works.
- **Full-target extrapolation:** capacity math above, with the measured per-instance throughput published in the deck.

### 7.5 SLOs and alerts

| SLO | Target |
|---|---|
| Chat send/read and search availability | 99.9% monthly |
| Assistant answer latency | p95 ≤ 8 s; TTFT p50 ≤ 1.5 s |
| Ingest freshness (message → searchable) | p95 ≤ 30 s |
| Research completion | ≥ 95% within 5 min |
| Voice session drop rate | ≤ 2% |

Alerts on: SLO burn rate, oldest-task age per queue, dead-letter count > 0, Gemini 429 rate > 2%, worker error rate, WebSocket drop spikes.

### 7.6 Data model additions

| Store | Collection / table | Notes |
|---|---|---|
| Firestore | `research_runs/{id}` (+ `events/{seq}`) | org, uid, goal, template, plan, status, report (claims with refs, gaps with owner/due), metrics, shared_to |
| Firestore | `standards/{id}`, `spec_limits/{id}`, `spec_checks/{fileId}` | Limits are *proposed* or *approved*, with source page and clause; checks follow the file's chat ACL |
| Firestore | `voice_sessions/{id}`, `users/{uid}/reads/{chatId}` | Voice transcripts are private, 30-day retention |
| BigQuery | `saathi_archive.chunks`, `saathi_archive.chat_members`, `saathi.events` | Partitioned by day, clustered by org/chat; vector index on `embedding` |
| Agent Search | One data store per workspace | Standards Library |

### 7.7 Security and governance

- Tenant isolation (org claims), ACLs identical across chat, Research, Voice and Spec Check, with a re-check against current membership.
- Shared reports pass the share check (R8).
- Nothing is filed without a person.
- Audit: research runs, spec-check verdicts and voice tool calls are written to the audit log and to BigQuery.
- Residency: Firestore, Storage, Document AI and embeddings stay in asia-south1. Generation uses the Gemini global endpoint (as today). Voice is processed in us-central1 behind an admin setting. The Admin residency panel shows all of this (E14).
- Model Armor (E12) screens injection attempts in documents and transcripts.

---

## 8. Success metrics

| Metric | Type | Target (success / stretch) | Measured by |
|---|---|---|---|
| Dossier prep time | Lagging | ≤ 10 min / 5 min vs 1–2 days | Research run duration + pilot timing |
| Research citation precision | Leading | ≥ 95% / 98% | Research eval (claims sampled vs sources) |
| Known-gap recall | Leading | ≥ 80% / 90% | Research eval (6 goals with gold checklists) |
| Gaps converted to tasks | Leading | ≥ 50% of gaps | `research_runs` × tasks |
| Spec Check accuracy | Guardrail | 100% on 20 cases | Spec eval |
| Certificate verdict time | Leading | ≤ 30 s / 15 s | Upload → verdict timestamps |
| FAILs with NCR drafted | Leading | ≥ 90% | `spec_checks` × records |
| Voice task success | Leading | ≥ 85% / 95% | 20 Hinglish scenarios |
| Ungrounded voice facts | Guardrail | 0 | 10 adversarial prompts |
| Voice capture time | Leading | ≤ 45 s / 30 s | Client timing |
| Assistant TTFT / full answer | Guardrail | ≤ 1.5 s / ≤ 4 s p50 | Latency eval + BigQuery |
| Load test error rate | Guardrail | ≤ 1% | Locust report |
| Lost ingest jobs in chaos test | Guardrail | 0 | Chaos test |
| Permission leaks | Guardrail | 0 | Existing suite + Research share and Voice cases |

---

## 9. Evaluation plan (extends `agent/eval`)

| Suite | Cases | Gate |
|---|---|---|
| Research | 6 goals on demo data (RDSO readiness, vendor comparison, NCR root cause, drawing change impact, two custom), gold checklists of known gaps | Precision ≥ 95%, recall ≥ 80% |
| Research leaks | Prince-run reports and shared reports vs the forbidden list | 0 leaks |
| Spec Check | 20 certificates (pass, fail, unit conversion, thickness band, missing value, grade mismatch, no limits) | 100% |
| Voice | 20 scripted Hinglish/Hindi/English scenarios, 10 adversarial | ≥ 85%, 0 ungrounded |
| Latency | 40 questions (existing 10 + 30 new) | TTFT p50 ≤ 1.5 s, full p50 ≤ 4 s |
| Platform | Load, chaos, fault injection (§7.4) | Pass criteria |

Numbers are exported to the landing page and the deck (`eval.export_web`), as today.

---

## 10. Timeline and phasing (both phases before 18 Oct)

**Phase 1: "Agents that finish the work"** — Tue 13 → Thu 15 Oct (feature freeze Thu 18:00 IST)

| Day | Person A (web / UX) | Person B (API / AI / platform) |
|---|---|---|
| Tue 13 | Research UI: templates, plan review, live progress timeline, report view with citations | Morning: **2-hour spike** running a scripted research plan through existing tools to judge report quality. Then `saathi-worker` + Cloud Tasks (E1), research workflow R1–R6, R10; enable backups (E4) |
| Wed 14 | Spec Check badge and table, NCR prefill (S4–S5); Standards Library admin page (upload, approve limits); gaps → tasks (R7); share check UI (R8) | Standards Library on Agent Search (S1–S2), comparator + auto-check (S3, S6), tools (S7); BigQuery archive index + `archive_search` (R9); R12 only if R1–R10 done by noon |
| Thu 15 | Provenance drawer (P1); mobile pass; demo data (standards PDFs, a failing MTC) | Streaming + retrieval-first (E2), fallback (E3); Research and Spec evals; deploy behind flags |

**Phase 2: "Voice and scale"** — Fri 16 → Sat 17 Oct; submission Sun 18 Oct

| Day | Person A (web / UX) | Person B (API / AI / platform) |
|---|---|---|
| Fri 16 | Voice sheet (V1): hold-to-talk, captions, cards, earcons; residency setting UI | `saathi-realtime` (E6) + Voice bridge (V2–V6); event bus + ingest migration (E5); ACL spike → E7; read state (E8) |
| Sat 17 | Deck and video recording on the demo script (appendix); full regression on phone and desktop | Voice eval; load, chaos and fault tests (E10); dashboards and alerts (E9); fixes |
| Sun 18 | Submission: deck PDF, video, links | Final deploy by 12:00 IST; re-run all evals; export numbers; submit |

**Cut line if we slip (in this order):**
1. R12 Agent Engine runtime, then E11, E12, E13, E14.
2. Voice tools limited to `revision_status` + `draft_record` + `shift_handover`.
3. E7 ACL refactor: keep member arrays with a cap and document the AlloyDB path.
4. Load test at a smaller slice.

**Never cut:** permission guarantees and leak tests, confirmation before filing, "no source, no answer", backups (E4), the queue for Research (E1).

---

## 11. Open questions

| # | Question | Owner | Blocking? |
|---|---|---|---|
| Q1 | Exact submission cut-off time on 18 Oct (IST?) | Stakeholder | Yes, for the final-day plan |
| Q2 | Which spec documents can go into the Standards Library? Company-owned summaries and limit tables vs licensed BIS/EN/RDSO texts. Demo uses synthetic company spec sheets. | QA + legal | Yes, for real customer use; no for the demo |
| Q3 | Is voice processing in `us-central1` acceptable for the demo workspace, and what is the production default? | Stakeholder / legal | Yes, for the Phase 2 demo |
| Q4 | Budget for Gemini quota during the load test, and Provisioned Throughput later | Engineering / finance | No (test at a 1/10 slice) |
| Q5 | Does Firestore vector search support pre-filtering with `in`/`array-contains-any` batches at our scale? | Engineering (2-hour spike) | No (fallback in E7) |
| Q6 | Who approves spec limits in a real plant (QA head role)? | Customer QA | No (admin in demo) |
| Q7 | Share check default: remove sections automatically, or block and explain? | Design / security | No (remove with notice) |
| Q8 | Which research templates beyond RDSO readiness and vendor comparison? | Stakeholder | No |

## 12. Dependencies

- **Enable:** Cloud Tasks API and Discovery Engine (Agent Search) API. Optional (P1): Memorystore for Valkey + Direct VPC egress, Model Armor API. Already enabled: Vertex AI, BigQuery (+ Storage API), Pub/Sub, Document AI, Cloud Run, Cloud Trace, Monitoring.
- **IAM for `saathi-agent`:** Cloud Tasks enqueuer, Pub/Sub publisher/subscriber, Run invoker (worker), Discovery Engine editor (setup) and viewer (query), BigQuery data editor on `saathi_archive`. The Pub/Sub service agent needs BigQuery data editor for the BigQuery subscription.
- **Firestore:** enable PITR and delete protection; schedule daily backups.
- **Models:** `gemini-3.8-flash`, `gemini-3.5-flash` (fallback), `gemini-3.5-flash-lite`, `gemini-embedding-001` (asia-south1), `gemini-3.8-live` (us-central1). All verified working in this project on 2026-10-10/12.
- **Demo content:** synthetic standards PDFs (material spec sheet, incoming inspection SOP, RDSO checklist), a failing MTC, an inspection on the calendar for 20 Oct.

---

## Appendix: demo storyline (≈ 3-minute video)

1. **Problem** (15 s): knowledge scattered, certificates checked by eye, frontline left out.
2. **Morning** (25 s): Needs-you, and Saathi Live answering a budget question in a meeting (existing).
3. **Certificate arrives** (20 s): Neha drops an MTC in the Bogie channel → Spec Check **FAIL: C 0.24% > 0.22% max** with the clause → NCR drafted in one tap.
4. **Inspection readiness** (35 s): Kavya asks "Are we ready for RDSO on 20 Oct?" → plan → live progress → report (✅ Rev C current, ❌ MTC fail, ⚠️ missing UT report for W7) → "Create 3 tasks".
5. **Shop floor** (25 s): Suresh on his phone, by voice in Hindi: "CNC-3 ka kya status hai?" → cited answer from the handover; "Downtime report karo" → draft → "haan, file karo".
6. **Built to scale** (25 s): how it's built, load-test numbers, latency, evals, provenance drawer.
7. **Close** (15 s): "Saathi: from conversation to work that gets done, for everyone in the plant."
