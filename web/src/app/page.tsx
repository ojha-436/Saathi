import {
  ArrowRight,
  BarChart3,
  Camera,
  Check,
  FileSearch,
  Gavel,
  History,
  ListTodo,
  Lock,
  MapPin,
  Radar,
  RefreshCw,
  ScrollText,
  ShieldCheck,
  Sun,
  Timer,
  Users,
  Workflow,
} from "@/lib/icons";
import Link from "next/link";
import { Logo, LogoMark } from "@/components/Logo";
import { RevealOnScroll } from "@/components/RevealOnScroll";
import { EVAL } from "@/lib/eval";

export const metadata = { title: "Saathi — from conversation to work that gets done" };

const NAV = [
  { href: "#live", label: "Saathi Live" },
  { href: "#pillars", label: "Product" },
  { href: "#manufacturing", label: "Manufacturing" },
  { href: "#how", label: "How it works" },
  { href: "#trust", label: "Trust" },
];

// Measured on production (Cloud Run, asia-south1) with Saathi Live's test meeting, 12 Oct 2026
const LIVE = { lineFinal: "0.7", heardToAnswer: "2.8", search: "0.5" };

export default function Landing() {
  return (
    <div className="min-h-dvh bg-paper text-ink">
      <RevealOnScroll />
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100] focus:rounded-md focus:bg-ink focus:px-4 focus:py-2 focus:text-paper">
        Skip to content
      </a>

      {/* ---------------- header ---------------- */}
      <header className="sticky top-3 z-50 px-3 sm:px-5">
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-6 rounded-full border border-white/60 bg-paper/70 px-4 shadow-[0_8px_30px_-12px_rgba(23,19,19,0.25)] backdrop-blur-xl lg:px-5">
          <Link href="/" aria-label="Saathi home">
            <Logo />
          </Link>
          <nav aria-label="Primary" className="hidden flex-1 items-center gap-6 text-sm text-muted md:flex">
            {NAV.map((n) => (
              <a key={n.href} href={n.href} className="nav-link pb-0.5 hover:text-ink">
                {n.label}
              </a>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-2">
            <Link href="/login" className="hidden rounded-full px-4 py-2 text-sm font-medium text-ink hover:bg-paper-2 sm:inline-flex">
              Sign in
            </Link>
            <Link href="/login?demo=1" className="inline-flex items-center gap-1.5 rounded-full bg-saffron px-4 py-2 text-sm font-semibold text-ink transition hover:brightness-95">
              Open live demo <ArrowRight size={15} />
            </Link>
          </div>
        </div>
      </header>

      <main id="main">
        {/* ---------------- hero ---------------- */}
        <section className="relative overflow-hidden">
          <div className="glow pointer-events-none absolute inset-0" />
          <div className="relative mx-auto grid max-w-7xl gap-14 px-5 pb-20 pt-20 lg:grid-cols-[1.02fr_1fr] lg:gap-10 lg:px-8 lg:pb-28 lg:pt-24">
            <div>
              <p className="rise inline-flex items-center gap-2 rounded-full border border-white/70 bg-white/50 px-3.5 py-1.5 font-mono text-[11px] uppercase tracking-[0.14em] text-muted backdrop-blur">
                <span className="h-1.5 w-1.5 rounded-full bg-saffron" /> Future of Work · Gemini on Google Cloud
              </p>
              <h1 className="rise mt-6 font-display text-[46px] leading-[1] text-ink sm:text-[60px] lg:text-[74px]" style={{ animationDelay: "80ms" }}>
                Your company talks all day.
                <br />
                <span className="text-ink/45">Saathi makes it count.</span>
              </h1>
              <p className="rise mt-6 max-w-xl text-lg leading-relaxed text-muted" style={{ animationDelay: "160ms" }}>
                Saathi is the AI workspace that turns what people say, in chats, meetings, photos and voice notes, into{" "}
                <span className="font-medium text-ink">knowledge you can find, decisions you can trust and work that gets done.</span> It listens in your
                meetings and answers questions as they&rsquo;re asked. It reads your drawings and remembers why every decision was made. It works in English, Hindi and Hinglish.
              </p>
              <div className="rise mt-9 flex flex-wrap items-center gap-3" style={{ animationDelay: "240ms" }}>
                <Link href="/login?demo=1" className="group inline-flex items-center gap-2 rounded-full bg-saffron px-7 py-4 text-[15px] font-semibold text-ink transition hover:brightness-95">
                  Try the live workspace <ArrowRight size={17} className="transition-transform group-hover:translate-x-0.5" />
                </Link>
                <a href="#live" className="inline-flex items-center gap-2 rounded-full border border-ink/25 px-7 py-4 text-[15px] font-semibold text-ink transition hover:bg-white/50">
                  See Saathi Live
                </a>
              </div>
              <dl className="rise mt-12 grid max-w-xl grid-cols-2 gap-6 border-t border-line pt-6 sm:grid-cols-4" style={{ animationDelay: "320ms" }}>
                <Stat value={`${LIVE.heardToAnswer}s`} label="from a question asked in a meeting to the answer on screen" />
                <Stat value={`${LIVE.lineFinal}s`} label="for a spoken line to be transcribed and final" />
                <Stat value={`${EVAL.retrieval}`} label="questions answered with the right source" />
                <Stat value={`${EVAL.leaks}`} label="permission leaks in adversarial tests" />
              </dl>
              <p className="mt-3 font-mono text-[10.5px] uppercase tracking-wider text-muted/80">Measured on production and Saathi&rsquo;s open evaluation suite · Oct 2026</p>
            </div>

            <HeroLive />
          </div>
        </section>

        {/* ---------------- problem ---------------- */}
        <section data-reveal className="border-y border-line bg-paper-2/60">
          <div className="mx-auto max-w-7xl px-5 py-16 lg:px-8">
            <p className="font-mono text-xs uppercase tracking-[0.16em] text-saffron-ink">The problem</p>
            <h2 className="mt-3 max-w-3xl font-display text-4xl leading-tight sm:text-5xl">
              The work happens in conversations. The systems only learn about it days later, if at all.
            </h2>
            <div className="mt-10 grid gap-px overflow-hidden rounded-2xl border border-line bg-line md:grid-cols-3">
              {[
                ["01", "Knowledge evaporates", "The answer was in a meeting, a WhatsApp-style chat or a PDF someone shared weeks ago. Finding it means scrolling, or asking again and waiting."],
                ["02", "Decisions get re-argued", "Nobody remembers why the vendor was kept or which revision is current. Parts get made to superseded drawings; the same defect comes back."],
                ["03", "Work slips between people", "Promises made in chat, defects reported on paper, handovers given verbally at shift change. Each one is a gap where work quietly drops."],
              ].map(([n, t, d]) => (
                <div key={n} className="bg-paper p-7">
                  <span className="font-mono text-sm text-saffron-ink">{n}</span>
                  <h3 className="mt-3 text-lg font-semibold">{t}</h3>
                  <p className="mt-2 text-[15px] leading-relaxed text-muted">{d}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ---------------- Saathi Live ---------------- */}
        <section id="live" className="blueprint-grid relative scroll-mt-16 overflow-hidden text-paper">
          <div data-reveal className="mx-auto grid max-w-7xl items-center gap-14 px-5 py-24 lg:grid-cols-[1fr_1.05fr] lg:px-8">
            <div>
              <p className="font-mono text-xs uppercase tracking-[0.16em] text-saffron">New · Saathi Live</p>
              <h2 className="mt-3 font-display text-4xl leading-tight sm:text-5xl">
                A copilot in every meeting. <em className="text-saffron">Answers before you reach for the file.</em>
              </h2>
              <p className="mt-5 max-w-lg text-[15px] leading-relaxed text-paper/70">
                Saathi listens to the meeting, through your mic and the Meet, Teams or Zoom tab. When someone asks &ldquo;what budget did we approve?&rdquo;, the answer appears
                in seconds from the documents you picked, with the source.
              </p>
              <ul className="mt-8 space-y-4">
                {[
                  ["Streaming transcript", "Gemini 3.5 Transcribe Live: words appear as people speak, in English, Hindi and Hinglish, with your team’s names and drawing numbers spelled right."],
                  ["Instant answers, cited", "Detects questions, searches your knowledge hub, Drive and workspace in parallel, and shows the answer on a heads-up card. It floats over the call in Chrome."],
                  ["Your sources, your meeting", "Tick what to “include in meeting context”. Saathi flags when sources disagree, and topic wikis show where two documents contradict each other."],
                  ["Notes that write themselves", "End the meeting: your shorthand plus the transcript becomes a summary, decisions, action items and enhanced notes."],
                  ["Respectful by design", "A chime and a spoken notice when it starts listening, a notice for the meeting chat, and attendees are told. Audio is never stored."],
                  ["Starts from your calendar", "“Start Saathi Live” on every synced meeting, and a nudge when one begins, with the right files already picked."],
                ].map(([t, d]) => (
                  <li key={t} className="flex gap-3">
                    <span className="mt-1 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-saffron/15 text-saffron">
                      <Check size={13} strokeWidth={3} />
                    </span>
                    <div>
                      <p className="font-semibold">{t}</p>
                      <p className="text-[15px] leading-relaxed text-paper/70">{d}</p>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
            <LivePanel />
          </div>
        </section>

        {/* ---------------- four pillars ---------------- */}
        <section data-reveal id="pillars" className="mx-auto max-w-7xl scroll-mt-20 px-5 py-24 lg:px-8">
          <div className="max-w-3xl">
            <p className="font-mono text-xs uppercase tracking-[0.16em] text-saffron-ink">The product</p>
            <h2 className="mt-3 font-display text-4xl leading-tight sm:text-5xl">How people find knowledge, work together, decide and finish the work. Saathi helps with all four.</h2>
          </div>
          <div className="mt-12 grid gap-4 lg:grid-cols-2">
            <Pillar
              n="01"
              icon={FileSearch}
              title="Access knowledge"
              lead="Ask in plain words and get the answer, with the source."
              items={[
                ["Recall search with citations", "Messages, PDFs, drawings, certificates, emails and Drive files, by meaning and by identifier."],
                ["Personal knowledge hub", "Your PDFs, notes, images and recordings, private to you, indexed section by section."],
                ["Plant memory", "“This happened before”: similar past defects with the root cause and the fix that worked."],
                ["Ask your data", "“NCRs by vendor this year” becomes a BigQuery chart in the answer."],
              ]}
            />
            <Pillar
              n="02"
              icon={Users}
              title="Collaborate"
              lead="Teams-style chat, with an AI colleague in every conversation."
              items={[
                ["Channels, threads, mentions, push", "Workspaces with admins and private channels, so nobody sees what they shouldn’t."],
                ["Saathi Live in meetings", "Live transcript, instant answers and auto-written notes."],
                ["AI shift handover", "Drafted from the shift’s messages and records, signed by the outgoing supervisor, acknowledged by the next shift."],
                ["Gmail, Calendar & Drive", "Connected read-only, so prep and answers include what’s in your mail and files."],
              ]}
            />
            <Pillar
              n="03"
              icon={Workflow}
              title="Make decisions"
              lead="Every decision kept with its reasons, and briefs for the next one."
              items={[
                ["Decision log", "Captured from chats and meetings: what was decided, why, what was rejected, who decided. Superseded ones are linked."],
                ["Decision briefs", "“Should we keep Om Castings?” gathers past decisions, incident history, the vendor’s promise record and the numbers."],
                ["Revision Guard", "Superseded drawings are flagged wherever they appear; Saathi always points to the current revision."],
                ["Topic wikis", "One overview per label, with contradictions between documents called out."],
              ]}
            />
            <Pillar
              n="04"
              icon={ListTodo}
              title="Complete everyday work"
              lead="What people say becomes tracked work, and the day starts with what needs you."
              items={[
                ["Needs you", "One ranked queue: overdue tasks, handovers to read, records you own, mentions and email promises."],
                ["Promise capture", "“I’ll send it by Friday” in any chat or email becomes a one-tap tracked task."],
                ["Snap-to-record", "A photo or a Hindi voice note becomes a drafted defect, downtime or safety report."],
                ["Voice everywhere", "Dictate in chat, in Saathi and in reports. “Kal subah 10 baje” sets a real reminder."],
              ]}
            />
          </div>
        </section>

        {/* ---------------- manufacturing ---------------- */}
        <section id="manufacturing" className="scroll-mt-16 border-y border-line bg-paper-2/60">
          <div data-reveal className="mx-auto grid max-w-7xl items-center gap-14 px-5 py-24 lg:grid-cols-2 lg:px-8">
            <div>
              <p className="font-mono text-xs uppercase tracking-[0.16em] text-saffron-ink">Built for the shop floor</p>
              <h2 className="mt-3 font-display text-4xl leading-tight sm:text-5xl">
                Generic assistants see a PDF. <em className="text-saffron-ink">Saathi reads the drawing.</em>
              </h2>
              <div className="mt-8 grid gap-3 sm:grid-cols-2">
                {[
                  [ScrollText, "Drawing register & Revision Guard", "Rev C supersedes Rev B, who approved it, when. Drafts stay private."],
                  [ShieldCheck, "QR controlled copies", "Scan a printed drawing: CURRENT or DO NOT USE, no login and no content shown."],
                  [Camera, "Snap-to-record", "NCR, downtime and near-miss reports from a photo or voice note, numbered and tracked to closure."],
                  [History, "Plant memory", "Repeat porosity from the same foundry? Saathi shows the last two NCRs and what fixed them."],
                  [RefreshCw, "Shift handover", "Machines, quality, safety, open items and watch-outs, every line cited, in Hinglish if you like."],
                  [BarChart3, "Plant data on BigQuery", "Downtime hours by machine, NCRs by vendor, promise on-time rate, in one question."],
                ].map(([Icon, t, d]) => {
                  const I = Icon as typeof Lock;
                  return (
                    <div key={t as string} className="lift rounded-2xl border border-line bg-paper p-5">
                      <I size={19} className="text-saffron-ink" aria-hidden />
                      <h3 className="mt-3 font-semibold">{t as string}</h3>
                      <p className="mt-1 text-[14px] leading-relaxed text-muted">{d as string}</p>
                    </div>
                  );
                })}
              </div>
            </div>
            <div className="rounded-3xl bg-ink p-6 text-paper">
              <DrawingPanel />
            </div>
          </div>
        </section>

        {/* ---------------- a day with Saathi ---------------- */}
        <section data-reveal className="mx-auto max-w-7xl px-5 py-24 lg:px-8">
          <p className="font-mono text-xs uppercase tracking-[0.16em] text-saffron-ink">A day with Saathi</p>
          <h2 className="mt-3 max-w-3xl font-display text-4xl leading-tight sm:text-5xl">One plant, one day, nothing dropped.</h2>
          <ol className="mt-12 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {[
              [Sun, "09:00 · My Day", "Neha opens Saathi. “Needs you” ranks an overdue UT report, a handover to acknowledge and an NCR she owns."],
              [Radar, "10:30 · Weekly review", "Saathi Live joins from the calendar. “What budget did we approve?” Rs 21.0 lakh, revised from 18.4, both sources cited."],
              [Camera, "14:10 · Bay 2", "Suresh snaps porosity on a casting. Saathi drafts NCR-0007, links the test certificate and shows the June fix."],
              [RefreshCw, "21:45 · Shift end", "The handover drafts itself. Suresh signs; the next shift reads “CNC-3 down, check the chiller” first thing."],
            ].map(([Icon, t, d]) => {
              const I = Icon as typeof Lock;
              return (
                <li key={t as string} className="rounded-2xl border border-line bg-paper p-6">
                  <I size={20} className="text-saffron-ink" aria-hidden />
                  <h3 className="mt-3 font-mono text-[12px] font-semibold uppercase tracking-wider">{t as string}</h3>
                  <p className="mt-2 text-[14.5px] leading-relaxed text-muted">{d as string}</p>
                </li>
              );
            })}
          </ol>
        </section>

        {/* ---------------- how ---------------- */}
        <section id="how" className="scroll-mt-16 border-y border-line bg-paper-2/60">
          <div data-reveal className="mx-auto max-w-7xl px-5 py-24 lg:px-8">
            <div className="grid gap-10 lg:grid-cols-[0.85fr_1.15fr]">
              <div>
                <p className="font-mono text-xs uppercase tracking-[0.16em] text-saffron-ink">How it works</p>
                <h2 className="mt-3 font-display text-4xl leading-tight sm:text-5xl">Gemini does the reading, listening and writing. People confirm.</h2>
                <p className="mt-5 max-w-md text-[15px] leading-relaxed text-muted">
                  One agent built with Google&rsquo;s Agent Development Kit answers through tools that only see what the asking person can see. Everything runs on Google Cloud in
                  Mumbai.
                </p>
                <div className="mt-6 flex flex-wrap gap-1.5">
                  {["Gemini 3.8 Flash", "Gemini 3.5 Flash-Lite", "Gemini 3.5 Transcribe Live", "Gemini TTS", "gemini-embedding", "ADK", "Document AI", "Firestore vector search", "BigQuery", "Cloud Run", "Cloud Scheduler", "Cloud KMS"].map((t) => (
                    <span key={t} className="rounded-md border border-blueprint/20 bg-blueprint-soft px-2 py-1 font-mono text-[11px] text-blueprint">
                      {t}
                    </span>
                  ))}
                </div>
              </div>
              <ol className="relative grid gap-4 sm:grid-cols-2">
                {[
                  ["Capture", "Chat, files, photos, voice, meetings (streamed over WebSocket), Gmail, Calendar and Drive.", "Cloud Run · Firestore · Storage"],
                  ["Understand", "Document AI + Gemini read title blocks, revision tables and certificates; Gemini spots promises, decisions and questions.", "Document AI · Gemini"],
                  ["Remember", "Section-aware chunks, embedded in Mumbai, in a vector index pre-filtered by membership; records mirrored to BigQuery.", "Vector search · BigQuery"],
                  ["Act", "Answers with citations, drafted tasks, records and handovers. People confirm; Scheduler keeps time.", "ADK · Scheduler · FCM push"],
                ].map(([t, d, tech], i) => (
                  <li key={t} className="relative rounded-2xl border border-line bg-paper p-6">
                    <span className="font-mono text-[11px] uppercase tracking-widest text-muted">Step 0{i + 1}</span>
                    <h3 className="mt-2 font-display text-3xl">{t}</h3>
                    <p className="mt-2 text-[14.5px] leading-relaxed text-muted">{d}</p>
                    <p className="mt-4 font-mono text-[11px] text-blueprint">{tech}</p>
                  </li>
                ))}
              </ol>
            </div>
          </div>
        </section>

        {/* ---------------- measured ---------------- */}
        <section data-reveal className="mx-auto max-w-7xl px-5 py-24 lg:px-8">
          <div className="grid gap-10 lg:grid-cols-[0.8fr_1.2fr]">
            <div>
              <p className="font-mono text-xs uppercase tracking-[0.16em] text-saffron-ink">Measured, not claimed</p>
              <h2 className="mt-3 font-display text-4xl leading-tight sm:text-5xl">Impact you can see in the product.</h2>
              <p className="mt-5 text-[15px] leading-relaxed text-muted">
                Admins get an Impact panel with real numbers: questions answered with sources, decisions captured, time to file a record, NCR days to close, blocked wrong-revision
                scans and Saathi Live speed. Only &ldquo;time saved&rdquo; is an estimate, and its assumptions are printed next to it.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-line bg-line sm:grid-cols-3">
              {[
                [`${LIVE.heardToAnswer} s`, "question in a meeting → answer on screen"],
                [`${LIVE.lineFinal} s`, "spoken line → final transcript"],
                [`${LIVE.search} s`, "search across the meeting’s sources + workspace"],
                [EVAL.retrieval, "retrieval eval: right source found"],
                [EVAL.leaks, "permission leaks in adversarial tests"],
                [EVAL.tasks, "plain-language tasks parsed right (Hinglish incl.)"],
              ].map(([v, l]) => (
                <div key={l} className="bg-paper p-6">
                  <p className="font-display text-4xl leading-none">{v}</p>
                  <p className="mt-2 text-xs leading-snug text-muted">{l}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ---------------- trust ---------------- */}
        <section data-reveal id="trust" className="scroll-mt-16 border-t border-line bg-paper-2/60">
          <div className="mx-auto grid max-w-7xl gap-12 px-5 py-24 lg:grid-cols-[0.8fr_1.2fr] lg:px-8">
            <div>
              <p className="font-mono text-xs uppercase tracking-[0.16em] text-saffron-ink">Trust & security</p>
              <h2 className="mt-3 font-display text-4xl leading-tight sm:text-5xl">An assistant you can put in front of the whole company.</h2>
              <p className="mt-5 text-[15px] leading-relaxed text-muted">Saathi can&rsquo;t show anyone what they shouldn&rsquo;t see. That rule is enforced in code and tested adversarially on every change, and every action is recorded in an audit trail.</p>
            </div>
            <div className="grid gap-px overflow-hidden rounded-2xl border border-line bg-line sm:grid-cols-2">
              {[
                [Lock, "Workspaces, roles, permission-aware AI", "Every search, decision, handover and meeting answer is filtered to what the asker can access."],
                [ScrollText, "Every answer cited", "No source, no answer: Saathi says it couldn’t find it instead of guessing."],
                [ShieldCheck, "People confirm actions", "Tasks, records and handovers are drafted, never filed silently. Instructions hidden in documents are ignored."],
                [Timer, "Audio is never stored", "Meetings are transcribed live; transcripts stay private to the person who ran them."],
                [MapPin, "Data stays in India", "Firestore, Cloud Run, Storage, Document AI and embeddings run in asia-south1 (Mumbai)."],
                [Gavel, "Audit trail", "Admin actions, records and every assistant question are logged; BigQuery for analytics."],
              ].map(([Icon, t, d]) => {
                const I = Icon as typeof Lock;
                return (
                  <div key={t as string} className="bg-paper p-6">
                    <I size={20} className="text-saffron-ink" aria-hidden />
                    <h3 className="mt-3 font-semibold">{t as string}</h3>
                    <p className="mt-1.5 text-[14.5px] leading-relaxed text-muted">{d as string}</p>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        {/* ---------------- CTA ---------------- */}
        <section data-reveal className="px-5 py-24 lg:px-8">
          <div className="relative mx-auto max-w-7xl overflow-hidden rounded-3xl bg-ink px-8 py-16 text-paper sm:px-14">
            <div className="blueprint-grid absolute inset-0 opacity-60" />
            <div className="relative flex flex-col items-start gap-8 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <h2 className="font-display text-4xl leading-tight sm:text-6xl">
                  From conversation
                  <br />
                  to <em className="text-saffron">work that gets done.</em>
                </h2>
                <p className="mt-4 max-w-lg text-paper/70">
                  The demo workspace is live: a rail-components company with real drawings, six months of plant history, decisions and conversations. Sign in as any colleague
                  and start a Saathi Live meeting.
                </p>
              </div>
              <Link href="/login?demo=1" className="group inline-flex shrink-0 items-center gap-2 rounded-full bg-saffron px-7 py-4 font-semibold text-ink transition hover:brightness-105">
                Enter the workspace <ArrowRight size={18} className="transition-transform group-hover:translate-x-0.5" />
              </Link>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 px-5 py-8 text-sm text-muted sm:flex-row sm:items-center sm:justify-between lg:px-8">
          <span className="inline-flex items-center gap-2">
            <LogoMark size={22} /> Saathi · Google Cloud AI Builder Cup 2026
          </span>
          <span className="flex flex-wrap items-center gap-x-4 gap-y-1">
            <Link href="/privacy" className="font-medium text-ink hover:underline">
              Privacy Policy
            </Link>
            <span className="font-mono text-xs">Gemini on Vertex AI · ADK · Document AI · Firestore · BigQuery · Cloud Run</span>
          </span>
        </div>
        <p className="mx-auto max-w-7xl px-5 pb-6 text-xs text-muted lg:px-8">
          Icons: <a className="underline" href="https://www.streamlinehq.com/icons/freehand-free">Freehand Line (free)</a> by Streamline, licensed{" "}
          <a className="underline" href="https://creativecommons.org/licenses/by/4.0/">CC BY 4.0</a>.
        </p>
      </footer>
    </div>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div>
      <dt className="sr-only">{label}</dt>
      <dd className="font-display text-4xl leading-none text-ink">{value}</dd>
      <dd className="mt-2 text-xs leading-snug text-muted">{label}</dd>
    </div>
  );
}

function Pillar({ n, icon: Icon, title, lead, items }: { n: string; icon: typeof Lock; title: string; lead: string; items: [string, string][] }) {
  return (
    <article className="lift rounded-2xl border border-line bg-paper p-7 hover:border-ink/25">
      <div className="flex items-center gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-saffron-soft text-saffron-ink">
          <Icon size={19} aria-hidden />
        </span>
        <span className="font-mono text-sm text-saffron-ink">{n}</span>
      </div>
      <h3 className="mt-4 font-display text-3xl">{title}</h3>
      <p className="mt-1 text-[15px] text-muted">{lead}</p>
      <ul className="mt-5 space-y-3">
        {items.map(([t, d]) => (
          <li key={t} className="flex gap-2.5">
            <span className="mt-1 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-ink text-paper">
              <Check size={10} strokeWidth={3} />
            </span>
            <p className="text-[14.5px] leading-relaxed">
              <b className="font-semibold">{t}.</b> <span className="text-muted">{d}</span>
            </p>
          </li>
        ))}
      </ul>
    </article>
  );
}

/** Hero composite: a live meeting with streaming transcript and a heads-up answer card. */
function HeroLive() {
  return (
    <div className="rise relative self-start lg:mt-4 lg:pl-6" style={{ animationDelay: "200ms" }} aria-label="Saathi Live during a meeting" role="img">
      <div className="relative rounded-2xl border border-ink/10 bg-white shadow-[0_40px_80px_-30px_rgba(11,27,43,0.45)]">
        <div className="flex items-center gap-2 border-b border-line px-4 py-3">
          <span className="h-2.5 w-2.5 rounded-full bg-rust/70" />
          <span className="h-2.5 w-2.5 rounded-full bg-saffron/80" />
          <span className="h-2.5 w-2.5 rounded-full bg-moss/70" />
          <span className="ml-3 font-mono text-[11px] text-muted">Saathi Live · Bogie prototype weekly</span>
          <span className="ml-auto inline-flex items-center gap-1.5 text-[11px] font-semibold text-rust">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-rust opacity-60" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-rust" />
            </span>
            Listening
          </span>
        </div>
        <div className="space-y-2 border-b border-line px-5 py-4 text-[13.5px] leading-relaxed">
          <p>Okay team, quick status check on the bogie prototype.</p>
          <p>
            Rahul, kitna budget approve hua tha side frame castings ke liye?
            <span className="ml-2 whitespace-nowrap font-mono text-[10px] text-muted">final in 0.7 s</span>
          </p>
          <p className="text-muted">
            And when is the RDSO insp<span className="caret ml-0.5 inline-block h-3.5 w-[2px] translate-y-0.5 bg-saffron" />
          </p>
        </div>
        <div className="p-4">
          <div className="rounded-xl bg-[#202124] p-4 text-white">
            <p className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-saffron">
              <Radar size={13} /> Saathi Live
            </p>
            <p className="mt-2 text-[14px] font-bold">What side frame castings budget was approved?</p>
            <p className="mt-1.5 text-[13.5px] leading-relaxed text-white/85">
              <b>Rs 21.0 lakh</b> for 24 Nos, approved after Om Castings&rsquo; rate revision (the v2 plan said Rs 18.4 lakh).
            </p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {["Finance Review · 8 Oct", "Bogie Prototype Plan v2"].map((c) => (
                <span key={c} className="rounded-md border border-white/15 bg-white/10 px-1.5 py-0.5 font-mono text-[10.5px] text-white/80">
                  {c}
                </span>
              ))}
            </div>
            <p className="mt-2 text-[11px] text-white/45">⚡ 2.8 s after it was said · search 0.5 s · write 1.1 s</p>
          </div>
        </div>
      </div>
      <div className="mt-4 grid grid-cols-3 gap-3">
        {[
          [Workflow, "Decision logged", "Stay with Om Castings, audit by 30 Sep"],
          [History, "This happened before", "NCR-0001 · wet sand · fixed"],
          [RefreshCw, "Handover signed", "Shift B · acknowledged"],
        ].map(([Icon, t, d]) => {
          const I = Icon as typeof Lock;
          return (
            <div key={t as string} className="rounded-xl border border-ink/10 bg-white/80 p-3 shadow-[0_20px_40px_-24px_rgba(23,19,19,0.35)] backdrop-blur">
              <I size={15} className="text-saffron-ink" />
              <p className="mt-1.5 text-[12px] font-semibold">{t as string}</p>
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
            <div key={p} className={`flex aspect-video items-center justify-center rounded-lg ${i === 4 ? "ring-2 ring-saffron" : ""} bg-white/10`}>
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-white/20 text-xs font-semibold">{p}</span>
            </div>
          ))}
        </div>
        <p className="mt-3 text-center font-mono text-[11px] text-paper/50">Google Meet · Bogie prototype weekly</p>
      </div>
      <div className="relative -mt-16 ml-auto w-[88%] rounded-2xl border border-white/15 bg-[#202124] p-5 shadow-2xl sm:w-[75%]">
        <p className="flex items-center gap-2 text-sm font-bold">
          <Radar size={16} className="text-saffron" /> Saathi Live <span className="ml-auto text-[11px] font-normal text-paper/50">A− A+</span>
        </p>
        <div className="mt-3 rounded-xl bg-white/10 p-3">
          <p className="text-[13.5px] font-bold">When is the RDSO inspection?</p>
          <p className="mt-1 text-[13px] text-paper/80">
            <b>20 Oct 2026</b>, confirmed by Kavya; drawing pack due 17 Oct.
          </p>
          <p className="mt-1.5 text-[10.5px] text-paper/45">⚡ 2.8 s after it was said · 9 passages searched</p>
        </div>
        <div className="mt-3 grid grid-cols-3 gap-2 text-center">
          {[
            [LIVE.lineFinal, "line final"],
            [LIVE.search, "search"],
            [LIVE.heardToAnswer, "said → answer"],
          ].map(([v, l]) => (
            <div key={l} className="rounded-lg bg-white/5 py-2">
              <p className="font-display text-2xl text-saffron">{v}s</p>
              <p className="text-[10.5px] text-paper/50">{l}</p>
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
        <g fill="none" stroke="#9fc0ec" strokeWidth="1.4" className="draw">
          <rect x="40" y="90" width="380" height="80" rx="6" />
          <rect x="180" y="170" width="100" height="44" />
          <circle cx="95" cy="130" r="26" />
          <circle cx="365" cy="130" r="26" />
          <path d="M20 130h440" strokeDasharray="8 5" />
          <path d="M40 70h380M40 64v12M420 64v12" />
        </g>
        <text x="230" y="62" fill="#9fc0ec" fontFamily="var(--font-mono)" fontSize="11" textAnchor="middle">2470</text>
        <text x="230" y="236" fill="#9fc0ec" fontFamily="var(--font-mono)" fontSize="10" textAnchor="middle">DETAIL A · FILLET 10 mm</text>
        <circle cx="230" cy="214" r="9" fill="none" stroke="#c8f031" strokeWidth="1.6" />
        <g fontFamily="var(--font-mono)" fontSize="10.5">
          <rect x="250" y="262" width="250" height="88" fill="#171313" stroke="#9fc0ec" />
          <path d="M250 284h250M250 306h250M250 328h250M340 262v88" stroke="#9fc0ec" />
          <text x="258" y="277" fill="#9fc0ec">DRG No.</text>
          <text x="348" y="277" fill="#efeae9">SRC-BF-2041</text>
          <text x="258" y="299" fill="#9fc0ec">REV</text>
          <text x="348" y="299" fill="#c8f031" fontWeight="700">C · supersedes B</text>
          <text x="258" y="321" fill="#9fc0ec">APPROVED</text>
          <text x="348" y="321" fill="#efeae9">N. VERMA · 06 OCT</text>
          <text x="258" y="343" fill="#9fc0ec">READ BY</text>
          <text x="348" y="343" fill="#efeae9">Saathi · Document AI</text>
        </g>
      </svg>
    </div>
  );
}
