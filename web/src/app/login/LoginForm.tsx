"use client";

import { onAuthStateChanged, signInWithEmailAndPassword } from "firebase/auth";
import { ArrowRight, Eye, EyeOff, Loader2 } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Logo } from "@/components/Logo";
import { Avatar } from "@/components/bits";
import { getFbAuth } from "@/lib/firebase";

const DEMO = [
  { id: "prince", name: "Prince Kumar", role: "Design Engineer", note: "Best place to start" },
  { id: "amit", name: "Amit Sharma", role: "Senior Design Engineer" },
  { id: "neha", name: "Neha Verma", role: "QA Manager" },
  { id: "rahul", name: "Rahul Singh", role: "Procurement Lead" },
  { id: "suresh", name: "Suresh Yadav", role: "Shop Floor Supervisor" },
  { id: "kavya", name: "Kavya Iyer", role: "Project Manager" },
];
const DEMO_PASSWORD = "Saathi@2026";

export function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<{ field: "email" | "password" | "form"; text: string } | null>(null);
  const emailRef = useRef<HTMLInputElement>(null);
  const demoRef = useRef<HTMLDivElement>(null);

  useEffect(
    () =>
      onAuthStateChanged(getFbAuth(), (u) => {
        if (u) router.replace("/app");
      }),
    [router],
  );

  useEffect(() => {
    if (params.get("demo")) demoRef.current?.scrollIntoView({ block: "center" });
  }, [params]);

  async function signIn(e: string, p: string, key: string) {
    setBusy(key);
    setError(null);
    try {
      await signInWithEmailAndPassword(getFbAuth(), e, p);
      router.replace("/app");
    } catch (err) {
      const code = (err as { code?: string }).code ?? "";
      if (code.includes("invalid-email")) setError({ field: "email", text: "That doesn't look like a valid work email." });
      else if (code.includes("too-many-requests")) setError({ field: "form", text: "Too many attempts. Wait a minute, then try again." });
      else setError({ field: "password", text: "Email or password is incorrect. Check both and try again." });
      setBusy(null);
    }
  }

  function submit(ev: React.FormEvent) {
    ev.preventDefault();
    if (!email.trim()) {
      setError({ field: "email", text: "Enter your work email." });
      emailRef.current?.focus();
      return;
    }
    if (!password) {
      setError({ field: "password", text: "Enter your password." });
      return;
    }
    signIn(email.trim(), password, "form");
  }

  return (
    <div className="grid min-h-dvh lg:grid-cols-[1.05fr_1fr]">
      {/* brand panel */}
      <aside className="blueprint-grid relative hidden flex-col justify-between overflow-hidden p-12 text-paper lg:flex">
        <Link href="/" aria-label="Saathi home">
          <Logo dark />
        </Link>
        <div className="max-w-md">
          <p className="font-mono text-xs uppercase tracking-[0.16em] text-saffron">Your AI colleague</p>
          <h1 className="mt-4 font-display text-6xl leading-[1.02]">
            Pick up exactly <em className="text-saffron">where the work is.</em>
          </h1>
          <p className="mt-5 text-paper/70">Sign in and ask &ldquo;What did I miss?&rdquo; Saathi briefs you from every chat you&rsquo;re in, with a source for every line.</p>
        </div>
        <div className="w-[300px] border border-paper/40 font-mono text-[11px]">
          {[
            ["PROJECT", "SAATHI WORKSPACE"],
            ["REGION", "ASIA-SOUTH1 · MUMBAI"],
            ["ACCESS", "PERMISSION-AWARE"],
          ].map(([k, v], i) => (
            <div key={k} className={`grid grid-cols-[92px_1fr] ${i ? "border-t border-paper/40" : ""}`}>
              <span className="border-r border-paper/40 px-2.5 py-2 text-paper/60">{k}</span>
              <span className="px-2.5 py-2">{v}</span>
            </div>
          ))}
        </div>
      </aside>

      {/* form */}
      <main className="flex items-center justify-center px-5 py-12 sm:px-10">
        <div className="w-full max-w-md">
          <Link href="/" className="mb-10 inline-block lg:hidden" aria-label="Saathi home">
            <Logo />
          </Link>
          <h2 className="font-display text-5xl leading-none">Sign in</h2>
          <p className="mt-3 text-muted">Welcome back. Use your work account.</p>

          <form onSubmit={submit} noValidate className="mt-8 space-y-5">
            {error?.field === "form" && (
              <p role="alert" className="rounded-lg border border-rust/30 bg-rust-soft px-3 py-2 text-sm text-rust">
                {error.text}
              </p>
            )}
            <div>
              <label htmlFor="email" className="text-sm font-medium">
                Work email
              </label>
              <input
                ref={emailRef}
                id="email"
                type="email"
                autoComplete="email"
                inputMode="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                aria-invalid={error?.field === "email"}
                aria-describedby={error?.field === "email" ? "email-err" : undefined}
                className="mt-1.5 h-12 w-full rounded-xl border border-line bg-white px-4 text-base outline-none transition focus:border-ink focus:ring-4 focus:ring-saffron/20 aria-[invalid=true]:border-rust"
                placeholder="you@company.com"
              />
              {error?.field === "email" && (
                <p id="email-err" role="alert" className="mt-1.5 text-sm text-rust">
                  {error.text}
                </p>
              )}
            </div>
            <div>
              <label htmlFor="password" className="text-sm font-medium">
                Password
              </label>
              <div className="relative mt-1.5">
                <input
                  id="password"
                  type={show ? "text" : "password"}
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  aria-invalid={error?.field === "password"}
                  aria-describedby={error?.field === "password" ? "pw-err" : undefined}
                  className="h-12 w-full rounded-xl border border-line bg-white px-4 pr-12 text-base outline-none transition focus:border-ink focus:ring-4 focus:ring-saffron/20 aria-[invalid=true]:border-rust"
                />
                <button
                  type="button"
                  onClick={() => setShow((s) => !s)}
                  className="absolute right-1 top-1 flex h-10 w-10 items-center justify-center rounded-lg text-muted hover:bg-paper-2 hover:text-ink"
                  aria-label={show ? "Hide password" : "Show password"}
                >
                  {show ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
              {error?.field === "password" && (
                <p id="pw-err" role="alert" className="mt-1.5 text-sm text-rust">
                  {error.text}
                </p>
              )}
            </div>
            <button
              type="submit"
              disabled={!!busy}
              className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-ink font-semibold text-paper transition hover:bg-ink-3 disabled:opacity-60"
            >
              {busy === "form" ? <Loader2 size={18} className="animate-spin" /> : <>Sign in <ArrowRight size={17} /></>}
            </button>
          </form>

          <div ref={demoRef} className="mt-10">
            <div className="flex items-center gap-3 text-xs uppercase tracking-[0.14em] text-muted">
              <span className="h-px flex-1 bg-line" /> or explore the demo workspace <span className="h-px flex-1 bg-line" />
            </div>
            <p className="mt-4 text-sm text-muted">Shakti Rail Components is a fictional company. Sign in as any colleague; each sees only their own chats.</p>
            <ul className="mt-4 grid gap-2 sm:grid-cols-2">
              {DEMO.map((u) => (
                <li key={u.id}>
                  <button
                    onClick={() => signIn(`${u.id}@saathi.demo`, DEMO_PASSWORD, u.id)}
                    disabled={!!busy}
                    className={`flex min-h-[60px] w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition hover:border-ink/40 hover:bg-white disabled:opacity-60 ${u.note ? "border-saffron/60 bg-saffron-soft/40" : "border-line"}`}
                  >
                    <Avatar name={u.name} size={34} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold">{u.name}</span>
                      <span className="block truncate text-xs text-muted">{u.note ?? u.role}</span>
                    </span>
                    {busy === u.id && <Loader2 size={16} className="animate-spin text-saffron-ink" />}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </main>
    </div>
  );
}
