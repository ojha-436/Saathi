# Saathi — Phase 5 PRD: Inspection Dossier, "Who knows?" and Supplier self-check

| | |
|---|---|
| **Status** | Draft for review · 2026-10-15 |
| **Owners** | Person A (web, UX, demo) · Person B (API, AI, platform) |
| **Hard deadline** | Hackathon submission **Sun 2026-10-18**. Feature freeze Sat 17 Oct 14:00 IST (§10). |
| **Builds on** | `main` at `9b4739d` (Phase 4 merged and live), plus the in-flight working-tree changes (21 files, `uiuxupdate.md`). These must be merged first (§12, PR-0). |
| **Decision** | 2026-10-15, after the brainstorm: **"go with #1, #2 and #3"**. Decide (#4) and Read in my language (#5) go on the roadmap slide. Same day: **Q1 yes** (Phase 4 E5/E6/E9/E10 move to the roadmap) and **Q3 yes** (seed the supplier channel and vendor guest on the live workspace as tagged, removable demo data). |
| **Strategy in one line** | **Saathi finishes the job at the three points where it stops today:** after the report (Dossier), when the documents run out ("Who knows?") and at the company boundary (Supplier self-check). |

---

## 0. Summary

- **Inspection Dossier.** One click on a finished readiness report turns it into the evidence pack the RDSO inspector receives. The pack has a cover and an index, and contains every cited drawing at its *current* revision, each certificate with its Spec Check page, NCR status pages and an open-items page. Every page is stamped with its source and revision and carries a QR code the inspector can scan to confirm the page is still current.
- **"Who knows?"** When Ask Saathi finds no source, it doesn't stop there. It names up to three colleagues likely to know, with the reason it picked each one (built only from sources the asker can see). It drafts the question for the asker to send. When the expert replies, Saathi offers the expert a one-click **"Save as answer"**, so the next person who asks gets a cited answer: *"Answered by Amit · 15 Oct"*.
- **Supplier self-check.** A vendor, invited as a guest into a private supplier channel, uploads the mill test certificate (MTC) **before dispatch**. Spec Check runs within 30 s. The vendor sees *"Do not dispatch heat H-78120"* with the failing values, and the buyer's Quality team gets an alert. Failing heats stay at the vendor instead of being rejected at receiving. Before this ships, Saathi stops showing guests the full Spec Check record (§6C S0).

### Alignment with the problem statement

| Feature | Verb it strengthens | Suggested direction | Suggested technology | Measurable gain |
|---|---|---|---|---|
| Inspection Dossier | complete everyday work · access knowledge | Document intelligence · workflow automation | Cloud Tasks → Cloud Run worker, Cloud Storage, Document AI (OCR confidence per page), ADK Research output | Evidence pack in ≤ 90 s after the report, vs 1–2 days by hand; 0 superseded revisions in the pack |
| "Who knows?" | access knowledge · collaborate | Enterprise knowledge assistant · intelligent search | Gemini (draft, structured no-source flag), Firestore vector search, BigQuery archive (P2) | Every no-source question gets a named expert in ≤ 5 s; a saved answer is cited for every later asker |
| Supplier self-check | collaborate · make decisions | Document intelligence · workflow automation | Document AI + Gemini extraction, deterministic comparator, Agent Search limits, FCM | Verdict at the vendor in ≤ 30 s, before dispatch; failing heats are caught at the vendor, not at receiving |

The four verbs are all covered already. Phase 5 adds depth: each feature completes a job that people finish by hand today, and each one gives the 3-minute video a scene (Appendix).

---

## 1. Problem statement

**The report isn't the pack.** Phase 4's Research answers *"Are we ready for RDSO on 20 Oct?"* in about 4 minutes with a cited checklist. What the inspector receives, though, is the documents themselves. A QA engineer still spends **1–2 days** (the Phase 3 baseline) collecting drawing copies, confirming each is the current revision, printing certificates and gathering NCR closure evidence. A superseded drawing in the pack is itself an audit finding. Phase 4's P1 "Export PDF" (R13) exported the report, not the evidence.

**When the documents run out, Saathi stops.** Ask Saathi correctly says *"I couldn't find that in the chats and files you can access."* That is a dead end. In a plant, the answer usually sits in one senior person's head, and the asker doesn't know who that is. When it is answered in a DM, it is lost again for the next asker, and when that person retires it leaves the company. We have no baseline for how often this happens. Phase 5 measures it first: the share of answers with zero citations in `audit_log` (Q6).

**Bad material is caught a truck-trip too late.** Spec Check already catches a failing MTC within 30 s of upload, but only when the material has *arrived*. A heat rejected at receiving costs two transport legs, the re-supply lead time and a line waiting for parts. Vendors send certificates by email today, and nobody checks them until the lot is at the gate.

**And one leak must be closed first.** The code review for this PRD found that a guest who can see a certificate can already read the whole `spec_checks` document through `GET /api/files/{id}/spec-check` (`agent/app/specs.py:549`). That includes every approved limit for the grade, the standard and clause, and a reference to the internal drawing file. No vendor exists in the workspace yet, so nothing has leaked, but the guard must ship before any vendor is invited (S0).

---

## 2. Goals

| # | Goal | Target (success / stretch) |
|---|---|---|
| G1 | **Evidence pack in minutes, not days** | Pack ready ≤ 90 s / 45 s after *Build* (p50, demo run of about 12 items). **0** superseded revisions. **100%** of pages stamped with source, revision and a QR code that resolves. **0** items outside the builder's access. |
| G2 | **No dead ends** | Every no-source answer shows a "Who knows?" card ≤ 5 s / 3 s after the answer. Expert hit@3 ≥ 80% / 90% on the eval. **0** reasons drawn from sources the asker can't see. |
| G3 | **Answer once, cited for every later asker** | 3/3 eval cases: a saved answer is returned and cited to its expert when a second person asks. **100%** of saves confirmed by the expert. |
| G4 | **Catch it before the truck leaves** | Vendor sees the verdict ≤ 30 s / 15 s after upload. Quality is alerted to every pre-dispatch FAIL or INCOMPLETE ≤ 60 s. **0** guest leaks on the vendor eval (S0). |

---

## 3. Non-goals

| Non-goal | Why |
|---|---|
| New model-written text in the dossier | The cover and summary pages use the verified report and stored data verbatim. A pack that goes to a regulator mustn't contain unverified prose. |
| Chat excerpts and full standards text as pack pages | Chat isn't evidence for an inspector. Standards are company IP (and licensed text is out of scope), so the index lists them by title and clause only. |
| DOCX/XLSX → PDF conversion, digital signatures (DSC), external expiring links | No converter in the current dependencies; DSC needs a certificate and a legal decision. Listed as P2. The pack is downloaded and handed over. |
| An expertise directory or skills profiles | "Who knows?" uses evidence that already exists (who uploaded, owned, signed or discussed), so nobody has to maintain a profile. Profiles go stale; evidence doesn't. |
| Auto-saving answers or auto-sending questions | Existing principle: the asker sends, the expert saves. Saathi drafts. |
| A vendor portal outside the workspace | Vendors already exist as guests in invited channels. Reusing that keeps one permission model. |
| Automatic NCRs for pre-dispatch failures | No material was received, so there is nothing to non-conform. Quality is alerted, and the record (if any) is a person's choice. |
| Phase 4 platform epics E5, E6, E9, E10 before 18 Oct | Moved to the roadmap to make room (Q1, agreed). They stay documented in the Phase 4 PRD. |

---

## 4. Personas

| Persona | Example (demo user) | Phase 5 job to be done |
|---|---|---|
| Plant head / project lead | Kavya | "When RDSO comes, I want the pack ready while there's still time to fix gaps, not the night before." |
| QA manager | Neha | "I want failing material stopped at the vendor, and every certificate attempt visible to me." |
| Design engineer (the expert) | Amit | "I answer the same question five times a month. I want to answer it once." |
| Shift supervisor (the asker) | Suresh | "When Saathi doesn't know, tell me who does, and help me ask without bothering the wrong person." |
| Supplier QA engineer (guest) | Om Castings QA (new seeded guest) | "Before I load the truck, I want to know the certificate will pass, and exactly what's wrong if it won't." |
| RDSO inspector (external, not a user) | — | "Every page I'm given must be current and traceable." |

---

## 5. User stories (priority order)

### A. Inspection Dossier
1. As a **plant head**, I want to turn a finished readiness report into one PDF pack for the inspector, so I don't spend two days collecting copies.
2. As a **plant head**, I want to review the item list before the pack is built (include or exclude, with reasons for anything that can't be included), so the pack contains what I intend.
3. As a **plant head**, I want every drawing in the pack to be the current released revision, even if the report cited an older file, so the pack doesn't create an audit finding.
4. As an **inspector**, I want each page stamped with its source, revision and a QR code I can scan to confirm it is still current.
5. As a **plant head**, I want an open-items page listing every gap with its owner and task status, so nothing is hidden from the people preparing the inspection.
6. *Edge:* when a cited document is a DOCX, has no file or is outside my access now, the manifest says so and lists it on the open-items page instead of failing.
7. *Edge:* when the report is re-run, I can rebuild the pack and see what changed (P1).

### B. "Who knows?"
8. As a **supervisor**, when Saathi can't find an answer, I want to see who in the plant is most likely to know and why, so I ask the right person first.
9. As a **supervisor**, I want Saathi to draft the question, including what it already checked, and send it only when I confirm.
10. As an **expert**, when I reply, I want a one-click "Save as answer" with the text pre-filled and editable, where I choose who can see it.
11. As **anyone** asking later, I want Saathi to answer from the saved answer and cite the person and date.
12. As an **expert**, I want to edit or retire an answer I saved (P1).
13. *Edge:* the reasons shown never come from conversations I'm not part of. If the only evidence is private, that person isn't suggested.
14. *Edge:* when no one stands out, Saathi says so plainly instead of guessing a name.

### C. Supplier self-check
15. As a **supplier QA engineer**, I want to upload the MTC in my supplier channel before dispatch and see PASS or FAIL in under 30 s.
16. As a **supplier QA engineer**, on FAIL I want the exact failing properties (value vs required limit) and clear next steps.
17. As a **QA manager**, I want an alert on every pre-dispatch FAIL or INCOMPLETE, with vendor, heat, PO, drawing revision and failing values.
18. As a **QA manager**, I want every certificate attempt per heat kept, and a flag when a re-uploaded certificate for the same heat has different values.
19. As a **QA manager**, I want the vendor to see only their own certificate's result: never our standards library, other grades, other vendors or internal drawings.
20. As **receiving**, when the heat arrives I want to see its pre-dispatch result (P1).
21. *Edge:* if the certificate has no drawing number, the check is INCOMPLETE ("add the drawing number from the PO"). It never falls back to the grade the vendor printed.

---

## 6. Requirements

### 6A. Inspection Dossier

| ID | Pri | Requirement | Acceptance criteria |
|---|---|---|---|
| D1 | P0 | **Entry point**: "Build dossier" in the report action bar (`Research.tsx:392`, next to `ShareButton`) for runs with `status == "done"` and `template == "readiness"`. Owner only. | ☐ Hidden for other templates and other users. ☐ API rejects non-owners (`_own()`). |
| D2 | P0 | **Manifest**: resolve every cited ref in the report into items, grouped in this order: **Drawings** (`file:` with `doc.doc_type == engineering_drawing`), **Material certificates** (`test_certificate` + `spec_checks/{file_id}`), **Inspection and test reports** (`inspection_report`), **Non-conformances** (`rec:`), **Decisions and concessions** (`dec:`), **Standards referenced** (`std:`, index only). `vendor_quote` and `purchase_order` are listed but **excluded by default** (commercial). `msg:`, `kn:`, `mail:` and `drive:` are not pack items. | ☐ Manifest returns in ≤ 5 s for ≤ 40 refs. ☐ Each item shows title, revision or verdict, source chip and an include toggle. ☐ Items that can't be included show why (format, no file, no access) and go to the open-items page. |
| D3 | P0 | **Current revision now**: for each drawing, look up the register (`drawings.lookup`, `norm_no`, `norm_rev`) **at build time**. If the cited file is superseded, include the current released revision's file instead and note *"Report cited Rev B; Rev C is current"*. If the current revision has no file, or the builder can't open it, list it as a gap. | ☐ 0 superseded revisions in the eval pack. ☐ In-work (draft) revisions never included. |
| D4 | P0 | **Access re-check at build time**: every item is re-checked with `research.ref_visible_to(ref, [owner_uid], org_id)` and file membership (`download_file` logic). | ☐ The Prince-built eval pack contains nothing from `FORBIDDEN_REFS` (`dm_amit_neha`, `file008` Rev D draft). |
| D5 | P0 | **Build job** `dossier-build` on `saathi-worker` (`jobs.register` / `enqueue`, idempotent status check as in `research.execute`). Progress is written to `research_runs/{id}.dossier` (`status: building|ready|failed`, `progress`, `items`), which the owner can already read, so **no new Firestore rule**. | ☐ Ready ≤ 90 s p50 on the demo run. ☐ Survives closing the tab. ☐ A failure keeps the manifest and shows the reason. |
| D6 | P0 | **Cover and index** (reportlab): workspace name, goal, inspection date (`context.due_date`), readiness and verdict **verbatim from the report**, prepared by, generated at (IST), dossier id. The index has #, section, document, revision or verdict, source and page range. | ☐ No new model-generated text in the PDF. ☐ Page ranges in the index match the merged pages. |
| D7 | P0 | **Summary pages** (reportlab): a **Spec Check page** before each certificate (verdict, rows with value, limit and clause, grade, drawing revision used); a one-page **NCR summary** per `rec:` (number, status, containment, root cause, corrective action, verification, closed date); a one-page **decision summary** per `dec:`. | ☐ Values match `spec_checks`, `records` and `decisions` exactly (eval). |
| D8 | P0 | **Stamp and QR on every page**: generalise `drawings._stamp` (header text, position and colour as parameters; the controlled-copy stamp stays the same). Footer band: *"Saathi dossier {id} · Item 3/12 · SRC-BF-2041 Rev C, current at 15 Oct 14:02 IST · page 7/42"*. Drawings carry the controlled-copy QR → `/r/{token}` (`qr_tokens`, existing public page), which shows the revision's status **now** (current, or superseded). Respects `settings.qr_public`. *As built (15 Oct): QR on drawings only. The public page shows status without sign-in, so QR pages for certificates or NCRs would expose plant records.* | ☐ 100% of pages stamped. ☐ Scanning a stamped drawing page shows the live register status. |
| D9 | P0 | **Open-items page**: every report gap (owner, due date, task status), each checklist item at *risk* or *gap*, every unknown, and every item excluded in D2 with its reason. It can't be removed in v1 (see Q2). | ☐ The eval pack lists the missing UT report for W7 and the Lot 2 FAIL. |
| D10 | P0 | **Storage and download**: PDF in GCS at `dossiers/{org}/{run_id}/{dossier_id}.pdf`, streamed through an authenticated proxy GET (no signed URLs exist). Owner only. Audit `dossier.built` and `dossier.downloaded`. Images become one-page PDFs (Pillow and reportlab already present). | ☐ Packs ≤ 25 MB stream without hitting Cloud Run's 32 MiB response cap. ☐ Over the cap → "deselect items" message. |
| D11 | P1 | **Share to a channel** with the Phase 4 share check: blocked (with a list) unless every member can open every item. | ☐ Eval: sharing into a channel without access to an item is blocked. |
| D12 | P1 | **Rebuild with delta**: *"2 gaps closed, Rev D released since the last pack."* | |
| D13 | P2 | Inspector copy without the open-items page; external expiring link; DSC signature; DOCX/XLSX conversion; customer pack templates (FAI, PPAP-style). | Design D6–D9 so the templates are data, not code. |

**Principle: the pack only repeats what is already verified.** Research verified the claims; the dossier adds documents and stamps. Every number on a summary page comes from a stored record, and every page traces back to a source by its stamp and QR.

### 6B. "Who knows?"

| ID | Pri | Requirement | Acceptance criteria |
|---|---|---|---|
| W1 | P0 | **No-source flag** on Ask Saathi answers. The system prompt (`agent.py:396`) tells the model to end a no-source answer with a sentinel token; the server strips the token and sets `no_source: true` on the assistant message. Fallback: zero valid citations **and** an empty `prefetched` list. Never set for task or reminder requests, drafts, charts or greetings. Also fix the audit `cited` regex (`main.py:738`) to count `kn`, `ho`, `std` and `ans`. | ☐ ≤ 1 false positive on 10 answerable questions. ☐ ≥ 9/10 flagged on 10 unanswerable ones. |
| W2 | P0 | **Expert ranking in code** (`who_knows(question, asker)`, new module `agent/app/experts.py`), run **after** the answer is written so it never delays it. Signals, all from sources the asker can access: **(a) entity owners**: drawing numbers and heats in the question (regex + `norm_no`) → uploader of the current revision's file (`files.uploaded_by`, only revisions `visible` to the asker), records the asker participates in (`owner`, the closer from `history`); **(b) near-miss authors**: top search hits that weren't cited → uid via `msg` sender, `files.uploaded_by`, record owner, weighted by score and recency; **(c) plant-memory lessons** (`memory.similar`, already shows owner names workspace-wide by design); **(d) job-title fit** (`users.role` and department keyword match, low weight). Excludes the asker, guests and deactivated users. Guests can't use the feature. Returns the top 3 with `reasons[]` written from templates (*"Uploaded SRC-BF-2041 Rev C"*, *"Closed NCR-2026-0007 (porosity, side frame)"*, *"3 messages about bolster bolts in Bogie Project"*) and their refs. | ☐ hit@3 ≥ 80% on 8 eval cases. ☐ Every reason's refs are visible to the asker (leak eval). ☐ Same data → same ranking. ☐ No LLM in the ranking. |
| W3 | P0 | **"Who knows?" card** under a `no_source` answer in `AssistantView.tsx` (after `ProposedTaskCard`, before `AnswerProvenance`): up to 3 people with name, job title, presence (available, busy, in a meeting) and 1–2 reasons with source chips, plus an **"Ask {name}"** button. If nobody scores above the threshold: *"No one stands out for this. Try asking in {channel with most near-miss hits}."* | ☐ Card appears ≤ 5 s after the answer. ☐ Renders on mobile. |
| W4 | P0 | **Ask composer**: Gemini drafts a 2–4 line question containing the asker's question and what Saathi already checked (only refs the **expert** can also see; `ref_visible_to`). The asker edits, then sends as a **DM from the asker** (deterministic `dm_` id, extract a reusable `find_or_create_dm` from `create_chat`; `post_message` + `after_post` + `ingest.process_message`). The message carries `ask: {id}` and renders "Asked via Saathi". Creates `asks/{id}` with `status: sent → answered → saved | closed`. | ☐ Nothing is sent without the asker's click. ☐ The draft never quotes a source the expert can't open. |
| W5 | P0 | **Answer detection**: the expert's first reply in that DM after the ask (a thread reply to it, or the next top-level message) within 7 days sets `answered`. The asker is notified through the existing thread or DM notification. | ☐ Eval: the reply is matched to the right ask. |
| W6 | P0 | **"Save as answer" (the expert's consent)**: a chip on the matched reply, **visible to the expert only** (pattern: `PromiseChip`). It opens a card with an editable question and answer and an audience choice: **everyone in the workspace** (members only, never guests) or **a channel the expert is in**. Confirm → `answers/{id}` + chunk (`source_type: "answer"`, `ref: "ans:{id}"`) + archive mirror. Audit `answer.saved`. | ☐ Nothing saved without the expert's confirm. ☐ The DM itself stays private; only the saved text is shared. |
| W7 | P0 | **Retrieval and citation**: workspace-wide answers get the pseudo chat id `answers_{org_id}`, which `search()` adds to the chat list of every non-guest (the same idea as `knowledge_{uid}`). Channel answers use that channel's id. Wire `ans:` through `REF_RE`, `Markdown` CITE, `CiteChip` (*"Answered by Amit Sharma · 15 Oct"*), `openRef` (opens an answer card, not the DM), `ref_visible_to` and the archive SQL. The agent prompt treats saved answers as sources and names the expert. | ☐ 3/3 reuse cases cite `ans:`. ☐ A guest never retrieves a workspace-wide answer. |
| W8 | P1 | The expert can edit or retire an answer; answers older than 180 days show *"may be out of date — confirm with {expert}"*. | |
| W9 | P1 | The asker can tap "Suggest saving" on the reply; an option to post the question in the channel where the near-miss evidence lives instead of a DM. | |
| W10 | P2 | Voice: *"Source nahi mila — Amit se poochhun?"*; BigQuery archive as signal (b) across the full history; per-person "answered 12 questions on bogies" on profile cards. | |

**Principle: code ranks, people answer, the expert decides what's saved.** The model drafts the question and nothing else. The ranking is deterministic and explainable, and the saved knowledge carries a person's name.

### 6C. Supplier self-check

| ID | Pri | Requirement | Acceptance criteria |
|---|---|---|---|
| S0 | **P0, first** | **Guest-safe Spec Check** (ships before any vendor is invited): for guests, `GET /api/files/{id}/spec-check` and the `spec_check` agent tool return a **whitelisted projection**: verdict, certificate no., heat, grade checked, drawing number + released revision, and rows `{label, unit, value, required min/max, test temperature, status}`, plus plain-language next steps. **Never** returned: `std:` refs, standard name, clause and page, the drawing `file:` ref, `org_id`/`chat_id`, `values`, internal notes (the `no_limits` note names the grades in the library). Hide "Draft NCR" and "Re-check" for guests. `PATCH /api/admin/org` rejects guests in `quality_team` (`admin.py:222` uses `same_org`, which allows guests). | ☐ Guest eval: projection matches the whitelist exactly. ☐ Guest `GET /api/standards`, `GET /api/spec-checks` and `standards_library` → 403 or empty (already). ☐ Members' view unchanged. |
| S1 | P0 | **Supplier channel**: a private channel with `chats.supplier = {vendor_name}`, set by an admin or the Quality team, with exactly one vendor's guests. Demo seed: *"Om Castings · Supplier QA"* (Neha, Rahul, guest `omcastings@saathi.demo`), tagged and removable like `seed.history` (approved for the live workspace, Q3). **Never** invite a vendor into `grp_bogie` (it holds internal Om Castings NCR and Bharat Foundry pricing threads). | ☐ Seed adds and `--remove` removes cleanly. |
| S2 | P0 | **Stage**: an MTC uploaded by a guest in a supplier channel → `stage: "pre_dispatch"` on `files` and `spec_checks`; everything else → `"incoming"` (current behaviour). | ☐ Stage is set before the check runs. |
| S3 | P0 | **Buyer-side grade only**: a pre-dispatch check takes its grade from the drawing register (MTC drawing number → current released revision). No drawing found → **INCOMPLETE**: *"Add the drawing number from the PO to the certificate."* The vendor's own printed grade is never used alone. Grade mismatch → FAIL (existing). | ☐ Eval: an MTC with no drawing number → INCOMPLETE, not PASS on the vendor's grade. |
| S4 | P0 | **Vendor verdict card** (on the file card, `SpecBadge` + a guest variant of the panel): "Pre-dispatch check" label. **PASS**: *"Cleared to dispatch. Quality will verify at receiving."* **FAIL**: *"Do not dispatch heat H-78120"* + failing rows (value vs required) + next steps (re-test and upload a new certificate, or message Quality in this channel). **INCOMPLETE**: what's missing. | ☐ ≤ 30 s from upload to card. ☐ Card text renders on mobile. |
| S5 | P0 | **Quality alert**: on FAIL or INCOMPLETE, `notify()` + push to `_quality_team(org)`: *"Pre-dispatch FAIL · Om Castings · H-78120 · SRC-BF-2041 Rev C · C 0.23 > 0.22, CEV 0.49 > 0.47, impact not at −20 °C. Lot held at vendor."* with a deep link to the check. **No NCR** is drafted, and the buyer's panel says "Pre-dispatch: no material received". | ☐ Notification ≤ 60 s. ☐ No `records` or `record_drafts` doc created. |
| S6 | P0 | **Every attempt kept**: one `spec_checks` doc per upload (already). Quality sees all attempts for a heat. A re-upload for the same heat and vendor with **different values** is flagged to Quality: *"2nd certificate for H-78120: C changed 0.23 → 0.21."* | ☐ Eval: changed values → flag; identical re-upload → no flag. |
| S7 | P1 | **Receiving link**: when the same heat and vendor arrives (incoming check), show *"Pre-dispatch: FAIL 15 Oct → PASS 16 Oct (re-test)"* on the incoming verdict. | |
| S8 | P1 | Admin toggle `settings.supplier_self_check` (pattern: `settings.voice_us`); a notice when a supplier channel is AI-excluded (no check would run). | |
| S9 | P2 | Vendor scorecard (first-time-right rate pre-dispatch); concession request → Decide (#4); a vendor UI in Hindi and regional languages (#5). | |

**Principle: the vendor sees exactly what they need to fix their certificate, and nothing about us.** Limits are shown only for the rows of their own certificate's grade. Our standards, other grades, other vendors and internal drawings stay inside.

---

## 7. Architecture

### 7.1 Flow

```
Dossier      Research run (done, readiness) ── Build ─▶ manifest (refs → items, register "current now", ACL re-check)
               └─▶ Cloud Tasks "dossier-build" ─▶ saathi-worker: cover + index + summary pages (reportlab)
                     + source PDFs (GCS) merged (pypdf) + stamp/QR per item (generalised _stamp, qr_tokens)
                     ─▶ GCS dossiers/{org}/{run}/{id}.pdf ─▶ authenticated streaming GET

Who knows?   /api/assistant ─▶ answer (no_source flag) ─▶ who_knows() in code: entity owners · near-miss authors
               · plant-memory owners · job-title fit (asker-visible only) ─▶ card ─▶ Gemini drafts ask
               ─▶ asker confirms ─▶ DM (post_message/after_post) + asks/{id} ─▶ expert replies ─▶ "Save as answer"
               ─▶ answers/{id} + chunk ans:{id} (pseudo chat answers_{org}) ─▶ cited in later answers

Supplier     Guest uploads MTC in supplier channel ─▶ stage=pre_dispatch ─▶ existing Spec Check (grade from
               register only) ─▶ guest projection to vendor · notify Quality on FAIL/INCOMPLETE · attempt history
```

### 7.2 Data model additions

| Store | Collection / field | Notes |
|---|---|---|
| Firestore | `research_runs/{id}.dossier` | `{id, status, progress, items[], pages, bytes, gcs_path, built_at, build_ms}`. The owner-read rule already covers it. |
| Firestore | `qr_tokens/{token}` (existing) | New `kind: "dossier_item"` with `ref` and `dossier_id`. |
| GCS | `dossiers/{org}/{run_id}/{dossier_id}.pdf` | Served only through the API. |
| Firestore | `asks/{id}` | `{org_id, asker, expert, question, draft, chat_id, msg_id, status, answer_msg_id, answer_id, reasons[], created_at}`. API-only (catch-all deny). |
| Firestore | `answers/{id}` | `{org_id, question, answer, expert_uid, expert_name, asker_uid, source_ref, audience: {scope: org|chat, chat_id}, created_at, updated_at, retired}`. API-only. |
| Firestore | `chunks` (existing), `source_type: "answer"` | `chat_id = answers_{org_id}` or the channel id; `ref: "ans:{id}"`. Mirrored to `saathi_archive.chunks`. |
| Firestore | `assistant/{uid}/messages/{id}` | New fields: `no_source`, `experts[]`. |
| Firestore | `chats.supplier`, `files.stage`, `spec_checks.stage` | `stage: pre_dispatch | incoming`. |

No new Google Cloud APIs and no new Python or npm dependencies (reportlab, pypdf, segno and Pillow are already locked).

### 7.3 Security and governance

- **Dossier:** built with the builder's access, re-checked at build time. Owner-only download. The QR page shows status, never content (and respects `qr_public`).
- **"Who knows?":** reasons and refs come only from sources the asker can access. The only exception is plant-memory owner names, which are workspace-visible by existing design. Not available to guests. The asker sends, the expert saves, and workspace-wide answers are never visible to guests.
- **Supplier:** S0 ships first. One vendor per supplier channel. Org settings are readable by guests, so no vendor lists or routing go in `settings`. Every attempt is kept, and changed values are flagged.
- **All three:** nothing is filed or sent without a person, and every action is written to `audit_log`.

---

## 8. Success metrics

| Metric | Type | Target (success / stretch) | Measured by |
|---|---|---|---|
| Pack build time | Leading | ≤ 90 s / 45 s p50 | `dossier.build_ms` |
| Goal → pack (research + build) | Lagging | ≤ 10 min vs 1–2 days | Run timestamps + pilot timing |
| Superseded revisions in packs | Guardrail | 0 | Dossier eval + register check per build |
| Pages stamped and resolvable | Guardrail | 100% | Dossier eval |
| No-source flag precision / recall | Leading | ≤ 10% FP / ≥ 90% recall | Who-knows eval (20 questions) |
| Expert hit@3 | Leading | ≥ 80% / 90% | Who-knows eval (8 cases) |
| Asks answered within one shift | Leading | ≥ 50% | `asks` status timestamps |
| Saved-answer reuse | Lagging | Each saved answer cited ≥ 2× in 30 days | `ans:` citations in `audit_log` |
| No-source rate | Lagging | Falls month on month as answers accumulate | `audit_log` `cited == 0` (baseline first, Q6) |
| Vendor verdict time | Leading | ≤ 30 s / 15 s | `spec_checks.upload_to_verdict_ms` where `stage == pre_dispatch` |
| Failing heats caught pre-dispatch | Lagging | ≥ 80% of failing heats from onboarded vendors | `spec_checks` by stage |
| Guest leaks | Guardrail | 0 | Vendor eval (S0) |
| Permission leaks (all features) | Guardrail | 0 | Existing suite + new cases |

---

## 9. Evaluation plan (new `agent/eval/phase5_eval.py`)

| Suite | Cases | Gate |
|---|---|---|
| Dossier | Build from the RDSO readiness gold run as Prince: manifest contains the Rev C drawing, the H-77812 MTC with its Spec Check page and the inspection report; the open-items page lists the UT report for W7 (and the Lot 2 FAIL when uploaded); a run citing Rev B swaps to Rev C | 0 superseded, 0 `FORBIDDEN_REFS`, 100% pages stamped, QR tokens resolve, summary values = stored values |
| No-source flag | 10 answerable + 10 unanswerable questions as Prince | ≤ 1 FP, ≥ 9 TP |
| Who knows | 8 no-source questions with gold experts written from `seed/history.py` owners and uploaders; 2 leak cases where the only evidence is in `dm_amit_neha` | hit@3 ≥ 6/8; 0 reasons or refs outside the asker's access |
| Saved answers | Rahul saves 3 answers → Kavya asks paraphrases → `ans:` cited with expert name; a guest asks → nothing | 3/3, 0 guest hits |
| Supplier | Guest projection whitelist; guest 403 on standards, recent checks and `standards_library`; `spec_check` tool as guest is redacted; FAIL → Quality notification and no record; no drawing number → INCOMPLETE; changed-values re-upload → flag; existing 20 comparator cases unchanged | 100% |

Numbers go to the landing page and deck through `eval.export_web`, as today.

---

## 10. Timeline and phasing

| Day | Person A (web / UX) | Person B (API / AI / platform) |
|---|---|---|
| **Thu 15** (rest of day) | Review this PRD; build Phase 5 UI on top of the 14 Oct UI/UX work already on `main` (§12) | PR-0 (§12, merged as #23); **S0 guest-safe Spec Check** + `quality_team` guard; pull the no-source baseline (Q6); author the who-knows eval cases |
| **Fri 16** | Dossier: build button, manifest review, progress, download (D1, D2 UI, D10 UI). "Who knows?" card + ask composer (W3, W4 UI) | Dossier backend D2–D10 (resolver, job, cover and index, summary pages, stamp/QR, storage). W1 flag, W2 ranker, W4 send + `asks` |
| **Sat 17** (to 14:00 IST) | Save-as-answer chip and card, `ans:` chip (W6, W7 UI); vendor verdict card (S4); mobile pass | W5–W7 (detection, save, search/citation); S1–S6 (seed after go-ahead, stage, grade guard, alerts, attempt flag); `phase5_eval`; deploy behind flags |
| **Sat 17** (afternoon) | Record the video (Appendix); deck slides for the three features | Re-run all evals, export numbers; fixes |
| **Sun 18** | Submission: deck PDF, video, links | Final deploy by 12:00 IST; evals re-run; submit |

Each feature ships behind its own flag (`DOSSIER`, `WHO_KNOWS`, `SUPPLIER_CHECK`), so a broken feature can be switched off without a code change.

**Cut line if we slip (in this order):**
1. All P1s (D11, D12, W8, W9, S7, S8).
2. D7's NCR and decision summary pages (list them on the index instead); keep the Spec Check page.
3. W2 signal (d) job-title fit, then (c) plant-memory owners.
4. Supplier S1–S6, **except S0**, which ships anyway because it fixes a live leak path.

**Never cut:** S0, the access re-check at build time (D4), the current revision at build time (D3), "the asker sends / the expert saves", reasons drawn only from sources the asker can see, and the leak evals.

---

## 11. Open questions

| # | Question | Owner | Blocking? |
|---|---|---|---|
| Q1 | Move the remaining Phase 4 platform epics (E5 queue migration, E6 realtime service, E9 observability, E10 load tests) to the roadmap to make room? | Stakeholder | **Resolved 2026-10-15: yes** |
| Q2 | Does the inspector's copy include the open-items page, or is that internal only? v1 always includes it; an inspector copy is P2 (D13). | Stakeholder (you know RDSO practice) | No |
| Q3 | OK to seed the supplier channel and the guest vendor on the **live** workspace as tagged, removable demo data? | Stakeholder | **Resolved 2026-10-15: yes** (tagged, removable with `--remove`) |
| Q4 | What may a vendor see: the required limits for their own grade (default **yes**), the standard name and clause (default **no**)? | QA / stakeholder | No (defaults in S0) |
| Q5 | May any member save a workspace-wide answer, or should safety-critical topics need a QA head's second confirmation? Default: the expert alone. | QA / stakeholder | No |
| Q6 | Baseline no-source rate from `audit_log` (`cited == 0`) over the last 7 days. | Engineering | No |
| Q7 | What exactly does your QA team hand an RDSO inspector today (sections, order, signatures)? D2 uses a default order. | Stakeholder | No |

---

## 12. Dependencies

- **PR-0, before any Phase 5 code:** merge the uncommitted security-hardening changes on `main` (21 files, 14 Oct) through a branch and PR, with two fixes the review found:
  - `agent/app/drawings.py:81` calls `user_profile`, which line 21 doesn't import. Every register rebuild raises `NameError`, which `rebuild_for_file` swallows, so **the drawing register silently stops updating**. D3 depends on the register.
  - `agent/app/research.py:736`: `share_filter` reads `claim`/`title`, but findings are `{text, refs}`, so findings never reach the rewritten shared summary.
- **Already on `main` since 14 Oct** (`970910c..323cfed`, pushed directly, no PR): the `uiuxupdate.md` UI work, persona switcher, product tour, workspace onboarding and mandatory email verification (`@saathi.demo` is exempt). It changed `AssistantView.tsx`, `Research.tsx`, `SpecCheck.tsx` and `Quality.tsx`, so Phase 5 UI work starts from that code. Reviewed after the fact on 15 Oct: no blockers.
- **IAM (fixed 15 Oct):** the API service account needs `roles/firebaseauth.admin`. Without it, setting workspace claims failed for new sign-ups, and the revoked-token check in PR-0 turned every request into a 401 (12:03–12:30 IST, 15 Oct).
- **No new APIs, dependencies or Firestore indexes.** Cloud Tasks, GCS, FCM, the `saathi-research`/`saathi-jobs` queues and the chunk vector index already exist.
- **Demo content:** the supplier channel and guest (Q3); the Lot 2 MTC (`agent/seed/files/MTC_H-78120_SideFrame_Lot2.pdf`, uploaded live); a who-knows question that has **no** source in the seed data (verify by asking Saathi before recording).
- **Script fix:** the Phase 4 storyline says *"C 0.24%"*, but the Lot 2 PDF has **C 0.23** (max 0.22), CEV 0.49 (max 0.47) and impact at 0 °C instead of −20 °C.

---

## Appendix: demo storyline with Phase 5 (≈ 2 min 45 s)

1. **Problem** (10 s): evidence takes days, answers live in people's heads, bad material is found at the gate.
2. **Before the truck leaves** (20 s): Om Castings' QA uploads the Lot 2 MTC in *Om Castings · Supplier QA* → **"Do not dispatch heat H-78120"**: C 0.23 > 0.22, CEV 0.49 > 0.47, impact not at −20 °C. Neha's phone: *"Pre-dispatch FAIL… lot held at vendor."*
3. **Ready for RDSO, with the pack** (40 s): Kavya asks *"Are we ready for RDSO on 20 Oct?"* → report → *Create 3 tasks* → **Build dossier** → manifest → PDF: cover, index, stamped Rev C, the MTC with its Spec Check page, open items. Scan the QR on a phone → *"Rev C — current."*
4. **Who knows?** (30 s): Suresh asks a question with no source → *"I couldn't find that"* → card: *"Amit — uploaded SRC-BF-2041 Rev C; closed NCR-…"* → **Ask Amit** → Amit replies → **Save as answer** → next day Kavya asks → cited *"Answered by Amit · 15 Oct."*
5. **Shop floor** (20 s): Suresh by voice in Hindi (existing).
6. **Built to be trusted** (20 s): evals (0 leaks, 0 superseded pages, hit@3), provenance, Cloud Run + ADK + Agent Search + BigQuery.
7. **Close** (10 s): *"Saathi: from conversation to work that gets done, inside the plant and beyond it."*
