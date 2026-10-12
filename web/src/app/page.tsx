import {
  ArrowRight,
  BellRing,
  Check,
  FileSearch,
  Handshake,
  Languages,
  Lock,
  MapPin,
  MessageSquareQuote,
  Radar,
  ScrollText,
  ShieldCheck,
  Sparkles,
  Workflow,
} from "@/lib/icons";
import Link from "next/link";
import { Logo, LogoMark } from "@/components/Logo";
import { RevealOnScroll } from "@/components/RevealOnScroll";
import { EVAL } from "@/lib/eval";

export const metadata = { title: "Saathi — the AI workspace that remembers" };

const NAV = [
  { href: "#product", label: "Product" },
  { href: "#how", label: "How it works" },
  { href: "#manufacturing", label: "Manufacturing" },
  { href: "#trust", label: "Trust & security" },
];

export default function Landing() {
  return (
    <div className="min-h-dvh bg-paper text-ink">
      <RevealOnScroll />
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100] focus:rounded-md focus:bg-ink focus:px-4 focus:py-2 focus:text-paper">
        Skip to content
      </a>

      {/* ---------------- header ---------------- */}
      <header className="sticky top-3 z-50 px-3 sm:px-5">
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-6 rounded-2xl border border-line bg-white/90 px-4 shadow-[0_8px_30px_-18px_rgba(16,21,16,0.25)] backdrop-blur-xl lg:px-5">
          <Link href="/" aria-label="Saathi home">
            <Logo />
          </Link>
          <nav aria-label="Primary" className="hidden flex-1 items-center gap-7 text-sm text-muted md:flex">
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
          <div className="relative mx-auto max-w-6xl px-5 pb-20 pt-16 text-center lg:px-8 lg:pb-28 lg:pt-24">
            <p className="rise inline-flex items-center gap-2 rounded-xl bg-saffron-soft px-3.5 py-1.5 text-[13px] font-medium text-saffron-ink">
              <span className="h-2 w-2 rounded-sm bg-saffron" /> Future of Work · Built on Google Cloud
            </p>
            <h1 className="rise mx-auto mt-6 max-w-4xl font-display text-[40px] leading-[1.05] text-ink sm:text-[56px] lg:text-[68px]" style={{ animationDelay: "80ms" }}>
              The AI workspace built so every team <span className="text-saffron-ink">remembers everything</span>
            </h1>
            <p className="rise mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-muted" style={{ animationDelay: "160ms" }}>
              Team chat with a personal AI colleague built in. It finds any file or message in seconds, briefs you on what you missed, and turns every{" "}
              <span className="font-medium text-ink">&ldquo;I&rsquo;ll send it by Friday&rdquo;</span> into a tracked task. No bots to install. Nothing to configure.
            </p>
            <div className="rise mt-9 flex flex-wrap items-center justify-center gap-3" style={{ animationDelay: "240ms" }}>
              <Link href="/login?demo=1" className="group inline-flex items-center gap-2 rounded-full bg-saffron px-6 py-3.5 text-[15px] font-semibold text-ink">
                Try the live workspace <ArrowRight size={17} />
              </Link>
              <a href="#how" className="inline-flex items-center gap-2 rounded-full border border-brand px-6 py-3.5 text-[15px] font-semibold text-brand transition hover:bg-saffron-soft">
                See how it works
              </a>
            </div>

            <HeroMock />

            <dl className="rise mx-auto mt-16 grid max-w-2xl grid-cols-3 gap-6 text-left" style={{ animationDelay: "320ms" }}>
              <Stat value={`${EVAL.retrieval}`} label="questions answered with the right source" />
              <Stat value={`${EVAL.leaks}`} label="permission leaks in adversarial tests" />
              <Stat value={`${EVAL.latency}s`} label="median answer time" />
            </dl>
            <p className="mt-3 text-xs text-muted/80">From Saathi&rsquo;s open evaluation suite · {EVAL.date}</p>
          </div>
        </section>

        {/* ---------------- problem ---------------- */}
        <section data-reveal className="border-y border-line bg-paper-2/60">
          <div className="mx-auto max-w-7xl px-5 py-16 lg:px-8">
            <p className="font-mono text-xs uppercase tracking-[0.16em] text-saffron-ink">The problem</p>
            <h2 className="mt-3 max-w-3xl font-display text-4xl leading-tight sm:text-5xl">Knowledge is trapped in chat history, and every small task needs another app.</h2>
            <div className="mt-10 grid gap-px overflow-hidden rounded-2xl border border-line bg-line md:grid-cols-3">
              {[
                ["01", "Files vanish into chats", "The drawing a colleague shared three weeks ago is found by scrolling, or by asking again. Search matches words, not meaning."],
                ["02", "Promises get forgotten", "“Vendor will dispatch on the 15th.” Typed once in a 1:1 chat, then lost. Nobody turns it into a follow-up."],
                ["03", "Productivity means more bots", "To-dos, reminders and approvals each need a separate app installed and configured. AI help is a paid add-on."],
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

        {/* ---------------- features ---------------- */}
        <section data-reveal id="product" className="mx-auto max-w-7xl scroll-mt-20 px-5 py-24 lg:px-8">
          <div className="max-w-2xl">
            <p className="font-mono text-xs uppercase tracking-[0.16em] text-saffron-ink">The product</p>
            <h2 className="mt-3 font-display text-4xl leading-tight sm:text-5xl">One workspace. One assistant that actually knows your work.</h2>
          </div>
          <div className="mt-12 grid gap-4 md:grid-cols-6">
            <Feature className="md:col-span-4" icon={FileSearch} title="Recall search with citations"
              body="Ask “the bogie frame drawing Amit sent about the weld change” and get the file, the message and the revision, each answer linked to its source. Meaning-based search across messages, PDFs and extracted fields." >
              <div className="mt-5 flex flex-wrap gap-2">
                {["SRC-BF-2041_RevC.pdf", "Amit Sharma · 6 Oct", "Bogie Project"].map((c) => (
                  <span key={c} className="inline-flex items-center gap-1.5 rounded-md border border-blueprint/20 bg-blueprint-soft px-2 py-1 font-mono text-[11px] text-blueprint">
                    <ScrollText size={12} /> {c}
                  </span>
                ))}
              </div>
            </Feature>
            <Feature className="md:col-span-2" dark icon={Handshake} title="Promise capture"
              body="Commitments in any chat are detected, in English or Hinglish, and offered as one-click tracked tasks with follow-up nudges." />
            <Feature className="md:col-span-2" icon={Radar} title="“What did I miss?”"
              body="Back from leave? A brief of decisions, asks for you, files shared and open promises, across every chat you’re in." />
            <Feature className="md:col-span-2" icon={BellRing} title="Tasks without apps"
              body="“Kal subah 10 baje vendor ko call karna” becomes a reminder you confirm in one tap. It fires on time, in the app." />
            <Feature className="md:col-span-2" icon={Languages} title="Speaks your team’s language"
              body="English, Hindi and Hinglish in, the same language out. Built for offices and shop floors alike." />
            <Feature className="md:col-span-3" icon={MessageSquareQuote} title="Decision log, automatically"
              body="Messages that record a decision (“Final: we go with S355J2”) are tagged and collected per chat, so nobody re-litigates last week." />
            <Feature className="md:col-span-3" icon={Workflow} title="Insights that respect people"
              body="A personal view of promises kept, tasks overdue and where your week went. Yours alone, never a manager surveillance tool." />
          </div>
        </section>

        {/* ---------------- how ---------------- */}
        <section id="how" className="scroll-mt-16 border-y border-line bg-paper-2/60">
          <div data-reveal className="mx-auto max-w-7xl px-5 py-24 lg:px-8">
            <div className="grid gap-10 lg:grid-cols-[0.9fr_1.1fr]">
              <div>
                <p className="font-mono text-xs uppercase tracking-[0.16em] text-saffron-ink">How it works</p>
                <h2 className="mt-3 font-display text-4xl leading-tight sm:text-5xl">From a message to an action, with a person always confirming.</h2>
                <p className="mt-5 max-w-md text-[15px] leading-relaxed text-muted">
                  Every message and file flows through an event-driven pipeline on Google Cloud. One agent, built with the Agent Development Kit, answers through tools that can
                  only see what the asking user can see.
                </p>
              </div>
              <ol className="relative grid gap-4 sm:grid-cols-2">
                {[
                  ["Capture", "Messages and uploads land in Firestore; files in Cloud Storage. Nothing extra to install.", "Firestore · Cloud Storage"],
                  ["Understand", "Document AI OCR + Gemini read title blocks, revision tables and certificates. Gemini Flash-Lite flags promises and decisions.", "Document AI · Gemini"],
                  ["Retrieve", "Meaning + identifier search over a vector index, pre-filtered to the chats the user is a member of.", "gemini-embedding · vector search"],
                  ["Act", "The ADK agent drafts tasks and reminders; the user confirms. Cloud Scheduler fires them on time.", "ADK · Cloud Run · Scheduler"],
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

        {/* ---------------- manufacturing ---------------- */}
        <section id="manufacturing" className="blueprint-grid relative scroll-mt-16 overflow-hidden text-paper">
          <div data-reveal className="mx-auto grid max-w-7xl items-center gap-14 px-5 py-24 lg:grid-cols-2 lg:px-8">
            <div>
              <p className="font-mono text-xs uppercase tracking-[0.16em] text-saffron">Manufacturing pack</p>
              <h2 className="mt-3 font-display text-4xl leading-tight sm:text-5xl">
                Generic assistants see a PDF. <em className="text-saffron">Saathi reads the drawing.</em>
              </h2>
              <ul className="mt-8 space-y-4">
                {[
                  ["Drawing revision awareness", "Knows Rev C supersedes Rev B, who approved it and when, straight from the title block."],
                  ["Certificates & inspection reports", "Heat numbers, material grades, test values and open points, extracted and searchable."],
                  ["Vendor commitments", "“Dispatch on 15th” becomes a follow-up tied to the vendor and the conversation."],
                  ["Shop-floor mode", "Supervisors ask in Hinglish from a phone: “Job 4521 ka inspection hua kya?”"],
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
            <DrawingPanel />
          </div>
        </section>

        {/* ---------------- trust ---------------- */}
        <section data-reveal id="trust" className="mx-auto max-w-7xl scroll-mt-16 px-5 py-24 lg:px-8">
          <div className="grid gap-12 lg:grid-cols-[0.8fr_1.2fr]">
            <div>
              <p className="font-mono text-xs uppercase tracking-[0.16em] text-saffron-ink">Trust & security</p>
              <h2 className="mt-3 font-display text-4xl leading-tight sm:text-5xl">An assistant you can put in front of your whole company.</h2>
              <p className="mt-5 text-[15px] leading-relaxed text-muted">Built so the answer to &ldquo;could it leak?&rdquo; is enforced in code, tested in an adversarial suite, and visible in an audit trail.</p>
            </div>
            <div className="grid gap-px overflow-hidden rounded-2xl border border-line bg-line sm:grid-cols-2">
              {[
                [Lock, "Permission-aware retrieval", "Every search is pre-filtered to chats the user belongs to. The model cannot widen it."],
                [ScrollText, "Every answer cited", "Claims link to the exact message or file. No source, no answer: Saathi says it couldn't find it."],
                [ShieldCheck, "People confirm actions", "Tasks and reminders are drafted, never silently created. Instructions inside documents are ignored."],
                [Sparkles, "Exclude any chat from AI", "One toggle removes a conversation from the index, for sensitive HR or commercial threads."],
                [MapPin, "Data stays in India", "Firestore, Cloud Run, Storage and Document AI run in asia-south1 (Mumbai)."],
                [Workflow, "Audit trail in BigQuery", "Every assistant question and tool call is logged for review and analytics."],
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
        <section data-reveal className="px-5 pb-24 lg:px-8">
          <div className="relative mx-auto max-w-7xl overflow-hidden rounded-3xl bg-ink px-8 py-16 text-paper sm:px-14">
            <div className="blueprint-grid absolute inset-0 opacity-60" />
            <div className="relative flex flex-col items-start gap-8 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <h2 className="font-display text-4xl leading-tight sm:text-6xl">
                  Never lose a document,
                  <br />a decision, <em className="text-saffron">or a promise.</em>
                </h2>
                <p className="mt-4 max-w-lg text-paper/70">The demo workspace is live: a fictional rail-components company with real drawings, certificates and conversations. Sign in as any colleague.</p>
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
          <span className="font-mono text-xs">Gemini on Vertex AI · ADK · Document AI · Firestore · BigQuery · Cloud Run</span>
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

function Feature({
  icon: Icon,
  title,
  body,
  dark,
  className,
  children,
}: {
  icon: typeof Lock;
  title: string;
  body: string;
  dark?: boolean;
  className?: string;
  children?: React.ReactNode;
}) {
  return (
    <article className={`lift group relative overflow-hidden rounded-2xl border p-7 ${dark ? "border-ink bg-ink text-paper" : "border-line bg-paper hover:border-ink/25"} ${className ?? ""}`}>
      <span className={`flex h-10 w-10 items-center justify-center rounded-xl ${dark ? "bg-saffron text-ink" : "bg-saffron-soft text-saffron-ink"}`}>
        <Icon size={19} aria-hidden />
      </span>
      <h3 className="mt-5 text-xl font-semibold">{title}</h3>
      <p className={`mt-2 text-[15px] leading-relaxed ${dark ? "text-paper/70" : "text-muted"}`}>{body}</p>
      {children}
    </article>
  );
}

/** Product composite: a chat with a detected promise, an assistant answer with citations, and a drawing title block. */
function HeroMock() {
  return (
    <div className="rise relative mx-auto mt-14 w-full max-w-4xl text-left" style={{ animationDelay: "200ms" }} aria-label="Saathi product preview" role="img">
      {/* floating category tags */}
      {[
        ["Search", "#a855f7", "bg-lavender", "-left-28 top-4"],
        ["Promises", "#68e246", "bg-saffron-soft", "-right-28 top-14"],
        ["Decisions", "#10a3ff", "bg-sky", "-left-32 top-[45%]"],
        ["Meetings", "#fc57e5", "bg-blush", "-right-32 top-[48%]"],
        ["Files", "#ff9d1c", "bg-cream", "-left-24 bottom-10"],
        ["Tasks", "#68e246", "bg-saffron-soft", "-right-24 bottom-6"],
      ].map(([t, dot, bg, pos]) => (
        <span key={t} className={`pill-tag ${bg} absolute z-10 hidden xl:inline-flex ${pos}`} style={{ ["--dot" as string]: dot }}>
          {t}
        </span>
      ))}
      <div className="grid gap-4 md:grid-cols-[1.35fr_1fr] md:items-stretch">
      <div className="relative rounded-3xl border border-line bg-white shadow-[0_30px_70px_-34px_rgba(16,21,16,0.35)]">
        <div className="flex items-center gap-2 border-b border-line px-4 py-3">
          <span className="h-2.5 w-2.5 rounded-full bg-blush" />
          <span className="h-2.5 w-2.5 rounded-full bg-cream" />
          <span className="h-2.5 w-2.5 rounded-full bg-saffron" />
          <span className="ml-3 text-xs text-muted">Saathi · Amit Sharma</span>
        </div>
        <div className="space-y-4 p-5">
          <div className="flex gap-3">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-plum text-[11px] font-semibold text-white">AS</span>
            <div className="min-w-0">
              <p className="text-[13px]">
                <b>Amit Sharma</b> <span className="text-muted">5:40 pm</span>
              </p>
              <p className="text-[14px]">Prince, I&rsquo;ll send the updated weld detail sheet by Friday.</p>
              <div className="mt-2 inline-flex items-center gap-2 rounded-lg border border-plum/20 bg-plum-soft px-2.5 py-1.5 text-[12px] text-plum">
                <Handshake size={13} /> <b>Promise</b> · due Fri, 6:00 pm
                <span className="rounded-md bg-plum px-2 py-0.5 font-semibold text-white">Track</span>
              </div>
            </div>
          </div>
          <div className="rounded-xl border border-saffron/30 bg-saffron-soft/50 p-4">
            <p className="flex items-center gap-2 text-[12px] font-semibold uppercase tracking-wider text-saffron-ink">
              <Sparkles size={13} /> Ask Saathi
            </p>
            <p className="mt-2 text-[13.5px] font-medium">Which revision of the side frame is latest?</p>
            <p className="mt-2 text-[13.5px] leading-relaxed text-ink/85">
              <b>Rev C</b> is current, approved by <b>Neha Verma</b> on 06 Oct. The bolster-pocket weld changed from 8 mm to 10 mm.
              <span className="caret ml-0.5 inline-block h-3.5 w-[2px] translate-y-0.5 bg-saffron" />
            </p>
            <div className="mt-2.5 flex flex-wrap gap-1.5">
              <span className="rounded-md border border-blueprint/20 bg-blueprint-soft px-1.5 py-0.5 font-mono text-[10.5px] text-blueprint">SRC-BF-2041_RevC.pdf</span>
              <span className="rounded-md border border-blueprint/20 bg-blueprint-soft px-1.5 py-0.5 font-mono text-[10.5px] text-blueprint">Bogie Project</span>
            </div>
          </div>
        </div>
      </div>

      {/* below the chat window: one card with the drawing title block + animation */}
      <div className="flex flex-col justify-center gap-3 rounded-3xl border border-line bg-white p-5 shadow-[0_30px_70px_-34px_rgba(16,21,16,0.3)]">
        <div className="min-w-0 flex-1">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-saffron-ink">Reads the drawing, not just the PDF</p>
          <div className="border-2 border-ink bg-paper font-mono text-[10.5px]">
            {[
              ["DRAWING No.", "SRC-BF-2041"],
              ["TITLE", "BOGIE SIDE FRAME — GA"],
              ["REVISION", "C"],
              ["APPROVED", "N. VERMA (QA)"],
            ].map(([k, v], i) => (
              <div key={k} className={`grid grid-cols-[92px_1fr] ${i ? "border-t border-ink" : ""}`}>
                <span className="border-r border-ink px-2 py-1.5 text-muted">{k}</span>
                <span className={`px-2 py-1.5 font-semibold ${k === "REVISION" ? "text-saffron-ink" : ""}`}>{v}</span>
              </div>
            ))}
          </div>
        </div>
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
        <circle cx="230" cy="214" r="9" fill="none" stroke="#68e246" strokeWidth="1.6" />
        <g fontFamily="var(--font-mono)" fontSize="10.5">
          <rect x="250" y="262" width="250" height="88" fill="#16330f" stroke="#9fc0ec" />
          <path d="M250 284h250M250 306h250M250 328h250M340 262v88" stroke="#9fc0ec" />
          <text x="258" y="277" fill="#9fc0ec">DRG No.</text>
          <text x="348" y="277" fill="#f4f6f2">SRC-BF-2041</text>
          <text x="258" y="299" fill="#9fc0ec">REV</text>
          <text x="348" y="299" fill="#68e246" fontWeight="700">C · supersedes B</text>
          <text x="258" y="321" fill="#9fc0ec">APPROVED</text>
          <text x="348" y="321" fill="#f4f6f2">N. VERMA · 06 OCT</text>
          <text x="258" y="343" fill="#9fc0ec">READ BY</text>
          <text x="348" y="343" fill="#f4f6f2">Saathi · Document AI</text>
        </g>
      </svg>
    </div>
  );
}
