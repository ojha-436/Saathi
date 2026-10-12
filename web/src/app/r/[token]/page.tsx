import Link from "next/link";
import { connection } from "next/server";
import { LogoMark } from "@/components/Logo";

export const metadata = { title: "Drawing check", robots: { index: false, follow: false } };

type Verdict = { verdict: "current" | "superseded" | "unknown" | "invalid" | "login_required"; drawing_no?: string; rev?: string; current_rev?: string | null; title?: string; checked_at?: string };

async function check(token: string): Promise<Verdict> {
  const api = (process.env.SAATHI_API_URL ?? "http://localhost:8080").replace(/\/$/, "");
  try {
    const res = await fetch(`${api}/api/qr/${encodeURIComponent(token)}`, { cache: "no-store" });
    if (res.status === 429) return { verdict: "unknown" };
    return (await res.json()) as Verdict;
  } catch {
    return { verdict: "unknown" };
  }
}

/** Public result of scanning a controlled-copy QR: drawing number, revision and a verdict only, never content or names. */
export default async function DrawingCheck({ params }: { params: Promise<{ token: string }> }) {
  await connection();
  const { token } = await params;
  const v = await check(token);
  const ui = {
    current: { bg: "bg-[#1f7a4a]", icon: "✓", head: "CURRENT REVISION", body: "This printed drawing is the current released revision. OK to use." },
    superseded: { bg: "bg-[#b3261e]", icon: "✕", head: "DO NOT USE", body: `This revision is superseded. Get Rev ${v.current_rev ?? "(current)"} from QA before you continue.` },
    unknown: { bg: "bg-[#8a5a00]", icon: "?", head: "STATUS UNKNOWN", body: "Saathi can't confirm this revision right now. Check with QA before use." },
    invalid: { bg: "bg-[#4a4a4a]", icon: "!", head: "NOT A VALID SAATHI CODE", body: "This QR wasn't issued by Saathi, or the copy is damaged. Check with QA." },
    login_required: { bg: "bg-[#1d3954]", icon: "🔒", head: "SIGN IN TO CHECK", body: "Your company requires signing in to check drawing revisions." },
  }[v.verdict];

  return (
    <main className="flex min-h-dvh flex-col bg-[#f4f1ef] text-ink">
      <section className={`${ui.bg} flex flex-1 flex-col items-center justify-center px-6 py-12 text-center text-white`} role="status" aria-live="polite">
        <span className="flex h-28 w-28 items-center justify-center rounded-full bg-white/15 text-6xl font-bold" aria-hidden>
          {ui.icon}
        </span>
        <h1 className="mt-6 text-3xl font-extrabold tracking-wide sm:text-4xl">{ui.head}</h1>
        {v.drawing_no && (
          <p className="mt-4 font-mono text-xl sm:text-2xl">
            {v.drawing_no}
            {v.rev && <span className="ml-2 rounded bg-white/20 px-2 py-0.5">Rev {v.rev}</span>}
          </p>
        )}
        {v.title && <p className="mt-1 text-sm text-white/80">{v.title}</p>}
        <p className="mt-6 max-w-sm text-lg leading-snug">{ui.body}</p>
        {v.checked_at && <p className="mt-6 text-xs text-white/70">Checked {new Date(v.checked_at).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short" })}</p>}
      </section>
      <footer className="flex items-center justify-between gap-3 px-5 py-4 text-sm">
        <span className="flex items-center gap-2">
          <LogoMark size={24} /> Saathi drawing control
        </span>
        <Link href="/app" className="font-semibold underline">
          {v.verdict === "login_required" ? "Sign in" : "Open in Saathi"}
        </Link>
      </footer>
    </main>
  );
}
