# Saathi UI/UX Upgrade Specification (`uiuxupdate.md`)

> **Purpose:** Actionable, file-by-file implementation guide for an AI coding agent to maximize Saathi's **UX (10%)**, **Problem Alignment (25%)**, **Innovation (25%)**, and **Technical/GenAI (40%)** scores for the **Google Cloud AI Builder Cup 2026** (deadline: **2026-10-18**).

## 0. Guardrails & Repo Conventions (Read First)

Before modifying any code in `web/`, follow these project rules:
1. **Next.js 16 + React 19 + Tailwind CSS v4 (`@import "tailwindcss";` in `globals.css`):** Read `web/AGENTS.md` and `web/node_modules/next/dist/docs/` if touching routing or server/client boundaries.
2. **Icons:** Import icons exclusively from `@/lib/icons` (`web/src/lib/icons.tsx`). Do **not** add `lucide-react` or `@phosphor-icons/react` imports directly; use the exported components (`Sparkles`, `ShieldCheck`, `FileSearch`, `Workflow`, `Radar`, `Gavel`, `History`, `BarChart3`, `ListTodo`, `CheckCircle2`, `AlertTriangle`, `Octagon`, `Users`, `Camera`, `RefreshCw`, `ScrollText`, `Timer`, `Lock`, `MapPin`, `ArrowRight`, `Search`, `Plus`, `Check`, `X`, `ChevronDown`, `Loader2`, etc.).
3. **No Silent Actions / Permission Invariants:** Never bypass confirmation flows (`ReportDialog`, `ProposedTaskCard`, `GapsToTasks`, `VoiceSheet` draft confirmation) or expose cross-user data.
4. **Verification Command:** After making changes, run `npm run build` and `npm run lint` inside `web/` to ensure zero TypeScript or ESLint errors.

---

## 1. Fix Semantic Color Tokens & Visual Bugs (`P0`)

### Problem
In `web/src/app/globals.css`, `--color-saffron` was remapped to Google Blue (`#4285f4`) and `--color-saffron-soft` to `#d2e3fc`. However, multiple components still use `saffron` expecting an amber/orange warning or accent color:
- **Broken gradient:** `web/src/components/Research.tsx` (line 133) uses `bg-gradient-to-br from-saffron to-[#d4691a]`, producing a muddy blue-to-orange gradient.
- **Ambiguous warning badges:** `at_risk`, `awaiting_plan`, `retrying`, `incomplete`, `proposed`, and `major` severity badges use `bg-saffron-soft text-saffron-ink`, which renders as light blue (`#d2e3fc` / `#174ea6`)—visually identical to normal info/brand chips (`bg-brand-soft text-brand`).
- **Mismatched Voice pulse shadow:** `web/src/components/VoiceSheet.tsx` (line 291) uses `bg-saffron` (blue) with a hardcoded orange box-shadow `rgba(232,137,28,0.25)` and `text-ink` on a blue button.

### Implementation Approach

#### 1.1 `web/src/app/globals.css`
Add dedicated semantic warning/amber tokens inside `@theme inline`:
```css
  --color-warn: #b45309;
  --color-warn-ink: #92400e;
  --color-warn-soft: #fef3c7;
  --color-warn-border: #f59e0b;
```

#### 1.2 `web/src/components/Research.tsx`
1. **Header icon badge (line ~133):**
   Replace:
   ```tsx
   <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-saffron to-[#d4691a] text-white">
   ```
   With:
   ```tsx
   <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-brand to-rail text-white">
   ```
2. **Warning status & readiness tokens (`STATUS` & `READINESS` maps, lines ~76–95):**
   - Update `awaiting_plan` and `retrying` in `STATUS` to use `"bg-warn-soft text-warn-ink"`.
   - Update `at_risk` in `READINESS` to use `"bg-warn-soft text-warn-ink border-warn-border/40"`.
   - Update `CHECK_ICON.risk` to use `className="text-warn"`.
   - Update `sev.medium` in `GapsToTasks` to use `"bg-warn-border"`.

#### 1.3 `web/src/components/SpecCheck.tsx`
1. **`VERDICT` map (lines ~12–17):**
   - Update `incomplete` to:
     ```tsx
     incomplete: { label: "Spec check incomplete", cls: "border-warn-border/40 bg-warn-soft text-warn-ink", icon: AlertTriangle },
     ```
2. **`ROW_ICON.missing` (line ~53):**
   - Change `text-saffron-ink` to `text-warn`.
3. **`StandardsTab` & `LimitsTable`:**
   - Update `c.verdict === "incomplete"` icon color to `"text-warn"`.
   - Update `proposed` status pill in `LimitsTable` to `"bg-warn-soft text-warn-ink"`.

#### 1.4 `web/src/components/Quality.tsx`
1. **`SEV_CLS` map (line ~26):**
   - Change `major: "bg-saffron-soft text-saffron-ink"` to `major: "bg-warn-soft text-warn-ink"`.
2. **Unfilled draft field highlight in `ReportDialog` (line ~183):**
   - Change `"border-dashed border-saffron/60 bg-saffron-soft/20"` to `"border-dashed border-warn-border/60 bg-warn-soft/30"`.

#### 1.5 `web/src/components/VoiceSheet.tsx`
1. **Mic button active state & audio-reactive ring (lines ~287–292):**
   - When `phase === "listening"`, use `bg-brand text-white` (instead of `bg-saffron` with `text-ink`), and update the inline `boxShadow` from `rgba(232,137,28,0.25)` to `rgba(66,133,244,0.35)`.

---

## 2. Update Landing Page to Showcase All Phase 4 Flagships (`P0`)

### Problem
`web/src/app/page.tsx` was written during Phase 3b/Saathi Live and does not showcase Phase 4's core additions (**Saathi Research**, **Spec Check & Standards Library**, **Saathi Voice**, **Answer Provenance**, **Cloud Tasks / Pub/Sub / Agent Search**). Judges reviewing the landing page first will miss 3 of the 7 hackathon directions.

### Implementation Approach (`web/src/app/page.tsx`)

1. **Navigation (`NAV` constant, line ~27):**
   - Keep existing anchors and ensure `#pillars` and `#manufacturing` highlight the new capabilities.
2. **Hero Lead Copy & Sub-cards (`HeroLive`, lines ~75–85 & ~340–355):**
   - Update the hero paragraph to mention **multi-agent inspection research, automatic mill test certificate verification, and hands-free shop-floor voice**.
   - In the 3 sub-cards below `HeroLive` (lines ~342–347), include **Spec Check** or **Saathi Research** alongside Decision logged and Plant memory.
3. **Four Pillars Section (`#pillars`, lines ~155–218):**
   - **Pillar 01 (`Access knowledge`):** Add **Saathi Research (multi-agent ADK)** — *"Ask 'Are we ready for the RDSO inspection?' Parallel researcher agents check drawings, certificates, NCRs and promises, verify every claim, and write a cited readiness report."* Also mention **"How Saathi got this" provenance** on every answer.
   - **Pillar 03 (`Make decisions`):** Add **Spec Check & Standards Library** — *"Mill test certificates are verified automatically against approved grade limits on Agent Search; Gemini extracts values, deterministic code decides pass/fail."*
   - **Pillar 04 (`Complete everyday work`):** Upgrade the 4th bullet to **Saathi Voice (Gemini 3.8 Live)** & **Gaps → Tasks** — *"Hands-free Hindi, Hinglish and English voice assistant for the shop floor, plus one-click task drafting from research gaps."*
4. **Manufacturing Grid (`#manufacturing`, lines ~228–248):**
   - Expand the 6-card grid (or replace the most overlapping card) so **Spec Check & Standards Library** (`ShieldCheck`: *"Automatic MTC pass/fail against the current drawing's grade limits; 1-click NCR draft on failure"*) and **Saathi Research Dossiers** (`FileSearch`: *"Inspection readiness & vendor comparison reports assembled in minutes, not days"*) are explicitly featured.
5. **How It Works Tech Stack Chips (`#how`, line ~288):**
   - Add `"Gemini 3.8 Live"`, `"Vertex AI Agent Search"`, `"Cloud Tasks"`, `"Pub/Sub"`, and `"Cloud Trace"` to the technology badge list so judges see full Google Cloud coverage at a glance.

---

## 3. Frictionless Judge Onboarding: In-App Persona Switcher & Guided Tour (`P0`)

### Problem
1. On `/login` (without `?demo=1`), `demoOpen` defaults to `false` (`web/src/app/login/LoginForm.tsx`, line 30), hiding the demo accounts behind a collapsed accordion.
2. Once signed into `/app` (`web/src/components/Workspace.tsx`), switching between demo personas (e.g., from **Prince — Design Engineer** to **Neha — QA Manager** or **Suresh — Shop Floor Supervisor**) requires signing out, returning to `/`, and logging back in.

### Implementation Approach

#### 3.1 `web/src/app/login/LoginForm.tsx`
1. **Default `demoOpen` to `true`:**
   Change line 30 from:
   ```tsx
   const [demoOpen, setDemoOpen] = useState(!!params.get("demo"));
   ```
   To:
   ```tsx
   const [demoOpen, setDemoOpen] = useState(true);
   ```
2. **Add role badges / what-to-test hints on the `DEMO` cards (lines ~11–18):**
   Update the `DEMO` array so judges immediately know which persona demonstrates which workflow:
   - `prince`: `"Design Engineer · Best place to start"`
   - `neha`: `"QA Manager · Spec Check, Standards & NCRs"`
   - `suresh`: `"Shop Floor Supervisor · Voice, Bay 2 & Handovers"`
   - `rahul`: `"Procurement Lead · Vendor Promises & Quotes"`
   - `kavya`: `"Project Manager · Research & Decisions"`
   - `amit`: `"Senior Design Engineer · Private Rev D Draft"`

#### 3.2 `web/src/components/Workspace.tsx`
1. **Add an In-App Demo Persona Switcher in the Top Header:**
   - Detect if the current user is in the demo workspace (`account.email?.endsWith("@saathi.demo") || account.org_id === "shakti-rail"`).
   - Next to the profile avatar in the top `<header>`, render a compact `Menu` trigger:
     `Demo: {me?.name.split(" ")[0]} ({me?.role?.split(",")[0]}) ▾`
   - Selecting another persona calls `signInWithPassword("${id}@saathi.demo", "Saathi@2026")` (imported from `@/lib/auth`) and reloads/refreshes the workspace state in place—allowing a judge to switch from **Prince** to **Neha** or **Suresh** in 1 second without leaving the current screen.
2. **Add a Quick "Try Demo Flows" Popover / Menu in the Header:**
   - Right beside the Demo Persona Switcher, include a compact **"Demo guide"** button (`Sparkles` icon) that opens a clean menu or modal with 5 one-click deep links into the strongest judge scenarios:
     1. **Ask Saathi + Provenance:** Opens `assistant` with prompt `"Which revision of SRC-BF-2041 is latest and who approved it?"`
     2. **Saathi Research (Multi-Agent):** Opens `{ kind: "research" }` (Inspection readiness report & gaps-to-tasks).
     3. **Spec Check & Standards Library:** Opens `{ kind: "quality", tab: "standards" }` (MTC verification table & one-click NCR draft).
     4. **Saathi Live (Meeting Copilot):** Opens `{ kind: "live" }` (real-time streaming transcription & instant cited HUD answers).
     5. **Saathi Voice (Hands-Free Shop Floor):** Opens `dialog("voice")` (Gemini Live audio with tool calling).

---

## 4. Elevate Phase 4 Feature Discoverability & Answer Provenance (`P1`)

### Problem
1. **Saathi Research** has no entry in the left `AppRail` (`web/src/components/Sidebar.tsx`) and is only reachable via a small `Ask | Research` tab switch in the `AssistantView` header.
2. **Command Palette (`⌘K`)** in `web/src/components/Dialogs.tsx` (lines ~350–358) only shows 4 basic actions (`Create a task`, `Add meeting notes`, `Create a channel`, `Browse channels`) and omits `Saathi Research`, `Saathi Voice`, `Report an issue (Snap-to-record)`, and `Spec Check / Standards Library`.
3. **Answer Provenance** in `web/src/components/AssistantView.tsx` (lines ~217–246) is a plain muted text link (`text-xs text-muted`). Making tool calls and latency visually scannable as badges highlights the ADK architecture on every response.

### Implementation Approach

#### 4.1 `web/src/components/AssistantView.tsx`
1. **Add a "Saathi Research" Hero Card Alongside the "Catch up" Card (lines ~106–128):**
   - Convert the top banner area on the empty state (`messages.length === 0`) into a 2-column grid (`grid gap-4 lg:grid-cols-2`) or stack a sleek **Saathi Research** card right below the *Catch up* card:
     - Title: `"Need an inspection dossier or vendor comparison?"`
     - Subtitle: `"Parallel research agents check drawings, certificates, NCRs and promises, verify every claim, and turn gaps into tasks."`
     - CTA Button: `"Open Saathi Research →"` calling `open({ kind: "research" })`.
2. **Add a Spec Check Starter to `STARTERS` (lines ~16–23):**
   - Replace or add a starter item:
     `{ icon: ShieldCheck, text: "Is heat H-77812 within spec for drawing SRC-BF-2041?" }`
3. **Upgrade `AnswerProvenance` Visual Polish (lines ~217–246):**
   - Style the provenance toggle button as an interactive pill bar showing distinct badges for:
     - **Steps & Tools:** e.g., unique tool badges (`Drawing register`, `Spec Check`, `Plant memory`, `BigQuery`)
     - **Verified Citations:** `{cited} sources cited` with a `ShieldCheck` icon
     - **Latency:** `⚡ {(p.latency_ms / 1000).toFixed(1)}s`
   - When expanded, render each step inside a clean bordered timeline card (`rounded-xl border border-border bg-canvas/50 p-3`) so judges inspecting "How Saathi got this" see a clear execution trace.

#### 4.2 `web/src/components/Dialogs.tsx` (`CommandPalette`, lines ~350–375)
Add Phase 3 & 4 high-value actions to the `actions` array when `!t` (and match them when typing keywords like `"research"`, `"voice"`, `"report"`, `"ncr"`, `"spec"`, `"standard"`):
- **Start Saathi Research** (`kind: "action-research"`, icon: `FileSearch`, sub: `"Multi-agent readiness & vendor reports"`) → `open({ kind: "research" })`
- **Talk to Saathi (Voice)** (`kind: "action-voice"`, icon: `Sparkles`, sub: `"Hands-free Hindi, Hinglish & English"`) → `dialog("voice")`
- **Report an issue (NCR / Downtime / Safety)** (`kind: "action-report"`, icon: `Gavel`, sub: `"Snap-to-record from photo or voice"`) → `dialog("report")`
- **Standards & Spec Check** (`kind: "action-standards"`, icon: `ShieldCheck`, sub: `"Verify mill test certificates against grade limits"`) → `open({ kind: "quality", tab: "standards" })`

---

## 5. Deduplicate "My Day" & Add a Plant/Quality Snapshot (`P1`)

### Problem
In `web/src/components/MyDay.tsx`, `<NeedsYou />` is rendered at the top of the page (lines ~147–149) and already displays due-today tasks, overdue tasks, unread mentions, and untracked email promises. Immediately below `<NeedsYou />`, `MyDayView` renders separate cards for **Due today**, **Promises in your email**, and **Mentions**—duplicating the exact same items on the same screen.

### Implementation Approach (`web/src/components/MyDay.tsx` & `web/src/components/NeedsYou.tsx`)

1. **Add Category Filter Pills to `NeedsYou` (`web/src/components/NeedsYou.tsx`):**
   - In the `< NeedsYou >` header, add compact filter pills: `All ({items.length})`, `Tasks & Promises`, `Quality & Handovers`, `Mentions`.
2. **Streamline the Lower Grid in `MyDayView` (`web/src/components/MyDay.tsx`):**
   - Replace the redundant *Due today* and *Mentions* cards (when those items are already shown in `NeedsYou`) or transform the first card into **"Coming Up Next"** (tasks due *after* today + in-progress work) alongside **"Owed to You"** (delegated tasks/promises you are watching).
   - For non-guest users (`!guest`), add a **"Plant & Quality Pulse"** card in the grid showing:
     - Open NCRs / Downtime count (linking to `open({ kind: "quality" })`)
     - Controlled Drawing Register count (linking to `open({ kind: "quality", tab: "drawings" })`)
     - Quick link to **Saathi Research** (`"Run inspection readiness check →"`).

---

## 6. Shop-Floor Mobile & Voice Ergonomics (`P1`)

### Problem
1. In `web/src/components/VoiceSheet.tsx`, the mic button only supports continuous press-and-hold (`onPointerDown` → `onPointerUp`). If a user or judge taps the button once (expecting tap-to-talk), `press()` and `release()` fire within `<200ms`, sending an empty audio buffer.
2. `VoiceSheet` only shows a single hardcoded placeholder string (`Puchiye: “Bay 2 mein CNC-3 ka kya status hai?”`) and no clickable prompt suggestions.
3. In `web/src/components/Sidebar.tsx` (line 54), the mobile bottom bar hides `quality` and `live`, burying shop-floor tools inside the top-right profile menu on phones.

### Implementation Approach

#### 6.1 `web/src/components/VoiceSheet.tsx`
1. **Support Both Tap-to-Toggle and Hold-to-Talk:**
   - Track `pressedAt = useRef<number>(0)` in `press()`.
   - On `onPointerDown`:
     - If already `talking.current` (in tap-to-toggle mode), calling `release()` stops recording and sends the audio.
     - Otherwise, record `pressedAt.current = Date.now()` and call `press()`.
   - On `onPointerUp`:
     - If `Date.now() - pressedAt.current < 280`, keep `talking.current = true` (stay in `listening` mode) and update the status hint to `"Listening… tap again when done"`.
     - If held for `>= 280ms`, call `release()` immediately on pointer up.
2. **Add Prompt Suggestion Pills in Idle State:**
   - Below the main transcript area when `phase === "idle" && !reply`, display 3 compact example chips so users/judges know what they can say (or can click to ask in `AssistantView` if they don't have a mic connected):
     - `"Bay 2 mein CNC-3 ka kya status hai?"`
     - `"SRC-BF-2041 ka latest revision kaunsa hai?"`
     - `"Heat H-77812 spec mein pass hai kya?"`

#### 6.2 `web/src/components/Sidebar.tsx` & `web/src/components/Workspace.tsx`
1. **Mobile Bottom Bar (`Sidebar.tsx`, line ~54):**
   - Include `quality` in the mobile bottom navigation for non-guest users (e.g., `My Day`, `Chat`, `Saathi`, `Tasks`, `Quality`) since `Activity` notifications already badge inside `My Day` / `NeedsYou`.
2. **Mobile Floating Action Bar (`Workspace.tsx`, lines ~291–299):**
   - Alongside the mobile `+ Report` floating action button, add a compact `Mic` button (`dialog("voice")`) when `account.org.settings.voice_us && !guest` so shop-floor users can launch **Saathi Voice** with one thumb tap from any screen.

---

## 7. Implementation Checklist & Verification Order

Execute these steps in order and verify each before moving to the next:

- [ ] **Step 1:** Update `web/src/app/globals.css`, `Research.tsx`, `SpecCheck.tsx`, `Quality.tsx`, and `VoiceSheet.tsx` to fix the `--color-warn` semantic tokens, header gradient, and voice pulse ring.
- [ ] **Step 2:** Update `web/src/app/page.tsx` to showcase **Saathi Research**, **Spec Check & Standards Library**, **Saathi Voice**, and the full Phase 4 Google Cloud stack.
- [ ] **Step 3:** Update `web/src/app/login/LoginForm.tsx` (default `demoOpen = true` + persona workflow hints) and `web/src/components/Workspace.tsx` (in-app Demo Persona Switcher + "Demo guide" quick-launch menu).
- [ ] **Step 4:** Update `web/src/components/AssistantView.tsx` (Research hero card, Spec Check starter, upgraded `AnswerProvenance` pill bar) and `web/src/components/Dialogs.tsx` (`⌘K` Command Palette actions for Research, Voice, Report Issue, Standards).
- [ ] **Step 5:** Update `web/src/components/NeedsYou.tsx` and `web/src/components/MyDay.tsx` to add category filter pills, remove duplicate task/mention lists, and add the Plant & Quality Pulse card.
- [ ] **Step 6:** Update `web/src/components/VoiceSheet.tsx` (hybrid tap-to-toggle + hold-to-talk and prompt hints) and `web/src/components/Sidebar.tsx` (expose `Quality` on mobile).
- [ ] **Step 7:** Run `cd web && npm run lint && npm run build` and verify zero errors.
