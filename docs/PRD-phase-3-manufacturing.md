# Saathi — Phase 3 PRD: Productivity for every employee, and the manufacturing operating layer

| | |
|---|---|
| **Status** | Draft for review · 2026-10-11 |
| **Owners** | Person A (web, UX, demo) · Person B (API, AI, integrations) |
| **Hard deadline** | Hackathon submission **2026-10-18**: Phase 3a only (see §10). Phases 3b–3e follow. |
| **Builds on** | Phase 2 (`docs/PRD-phase-2.md`), live on `main`: workspaces and roles, channels, threads, push, Google connector (Calendar, Gmail, Drive), meetings, tasks, My Day |
| **Strategy in one line** | **Conversation → record.** Plant knowledge already flows through chat, photos, email and voice; Saathi turns it into the records the factory runs on (revisions, NCRs, downtime, handovers, traceability) and connects to the systems of record (ERP, PDM/PLM) instead of replacing them. |

---

## Update 2026-10-12: scope change and Phase 3b

**ERP and PDM/PLM integration are dropped.** The reference company uses neither. Saathi itself becomes the lightweight
system of record, built from conversation: §6C (connectors), goal G5, user stories 22–23 and Phases 3c–3d no longer apply.
Revision Guard stays Saathi-extracted (B1).

**Re-aligned to the official problem statement:** *"transform how individuals and organizations access knowledge,
collaborate, make decisions, and complete everyday work"* with measurable improvement. The gaps were **make decisions**
and **show measurable gains**, so Phase 3b (hackathon cut, shipped 2026-10-12) adds:

| ID | Requirement | Acceptance criteria | Status |
|---|---|---|---|
| K1 | **Decision log**: when the message classifier flags a decision (chat) or a meeting summary lists one, Gemini reads the surrounding conversation and records title, topic, rationale (only if stated), rejected alternatives, decided-by, identifiers and the source. A newer decision on the same topic supersedes the older one. `find_decisions` agent tool; Decisions view with search. | ☑ Visible only to members of the source chat/meeting, following membership changes. ☑ The superseding decision is linked only if the viewer can see it. ☑ Rationale is never invented. | Shipped |
| K2 | **Decision briefs**: "Should we…?" gathers past decisions, similar incidents, promise track record and plant data, then lays out Question / Options / Evidence (cited) / Past decisions / Unknowns / Suggestion. | ☑ Every number cited. ☑ The suggestion is labelled; the decision stays with the user. | Shipped |
| K3 | **Plant memory ("this happened before")**: similar past NCR/downtime records with root cause, fix and owner, shown on the report draft, on each record and via the `similar_incidents` tool. | ☑ Lessons are shared workspace-wide as lessons only (no photos, voice or reporter). ☑ Safety reports excluded. ☑ Guests get none. | Shipped |
| K4 | **Promise track record**: kept / late / overdue for a vendor or colleague (`promise_record`). | ☑ Only promises from chats the asker is in. | Shipped |
| K5 | **Ask your plant data (BigQuery)**: records and promises mirrored to `saathi.plant_records` / `saathi.plant_promises`; questions become a validated query spec (Gemini never writes SQL); the answer shows a chart. | ☑ Always filtered to the workspace; non-admins only see records/chats they are part of. ☑ Guests blocked. | Shipped |
| K6 | **Impact panel** (Admin → Impact): measured questions, citation rate, latency, decisions captured, records filed, median capture time, NCR days-to-close, blocked wrong-revision scans; a time-saved estimate with its assumptions printed next to it. | ☑ Everything except time saved is counted, not estimated. | Shipped |

**Demo history:** `seed/history.py` adds six months of closed NCR/downtime records, a vendor decision thread and vendor
promises with outcomes, all tagged `demo_history` and removable with `--remove`. Messages go through the real extraction pipeline.

**B7 shift handover shipped 2026-10-12 (Phase 3c):** per bay/line group; draft on demand or automatically 15 min before
shift end (shift times in Admin → Workspace, default A 06:00 / B 14:00 / C 22:00), English or Hinglish, every bullet cited;
sections machines, quality, safety, open items, what changed, watch out (with past lessons); the outgoing person edits and signs, the
incoming crew acknowledges (Needs-you + push); unacknowledged after 30 min escalates to admins in the group; `shift_handover` agent
tool. Demo: `uv run python -m seed.shift` stages a realistic shift in Shop Floor - Bay 2 (`--remove` undoes).

**Saathi Live shipped 2026-10-12 (after Google AI Edge Foresight, on Gemini in the cloud instead of on-device Gemma):**
in-meeting copilot that records the microphone (+ the Meet/Teams/Zoom tab's audio when shared) in 12-second chunks; Gemini
transcribes each chunk and detects questions; each question is answered in seconds from the sources picked as meeting context
(knowledge hub uploads, Drive files, workspace files, past meetings) plus everything else the person can access, with citations.
HUD with A−/A+ and dismiss, typed questions, and a Picture-in-Picture pop-out that floats over the meeting (Chrome/Edge).
"End meeting" turns notes + transcript + answers into a Saathi meeting (summary, decisions captured to the decision log, action
items) with **enhanced notes**. Personal **knowledge hub** (PDF, text/markdown/CSV, images, audio; labels) and **topic wikis**
that flag contradictions between sources. **Briefing**: upcoming calendar meetings with suggested sources. Audio is never stored;
transcripts are private to the person who ran the session.

**Still planned:** B9 inspection dossier, B11 expiry radar, A2 approvals, A4 voice out, A6 translation.

---

## 1. Problem statement

In an Indian manufacturing plant (our reference customer is a rail rolling-stock component maker), the information that matters is spread across three places:
- **Conversations:** WhatsApp groups, phone calls, chat.
- **Paper:** printed drawings, NCR forms, shift logbooks, test certificates in files.
- **Systems of record:** ERP for orders, stock and production; PDM/PLM for drawings and revisions.

The systems of record only know what someone re-typed into them, days later.

The consequences are expensive and repeated:
- parts made to a **superseded drawing revision**,
- defects and breakdowns that are **never formally recorded**, so root causes repeat,
- **shift handovers** that lose open issues,
- **customer inspections (RDSO)** that need days of document hunting,
- **vendor promises** that slip without anyone noticing a pattern.

Office staff lose hours a week chasing approvals and re-reading channels. Shop-floor staff (phone only, gloves, noise, Hindi) are not served by desk software at all.

**Cost of not solving it:** scrap and rework, audit findings, late dispatches, and decisions made without data. And Saathi stays "a better Teams", which a company will not switch for.

## 2. Goals

| # | Goal | Type | Measure (pilot plant, 8 weeks after launch) |
|---|---|---|---|
| G1 | **Zero wrong-revision builds** where Saathi is used | Business / quality | 0 builds to a superseded revision on QR-stamped drawings; 100% of scans return a correct current/obsolete verdict in the eval set |
| G2 | **Capture what the floor knows, without forms** | Business | ≥ 3× more NCR + downtime records per week than the paper baseline; median capture time ≤ 45 s from photo/voice to confirmed record |
| G3 | **Every employee clears their day from one place** | User | ≥ 60% of weekly active users use the Needs-you queue ≥ 3 days/week; median approval turnaround ↓ 50% vs email |
| G4 | **Answer traceability and audit questions in minutes, not days** | Business | "Which jobs used heat X?" answered correctly in ≤ 30 s (eval, 10/10); RDSO dossier assembled with gaps flagged in ≤ 10 min vs 1–2 days |
| G5 | **Read from ERP and PLM, never fight them** | Business | ERP/PLM answers cite their source record; 0 writes to ERP/PLM in Phase 3; the PLM release state is authoritative for Revision Guard when connected |

## 3. Non-goals

| Non-goal | Why |
|---|---|
| **Replacing ERP, MES, QMS or PLM** | They're the systems of record and deeply embedded. Saathi is the conversational layer and the capture layer; it connects to them and doesn't compete with them. |
| **Writing back to ERP/PLM in Phase 3** (creating POs, releasing revisions, posting goods receipts) | Write access multiplies the security, validation and blast-radius risk. Phase 3 is read-only; write-back (with human approval) is a Phase 4 decision. |
| **Real-time machine telemetry (OPC UA, PLC, IIoT)** | Different hardware, protocols and buyers. Downtime capture starts human-reported; machine signals can be a later source for the same records. |
| **Statutory e-signatures (21 CFR Part 11 style) and a validated QMS** | Approvals in Phase 3 are auditable business approvals, not regulatory e-records. Avoid implying compliance we haven't validated. |
| **Individual employee performance scoring** | Reliability metrics are per vendor and per team only. Per-person scores would destroy trust and adoption on the floor. |
| **Building our own speech or translation models** | Use Google Cloud (Speech-to-Text, Text-to-Speech, Gemini) through the existing GCP setup. |

## 4. Personas

| Persona | Reality | What Phase 3 gives them |
|---|---|---|
| **Operator / supervisor (Suresh, Bay 2)** | Phone only, Hindi first, gloves, noise, shared devices, lives in WhatsApp | Voice notes, snap-to-record, shift handover, "spec kya hai?" answers, QR scan |
| **QA engineer / manager (Neha)** | Paper NCRs, test certificate files, audits, customer inspections | NCR inbox and corrective-action tracking, traceability, dossier builder, expiry radar |
| **Design engineer (Prince, Amit)** | Revisions, deviation requests, floor queries | Revision Guard, approvals, PLM-backed answers |
| **Procurement lead (Rahul)** | Vendors, POs, dispatch promises | Vendor promise scorecard, ERP PO/stock answers |
| **Plant head (Kavya)** | No real-time picture; chases updates | Daily huddle board, escalations, approvals queue |
| **IT/ERP admin** | Owns ERP/PLM security; fears shadow IT | Read-only connectors, an on-prem bridge with an outbound-only connection, audit, per-workspace switches |

## 5. User stories (priority order)

### A. Revision control
1. As a **shop-floor supervisor**, I want to scan the QR on a printed drawing and see immediately whether it's the current released revision, so that we never machine parts to an obsolete drawing.
2. As a **design engineer**, I want Saathi to warn anyone who shares, asks about or downloads a superseded revision, and point them to the current one, so that wrong revisions stop spreading in chat.
3. As a **QA manager**, I want every released drawing to get a QR-stamped "controlled copy" PDF, with the print date and who printed it, so that printed copies can be audited.
4. As a **design engineer**, when PLM is connected, I want Saathi to treat PLM's released state as the truth and show Saathi's own extraction only as a fallback, so that there is one source of truth.

### B. Snap-to-record
5. As an **operator**, I want to photograph a defect or say "CNC-3 spindle alarm, do ghante se band" and have Saathi draft a defect report (NCR) or downtime record with the part, drawing, job and machine filled in, so that I report it in seconds without a form.
6. As a **QA engineer**, I want an NCR inbox with status (open → contained → root cause → corrective action → closed), owners and due dates, so that nothing is lost and audits are easy.
7. As a **worker**, I want to report a near miss anonymously, so that I can raise safety issues without fear.
8. As a **maintenance lead**, I want downtime records per machine, with time to repair and the top reasons, so that I can fix the chronic problems.

### C. Shift handover
9. As an **incoming supervisor**, I want a handover brief for my bay (machine status, quality holds, open promises, safety notes, what changed), drafted from the outgoing shift's activity, so that I start informed.
10. As an **outgoing supervisor**, I want to edit and sign off the draft in under 2 minutes, so that the handover is accurate without writing it from scratch.

### D. Traceability, audits, vendors, compliance
11. As a **QA manager**, I want to ask "which jobs, parts and dispatches used heat H-77812?" and get a traced answer with documents, so that I can contain a material problem fast.
12. As a **QA manager preparing for an RDSO inspection**, I want Saathi to assemble the dossier (drawings at the current revision, MTCs, inspection reports, calibration certificates) and flag gaps, so that preparation takes minutes.
13. As a **procurement lead**, I want each vendor's promise-kept rate and average slip, from chat, email and ERP receipts, so that I negotiate and plan with facts.
14. As a **QA / HR admin**, I want reminders 30, 7 and 1 days before welder qualifications, gauge calibrations and approvals expire, so that we're never caught out of date.
15. As a **plant head**, I want a daily huddle board (output vs plan, quality holds, downtime, safety, escalations), so that the morning meeting runs on data.

### E. Everyday productivity
16. As **any employee**, I want one ranked "Needs you" queue (mentions, approvals, assigned tasks, email promises, overdue items) with one-tap actions, so that I clear my day in one place.
17. As a **manager**, I want approval requests (deviation, PO, leave, drawing release) as cards in chat with Approve/Reject plus reason and an audit trail, so that approvals don't sit in inboxes.
18. As a **Hindi-first user**, I want to talk instead of type and have answers read aloud, so that I can use Saathi with my hands busy.
19. As a **user**, I want "remind me about this message" and scheduled send, so that I follow up at the right time.
20. As a **bilingual team**, I want one-tap translation between English and Hindi on any message, so that the supervisor and the design engineer understand each other.
21. As a **knowledge worker**, I want focus time to set Do not disturb from my calendar, and a weekly review of what I closed and what slipped, so that I protect deep work and improve.

### F. Systems of record
22. As a **planner**, I want to ask "status of PO-0412" or "stock of M24 bolts" and get the ERP answer with a link, so that I don't log into the ERP for a quick check.
23. As an **IT admin**, I want to connect ERP and PLM read-only through a bridge running inside our network, with an outbound-only connection, so that no inbound firewall holes are needed.
24. **Edge cases:**
    - A QR is scanned by someone who isn't signed in: show only the verdict, with no drawing content.
    - The PLM is unreachable: use the last-known state, show its age, and never claim "current" if the data is older than 24 h.
    - An AI-drafted NCR is never filed without human confirmation.
    - An ERP answer is labelled with its as-of time.

## 6. Requirements

Effort: **S** ≤ ½ day · **M** ≈ 1 day · **L** ≈ 2–3 days · **XL** ≈ 1 week+. "3a" means in the hackathon cut.

### 6A. Everyday productivity

| ID | Pri | Requirement | Acceptance criteria | Effort |
|---|---|---|---|---|
| A1 | **P0 · 3a** | **Needs-you queue**: one ranked list merging unread mentions and thread replies, tasks assigned to me, pending approvals (A2), untracked email promises, items due or overdue today, and NCRs/handovers awaiting me. One-tap actions: done, snooze (1 h / tomorrow / next week), delegate, open. Replaces the separate My Day cards at the top of My Day. | ☐ Ranking: overdue > approvals > due today > mentions > promises. ☐ Snooze hides the item until then and survives reload. ☐ An empty state with "You're clear" when nothing is pending. | M |
| A2 | **P0** | **Approvals in chat**: `approvals` with type (deviation, drawing release, PO, generic), requester, approver(s), attachments or refs, status, decision reason, timestamps. Shown as a card in the chat, the Needs-you queue and push. Approver-only actions. | ☐ Audit-log entry for create, approve and reject. ☐ A decision posts a system line in the chat. ☐ The requester can't approve their own request. ☐ Optional sequential approvers (two-step). | L |
| A3 | **P0 · 3a** | **Voice in**: hold-to-talk in the composer, Saathi and snap-to-record. Audio is transcribed (Hindi, Hinglish, English); the transcript is posted with the audio and runs through the promise, decision and record extractors. | ☐ Word error rate on 20 labelled Hinglish shop-floor clips is reported in the eval (target ≤ 20%). ☐ Audio ≤ 2 min and ≤ 5 MB. ☐ The audio file is kept with the message, private to chat members. | M |
| A4 | **P1** | **Voice out**: a "read aloud" button on Saathi answers and handover briefs (Hindi or English voice). | ☐ Plays on iPhone (installed app) and Android Chrome. | S |
| A5 | **P1** | **Remind me about this message**, plus **scheduled send** (the existing scheduler job delivers due items). | ☐ The reminder lands in the Needs-you queue and as a push. ☐ Scheduled messages can be edited or cancelled before sending. | S |
| A6 | **P1** | **Inline translation** EN↔HI on any message (cached per message and language). | ☐ The original stays visible on toggle. ☐ Technical tokens (part numbers, revisions) are untouched. | S |
| A7 | **P2** | **Focus time** (automatic Do not disturb from calendar blocks titled "Focus" or similar) and a **weekly review** (closed, slipped, promises kept) delivered Monday 09:00. | — | M |

### 6B. Manufacturing core

| ID | Pri | Requirement | Acceptance criteria | Effort |
|---|---|---|---|---|
| B1 | **P0 · 3a** | **Revision register**: a normalized `drawings` collection keyed by `(org, drawing_no)` with revisions (rev, status = released / superseded / in-work, approved_by, date, source = Saathi-extracted / PLM, file ref). Built from document extraction today; PLM-fed when connected (E3). | ☐ Rev C released ⇒ Rev B automatically superseded. ☐ Manual override by QA with an audit entry. ☐ Each revision links to its source file or PLM item. | M |
| B2 | **P0 · 3a** | **Revision Guard in chat and the assistant**: when a superseded revision is shared, referenced (for example "Rev B") or downloaded, show a banner: "⚠ Superseded by Rev C, approved by {name} on {date}" with a link to the current revision. Saathi always answers with the current revision. | ☐ Eval: 10 prompts and shares involving old revisions, 10/10 flagged correctly with 0 false alarms on current ones. ☐ The banner shows within 5 s of the file upload finishing. | M |
| B3 | **P0 · 3a** | **QR-stamped controlled copies**: "Print controlled copy" generates a PDF with a QR plus "CONTROLLED COPY · Rev C · printed {date} by {name}" in the margin. The QR encodes `/r/{token}`, where the token is an HMAC-signed id (no enumeration). The public scan page shows **only** drawing number, revision and a verdict (✅ current / ❌ superseded → "Get Rev C from QA" / ⚠ status unknown), with no file content and no names. Signed-in members get "Open current revision". | ☐ The verdict reflects the register within 60 s of a new release. ☐ Tampered or unknown tokens show "Not a valid Saathi code". ☐ The scan page works without login and loads in < 2 s on 4G. ☐ Every scan is logged (time, verdict, coarse location if permitted). | L |
| B4 | **P0 · 3a** | **Snap-to-record: NCR**: a photo (and optional voice/text) → Gemini drafts an NCR: part, drawing and revision, job, heat number (linked to the test certificate), defect type, location, quantity, severity, suggested containment. The user confirms or edits, and it is filed in `records` with a number (NCR-2026-0001). Owner = QA on duty (workspace setting). | ☐ Nothing is filed without confirmation. ☐ Fields Saathi can't infer are left blank and highlighted, not invented. ☐ Eval: 15 labelled defect photos and notes, ≥ 80% of filled fields correct. | L |
| B5 | **P0 · 3a** | **NCR inbox and corrective actions**: list and detail with status flow (open → contained → root cause → corrective action → verified → closed), owner, due dates, linked tasks (assignable, Phase 2 tasks), comments in a thread. | ☐ Status changes are audited. ☐ Overdue NCRs show in the owner's Needs-you queue. ☐ Export as PDF and CSV. | M |
| B6 | **P1** | **Snap-to-record: downtime and safety**: same pipeline. Downtime = machine (asset register B12), reason, start and end, creates a maintenance task, and tracks time to repair. Safety near-miss = location, hazard, photo, **anonymous option** (reporter id dropped before storage, so an admin can't recover it). | ☐ Downtime closes when the machine is marked running. ☐ An anonymous report has no reporter id in any collection or log Saathi writes. | M |
| B7 | **P1 · 3a stretch** | **AI shift handover**: per bay or line, at a configured shift end (for example 06:00, 14:00, 22:00) Saathi drafts a handover from the shift's chats, records, downtime, holds, tasks and promises. The outgoing supervisor edits and signs; the incoming one acknowledges. Stored as `handovers`, with push to the incoming crew. | ☐ The draft is ready 15 min before shift end. ☐ Every bullet cites its source (message, record or task). ☐ Unacknowledged after 30 min → escalates to the plant head. | M |
| B8 | **P1** | **Traceability graph**: typed links extracted from documents and records: heat ↔ MTC ↔ material ↔ part/lot ↔ job ↔ inspection report ↔ NCR ↔ dispatch/invoice (ERP when connected). Agent tool `trace(identifier)` returns the upstream/downstream chain with citations. | ☐ The eval set of 10 trace questions is answered 9/10 or better with correct citations. ☐ Permission-filtered: the chain only shows documents the asker can access, with a count of hidden items. | L |
| B9 | **P1** | **Inspection dossier builder (RDSO/customer)**: pick product, drawing or job and the inspection type. Saathi assembles the current-revision drawings, MTCs, inspection reports and calibration certificates, flags gaps (missing, expired, superseded), and exports a zip plus an index PDF. | ☐ Gaps listed with owners. ☐ A re-run after fixes shows "complete". | M |
| B10 | **P1** | **Vendor promise scorecard**: vendors as entities (name aliases, email domains, ERP vendor code). Promises from chat, email and meetings are matched to outcomes (ERP goods receipt, or a "delivered" message or task done). Shows kept %, average slip and trend, at vendor and team level only. | ☐ Each score links to the underlying promises. ☐ Visible to procurement and admins only (role-scoped). | M |
| B11 | **P1** | **Expiry radar**: `expiries` from documents (welder qualification / WPQ, gauge calibration, customer approvals, certificates) with an owner and date; reminders at 30, 7 and 1 days to the owner and QA; shown on the huddle board. | ☐ Extraction confirms the date before tracking. ☐ Expired items block "dossier complete". | S |
| B12 | **P1** | **Asset and line register**: plants → lines/bays → machines (id, name, QR label), used by downtime, handover and the huddle board. CSV import. | ☐ The machine QR opens the "report downtime" form prefilled. | S |
| B13 | **P2** | **Daily huddle board (tier meeting)**: by plant/line for a date: output vs plan (ERP), quality holds/NCRs, downtime, safety, escalations, expiries, plus Saathi's three-bullet brief. A full-screen TV mode. | — | M |

### 6C. Connectors: ERP and PDM/PLM

**Design principle.** Extend the Phase 2 connector framework (`agent/app/connectors.py`) with **workspace-level** connectors, configured by admins, in addition to the existing per-user Google connector.
- **Read-only** in Phase 3.
- **Caching:** records are cached into Firestore with an `as_of` timestamp and indexed like other sources.
- **Permissions:** inherited from a role mapping that admins configure (for example, only procurement sees POs).
- **On-premises systems:** reached through the **Saathi Bridge** (E1), never through inbound firewall holes.

| ID | Pri | Requirement | Acceptance criteria | Effort |
|---|---|---|---|---|
| E1 | **P0 (for 3c/3d)** | **Saathi Bridge**: a small container (Docker or a Windows service) installed in the plant network. It opens an **outbound-only** connection to Saathi (HTTPS/WebSocket via Cloud Run or Pub/Sub), authenticates with a per-workspace key (rotatable, stored in KMS-wrapped form), and executes only **allow-listed read queries** against local ERP/PDM endpoints. | ☐ No inbound ports opened. ☐ Every query is logged on both sides. ☐ The admin can pause the bridge and revoke its key. ☐ Health shown in Admin → Integrations. | XL |
| E2 | **P0 (3c)** | **ERP read connector**: adapters behind one interface (`get_po`, `po_lines`, `goods_receipts`, `stock(item)`, `production_order(job)`, `vendor(code)`, `item(part_no)`). Targets in priority order:<br>1. **SAP Business One** (Service Layer REST)<br>2. **SAP S/4HANA** (OData APIs, for example purchase order, material stock, production order)<br>3. **Tally Prime** (XML over HTTP / ODBC via the Bridge)<br>4. **ERPNext** (REST)<br>5. **Oracle Fusion / Microsoft Dynamics 365** (REST/OData) | ☐ The agent tool `erp_lookup` answers PO status, stock and job status with the ERP doc number and as-of time. ☐ Role mapping enforced (procurement-only data hidden from others). ☐ The cache refreshes on schedule, plus on demand with a rate limit. | XL (per ERP: L) |
| E3 | **P0 (3d)** | **PDM/PLM read connector**: items, documents, revisions and lifecycle states (released, in-work, obsolete), BOM (where available), and change orders (ECR/ECN). Adapters:<br>1. **SOLIDWORKS PDM** (on-prem, via Bridge, PDM API)<br>2. **Autodesk Vault** (Vault REST API)<br>3. **PTC Windchill** (Windchill REST Services / OData)<br>4. **Siemens Teamcenter** (Teamcenter REST/SOA services)<br>5. **Cloud:** Onshape, Autodesk Fusion Manage, Arena | ☐ When connected, the revision register (B1) is **PLM-authoritative**: release, supersede and obsolete come from PLM lifecycle states. ☐ Revision Guard and the QR verdict use PLM state, and show "status unknown" if the PLM sync is > 24 h old. ☐ Approved ECNs post to the linked channel ("Rev D released via ECN-112"). | XL (per PLM: L) |
| E4 | **P1** | **ERP + PLM in the graph**: ERP goods receipts close vendor promises (B10) automatically; PO, GRN, production order and dispatch link into traceability (B8); the PLM BOM links parts to drawings. | ☐ A vendor's "dispatch by 15th" promise auto-resolves when the GRN posts. | L |
| E5 | **P2** | **Write-back with approval** (create a PO request, post an NCR to the QMS, raise an ECR in PLM) through A2 approvals. Phase 4. | — | — |

### 6D. Channels

| ID | Pri | Requirement | Acceptance criteria | Effort |
|---|---|---|---|---|
| W1 | **P1 pilot** | **WhatsApp bridge** (see decision §7): a workspace-level WhatsApp Business number. Verified employees (phone number linked in their profile) send text, voice or photos. Saathi routes the content into snap-to-record, the right chat (by keyword or menu), or a question to Saathi; replies come back on WhatsApp. | ☐ Only phone numbers verified in the workspace are accepted; others get a generic reply. ☐ Media is downloaded into Saathi storage, and WhatsApp-side copies follow Meta's retention. ☐ Admin switch per workspace (off by default). | L |
| W2 | **P2** | Shared shop-floor kiosk or tablet mode (PIN login, auto sign-out). | — | M |

## 7. Decision record: WhatsApp bridge

**Context:** the shop floor runs on WhatsApp. Asking operators to adopt a new app is the riskiest assumption in Phase 3 (§9).

| Option | Pros | Cons |
|---|---|---|
| A. No bridge; installable app only | Simplest; data stays in our stack | Adoption risk on the floor stays unaddressed |
| **B. WhatsApp Business Cloud API bridge (chosen, as a P1 pilot)** | Meets workers where they already are; zero training | Per-conversation cost; content passes through Meta; template approval; phone-number identity |
| C. Unofficial WhatsApp automation | Fast | Violates WhatsApp terms; bans; not enterprise-grade. **Rejected.** |

**Decision:**
- Build the **installable app first** (Phase 2 PWA + voice + snap-to-record).
- Run **a 2-week WhatsApp bridge pilot (B)** in one bay, after a **manual Wizard-of-Oz test**: a supervisor forwards WhatsApp reports to Saathi, and we measure volume and quality.
- **Go/no-go criterion:** at least 2× more records from the pilot bay than from a comparable app-only bay.
- **Conditions:** off by default; admin opt-in; disclosed in the Privacy Policy before launch (content processed by Meta; retention); only verified employee numbers.

## 8. Architecture alignment

| Concern | Today (Phases 1–2) | Phase 3 change |
|---|---|---|
| Web | Next.js 16 on Cloud Run (`saathi-web`), PWA, push, app rail | New rail entries:<br>• **Quality** (NCR inbox, dossiers, expiries)<br>• **Plant** (handover, downtime, huddle board, assets)<br>• **Approvals** inside the Needs-you queue<br>New public route `/r/[token]` (QR verdict, no auth, no content, rate-limited) |
| API | FastAPI + ADK on Cloud Run (`saathi-api`), routers per domain | New routers: `records` (NCR, downtime, safety), `approvals`, `drawings` (register, QR, stamp), `handovers`, `trace`, `vendors`, `expiries`, `assets`, `bridge`, `erp`, `plm`, `whatsapp` (webhook). Stamped PDFs via `pypdf` + `reportlab` (already a dev dependency) + QR via `segno` |
| AI | Gemini 3.8 Flash agent (8 tools), 3.5 Flash-Lite classifiers, Document AI, `gemini-embedding-001` | **Agent tools:** `trace`, `erp_lookup`, `plm_lookup`, `revision_status`, `draft_record`, `request_approval`.<br>**Vision:** NCR drafting from photos.<br>**Audio:** Speech-to-Text v2 (Chirp, `hi-IN`/`en-IN`) or Gemini audio input (decide by WER eval, Q3).<br>**Speech out:** Cloud Text-to-Speech (`hi-IN`/`en-IN`).<br>Translation via Gemini (with protected tokens) |
| Data (Firestore, asia-south1) | users, orgs, chats/messages, files, chunks (vector), tasks, meetings, notifications, connections, external_items, events, user_settings, audit_log | New collections:<br>• `drawings` (+ revisions), `qr_tokens`, `qr_scans`<br>• `records` (type = ncr / downtime / safety), `approvals`, `handovers`<br>• `assets`, `vendors`, `expiries`, `trace_edges`<br>• `erp_cache/{type}`, `plm_items`, `bridges`<br>All carry `org_id`; rules follow the Phase 2 pattern (membership, role, owner); new chunk `source_type`s: `record`, `erp`, `plm` |
| Permissions | Workspace roles (owner/admin/member/guest), membership-scoped search | New **functional roles** inside a workspace (quality, procurement, maintenance, plant_head), assigned in Admin, used for record visibility, scorecards and ERP data scopes. **Guests** never see records, ERP or PLM data |
| Integrations | Per-user Google connector (OAuth, KMS-encrypted tokens) | **Workspace connectors:** credentials in Secret Manager or KMS, configured by admins; the Bridge for on-prem systems; WhatsApp Cloud API webhook (signature-verified) |
| Jobs | Scheduler: reminders (1 min), Google sync (10 min) | Plus: shift-handover drafts (per shift), expiry reminders (daily 08:00), ERP/PLM cache refresh (5–15 min), weekly review (Mon 09:00), huddle board pre-compute (daily 07:00) |
| Security & audit | Audit log, rate limits, CSP, Privacy Policy | Audit for approvals, record status changes, QR prints and scans, connector config and Bridge queries. **Privacy Policy update before each launch:** voice, ERP/PLM, WhatsApp, anonymous reports. A public QR route with a strict rate limit and no PII |
| CI/CD | GitHub Actions + WIF, rules deploy, per-service deploys | Rules tests for new collections in CI; Bridge image built and published to Artifact Registry (separate job); connector contract tests with recorded fixtures (no live ERP in CI) |

**Invariants added in Phase 3:**
1. AI drafts and humans confirm, for every record, approval and handover.
2. ERP and PLM are read-only and source-cited, with an as-of time.
3. Public endpoints (QR) never reveal content or names.
4. The anonymous safety reporter id is never stored.

## 9. Success metrics

| Metric | Type | Target (success / stretch) | Measured by |
|---|---|---|---|
| Wrong-revision builds on stamped drawings | Lagging | 0 / 0 | QA NCR cause codes, pilot plant |
| QR verdict accuracy | Leading | 100% on 30-case eval | `eval/` new section |
| Revision Guard precision / recall | Leading | ≥ 0.95 / ≥ 0.9 | 20-prompt eval |
| Records captured per week (NCR + downtime + safety) | Leading | 3× / 5× paper baseline | `records` count vs paper log |
| Median capture time (photo/voice → confirmed) | Leading | ≤ 45 s / ≤ 30 s | Client timing events |
| NCR field accuracy (drafted vs confirmed) | Leading | ≥ 80% / 90% | Diff on confirm |
| Needs-you queue weekly usage | Leading | 60% of WAU on ≥ 3 days | Product events (BigQuery) |
| Approval turnaround | Lagging | −50% vs email | Approvals timestamps |
| Handover acknowledged on time | Leading | ≥ 85% within 30 min | `handovers` |
| Trace question accuracy | Leading | ≥ 9/10 | Eval |
| Dossier prep time | Lagging | ≤ 10 min vs 1–2 days | Pilot timing |
| Hinglish voice WER | Guardrail | ≤ 20% | 20-clip eval |
| Leaks (cross-org, guest, role-scoped ERP) | Guardrail | 0 | Phase 2 isolation suite, extended |
| Assistant latency (median) | Guardrail | ≤ 7.5 s | BigQuery |

## 10. Timeline and phasing

**Phase 3a: hackathon cut (2026-10-11 → 10-18).** The demo story: *"A worker scans an old drawing → it's blocked → they snap the defect → the NCR is drafted in Hindi voice → QA sees it in Needs-you → Saathi traces the heat number."*

| Day | Person A (web / UX) | Person B (API / AI) |
|---|---|---|
| 10-11 → 10-12 | Needs-you queue (A1); QR scan page `/r/[token]` | Revision register (B1) from existing extractions; QR tokens + stamped PDF (B3) |
| 10-13 | Revision Guard banners in chat and assistant (B2) | Revision Guard detection + eval; `revision_status` tool |
| 10-14 | Snap-to-record UI: camera, voice, confirm form (B4, A3) | NCR drafting (vision + audio), records API, numbering |
| 10-15 *(freeze)* | NCR inbox (B5, minimal); handover draft view if time (B7 stretch) | Corrective-action flow; eval sets (QR 30, guard 20, NCR 15, WER 20) |
| 10-16 → 10-18 | Polish, mobile/iPhone pass, deck + video | Privacy Policy update (voice, QR scans), regression suite, deploy |

**Cut line if we slip:**
- Drop B7 before B5.
- Drop voice (A3) before snap-from-photo (B4).
- **Never cut confirmation before filing, or the QR no-content rule.**

**Phase 3b (2 weeks after):**
- B6 downtime and safety, B7 handover (full), B8 traceability, B9 dossier, B11 expiry, B12 assets
- A2 approvals, A5 reminders and scheduled send, A6 translation, A4 voice out
- WhatsApp **Wizard-of-Oz** test

**Phase 3c (3–4 weeks):**
- E1 Saathi Bridge + E2 ERP: first SAP Business One or Tally (customer choice, Q1), then S/4HANA
- B10 vendor scorecard with ERP receipts (E4)

**Phase 3d (3–4 weeks):**
- E3 PLM: first SOLIDWORKS PDM or Autodesk Vault (Q2), then Windchill and Teamcenter
- PLM-authoritative Revision Guard; ECN → channel
- B13 huddle board

**Phase 3e:** W1 WhatsApp pilot (if the Wizard-of-Oz test passes), A7 focus and weekly review, kiosk mode.

**Dependencies:**
- A pilot plant willing to stamp drawings and run a 4-week NCR comparison.
- ERP/PLM sandbox or test credentials from the customer's IT.
- A Meta Business verification for WhatsApp.
- Speech-to-Text API enablement.
- The Phase 2 Drive scope added on the consent screen (done separately).

## 11. Open questions

| # | Question | Owner | Blocking? |
|---|---|---|---|
| Q1 | Which ERP does the pilot plant run (SAP B1, S/4HANA, Tally, ERPNext, other), and can IT give a read-only sandbox user? | Stakeholder / customer IT | Yes, for 3c |
| Q2 | Which PDM/PLM holds drawings (SOLIDWORKS PDM, Vault, Windchill, Teamcenter, a shared drive)? If it's a shared drive, Saathi's register stays authoritative. | Stakeholder | Yes, for 3d |
| Q3 | Speech: Cloud Speech-to-Text (Chirp) vs Gemini audio input. Pick by WER on 20 real Hinglish shop-floor clips; also cost per minute. | Engineering | No (3a uses whichever wins a 1-day test) |
| Q4 | QR verdict page without login: is showing "drawing number + current/obsolete" acceptable to the customer's confidentiality policy, or must every scan require sign-in? | Stakeholder / security | Yes, for B3 |
| Q5 | NCR numbering and fields: match the plant's existing QMS form (ISO 9001 / IRIS rail quality standard)? Need a sample form. | QA (customer) | No |
| Q6 | Shift pattern per plant (2 or 3 shifts, times), and who signs handovers. | Customer ops | No (configurable) |
| Q7 | WhatsApp: data-processing terms with Meta, retention, and the customer's policy on business use of WhatsApp. | Legal / stakeholder | Yes, for W1 |
| Q8 | Functional roles: can they be derived from the ERP (user roles) or do admins assign them? | Engineering + customer IT | No |
| Q9 | Bridge hosting: Docker on Linux vs a Windows service (many plants are Windows-only), and corporate proxy support. | Engineering + customer IT | Yes, for E1 |
