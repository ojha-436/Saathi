# Saathi Shortcuts — design

Date: 2026-10-18 · Status: approved in chat, waiting for spec review · Branch: `saathi/shortcuts`

## 1. Why

People in the plant repeat the same jobs every week: check a PO's dispatch, chase late vendors, go over a heat's
certificates before an inspection. Today each person types the whole question to Saathi again every time. Shortcuts
let anyone in the workspace turn a job like that into their own saved bot (a name, a `/command`, steps and blanks to
fill) and run it in one line.

- **Problem-statement fit:** the verb *complete everyday work*, the direction *workflow automation / AI copilots*.
- **Measurable gain:** runs × minutes saved per run, shown on every shortcut and as a total (e.g. "used 14× · ~3 h 30
  min saved"). The eval adds draft quality and run quality (section 8).

## 2. What the user asked for, and what we assumed

Asked: users can create their own workflows or shortcuts, a bot for their own repetitive work. It ships today
(18 Oct, submission day), and for now a person starts a shortcut by hand.

Assumed (confirmed in chat):
- Any workspace member can make shortcuts, in plain words (Hinglish too). There is no code and no flow editor.
- A shortcut can do only what Saathi already does, with its creator's access and nothing more.
- AI never files anything silently: the bot is drafted and the person saves it, and anything the bot proposes
  (tasks) is a draft the person confirms.

## 3. Scope

In:
- Personal shortcuts: create (from a description, or from "Save as shortcut" on an answer), edit, delete, run.
- Running with `/command <values>` in the Saathi box, or Run on the Shortcuts tab.
- Runs and minutes-saved counters.
- A demo-login rule, an eval, and a Demo Guide step.

Out (the "next" slide): schedules, event triggers, sharing a shortcut with the team, a multi-step job engine, a
separate ADK agent per bot, any Gmail/Calendar write actions.

## 4. Approach

Approach A of three: a shortcut is saved text that runs through the existing `agent.ask()`. The scope check, the
prefetch, the tools, the access filter (`user_chats`), citations and task drafts all apply unchanged.

Rejected for today:
- **B, a recipe engine:** ordered tool steps run as jobs on the worker. It needs a new runner, a new job kind, a
  progress UI and a worker deploy.
- **C, one ADK agent per bot:** agents built on the fly with a chosen subset of tools. Riskier and hard to test in a
  day.

## 5. Data

Collection: `assistant/{uid}/shortcuts/{id}`. It is server-only: no Firestore rules change, and all access goes
through the API.

| field | type | notes |
|---|---|---|
| `name` | str ≤ 60 | "Dispatch check" |
| `command` | str | `^[a-z0-9][a-z0-9-]{1,29}$`, unique per person and workspace; not a reserved word (`clear`, `help`, `new`) |
| `instruction` | str ≤ 1500 | plain-language steps, e.g. "1. Find the PO's delivery schedule. 2. Check the latest MTC against spec…" |
| `inputs` | list[str] ≤ 4, each ≤ 40 | names of the blanks, e.g. `["PO number"]` |
| `minutes_saved` | int 1–240 | suggested by Gemini, editable |
| `runs` | int | incremented on each run |
| `last_run` | timestamp \| null | |
| `org_id` | str | the workspace; lists and runs see only this workspace's shortcuts |
| `created_at`, `updated_at` | timestamp | |
| `demo` | bool, optional | set only on seeded demo examples |

Limit: 20 shortcuts per person per workspace.

## 6. Backend — `agent/app/shortcuts.py` (an APIRouter, like `sessions.py`)

### Endpoints
- `GET /api/shortcuts` lists your shortcuts in this workspace, plus `total_runs` and `total_minutes_saved`.
- `POST /api/shortcuts/draft` takes `{description}` or `{message_id}` and returns a draft. **It saves nothing.**
  1. `rate_limit(uid, "shortcut-draft", 10)` and `require_ai`. It is refused when the admin has turned AI off.
  2. With `message_id`, it reads that Saathi answer and the question before it, from the person's own
     `assistant/{uid}/messages`.
  3. It runs `scope.check` on the description or question. An off-topic bot is refused with the same EN/Hinglish
     text as `scope.refusal`.
  4. One `FAST_MODEL` call with a JSON response schema returns `{name, command, instruction, inputs, minutes_saved}`.
     The prompt asks for numbered steps, and for IDs (PO-…, SRC-…, heat numbers, vendor names) to become blanks.
  5. The result is validated and fixed up: the command is slugified, made unique, kept off the reserved words,
     and lengths are clamped.
- `POST /api/shortcuts` saves a draft after the person has edited it. It applies section 5's validation and returns
  400 with a clear message on any error.
- `PATCH /api/shortcuts/{id}` changes any editable field.
- `DELETE /api/shortcuts/{id}` deletes one.

### Running: `shortcuts.expand(user, text) -> dict | None`
Called at the top of `POST /api/assistant` (`main.py`), before the session and history are written:
- If `text` doesn't start with `/<word>`, or the word is `clear`, it returns `None` and nothing changes.
- If the person has a shortcut with that command in this workspace, it returns
  `{"prompt": <expanded>, "shortcut": {"id", "name"}}`. The expanded prompt is:

  > Run the person's saved shortcut "<name>". Steps: <instruction>. It needs: <inputs>. The person gave: "<rest of
  > the line>". If something it needs is missing or unclear, ask for it briefly instead of guessing.

- If there's no such shortcut, it returns `{"reply": "You don't have a shortcut called /x. Yours are: /a, /b."}`.
  The endpoint stores that reply as the assistant message and makes no model call.

In the endpoint:
- The user message stored and shown is still the raw `/dispatch-check PO-7781`.
- `ask()` receives the expanded prompt, so the scope check, prefetch and the agent all see the full steps.
- The finished assistant message gets `shortcut: {id, name}`.
- Then `runs += 1` (Firestore `Increment`) and `last_run = now`.
- The audit log and BigQuery rows get `shortcut_id`.
- The session title still comes from the raw text, through the existing `sessions.name`.

### Demo logins
They can list, draft, create and run shortcuts. They can edit or delete only shortcuts they created today, and never
`demo: true` ones. The rule uses `demo.guard`, the same way `sessions._own` does.

## 7. Web

- **`SaathiTabs`** (`Research.tsx`) becomes `Ask | Research | Shortcuts`. That means a new `View` kind
  `"shortcuts"` in `ctx.tsx`, rendered in `Workspace.tsx` with the Saathi sidebar mode like Ask and Research. The
  rail, icons and phone bar don't change.
- **`Shortcuts.tsx`** (new):
  - A header with the totals and **+ New shortcut**.
  - A grid of cards: name, `/command · blanks`, the first steps, "used N× · ~M min each", **Run**, Edit, Delete.
  - **New:** a description box → *Draft with Saathi* → the same card in edit mode (every field editable) → **Save**.
    If drafting fails, an empty editor opens with a note.
  - **Run:** when the shortcut has blanks, a one-line input appears per blank. Run then opens Ask with
    `/command <values>` sent.
  - An empty state with three example descriptions you can click.
- **`AssistantView.tsx`:**
  - Typing `/` at the start of the composer opens a menu of your shortcuts (name + blanks), with arrow keys and
    Enter. Picking one inserts `/command `.
  - In an empty conversation, your shortcuts show as chips above "Try asking".
  - Each Saathi answer gets **Save as shortcut**, which opens the draft card from `message_id`.
  - Answers that have a `shortcut` field show a small `⚡ <name>` chip.
- **Demo Guide:** a step that walks through making a shortcut and then running it.
- The look stays the current design (colours, cards, buttons as in Research/Ask). No restyle.

## 8. Testing and eval

- **`agent/eval/shortcuts_eval.py` → `eval/results_shortcuts.md` / `.json`:**
  - **Drafting:** 12 work descriptions (EN + Hinglish) must give a valid draft (a good command, ≥1 numbered step, IDs
    as blanks where the description names one). 5 off-topic bot requests must be refused.
  - **Running:** 4 shortcuts filled with demo IDs (PO-7781, SRC-BF-2041, heat K-55210, Om Castings) must give an
    answer that cites ≥1 source, calls the expected tool, and is not refused.
- Add the eval's descriptions and expanded prompts to `WORK` in `scope_eval.py`, and re-run it with a target of 0
  wrong refusals.
- Unit-style checks inside the eval script: command validation, uniqueness, reserved words, the 20 limit, the demo
  rule, and an unknown command answered without a model call.
- **Offline UI check** with the local recipe (`SAATHI_LOCAL=1`, JSON DB, Playwright): create from a description →
  card → `/` menu → run → chip on the answer → Save as shortcut → edit → delete.
- `uv run ruff check`, `npm run lint`, `npm run build`.

## 9. Rollout

1. PR from `saathi/shortcuts` into `main`. CI runs on PRs into `main`.
2. Merge only on the user's explicit go-ahead. Then watch the auto-deploy and verify prod: `/health`, the same image
   on API and worker, a browser smoke test on a demo login, and deleting the test shortcuts afterwards.
3. **Separate approval (a prod data write):** seed 2 example shortcuts on each demo persona, tagged `demo: true` and
   removable with `--remove`, in a new `seed/shortcuts_demo.py`.
4. A README line under features, and the deck's "next" slide (schedules, events, sharing).

## 10. Risks

- **The expanded prompt trips the scope check:** covered by the scope eval. The check fails open after 4 s.
- **A long instruction hits the 15-call cap:** the instruction is capped at 1500 characters, the draft prompt asks
  for at most 6 steps, and the answer says what it couldn't finish.
- **Gemini quota (429):** drafting uses the fast model, and running uses the existing fallback and circuit breaker.
