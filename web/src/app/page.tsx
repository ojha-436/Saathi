import {
  AlertTriangle,
  ArrowRight,
  BarChart3,
  Camera,
  Check,
  CheckCircle2,
  FileSearch,
  Gavel,
  History,
  ListTodo,
  Lock,
  MapPin,
  Octagon,
  Radar,
  RefreshCw,
  ScrollText,
  ShieldCheck,
  Sparkles,
  Sun,
  Timer,
  Users,
  Workflow,
} from "@/lib/icons";
import Link from "next/link";
import { Logo, LogoMark } from "@/components/Logo";
import { RevealOnScroll } from "@/components/RevealOnScroll";
import { EVAL } from "@/lib/eval";

export const metadata = { title: "Saathi — AI Operating System for Enterprise & Manufacturing" };

const NAV = [
  { href: "#flagships", label: "Phase 4 Agents" },
  { href: "#live", label: "Saathi Live" },
  { href: "#pillars", label: "Platform" },
  { href: "#manufacturing", label: "Shop Floor" },
  { href: "#how", label: "Architecture" },
  { href: "#trust", label: "Security" },
];

const LIVE = { lineFinal: "0.7", heardToAnswer: "2.8", search: "0.5" };

const PERSONAS = [
  { id: "prince", name: "Prince Kumar", role: "Design Engineer", badge: "Drawings & AI Provenance", accent: "border-brand/40 bg-brand-soft/40 text-brand-strong" },
  { id: "neha", name: "Neha Verma", role: "QA Manager", badge: "Spec Check & NCRs", accent: "border-moss/40 bg-moss-soft/60 text-moss" },
  { id: "suresh", name: "Suresh Yadav", role: "Shop Floor Supervisor", badge: "Hindi Voice & Handovers", accent: "border-warn-border/50 bg-warn-soft/70 text-warn-ink" },
  { id: "kavya", name: "Kavya Iyer", role: "Project Manager", badge: "Multi-Agent Research", accent: "border-plum/40 bg-plum-soft/60 text-plum" },
  { id: "rahul", name: "Rahul Singh", role: "Procurement Lead", badge: "Vendor Promises & POs", accent: "border-blueprint/40 bg-blueprint-soft/50 text-blueprint" },
  { id: "amit", name: "Amit Sharma", role: "Sr. Design Engineer", badge: "Private Rev D Draft", accent: "border-line bg-paper-3 text-ink-2" },
];

export default function Landing() {
  return (
    <div className="min-h-dvh bg-paper text-ink selection:bg-brand-soft selection:text-ink">
      <RevealOnScroll />
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100] focus:rounded-md focus:bg-ink focus:px-4 focus:py-2 focus:text-paper"
      >
        Skip to content
      </a>

      {/* ---------------- Floating Industrial Command Navbar ---------------- */}
      <header className="sticky top-3 z-50 px-3 sm:px-5">
        <div className="mx-auto flex h-14 max-w-7xl items-center gap-5 rounded-2xl border border-line/90 bg-white/85 px-4 shadow-[0_12px_36px_-12px_rgba(15,23,42,0.14)] backdrop-blur-xl lg:px-6">
          <Link href="/" aria-label="Saathi home" className="flex items-center gap-2.5">
            <Logo />
          </Link>
          <span className="hidden items-center gap-1.5 rounded-full border border-moss/30 bg-moss-soft/70 px-2.5 py-0.5 font-mono text-[10.5px] font-semibold text-moss xl:inline-flex">
            <span className="h-1.5 w-1.5 rounded-full bg-moss" /> SHAKTI RAIL · MUMBAI REGION
          </span>
          <nav aria-label="Primary" className="hidden flex-1 items-center justify-center gap-6 text-sm font-medium text-muted md:flex">
            {NAV.map((n) => (
              <a key={n.href} href={n.href} className="nav-link pb-0.5 transition hover:text-ink">
                {n.label}
              </a>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-2">
            <Link
              href="/login"
              className="hidden rounded-xl border border-line bg-paper-2 px-3.5 py-2 text-xs font-semibold text-ink transition hover:border-brand/40 hover:bg-white sm:inline-flex"
            >
              Sign in / Switch user
            </Link>
            <Link
              href="/app?demo=prince"
              className="inline-flex items-center gap-1.5 rounded-xl bg-brand px-4 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-brand-strong sm:text-sm"
            >
              Launch Workspace <ArrowRight size={15} />
            </Link>
          </div>
        </div>
      </header>

      <main id="main">
        {/* ---------------- Hero: Industrial AI Operating System ---------------- */}
        <section className="relative overflow-hidden pb-16 pt-12 lg:pb-24 lg:pt-16">
          <div className="glow pointer-events-none absolute inset-0" />
          <div className="relative mx-auto grid max-w-7xl items-start gap-12 px-5 lg:grid-cols-[1.05fr_1fr] lg:gap-12 lg:px-8">
            <div>
              <div className="rise inline-flex flex-wrap items-center gap-2 rounded-full border border-brand/25 bg-brand-soft/60 px-3.5 py-1.5 font-mono text-[11px] font-semibold text-brand-strong">
                <Sparkles size={13} />
                <span>AI WORKSPACE + MANUFACTURING OPERATING LAYER</span>
                <span className="rounded bg-brand px-1.5 py-0.5 text-[10px] text-white">PHASE 4 LIVE</span>
              </div>

              <h1 className="rise mt-5 font-display text-[42px] leading-[1.02] tracking-tight text-ink sm:text-[56px] lg:text-[66px]">
                Every drawing, promise, and shift—
                <span className="mt-1 block bg-gradient-to-r from-brand-strong via-brand to-[#0ea5e9] bg-clip-text text-transparent">
                  verified and remembered.
                </span>
              </h1>

              <p className="rise mt-5 max-w-xl text-[16.5px] leading-relaxed text-muted" style={{ animationDelay: "100ms" }}>
                Built for <strong className="font-semibold text-ink">Shakti Rail Components</strong>, Saathi combines Teams-grade collaboration with a permission-scoped{" "}
                <strong className="font-semibold text-ink">ADK multi-agent colleague</strong>. It verifies mill test certificates against drawing specs, assembles cited
                inspection dossiers, guards shop-floor revisions via QR, and captures Hindi voice reports hands-free.
              </p>

              <div className="rise mt-7 flex flex-wrap items-center gap-3" style={{ animationDelay: "160ms" }}>
                <Link
                  href="/app?demo=prince"
                  className="group inline-flex items-center gap-2 rounded-xl bg-brand px-6 py-3.5 text-[15px] font-semibold text-white shadow-[0_10px_25px_-8px_rgba(37,99,235,0.6)] transition hover:bg-brand-strong"
                >
                  Open Live Workspace (/app) <ArrowRight size={17} className="transition-transform group-hover:translate-x-0.5" />
                </Link>
                <Link
                  href="/login?demo=1"
                  className="inline-flex items-center gap-2 rounded-xl border border-line bg-white px-5 py-3.5 text-[15px] font-semibold text-ink shadow-2xs transition hover:border-brand/50 hover:bg-paper-2"
                >
                  All 6 Demo Personas
                </Link>
              </div>

              {/* Instant 1-Click Role Launchpad */}
              <div className="rise mt-8 rounded-2xl border border-line bg-white/90 p-4 shadow-[0_16px_40px_-24px_rgba(15,23,42,0.18)] backdrop-blur" style={{ animationDelay: "220ms" }}>
                <div className="flex items-center justify-between gap-2">
                  <p className="font-mono text-[11px] font-bold uppercase tracking-wider text-ink-2">
                    Instant Role Launchpad · Click any colleague to enter /app directly
                  </p>
                  <span className="font-mono text-[10px] text-muted">No password required</span>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {PERSONAS.map((p) => (
                    <Link
                      key={p.id}
                      href={`/app?demo=${p.id}`}
                      className="group flex flex-col justify-between rounded-xl border border-line bg-paper-2/70 p-2.5 text-left transition hover:-translate-y-0.5 hover:border-brand hover:bg-white hover:shadow-sm"
                    >
                      <div className="flex items-center justify-between gap-1">
                        <span className="truncate text-xs font-bold text-ink group-hover:text-brand">{p.name}</span>
                        <ArrowRight size={12} className="shrink-0 text-muted opacity-0 transition group-hover:translate-x-0.5 group-hover:text-brand group-hover:opacity-100" />
                      </div>
                      <p className="mt-0.5 truncate text-[11px] text-muted">{p.role}</p>
                      <span className={`mt-1.5 inline-block truncate rounded-md border px-1.5 py-0.5 font-mono text-[9.5px] font-semibold ${p.accent}`}>
                        {p.badge}
                      </span>
                    </Link>
                  ))}
                </div>
              </div>
            </div>

            <HeroWorkbench />
          </div>
        </section>

        {/* ---------------- Live Telemetry & Benchmark Ribbon ---------------- */}
        <section className="border-y border-slate-800 bg-rail text-paper">
          <div className="mx-auto grid max-w-7xl grid-cols-2 gap-px bg-slate-800/80 sm:grid-cols-3 lg:grid-cols-6">
            {[
              [`${LIVE.heardToAnswer}s`, "Spoken question → cited HUD answer"],
              [`${LIVE.search}s`, "Permission-scoped hybrid vector recall"],
              [EVAL.retrieval, "Retrieval eval: exact source cited"],
              [EVAL.leaks, "Cross-user permission leaks in red-team eval"],
              ["100%", "Deterministic Spec Check math on MTCs"],
              ["HI · EN", "Hands-free Hinglish, Hindi & regional voice"],
            ].map(([val, label]) => (
              <div key={label} className="bg-rail px-5 py-5">
                <p className="font-display text-3xl font-bold tracking-tight text-white">{val}</p>
                <p className="mt-1 text-xs leading-snug text-slate-400">{label}</p>
              </div>
            ))}
          </div>
        </section>

        {/* ---------------- Phase 4 Flagships Showcase (#flagships) ---------------- */}
        <section id="flagships" className="scroll-mt-20 border-b border-line bg-paper-2/70 py-20 lg:py-24">
          <div data-reveal className="mx-auto max-w-7xl px-5 lg:px-8">
            <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
              <div>
                <p className="font-mono text-xs font-bold uppercase tracking-[0.16em] text-brand">Phase 4 Autonomous Capabilities</p>
                <h2 className="mt-2 max-w-3xl font-display text-3xl leading-tight sm:text-5xl">
                  Three specialized industrial agents that close the loop from PDF to shop floor.
                </h2>
              </div>
              <Link
                href="/app?demo=neha"
                className="inline-flex items-center gap-1.5 self-start rounded-xl bg-ink px-4 py-2.5 text-xs font-semibold text-white transition hover:bg-ink-2 lg:self-auto"
              >
                Test as Neha (QA Manager) <ArrowRight size={14} />
              </Link>
            </div>

            <div className="mt-12 grid gap-6 lg:grid-cols-3">
              {/* Card 1: Saathi Research */}
              <div className="flex flex-col justify-between rounded-2xl border border-line bg-white p-6 shadow-xs">
                <div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="inline-flex items-center gap-1.5 rounded-lg bg-brand-soft px-2.5 py-1 font-mono text-xs font-bold text-brand-strong">
                      <FileSearch size={14} /> Saathi Research
                    </span>
                    <span className="rounded-full border border-warn-border/40 bg-warn-soft px-2.5 py-0.5 font-mono text-[10.5px] font-bold text-warn-ink">
                      AT RISK · 2 GAPS
                    </span>
                  </div>
                  <h3 className="mt-4 font-display text-2xl">Multi-Agent Inspection Dossiers</h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted">
                    Ask <em>&ldquo;Are we ready for the RDSO inspection on Oct 20?&rdquo;</em> Parallel ADK researcher waves inspect drawings, MTCs, NCRs, and promises, then strip
                    any unverified claim in code.
                  </p>

                  <div className="mt-5 space-y-2 rounded-xl border border-line bg-paper-2 p-3.5 font-mono text-xs">
                    <div className="flex items-center justify-between text-[11px] font-semibold text-ink">
                      <span>4 Researcher Waves Executed</span>
                      <span className="text-moss">14/14 Claims Cited</span>
                    </div>
                    {[
                      ["✓", "text-moss", "SRC-BF-2041 Rev C released (N. Verma)"],
                      ["!", "text-warn", "Heat H-77812 Charpy @ -20°C: 21J < 27J min"],
                      ["✕", "text-rust", "UT calibration cert for Bay 2 rig expired"],
                    ].map(([ic, cls, txt]) => (
                      <div key={txt} className="flex items-center gap-2 rounded-lg bg-white px-2.5 py-1.5 text-[11px]">
                        <span className={`font-bold ${cls}`}>{ic}</span>
                        <span className="truncate font-sans text-ink">{txt}</span>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="mt-5 flex items-center justify-between border-t border-line pt-4">
                  <span className="font-mono text-[11px] text-muted">1-click: Turn gaps into tasks</span>
                  <Link href="/app?demo=kavya" className="inline-flex items-center gap-1 text-xs font-bold text-brand hover:underline">
                    Open Research <ArrowRight size={13} />
                  </Link>
                </div>
              </div>

              {/* Card 2: Spec Check */}
              <div className="flex flex-col justify-between rounded-2xl border border-line bg-white p-6 shadow-xs">
                <div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="inline-flex items-center gap-1.5 rounded-lg bg-moss-soft px-2.5 py-1 font-mono text-xs font-bold text-moss">
                      <ShieldCheck size={14} /> Spec Check & Standards
                    </span>
                    <span className="rounded-full bg-rust-soft px-2.5 py-0.5 font-mono text-[10.5px] font-bold text-rust">
                      DETERMINISTIC VERDICT
                    </span>
                  </div>
                  <h3 className="mt-4 font-display text-2xl">Automated MTC Verification</h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted">
                    When a supplier Mill Test Certificate arrives in chat, Gemini extracts ladle/product values and <strong>deterministic Python code</strong> compares them against
                    thickness-banded grade limits.
                  </p>

                  <div className="mt-5 overflow-hidden rounded-xl border border-line bg-paper-2 text-xs">
                    <div className="flex items-center justify-between border-b border-line bg-white px-3 py-2 font-mono text-[11px]">
                      <span className="font-bold text-ink">MTC_H-77812 · S355J2 (28 mm)</span>
                      <span className="font-bold text-rust">1 LIMIT FAILED</span>
                    </div>
                    <div className="divide-y divide-line/70 px-3 py-1.5 font-mono text-[11px]">
                      <div className="flex justify-between py-1">
                        <span className="font-sans text-muted">Yield Strength ReH</span>
                        <span className="text-moss">368 MPa ≥ 345 (PASS)</span>
                      </div>
                      <div className="flex justify-between py-1">
                        <span className="font-sans text-muted">Phosphorus (P)</span>
                        <span className="text-moss">0.019% ≤ 0.025% (PASS)</span>
                      </div>
                      <div className="flex justify-between py-1 font-bold text-rust">
                        <span className="font-sans">Impact @ -20 °C</span>
                        <span>21 J &lt; 27 J min (FAIL)</span>
                      </div>
                    </div>
                  </div>
                </div>
                <div className="mt-5 flex items-center justify-between border-t border-line pt-4">
                  <span className="font-mono text-[11px] text-muted">Auto-prefills NCR draft</span>
                  <Link href="/app?demo=neha" className="inline-flex items-center gap-1 text-xs font-bold text-brand hover:underline">
                    Open Spec Check <ArrowRight size={13} />
                  </Link>
                </div>
              </div>

              {/* Card 3: Saathi Voice */}
              <div className="flex flex-col justify-between rounded-2xl border border-line bg-white p-6 shadow-xs">
                <div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="inline-flex items-center gap-1.5 rounded-lg bg-warn-soft px-2.5 py-1 font-mono text-xs font-bold text-warn-ink">
                      <Sparkles size={14} /> Saathi Voice
                    </span>
                    <span className="rounded-full bg-brand-soft px-2.5 py-0.5 font-mono text-[10.5px] font-bold text-brand-strong">
                      GEMINI LIVE AUDIO
                    </span>
                  </div>
                  <h3 className="mt-4 font-display text-2xl">Hands-Free Shop-Floor Voice</h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted">
                    Supervisors with gloves on hold or tap to speak in Hindi, Hinglish, Marathi, Tamil, or Telugu. Saathi checks drawings, reads shift handovers, and drafts NCRs
                    with two-turn confirmation.
                  </p>

                  <div className="mt-5 space-y-2 rounded-xl bg-rail p-3.5 text-xs text-white">
                    <p className="text-[11px] text-slate-400">
                      Suresh: &ldquo;Bay 2 mein CNC-3 band hai, chiller fault aa raha hai, downtime report draft karo.&rdquo;
                    </p>
                    <div className="rounded-lg border border-white/15 bg-white/10 p-2.5">
                      <p className="font-mono text-[10px] font-bold uppercase text-warn-border">Drafted · Waiting for spoken &ldquo;Haan&rdquo;</p>
                      <p className="mt-0.5 font-semibold text-white">DT-0004 · CNC-3 Chiller Fault (Bay 2)</p>
                    </div>
                  </div>
                </div>
                <div className="mt-5 flex items-center justify-between border-t border-line pt-4">
                  <span className="font-mono text-[11px] text-muted">Server-enforced confirmation</span>
                  <Link href="/app?demo=suresh" className="inline-flex items-center gap-1 text-xs font-bold text-brand hover:underline">
                    Try as Suresh <ArrowRight size={13} />
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ---------------- Problem Statement ---------------- */}
        <section data-reveal className="border-b border-line bg-white">
          <div className="mx-auto max-w-7xl px-5 py-16 lg:px-8">
            <p className="font-mono text-xs font-bold uppercase tracking-[0.16em] text-brand">Why Plants Lose Hours Every Shift</p>
            <h2 className="mt-3 max-w-3xl font-display text-3xl leading-tight sm:text-5xl">
              The real work happens in conversations. Traditional ERPs only learn about it days later.
            </h2>
            <div className="mt-10 grid gap-5 md:grid-cols-3">
              {[
                [
                  "01",
                  "Knowledge evaporates across shifts",
                  "The answer was in a WhatsApp-style chat, a shift handover, or a 14-page PDF shared weeks ago. Finding it means scrolling or interrupting a colleague.",
                ],
                [
                  "02",
                  "Parts get machined to superseded drawings",
                  "Nobody remembers why the vendor was kept or whether Rev B or Rev C is current on the shop floor. Outdated paper prints cause costly scrap and repeat NCRs.",
                ],
                [
                  "03",
                  "Promises and defects slip through the cracks",
                  "Vendor delivery commitments made in chat, MTCs checked by eye, and verbal shift handovers create blind spots right before an RDSO customer audit.",
                ],
              ].map(([n, t, d]) => (
                <div key={n} className="rounded-2xl border border-line bg-paper-2/60 p-7 transition hover:border-brand/40 hover:bg-white hover:shadow-sm">
                  <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-brand-soft font-mono text-xs font-bold text-brand-strong">{n}</span>
                  <h3 className="mt-4 text-lg font-bold">{t}</h3>
                  <p className="mt-2 text-[15px] leading-relaxed text-muted">{d}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ---------------- Saathi Live (#live) ---------------- */}
        <section id="live" className="blueprint-grid relative scroll-mt-16 overflow-hidden text-paper">
          <div data-reveal className="mx-auto grid max-w-7xl items-center gap-14 px-5 py-24 lg:grid-cols-[1fr_1.05fr] lg:px-8">
            <div>
              <span className="inline-flex items-center gap-2 rounded-full border border-sky/30 bg-white/10 px-3 py-1 font-mono text-xs uppercase tracking-[0.14em] text-mint">
                <Radar size={13} /> Real-Time Meeting Copilot · Saathi Live
              </span>
              <h2 className="mt-4 font-display text-4xl leading-tight sm:text-5xl">
                A copilot in every review. <em className="text-mint">Cited answers before you reach for the folder.</em>
              </h2>
              <p className="mt-5 max-w-lg text-[15px] leading-relaxed text-slate-300">
                Saathi listens to the meeting through your mic and the Meet, Teams, or Zoom tab. When someone asks &ldquo;what budget did we approve?&rdquo; or &ldquo;when is the
                RDSO inspection?&rdquo;, the cited answer appears in 2.8 seconds on a floating heads-up card.
              </p>
              <ul className="mt-8 space-y-3.5">
                {[
                  ["Streaming bilingual transcript", "Words appear in 0.7s in English, Hindi, and Hinglish with plant drawing numbers and colleague names spelled accurately."],
                  ["Instant HUD answers, cited", "Detects questions automatically, searches your Knowledge Hub, Drive, and channels in parallel, and cites every source."],
                  ["Contradiction & source radar", "Flags when two documents or a spoken claim disagree with approved specs or earlier decisions."],
                  ["Auto-enhanced notes & tasks", "When the call ends, shorthand + transcript become structured decisions and 1-click assignable action items."],
                ].map(([t, d]) => (
                  <li key={t} className="flex gap-3">
                    <span className="mt-1 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-mint/20 text-mint">
                      <Check size={12} strokeWidth={3} />
                    </span>
                    <div>
                      <p className="font-semibold text-white">{t}</p>
                      <p className="text-sm leading-relaxed text-slate-300">{d}</p>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
            <LivePanel />
          </div>
        </section>

        {/* ---------------- Four Pillars (#pillars) ---------------- */}
        <section data-reveal id="pillars" className="mx-auto max-w-7xl scroll-mt-20 px-5 py-24 lg:px-8">
          <div className="max-w-3xl">
            <p className="font-mono text-xs font-bold uppercase tracking-[0.16em] text-brand">Unified Workspace Architecture</p>
            <h2 className="mt-3 font-display text-4xl leading-tight sm:text-5xl">
              Access knowledge, collaborate, decide with evidence, and finish the work.
            </h2>
          </div>
          <div className="mt-12 grid gap-5 lg:grid-cols-2">
            <Pillar
              n="01"
              icon={FileSearch}
              title="Access knowledge"
              lead="Permission-scoped recall across chats, PDFs, drawings, and 6 months of BigQuery archive."
              items={[
                ["Saathi Research (multi-agent ADK)", "Parallel researcher waves check drawings, certificates, NCRs, and promises, verify every claim, and write a cited readiness report."],
                ["Recall search with provenance", "Every answer includes 'How Saathi got this' showing exact ADK tool calls, execution latency, and clickable citation chips."],
                ["Personal Knowledge Hub", "Private PDFs, notes, images, and audio recordings indexed section-by-section with topic wikis and contradiction detection."],
                ["Plant Memory & BigQuery Analytics", "“This happened before” matches past defects and fixes; natural-language questions plot live BigQuery charts."],
              ]}
            />
            <Pillar
              n="02"
              icon={Users}
              title="Collaborate"
              lead="Teams-style channels and threads with built-in shift continuity."
              items={[
                ["Channels, threads, mentions & RBAC", "Workspaces with owners, admins, members, and channel-scoped external guests (`ai_excluded` privacy toggle per chat)."],
                ["Saathi Live in meetings", "Real-time bilingual transcription, Picture-in-Picture HUD cards, and audible consent chime."],
                ["AI Shift Handover", "Auto-drafted at shift end from Bay messages and records, signed by the outgoing supervisor, and acknowledged by the incoming shift."],
                ["Google Workspace Connectors", "Read-only Gmail, Calendar, and Drive sync with Cloud KMS envelope encryption and automatic email promise detection."],
              ]}
            />
            <Pillar
              n="03"
              icon={Workflow}
              title="Make decisions"
              lead="Deterministic spec verification and an institutional decision ledger."
              items={[
                ["Spec Check & Standards Library", "Mill test certificates verified automatically against approved grade limits on Vertex AI Agent Search + deterministic Python math."],
                ["Decision Log & Supersession", "Captured from chats and meetings: what was decided, why, which options were rejected, and what earlier decision it superseded."],
                ["Vendor & Engineering Briefs", "“Should we keep Om Castings?” synthesizes NCR history, promise on-time rate, and commercial quotes."],
                ["Revision Guard", "Flags superseded drawings (`Rev B`) inline in chat and always links operators to the released `Rev C`."],
              ]}
            />
            <Pillar
              n="04"
              icon={ListTodo}
              title="Complete everyday work"
              lead="Conversations turn into tracked tasks and numbered plant records."
              items={[
                ["Needs You Priority Queue", "One ranked triage view with category filters: overdue tasks, shift handovers, open NCRs, mentions, and email promises."],
                ["Promise Capture & Gaps → Tasks", "“I’ll send the UT report by Friday” becomes a proposed task; Research gaps convert into assigned tasks in one click."],
                ["Snap-to-Record", "A photo of casting porosity or a voice note becomes a structured NCR, machine downtime, or anonymous safety near-miss draft."],
                ["Saathi Voice (Gemini Live)", "Hands-free Hindi, Hinglish, and English voice copilot for the shop floor with server-enforced confirmation."],
              ]}
            />
          </div>
        </section>

        {/* ---------------- Shop-Floor Manufacturing Layer (#manufacturing) ---------------- */}
        <section id="manufacturing" className="scroll-mt-16 border-y border-line bg-paper-2/70">
          <div data-reveal className="mx-auto grid max-w-7xl items-center gap-14 px-5 py-24 lg:grid-cols-2 lg:px-8">
            <div>
              <p className="font-mono text-xs font-bold uppercase tracking-[0.16em] text-brand">Built for the Shop Floor</p>
              <h2 className="mt-3 font-display text-4xl leading-tight sm:text-5xl">
                Generic assistants see a PDF. <em className="text-brand">Saathi reads the title block.</em>
              </h2>
              <div className="mt-8 grid gap-3.5 sm:grid-cols-2">
                {[
                  [ScrollText, "Drawing Register & Revision Guard", "Tracks Rev C vs Rev B, approver, and release date. Unapproved drafts stay private."],
                  [ShieldCheck, "Spec Check & Standards Library", "Automatic MTC pass/fail against the drawing's required steel grade; 1-click NCR draft on failure."],
                  [FileSearch, "Saathi Research Dossiers", "RDSO inspection readiness and vendor comparison dossiers assembled in minutes."],
                  [Camera, "Snap-to-Record (NCR / Downtime)", "Photo or Hindi voice note becomes a numbered plant record tracked from open to verified closure."],
                  [History, "Plant Memory", "Repeat porosity from the same foundry? Surfaces past NCRs and the corrective action that fixed them."],
                  [RefreshCw, "Signed Shift Handovers", "Machines down, quality holds, safety, and watch-outs—signed and escalated if unacknowledged."],
                  [BarChart3, "Ask Your Plant Data (BigQuery)", "Downtime hours by machine, NCRs by vendor, and promise on-time rate charted on demand."],
                  [Radar, "QR Controlled Copies", "Stamp any drawing PDF with a QR code: scanning on a phone shows CURRENT or DO NOT USE."],
                ].map(([Icon, t, d]) => {
                  const I = Icon as typeof Lock;
                  return (
                    <div key={t as string} className="lift rounded-2xl border border-line bg-white p-5 shadow-2xs">
                      <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-brand-soft text-brand-strong">
                        <I size={18} aria-hidden />
                      </span>
                      <h3 className="mt-3 font-bold text-ink">{t as string}</h3>
                      <p className="mt-1 text-[13.5px] leading-relaxed text-muted">{d as string}</p>
                    </div>
                  );
                })}
              </div>
            </div>
            <div className="rounded-3xl border border-slate-800 bg-rail p-6 text-paper shadow-2xl">
              <DrawingPanel />
            </div>
          </div>
        </section>

        {/* ---------------- Architecture (#how) ---------------- */}
        <section id="how" className="scroll-mt-16 border-b border-line bg-white">
          <div data-reveal className="mx-auto max-w-7xl px-5 py-24 lg:px-8">
            <div className="grid gap-10 lg:grid-cols-[0.85fr_1.15fr]">
              <div>
                <p className="font-mono text-xs font-bold uppercase tracking-[0.16em] text-brand">Cloud-Native Architecture</p>
                <h2 className="mt-3 font-display text-4xl leading-tight sm:text-5xl">Gemini does the reading, listening, and synthesis. People confirm.</h2>
                <p className="mt-5 max-w-md text-[15px] leading-relaxed text-muted">
                  Built on Google&rsquo;s Agent Development Kit (ADK) with permission-scoped tools, separate API and private worker Cloud Run services, and zero silent writes.
                </p>
                <div className="mt-6 flex flex-wrap gap-1.5">
                  {[
                    "Gemini 3.8 Flash",
                    "Gemini 3.8 Live",
                    "Gemini 3.5 Flash-Lite",
                    "Gemini 3.5 Transcribe Live",
                    "Gemini TTS",
                    "gemini-embedding",
                    "Google ADK",
                    "Vertex AI Agent Search",
                    "Document AI",
                    "Firestore Vector Search",
                    "BigQuery Archive & Analytics",
                    "Cloud Run (API + Worker)",
                    "Cloud Tasks",
                    "Pub/Sub",
                    "Cloud Trace",
                    "Cloud Scheduler",
                    "Cloud KMS",
                  ].map((t) => (
                    <span key={t} className="rounded-md border border-brand/25 bg-brand-soft/60 px-2.5 py-1 font-mono text-[11px] font-semibold text-brand-strong">
                      {t}
                    </span>
                  ))}
                </div>
              </div>
              <ol className="relative grid gap-4 sm:grid-cols-2">
                {[
                  ["Capture", "Channels, DMs, PDFs, photos, Hindi voice notes, live meetings over WebSocket, Gmail, Calendar, and Drive.", "Cloud Run · Pub/Sub · Storage"],
                  ["Understand", "Document AI + Gemini extract title blocks, revision tables, and MTC ladle values; deterministic code checks spec limits.", "Document AI · Vertex AI · Spec Check"],
                  ["Remember", "Section-aware chunks embedded in Mumbai in a permission-filtered Firestore vector index + BigQuery full-history archive.", "Firestore Vector · BigQuery · Agent Search"],
                  ["Act", "Multi-agent research dossiers, cited answers, and drafted tasks, NCRs, and handovers. Humans confirm every write.", "ADK · Cloud Tasks · FCM Push"],
                ].map(([t, d, tech], i) => (
                  <li key={t} className="relative rounded-2xl border border-line bg-paper-2/70 p-6">
                    <span className="font-mono text-[11px] font-bold uppercase tracking-widest text-brand">Step 0{i + 1}</span>
                    <h3 className="mt-2 font-display text-2xl font-bold">{t}</h3>
                    <p className="mt-2 text-[14.5px] leading-relaxed text-muted">{d}</p>
                    <p className="mt-4 font-mono text-[11px] font-semibold text-ink-2">{tech}</p>
                  </li>
                ))}
              </ol>
            </div>
          </div>
        </section>

        {/* ---------------- Trust & Security (#trust) ---------------- */}
        <section data-reveal id="trust" className="scroll-mt-16 bg-paper-2/60">
          <div className="mx-auto grid max-w-7xl gap-12 px-5 py-24 lg:grid-cols-[0.8fr_1.2fr] lg:px-8">
            <div>
              <p className="font-mono text-xs font-bold uppercase tracking-[0.16em] text-brand">Enterprise Trust & Security</p>
              <h2 className="mt-3 font-display text-4xl leading-tight sm:text-5xl">Hardened permission boundaries across every tool and agent.</h2>
              <p className="mt-5 text-[15px] leading-relaxed text-muted">
                Saathi enforces workspace, channel, and role isolation in deterministic Python code, Firestore security rules, and parameterized BigQuery queries—verified by
                adversarial red-team evaluations.
              </p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              {[
                [Lock, "Permission-Scoped ADK Tools", "Every search, decision, handover, and research wave filters results to the caller's exact channel membership."],
                [ScrollText, "Code-Verified Citations", "Research claims and citations are verified against tool evidence in Python; uncited claims are dropped."],
                [ShieldCheck, "Zero Silent Actions", "Tasks, NCRs, and handovers are always drafted for human confirmation. Prompt injections inside files are ignored."],
                [Timer, "Ephemeral Meeting & Voice Audio", "Audio is streamed in memory and never stored; anonymous safety reports strip raw voice audio to protect identity."],
                [MapPin, "India Data Residency (Mumbai)", "Firestore, Cloud Run, Storage, Document AI, BigQuery, and KMS encryption run in asia-south1."],
                [Gavel, "Complete Admin Audit Trail", "Role changes, channel governance, shared research reports, and assistant queries are logged for compliance."],
              ].map(([Icon, t, d]) => {
                const I = Icon as typeof Lock;
                return (
                  <div key={t as string} className="rounded-2xl border border-line bg-white p-6 shadow-2xs">
                    <I size={20} className="text-brand" aria-hidden />
                    <h3 className="mt-3 font-bold">{t as string}</h3>
                    <p className="mt-1.5 text-[14px] leading-relaxed text-muted">{d as string}</p>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        {/* ---------------- Bottom CTA ---------------- */}
        <section data-reveal className="px-5 py-20 lg:px-8">
          <div className="relative mx-auto max-w-7xl overflow-hidden rounded-3xl bg-rail px-8 py-16 text-paper shadow-2xl sm:px-14">
            <div className="blueprint-grid absolute inset-0 opacity-80" />
            <div className="relative flex flex-col items-start gap-8 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <span className="font-mono text-xs font-semibold uppercase tracking-widest text-mint">Shakti Rail Components · Live Demo</span>
                <h2 className="mt-2 font-display text-4xl leading-tight text-white sm:text-5xl">
                  From shop-floor conversation
                  <br />
                  to <em className="text-mint">verified work that gets done.</em>
                </h2>
                <p className="mt-4 max-w-xl text-slate-300">
                  Jump directly into the live workspace as Prince (Design Engineer), Neha (QA Manager), or Suresh (Shop Floor Supervisor) and switch personas anytime from the top
                  bar.
                </p>
              </div>
              <div className="flex flex-wrap gap-3">
                <Link
                  href="/app?demo=prince"
                  className="group inline-flex shrink-0 items-center gap-2 rounded-xl bg-white px-7 py-4 font-semibold text-rail shadow-lg transition hover:bg-paper-2"
                >
                  Launch Workspace (/app) <ArrowRight size={18} className="transition-transform group-hover:translate-x-0.5" />
                </Link>
                <Link
                  href="/login?demo=1"
                  className="inline-flex shrink-0 items-center gap-2 rounded-xl border border-white/25 bg-white/10 px-6 py-4 font-semibold text-white backdrop-blur transition hover:bg-white/20"
                >
                  Choose Persona
                </Link>
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-line bg-white">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 px-5 py-8 text-sm text-muted sm:flex-row sm:items-center sm:justify-between lg:px-8">
          <span className="inline-flex items-center gap-2 font-semibold text-ink">
            <LogoMark size={22} /> Saathi · Google Cloud AI Builder Cup 2026
          </span>
          <span className="flex flex-wrap items-center gap-x-4 gap-y-1">
            <Link href="/app?demo=prince" className="font-semibold text-brand hover:underline">
              Open Workspace
            </Link>
            <Link href="/login?demo=1" className="font-medium text-ink hover:underline">
              Sign in
            </Link>
            <Link href="/privacy" className="font-medium text-ink hover:underline">
              Privacy Policy
            </Link>
            <span className="font-mono text-xs">Gemini · ADK · Vertex AI · Document AI · Firestore · BigQuery · Cloud Run</span>
          </span>
        </div>
      </footer>
    </div>
  );
}

function Pillar({ n, icon: Icon, title, lead, items }: { n: string; icon: typeof Lock; title: string; lead: string; items: [string, string][] }) {
  return (
    <article className="lift rounded-2xl border border-line bg-white p-7 shadow-2xs transition hover:border-brand/40">
      <div className="flex items-center gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-soft text-brand-strong">
          <Icon size={19} aria-hidden />
        </span>
        <span className="font-mono text-sm font-bold text-brand">{n}</span>
      </div>
      <h3 className="mt-4 font-display text-3xl">{title}</h3>
      <p className="mt-1 text-[15px] text-muted">{lead}</p>
      <ul className="mt-5 space-y-3">
        {items.map(([t, d]) => (
          <li key={t} className="flex gap-2.5">
            <span className="mt-1 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-brand text-white">
              <Check size={10} strokeWidth={3} />
            </span>
            <p className="text-[14.5px] leading-relaxed">
              <b className="font-semibold text-ink">{t}.</b> <span className="text-muted">{d}</span>
            </p>
          </li>
        ))}
      </ul>
    </article>
  );
}

/** Hero right-hand visual: multi-layered Industrial AI Command Workbench preview. */
function HeroWorkbench() {
  return (
    <div className="rise relative self-start lg:mt-2" style={{ animationDelay: "180ms" }} aria-label="Saathi Industrial Command Workbench Preview" role="img">
      {/* Main dark command frame */}
      <div className="overflow-hidden rounded-3xl border border-slate-800 bg-rail text-white shadow-[0_36px_90px_-24px_rgba(11,19,43,0.55)]">
        {/* Window title bar */}
        <div className="flex items-center gap-2 border-b border-white/10 bg-white/5 px-4 py-3">
          <span className="h-2.5 w-2.5 rounded-full bg-rust/80" />
          <span className="h-2.5 w-2.5 rounded-full bg-warn-border/80" />
          <span className="h-2.5 w-2.5 rounded-full bg-moss/80" />
          <span className="ml-2 font-mono text-[11px] font-medium text-slate-300">Saathi OS · Shakti Rail Components</span>
          <span className="ml-auto inline-flex items-center gap-1.5 rounded-full bg-moss/20 px-2.5 py-0.5 font-mono text-[10px] font-bold text-emerald-300">
            <span className="h-1.5 w-1.5 animate-ping rounded-full bg-emerald-400" />
            ADK AGENTS READY
          </span>
        </div>

        <div className="space-y-3.5 p-5">
          {/* Module 1: Live Meeting Copilot */}
          <div className="rounded-2xl border border-white/10 bg-white/[0.06] p-4">
            <div className="flex items-center justify-between gap-2">
              <span className="flex items-center gap-1.5 font-mono text-[10.5px] font-bold uppercase tracking-wider text-mint">
                <Radar size={13} /> Saathi Live · Bogie Prototype Weekly
              </span>
              <span className="font-mono text-[10px] text-slate-400">⚡ {LIVE.heardToAnswer}s said → cited answer</span>
            </div>
            <p className="mt-2 text-xs text-slate-300">
              &ldquo;Rahul, kitna budget approve hua tha side frame castings ke liye, aur Heat H-77812 spec mein pass hai kya?&rdquo;
            </p>
            <div className="mt-2.5 rounded-xl border border-mint/25 bg-[#0f172a] p-3">
              <p className="text-xs leading-relaxed text-slate-100">
                <strong className="text-white">Budget: Rs 21.0 lakh</strong> for 24 Nos (revised from Rs 18.4L).{" "}
                <strong className="text-amber-300">Spec Alert: Heat H-77812 FAILED</strong> Charpy impact @ -20°C (21 J vs 27 J min on S355J2).
              </p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {["[meet:finance-oct8]", "[std:S355J2-cl7]", "[file:MTC_H-77812]"].map((c) => (
                  <span key={c} className="rounded border border-mint/30 bg-mint/10 px-1.5 py-0.5 font-mono text-[10px] text-mint">
                    {c}
                  </span>
                ))}
              </div>
            </div>
          </div>

          {/* Module 2: Spec Check & Revision Guard side-by-side */}
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-2xl border border-white/10 bg-white/[0.06] p-3.5">
              <div className="flex items-center justify-between">
                <span className="font-mono text-[10px] font-bold uppercase tracking-wider text-emerald-300">Revision Guard</span>
                <span className="rounded bg-moss/25 px-1.5 py-0.5 font-mono text-[9.5px] font-bold text-emerald-300">REV C CURRENT</span>
              </div>
              <p className="mt-1.5 font-mono text-xs font-bold text-white">SRC-BF-2041 · Side Frame GA</p>
              <p className="mt-1 text-[11px] text-slate-300">Rev B superseded Oct 6 · QR stamps active across Bay 2</p>
            </div>

            <div className="rounded-2xl border border-white/10 bg-white/[0.06] p-3.5">
              <div className="flex items-center justify-between">
                <span className="font-mono text-[10px] font-bold uppercase tracking-wider text-amber-300">Research Dossier</span>
                <span className="rounded bg-warn-border/25 px-1.5 py-0.5 font-mono text-[9.5px] font-bold text-amber-300">AT RISK</span>
              </div>
              <p className="mt-1.5 font-mono text-xs font-bold text-white">RDSO Readiness · Oct 20</p>
              <p className="mt-1 text-[11px] text-slate-300">4 agents checked 19 sources · 2 gaps ready to assign</p>
            </div>
          </div>

          {/* Bottom quick launch inside workbench */}
          <div className="flex items-center justify-between rounded-xl border border-white/10 bg-white/5 px-3.5 py-2.5 text-xs">
            <span className="text-slate-300">Experience all workflows live in your browser</span>
            <Link href="/app?demo=prince" className="inline-flex items-center gap-1 font-semibold text-mint hover:underline">
              Enter /app now <ArrowRight size={13} />
            </Link>
          </div>
        </div>
      </div>

      {/* 3 Floating Status Pills Underneath */}
      <div className="mt-3.5 grid grid-cols-3 gap-2.5">
        {[
          [Workflow, "Decision Ledger", "Om Castings retained · audit tracked"],
          [History, "Plant Memory", "NCR-0001 porosity fix linked"],
          [ShieldCheck, "Spec Check", "Deterministic MTC pass/fail"],
        ].map(([Icon, t, d]) => {
          const I = Icon as typeof Lock;
          return (
            <div key={t as string} className="rounded-2xl border border-line bg-white p-3 shadow-xs">
              <I size={15} className="text-brand" />
              <p className="mt-1.5 text-xs font-bold text-ink">{t as string}</p>
              <p className="text-[11px] leading-snug text-muted">{d as string}</p>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** Dark-section visual for Saathi Live: the floating answer card over a meeting, with stage timings. */
function LivePanel() {
  return (
    <div className="relative">
      <div className="rounded-2xl border border-white/10 bg-white/5 p-5 backdrop-blur">
        <div className="grid grid-cols-3 gap-2">
          {["AS", "NV", "RS", "KI", "PK", "SY"].map((p, i) => (
            <div key={p} className={`flex aspect-video items-center justify-center rounded-lg ${i === 4 ? "ring-2 ring-mint" : ""} bg-white/10`}>
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-white/20 text-xs font-semibold">{p}</span>
            </div>
          ))}
        </div>
        <p className="mt-3 text-center font-mono text-[11px] text-paper/60">Google Meet · Bogie prototype weekly</p>
      </div>
      <div className="relative -mt-16 ml-auto w-[88%] rounded-2xl border border-white/15 bg-[#0f172a] p-5 shadow-2xl sm:w-[75%]">
        <p className="flex items-center gap-2 text-sm font-bold text-white">
          <Radar size={16} className="text-mint" /> Saathi Live <span className="ml-auto text-[11px] font-normal text-paper/50">A− A+</span>
        </p>
        <div className="mt-3 rounded-xl bg-white/10 p-3">
          <p className="text-[13.5px] font-bold text-white">When is the RDSO inspection?</p>
          <p className="mt-1 text-[13px] text-paper/85">
            <b>20 Oct 2026</b>, confirmed by Kavya; drawing pack due 17 Oct.
          </p>
          <p className="mt-1.5 text-[10.5px] text-paper/55">⚡ 2.8 s after it was said · 9 passages searched</p>
        </div>
        <div className="mt-3 grid grid-cols-3 gap-2 text-center">
          {[
            [LIVE.lineFinal, "line final"],
            [LIVE.search, "search"],
            [LIVE.heardToAnswer, "said → answer"],
          ].map(([v, l]) => (
            <div key={l} className="rounded-lg bg-white/5 py-2">
              <p className="font-display text-2xl text-mint">{v}s</p>
              <p className="text-[10.5px] text-paper/60">{l}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function DrawingPanel() {
  return (
    <div className="relative">
      <svg viewBox="0 0 520 360" className="w-full" role="img" aria-label="Engineering drawing of a bogie side frame with its title block">
        <g fill="none" stroke="#93c5fd" strokeWidth="1.4" className="draw">
          <rect x="40" y="90" width="380" height="80" rx="6" />
          <rect x="180" y="170" width="100" height="44" />
          <circle cx="95" cy="130" r="26" />
          <circle cx="365" cy="130" r="26" />
          <path d="M20 130h440" strokeDasharray="8 5" />
          <path d="M40 70h380M40 64v12M420 64v12" />
        </g>
        <text x="230" y="62" fill="#93c5fd" fontFamily="var(--font-mono)" fontSize="11" textAnchor="middle">
          2470
        </text>
        <text x="230" y="236" fill="#93c5fd" fontFamily="var(--font-mono)" fontSize="10" textAnchor="middle">
          DETAIL A · FILLET 10 mm · EN 10025 S355J2
        </text>
        <circle cx="230" cy="214" r="9" fill="none" stroke="#60a5fa" strokeWidth="1.6" />
        <g fontFamily="var(--font-mono)" fontSize="10.5">
          <rect x="250" y="262" width="250" height="88" fill="#0f172a" stroke="#93c5fd" />
          <path d="M250 284h250M250 306h250M250 328h250M340 262v88" stroke="#93c5fd" />
          <text x="258" y="277" fill="#93c5fd">
            DRG No.
          </text>
          <text x="348" y="277" fill="#f8fafc">
            SRC-BF-2041
          </text>
          <text x="258" y="299" fill="#93c5fd">
            REV
          </text>
          <text x="348" y="299" fill="#34d399" fontWeight="700">
            C · supersedes B
          </text>
          <text x="258" y="321" fill="#93c5fd">
            APPROVED
          </text>
          <text x="348" y="321" fill="#f8fafc">
            N. VERMA · 06 OCT
          </text>
          <text x="258" y="343" fill="#93c5fd">
            GUARD
          </text>
          <text x="348" y="343" fill="#f8fafc">
            QR Stamped · Spec Linked
          </text>
        </g>
      </svg>
    </div>
  );
}
