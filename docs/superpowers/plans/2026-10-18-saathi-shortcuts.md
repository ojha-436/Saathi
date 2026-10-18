# Saathi Shortcuts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Anyone in a workspace can save their own bot (name, `/command`, steps, blanks), drafted by Gemini from plain words
or from an answer, and run it in one line through the existing Saathi agent.

**Architecture:** A new FastAPI router, `agent/app/shortcuts.py`, stores shortcuts in `assistant/{uid}/shortcuts` and
exposes `expand()`. `POST /api/assistant` calls `expand()` first and passes the expanded prompt to the unchanged
`agent.ask()`. On the web, a third Saathi tab (`Shortcuts.tsx`) and three small additions to `AssistantView.tsx` (a `/`
menu, chips, Save as shortcut).

**Tech Stack:** FastAPI, Firestore (LocalDB in local mode), google-genai via `app.ai`, Next.js 16, React 19, Tailwind 4.

**Spec:** `docs/superpowers/specs/2026-10-18-saathi-shortcuts-design.md`

## Global Constraints

- Next 16 has breaking changes: read `web/AGENTS.md` before writing web code. Match the current look (classes like
  those in `Research.tsx` / `AssistantView.tsx`); no restyle.
- AI never files anything silently: a draft is saved only by the person's Save; runs can only draft tasks.
- Every write to the live workspace other than through the app (seeding, evals that leave data) needs the user's yes.
- Never commit env files or secrets. Work on `saathi/shortcuts`; open a PR; merge only on an explicit go-ahead.
- Values from the spec: command `^[a-z0-9][a-z0-9-]{1,29}$`; reserved `clear`, `help`, `new`; name ≤ 60; instruction
  ≤ 1500; inputs ≤ 4, each ≤ 40; minutes_saved 1–240; at most 20 shortcuts per person per workspace.
- Deviation from spec §6: `shortcut_id` goes into `audit_log` only, not BigQuery, because an unknown column would make
  `insert_rows_json` reject the whole row.

## Review Focus

1. **Command typed in a different case or followed by several lines** (`/Dispatch-Check po-7781\nalso Lot 2`) must
   still match, with all the text after the command passed on. Pinned in Task 1 (`parse`).
2. **One person in two workspaces** never sees or runs workspace A's shortcuts in workspace B. Pinned in Task 1
   (`mine`, `expand`).
3. **A person with no shortcuts types `/something`.** They must get "You don't have any shortcuts yet…" with no model
   call, not an error. Pinned in Task 1 (`expand`).
4. **Enter in the composer while the `/` menu is open** picks the highlighted shortcut. It must not send a half-typed
   `/disp`. Pinned in Task 5 (UI smoke).
5. **A run counter for a shortcut deleted mid-run, and "Save as shortcut" on someone else's message id**: the first is
   a silent no-op, the second a 404. Pinned in Task 1 (`record_run`, `source_from_message`).

---

### Task 1: Shortcut store, validation and `expand` (`agent/app/shortcuts.py`)

**Files:**
- Create: `agent/app/shortcuts.py`
- Create: `agent/eval/shortcuts_eval.py` (the `--unit` part)
- Modify: `agent/app/main.py:38` (`app.include_router(shortcuts.router)` after `sessions.router`; import alongside the
  other modules)

**Interfaces:**
- Produces (module `app.shortcuts`):
  - `router = APIRouter(prefix="/api/shortcuts")`
  - `RESERVED = {"clear", "help", "new"}`, `LIMIT = 20`
  - `class ShortcutIn(BaseModel)`: `name: str`, `command: str`, `instruction: str`, `inputs: list[str] = []`,
    `minutes_saved: int = 10`
  - `class ShortcutPatch(BaseModel)`: the same fields, all `| None = None`
  - `slug(text: str) -> str`: lowercase; runs of non-`[a-z0-9]` become `-`; trimmed to 30; edge dashes stripped;
    `"shortcut"` if under 2 characters
  - `parse(text: str) -> tuple[str, str] | None`: `(command_lowercased, rest_stripped)` for `^/([A-Za-z0-9][A-Za-z0-9-]{1,29})(?:\s+(.*))?$`
    (DOTALL), else `None`
  - `mine(user: dict) -> list[dict]`: this workspace's shortcuts (`org_id` == `user["org_id"]`), each with `id`,
    sorted by `runs` desc then `name`
  - `fixup(d: dict, taken: set[str]) -> dict`: for drafts. Never raises. Slugifies the command; if it's reserved or
    taken, appends `-2`, `-3`… until free; clamps every length; trims and de-duplicates inputs (max 4); clamps
    `minutes_saved` to 1–240
  - `validate(d: dict, taken: set[str]) -> dict`: for saves. Raises `HTTPException(400, <sentence>)` on: empty name
    or instruction, bad command, reserved command, command in `taken`, any length over the limit, more than 4 inputs.
    Returns the cleaned dict
  - `prompt_for(sc: dict, given: str) -> str`: the exact template in spec §6
  - `expand(user: dict, text: str) -> dict | None`: `None` if `parse` is `None` or the command is in `RESERVED`;
    `{"prompt": str, "shortcut": {"id", "name"}}` for a match; `{"reply": str}` otherwise. With other shortcuts the
    reply is "You don't have a shortcut called /x. Yours are: /a, /b."; with none it is "You don't have any shortcuts
    yet. Make one on the Shortcuts tab: describe a job you repeat and Saathi drafts it."
  - `record_run(uid: str, shortcut_id: str) -> None`: `runs` = `Increment(1)`, `last_run` = now; swallows any error
  - `source_from_message(user: dict, message_id: str) -> str`: "Question: …\nAnswer: …" (answer ≤ 600 characters),
    from the person's own `assistant/{uid}/messages`. 404 if it's missing, from another workspace, or not an
    assistant message. The question is the latest user message in the same `session_id` before it
  - Endpoints:
    - `list_shortcuts(user)` on `GET ""` → `{"shortcuts": [...], "total_runs": int, "total_minutes_saved": int}`
    - `create(body: ShortcutIn, user)` on `POST ""` → the saved shortcut with `id`. Over 20 gives 400 "You can keep up
      to 20 shortcuts…"
    - `update(sc_id, body: ShortcutPatch, user)` on `PATCH "/{sc_id}"`
    - `remove(sc_id, user)` on `DELETE "/{sc_id}"`
  - `_own(user, sc_id) -> DocumentReference`: 404 unless it's the person's own and in this workspace. A demo login
    gets `demo.guard` when `d.get("demo")` is set or `created_at` is a day or more old, with the message "Demo logins
    are shared by everyone trying Saathi, so they can change only the shortcuts made today."

- [ ] **Step 1: Write the failing unit checks** in `agent/eval/shortcuts_eval.py`, under `def unit() -> list[tuple[str, bool]]`
  - Run when `--unit` is passed. It must run under `SAATHI_LOCAL=1` with a temporary `LOCAL_DATA_DIR`, and the script
    refuses `--unit` otherwise.
  - The users: `u = {"uid": "u1", "org_id": "o1", "name": "Test", "role": "engineer"}`, the same uid with
    `org_id="o2"`, and a demo user `{"uid": "rahul", "org_id": "o1", ...}`.
  - It calls the router functions directly, passing `user=`.
  - It prints each check, and exits 1 if any fail.

  ```python
  assert slug("Dispatch Check!") == "dispatch-check" and slug("x") == "shortcut"
  assert parse("/Dispatch-Check po-7781\nalso Lot 2") == ("dispatch-check", "po-7781\nalso Lot 2")
  assert parse("/dispatch-check") == ("dispatch-check", "") and parse("what /x") is None and parse("/a") is None
  assert expand(u, "/anything")["reply"].startswith("You don't have any shortcuts yet")
  sc = create(ShortcutIn(name="Dispatch check", command="dispatch-check", instruction="1. Find {PO number} schedule.", inputs=["PO number"], minutes_saved=15), user=u)
  r = expand(u, "/dispatch-check PO-7781"); assert "PO-7781" in r["prompt"] and "Find {PO number} schedule" in r["prompt"] and r["shortcut"] == {"id": sc["id"], "name": "Dispatch check"}
  assert "/dispatch-check" in expand(u, "/nope")["reply"] and expand(u, "/clear") is None and expand(u, "hello") is None
  # 400s: duplicate, reserved, too long, 5 inputs; 21st shortcut
  # fixup: fixup({"command": "dispatch-check", ...}, {"dispatch-check"})["command"] == "dispatch-check-2"; fixup(command="clear") -> "clear-2"; minutes 999 -> 240
  assert mine(u_other_org) == [] and expand(u_other_org, "/dispatch-check x")["reply"].startswith("You don't have any")
  record_run("u1", sc["id"]); assert mine(u)[0]["runs"] == 1; record_run("u1", "missing")  # no raise
  # demo: rahul creates -> ok; patch own today -> ok; patch a doc with demo=True -> 403; created_at 2 days ago -> 403
  # source_from_message: other org's / missing message id -> 404; own assistant msg -> contains "Question:" and the user text
  ```

- [ ] **Step 2: Run the checks and confirm they fail**

  Run: `cd agent && SAATHI_LOCAL=1 LOCAL_DATA_DIR=$(mktemp -d) uv run python -m eval.shortcuts_eval --unit`
  Expected: ImportError for `app.shortcuts`.

- [ ] **Step 3: Implement `app/shortcuts.py`** to the interface above, following `sessions.py`'s layout (module
  docstring, `_col(uid)`, `_here`-style org filter in Python). Wire the router into `main.py`.

- [ ] **Step 4: Run the checks and confirm they pass**

  Run: the same command as Step 2.
  Expected: every line `ok`, exit 0.

- [ ] **Step 5: Commit**

  `git add agent/app/shortcuts.py agent/app/main.py agent/eval/shortcuts_eval.py && git commit -m "Shortcuts: store, validation and /command expansion"`

### Task 2: Drafting with Gemini (`POST /api/shortcuts/draft`)

**Files:**
- Modify: `agent/app/shortcuts.py`
- Modify: `agent/eval/shortcuts_eval.py` (adds the draft part of full mode)

**Interfaces:**
- Consumes: `fixup`, `mine`, `source_from_message` (Task 1); `scope.check`, `scope.refusal`; `ai.generate_json_hedged`;
  `from .main import org_of, rate_limit, require_ai` imported inside the function (as `research.py` does)
- Produces:
  - `class DraftIn(BaseModel)`: `description: str | None = None`, `message_id: str | None = None`
  - `class Draft(BaseModel)`: the Gemini schema, with `name`, `command`, `instruction`, `inputs: list[str]`,
    `minutes_saved: int`
  - `make_draft(user: dict, source: str) -> dict`:
    1. Runs `scope.check(source, [], company=…, about=…, user=…, role=…)`, with `company`/`about` worked out as in
       `agent.ask()`. Off-topic raises `HTTPException(422, scope.refusal(...))`.
    2. Calls `ai.generate_json_hedged(DRAFT_PROMPT.format(...), Draft, limit=20.0)`. Any failure raises
       `HTTPException(503, "Saathi couldn't draft it right now. Write the steps yourself, or try again.")`.
    3. Returns `fixup(draft, taken={s["command"] for s in mine(user)})`.
  - `POST "/draft"`: `require_ai`, `rate_limit(uid, "shortcut-draft", 10)`, refused with 403 when the admin has
    turned AI off. The source is the description (1–1000 characters) or `source_from_message`; neither given is a
    400. Returns `{"draft": dict}`. Saves nothing.
  - `DRAFT_PROMPT` says:
    - What Saathi can do, and that it cannot send email, edit files or post messages.
    - `name`: 2–5 words.
    - `command`: hyphenated lowercase.
    - `instruction`: at most 6 numbered one-line steps addressed to Saathi, with blanks written `{Name}`.
    - `inputs`: the values that change each run. An example id in the description becomes a blank, never a
      hard-coded value.
    - `minutes_saved`: 1–120.
    - Same language as the description.

- [ ] **Step 1: Write the eval cases** in `shortcuts_eval.py` full mode (no flag). It runs against the live workspace
  as `user_profile("prince")` and is read-only, because `make_draft` saves nothing.
  - `DRAFTS`: 12 `(description, expects_input: bool)` pairs, EN and Hinglish. For example:
    - "Check a PO's delivery schedule, its latest certificate and open NCRs for that vendor" → `True`
    - "har Monday dekho kaun se vendor late hain aur unke promises" → `False`
  - `OFF_BOTS`: 5 off-topic bot requests, e.g. "every morning write me a motivational poem", "make a bot that writes
    Python scripts".
  - Pass rule for a draft: the command matches `^[a-z0-9][a-z0-9-]{1,29}$`; the instruction contains `1.`; if
    `expects_input`, `inputs` is not empty and no id from the description (e.g. `PO-7781`) appears in the
    instruction.
  - Pass rule for an off-topic bot: `HTTPException` with status 422.

- [ ] **Step 2: Run it and confirm it fails**

  Run: `cd agent && uv run python -m eval.shortcuts_eval --only draft`
  Expected: AttributeError for `make_draft`.

- [ ] **Step 3: Implement `DraftIn`, `Draft`, `DRAFT_PROMPT`, `make_draft` and `POST /draft`.**

- [ ] **Step 4: Run it and confirm it passes**

  Run: the same command as Step 2.
  Expected: ≥ 11/12 drafts valid, 5/5 off-topic refused. The results are written to `eval/results_shortcuts.md` and
  `.json`.

- [ ] **Step 5: Commit**

  `git commit -am "Shortcuts: Gemini drafts a shortcut from plain words or from an answer"`

### Task 3: Run shortcuts through `POST /api/assistant`

**Files:**
- Modify: `agent/app/main.py:910-960` (the `assistant()` endpoint)
- Modify: `agent/eval/shortcuts_eval.py` (adds the run part of full mode)

**Interfaces:**
- Consumes: `shortcuts.expand`, `shortcuts.record_run`, `shortcuts.prompt_for`
- Produces:
  - The assistant message doc gains `shortcut: {"id", "name"}`.
  - The `audit_log` row gains `shortcut_id`.
  - The response is unchanged, plus `shortcut` when a shortcut ran.

Behaviour in `assistant()`:
- `run = shortcuts.expand(user, text)` comes right after the `ai_enabled` check.
- The session touch and the user message are written exactly as today, with the raw `text`.
- When `run` has `reply`: the pending doc is set straight to `{"text": reply, "pending": False}`, and the endpoint
  returns `{"text": reply, "tool_calls": [], "proposed_tasks": [], "charts": [], "session_id": sid}`. There is no
  `ask()` call and no session naming.
- Otherwise `ask(user, run["prompt"] if run else text, history, on_partial=on_partial)`.
- When `run` matched: add `"shortcut": run["shortcut"]` to the final `pending.update`, call
  `shortcuts.record_run(user["uid"], run["shortcut"]["id"])` in the background, and add `shortcut_id` to the audit
  row. The BigQuery row is unchanged.

- [ ] **Step 1: Write the run cases.** `RUNS`, 4 items, each `(name, instruction, inputs, given, expected_tools)`:
  - PO dispatch: `PO-7781`, expecting {search_workspace, promise_record, lookup_document}.
  - Drawing revision: `SRC-BF-2041`, expecting {revision_status}.
  - Heat certificate: `K-55210`, expecting {spec_check, lookup_document}.
  - Vendor promises: `Om Castings`, expecting {promise_record, who_owes}.

  Each one runs `await ask(prince, prompt_for(sc, given), [])`. It passes when `out_of_scope` is absent, there is ≥1
  `[kind:id]` citation, and a tool call is in `expected_tools`. Afterwards it deletes any `proposed_tasks` (as
  `run_eval.py:102-107` does).

- [ ] **Step 2: Run the cases against the real agent**

  Run: `cd agent && uv run python -m eval.shortcuts_eval --only run`
  Expected: 4/4 pass. This checks `prompt_for` with the real agent, so if a case fails, tune the `prompt_for` wording,
  not the agent.

- [ ] **Step 3: Implement the endpoint changes above.**

- [ ] **Step 4: Check it**
  - Run: `uv run python -m compileall -q app eval`. Expected: no output.
  - Run: the `--unit` command from Task 1. Expected: all ok.
  - The endpoint path itself (chip, run counter, unknown command) is checked end to end in Task 5 Step 3, items 6–7.

- [ ] **Step 5: Commit**

  `git commit -am "Saathi runs a /shortcut through the same agent, scope check and permissions"`

### Task 4: Web — the Shortcuts tab

**Files:**
- Modify: `web/src/lib/types.ts`:
  - `export type Shortcut = { id: string; name: string; command: string; instruction: string; inputs: string[]; minutes_saved: number; runs: number; last_run?: string | null; demo?: boolean }`
  - `export type ShortcutDraft = Pick<Shortcut, "name" | "command" | "instruction" | "inputs" | "minutes_saved">`
  - `AssistantMsg.shortcut?: { id: string; name: string }`
- Modify: `web/src/components/ctx.tsx:6`: add `| { kind: "shortcuts"; draftFrom?: string }`.
- Modify: `web/src/components/Research.tsx:108`: `SaathiTabs` gets `active: "ask" | "research" | "shortcuts"` and a
  third tab, "Shortcuts", that opens `{ kind: "shortcuts" }`.
- Modify: `web/src/components/Workspace.tsx`:
  - `:120`: the `!canAI` guard also covers `shortcuts`.
  - `:294`: `listPane` includes `shortcuts`.
  - `:458`: the sidebar shows `SaathiSidebar mode="ask"` for `shortcuts`.
  - `:468`: render `<ShortcutsView key={view.draftFrom ?? "shortcuts"} draftFrom={view.draftFrom} />` when `canAI`.
- Create: `web/src/components/Shortcuts.tsx`

**Interfaces:**
- Consumes: the Task 1–2 endpoints, `api()` from `@/lib/api`, `useWs()`.
- Produces:
  - `useShortcuts(): { list: Shortcut[]; totals: { runs: number; minutes: number }; reload: () => void }`. It loads
    `GET /api/shortcuts` and reloads on `window` event `"saathi:shortcuts"`.
  - `runText(sc: Pick<Shortcut, "command">, values: string[]): string` returns
    `` `/${sc.command}` + (values.filter(Boolean).length ? " " + values.filter(Boolean).join(", ") : "") ``.
  - `ShortcutsView({ draftFrom }: { draftFrom?: string })`:
    - Header: "My shortcuts", the totals ("Used N× · ~H h M min saved"), `SaathiTabs active="shortcuts"`, and **+ New
      shortcut**.
    - Card grid: name, `/command · inputs`, the first 2 steps, "used N× · ~M min each", **Run**, Edit, Delete.
    - Empty state: 3 example descriptions you can click.
    - When `draftFrom` is set: on mount, `POST /api/shortcuts/draft {message_id}` opens the editor filled in.
  - `ShortcutEditor({ initial, onDone })`:
    - All 5 fields are editable; inputs are a comma-separated field.
    - **Save** does `POST` for a new one, `PATCH` for an existing one, then dispatches `"saathi:shortcuts"`. A 400
      detail shows inline.
    - **New** flow: description textarea → **Draft with Saathi** (spinner) → fields filled. A 422 detail shows inline
      (the off-topic refusal). A 503 opens empty fields with the detail as a note.
  - **Run:**
    - No inputs: `open({ kind: "assistant", prompt: runText(sc, []) })`.
    - With inputs: one input per blank inline, and Enter or Run opens Ask with `runText(sc, values)`.

- [ ] **Step 1: Read `web/AGENTS.md`.**
- [ ] **Step 2: Build the types, routing, tab and `Shortcuts.tsx` as above.**
- [ ] **Step 3: Check it**
  - Run: `cd web && npm run lint && npm run build`. Expected: both exit 0.
- [ ] **Step 4: Commit**

  `git commit -am "Shortcuts tab: make, edit, run and delete your own shortcuts"`

### Task 5: Web — shortcuts inside Ask, Demo Guide, README; offline UI check

**Files:**
- Modify: `web/src/components/AssistantView.tsx`
- Modify: `web/src/components/DemoGuide.tsx` (the "Ask & find" group)
- Modify: `README.md` (one line in the features list)
- Modify: `agent/eval/scope_eval.py` (`WORK` += the `DRAFTS` descriptions and the 4 `RUNS` prompts built with
  `prompt_for`; `OFF` += `OFF_BOTS`)

**Interfaces:**
- Consumes: `useShortcuts`, `runText` (Task 4); `AssistantMsg.shortcut`.

Behaviour in `AssistantView.tsx`:
- **The `/` menu:**
  - Opens while `text` matches `^/[a-z0-9-]*$` and there is at least one shortcut whose command starts with what
    follows the `/`.
  - It sits above the form and lists `/command`, the name and the inputs; ↑/↓ move.
  - **Enter or Tab picks** the highlighted one (`setText("/" + command + " ")`) and does not send. Esc closes it.
  - Enter sends only when the menu is closed.
- **Empty state:** "Your shortcuts" chips above "Try asking". A shortcut without inputs runs `ask(runText(sc, []))`; one
  with inputs fills the composer with `/command ` and focuses it.
- **Answer chip:** an assistant bubble with `m.shortcut` shows a chip with the name at the top. Use an icon from
  `@/lib/icons`, not the ⚡ the latency chip already uses.
- **Save as shortcut:** a small text button in the answer footer, next to the time. It shows only when
  `!m.pending && !m.shortcut && !m.out_of_scope`, and opens `{ kind: "shortcuts", draftFrom: m.id }`.
- **The answer doc:** add `out_of_scope: result.get("out_of_scope")` to the final `pending.update` in `main.py`. Add
  `out_of_scope?: string` to `AssistantMsg`.

DemoGuide flow (in "Ask & find", after Research):
- title "Your own shortcuts"
- what: "Save a job you repeat as your own bot: describe it in plain words, Saathi drafts the steps, and you run it
  with one /command."
- tryText: "New shortcut → “Check a PO's delivery schedule, its latest certificate and open NCRs for the vendor”.
  Save it, then type /"
- cta "Open Shortcuts"; action `go({ kind: "shortcuts" })`

- [ ] **Step 1: Implement the behaviour above.**
- [ ] **Step 2: Lint and build**
  - Run: `cd web && npm run lint && npm run build`. Expected: exit 0.
- [ ] **Step 3: Offline UI check** with the local recipe in memory (`saathi-message-actions`): the API runs with
  `SAATHI_LOCAL=1 … --port 8091` on a temp JSON DB; the web is built with `CSP_CONNECT_EXTRA`. A Playwright script in
  the scratchpad checks:
  1. Rail → Saathi → Shortcuts tab.
  2. New → Draft. There's no Gemini key locally, so expect the 503 note and empty fields.
  3. Fill the fields and Save. The card appears.
  4. In Ask, type `/di`. The menu shows `/dispatch-check`.
  5. Press **Enter**. The composer reads `/dispatch-check ` and nothing was sent. *(Review Focus 4)*
  6. Type `PO-7781` and press Enter. The answer has the shortcut chip.
  7. Back on Shortcuts, the card says "used 1×".
  8. Delete it. The card is gone.

  Screenshots go to the scratchpad.
- [ ] **Step 4: Re-run the scope eval**
  - Run: `cd agent && uv run python -m eval.scope_eval`. Expected: 0 work items wrongly refused; every `OFF` item
    refused.
- [ ] **Step 5: Commit**

  `git commit -am "Shortcuts in Ask: / menu, your shortcuts as chips, Save as shortcut; demo guide step"`

### Task 6: Pull request

- [ ] **Step 1:** Scan the diff for secrets: `git diff main --stat` and `git diff main | grep -iE "api[_-]?key|secret|password"`.
  Expected: only the existing demo password constant, if anything.
- [ ] **Step 2:** `git push -u origin saathi/shortcuts`, then `gh pr create` with the summary, the eval numbers from
  `results_shortcuts.md` and `results_scope.md`, and the screenshots list. The body ends with the Claude Code line.
- [ ] **Step 3:** Stop. Merge only on the user's explicit go-ahead, then verify prod as in the working rules.

### Task 7 (only after a separate yes): demo shortcuts on prod

**Files:**
- Create: `agent/seed/shortcuts_demo.py`. It writes 2 shortcuts (`demo: True`) per demo persona from a dict in the
  file. It is idempotent: deterministic doc ids `demo_<persona>_<command>`. `--remove` deletes `demo: True` docs only.

- [ ] **Step 1:** Write it. Run it locally against LocalDB, then with `--remove`. Expected: 12 docs written, then 0
  left.
- [ ] **Step 2:** Ask the user, then run it on prod and check a demo login sees the cards.
