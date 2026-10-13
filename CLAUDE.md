# Saathi — project brief for Claude

Saathi is an AI-first team workspace (Teams-style chat + a personal AI colleague) with a manufacturing layer for an
Indian rail-component plant (demo company: Shakti Rail Components). Built by a team of two for the
**Google Cloud AI Builder Cup 2026**, theme *Future of Work & Enterprise Productivity*.

## The problem statement we are building against

> Build an AI-powered solution that transforms how individuals and organizations **access knowledge, collaborate,
> make decisions, and complete everyday work**. Solutions should demonstrate meaningful improvements in productivity,
> efficiency, knowledge accessibility, or workflow execution.

- **Suggested directions:** enterprise knowledge assistants, AI copilots, document intelligence, meeting intelligence,
  workflow automation, research assistants, intelligent search.
- **Suggested Google Cloud tech:** Gemini on Vertex AI, Vertex AI Search / Agent Search, Document AI, Vertex AI Agent
  Engine and ADK, Cloud Run, BigQuery, AlloyDB or Firestore.
- **Judging:** Technical/GenAI 40% · Problem alignment 25% · Innovation 25% · UX 10%.
- **Submission:** 2026-10-18 — deck (PDF), deployed prototype on Cloud Run/Firebase using Gemini, video ≤ 3 min.

Every new feature should map to one of the four verbs above, a suggested direction, and a **measurable** gain, and it
should be showable as a scene in the 3-minute video. Prefer depth and polish over breadth.

## Repo

- `web/` — Next.js 16 + React 19 + Tailwind 4 (Cloud Run `saathi-web`). Next 16 has breaking changes: read
  `web/AGENTS.md` and `node_modules/next/dist/docs/` before writing Next code.
- `agent/` — FastAPI + Google ADK + Gemini on Vertex AI (Cloud Run `saathi-api`, asia-south1). `uv` for Python.
- `agent/eval/` — evaluation suite (`uv run python -m eval.run_eval`); numbers feed the landing page via `eval.export_web`.
- `docs/` — Phase 2, 3 and 4 PRDs. **Current work: `docs/PRD-phase-4-agents-voice.md`** (Saathi Research, Spec Check,
  provenance in Phase 1; Saathi Voice and the enterprise-scale platform in Phase 2; both before 18 Oct).
- See `README.md` for architecture, local run and deploy commands.

## Ground rules

- Never commit env files or secrets; web config is read from Cloud Run env vars at request time.
- Every push/merge to `main` auto-deploys via GitHub Actions. Work on a branch and open a PR; merge only when the user
  explicitly says so.
- The live workspace holds real data. Never run `seed.seed` (wipes everything) or `seed.reset` without asking.
  `seed.history` / `seed.shift` demo data is tagged and removable with `--remove`.
- AI never files anything silently: tasks, records and handovers are drafted and confirmed by a person; every answer
  cites its source and is filtered to what the asker can access.
