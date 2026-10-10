"use client";

import { onAuthStateChanged, sendPasswordResetEmail, signInWithEmailAndPassword } from "firebase/auth";
import { ArrowLeft, ArrowRight, CheckCircle2, ChevronDown, Eye, EyeOff, Loader2 } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Avatar } from "@/components/bits";
import { getFbAuth } from "@/lib/firebase";
import { AuthShell, Divider, GoogleButton, authMessage, inputCls, signInWithGoogle } from "./AuthShell";

const DEMO = [
  { id: "prince", name: "Prince Kumar", role: "Design Engineer", note: "Best place to start" },
  { id: "amit", name: "Amit Sharma", role: "Senior Design Engineer" },
  { id: "neha", name: "Neha Verma", role: "QA Manager" },
  { id: "rahul", name: "Rahul Singh", role: "Procurement Lead" },
  { id: "suresh", name: "Suresh Yadav", role: "Shop Floor Supervisor" },
  { id: "kavya", name: "Kavya Iyer", role: "Project Manager" },
];
const DEMO_PASSWORD = "Saathi@2026";

type Err = ReturnType<typeof authMessage>;

export function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [mode, setMode] = useState<"signin" | "reset">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<Err>(params.get("error") === "domain" ? { field: "form", text: "Your organisation hasn't enabled Saathi for that email domain. Sign in with your work account." } : null);
  const [resetSent, setResetSent] = useState(false);
  const [demoOpen, setDemoOpen] = useState(!!params.get("demo"));
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

  async function run(key: string, fn: () => Promise<unknown>) {
    setBusy(key);
    setError(null);
    try {
      await fn();
      router.replace("/app");
    } catch (err) {
      setError(authMessage(err));
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
    if (mode === "reset") return reset();
    if (!password) return setError({ field: "password", text: "Enter your password." });
    run("form", () => signInWithEmailAndPassword(getFbAuth(), email.trim(), password));
  }

  async function reset() {
    setBusy("reset");
    setError(null);
    try {
      await sendPasswordResetEmail(getFbAuth(), email.trim());
    } catch (err) {
      const m = authMessage(err);
      if (m?.field === "email" || m?.text.startsWith("Too many")) {
        setError(m);
        setBusy(null);
        return;
      }
    }
    // Same confirmation whether or not the account exists, so emails can't be probed.
    setResetSent(true);
    setBusy(null);
  }

  const field = (f: "email" | "password") => (error?.field === f ? error.text : null);

  return (
    <AuthShell>
      {mode === "signin" ? (
        <>
          <h2 className="text-[28px] font-bold tracking-tight">Sign in to Saathi</h2>
          <p className="mt-1.5 text-muted">
            New here?{" "}
            <Link href="/signup" className="font-semibold text-brand hover:underline">
              Create an account
            </Link>
          </p>
        </>
      ) : (
        <>
          <button onClick={() => { setMode("signin"); setResetSent(false); setError(null); }} className="mb-4 flex items-center gap-1.5 self-start text-sm font-medium text-muted hover:text-ink">
            <ArrowLeft size={15} /> Back to sign in
          </button>
          <h2 className="text-[28px] font-bold tracking-tight">Reset your password</h2>
          <p className="mt-1.5 text-muted">We&rsquo;ll email you a secure link to choose a new one.</p>
        </>
      )}

      {error?.field === "form" && (
        <p role="alert" className="mt-6 rounded-lg border border-rust/30 bg-rust-soft px-3 py-2.5 text-sm text-rust">
          {error.text}
        </p>
      )}

      {mode === "signin" && (
        <div className="mt-7">
          <GoogleButton label="Continue with Google" busy={busy === "google"} disabled={!!busy} onClick={() => run("google", signInWithGoogle)} />
          <Divider text="or sign in with email" />
        </div>
      )}

      {resetSent ? (
        <div role="status" className="mt-7 flex gap-3 rounded-xl border border-moss/30 bg-moss-soft p-4 text-sm text-moss">
          <CheckCircle2 size={18} className="mt-0.5 shrink-0" aria-hidden />
          <span>
            If an account exists for <b>{email.trim()}</b>, a reset link is on its way. Check your inbox and spam folder.
          </span>
        </div>
      ) : (
        <form onSubmit={submit} noValidate className={mode === "reset" ? "mt-7 space-y-4" : "space-y-4"}>
          <div>
            <label htmlFor="email" className="text-sm font-semibold">
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
              aria-invalid={!!field("email")}
              aria-describedby={field("email") ? "email-err" : undefined}
              className={`mt-1.5 ${inputCls}`}
              placeholder="you@company.com"
            />
            {field("email") && (
              <p id="email-err" role="alert" className="mt-1.5 text-sm text-rust">
                {field("email")}
              </p>
            )}
          </div>
          {mode === "signin" && (
            <div>
              <div className="flex items-baseline justify-between">
                <label htmlFor="password" className="text-sm font-semibold">
                  Password
                </label>
                <button type="button" onClick={() => { setMode("reset"); setError(null); }} className="text-sm font-medium text-brand hover:underline">
                  Forgot password?
                </button>
              </div>
              <div className="relative mt-1.5">
                <input
                  id="password"
                  type={show ? "text" : "password"}
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  aria-invalid={!!field("password")}
                  aria-describedby={field("password") ? "pw-err" : undefined}
                  className={`${inputCls} pr-12`}
                />
                <button
                  type="button"
                  onClick={() => setShow((s) => !s)}
                  className="absolute right-1 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-md text-muted hover:bg-canvas hover:text-ink"
                  aria-label={show ? "Hide password" : "Show password"}
                >
                  {show ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
              {field("password") && (
                <p id="pw-err" role="alert" className="mt-1.5 text-sm text-rust">
                  {field("password")}
                </p>
              )}
            </div>
          )}
          <button
            type="submit"
            disabled={!!busy}
            className="flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-brand text-[15px] font-semibold text-white transition hover:bg-brand-strong disabled:opacity-60"
          >
            {busy === "form" || busy === "reset" ? (
              <Loader2 size={18} className="animate-spin" />
            ) : mode === "reset" ? (
              "Send reset link"
            ) : (
              <>
                Sign in <ArrowRight size={17} />
              </>
            )}
          </button>
        </form>
      )}

      {mode === "signin" && (
        <div ref={demoRef} className="mt-8 rounded-xl border border-border bg-canvas/60">
          <button onClick={() => setDemoOpen((o) => !o)} aria-expanded={demoOpen} className="flex w-full items-center gap-3 px-4 py-3 text-left">
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-semibold">Explore the demo workspace</span>
              <span className="block text-xs text-muted">Shakti Rail Components is fictional. Each colleague sees only their own chats.</span>
            </span>
            <ChevronDown size={18} className={`shrink-0 text-muted transition ${demoOpen ? "rotate-180" : ""}`} aria-hidden />
          </button>
          {demoOpen && (
            <ul className="grid gap-2 px-3 pb-3 sm:grid-cols-2">
              {DEMO.map((u) => (
                <li key={u.id}>
                  <button
                    onClick={() => run(u.id, () => signInWithEmailAndPassword(getFbAuth(), `${u.id}@saathi.demo`, DEMO_PASSWORD))}
                    disabled={!!busy}
                    className={`flex min-h-[56px] w-full items-center gap-3 rounded-lg border bg-white px-3 py-2 text-left transition hover:border-brand/50 disabled:opacity-60 ${u.note ? "border-saffron/60" : "border-border"}`}
                  >
                    <Avatar name={u.name} size={32} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold">{u.name}</span>
                      <span className="block truncate text-xs text-muted">{u.note ?? u.role}</span>
                    </span>
                    {busy === u.id && <Loader2 size={16} className="animate-spin text-brand" />}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </AuthShell>
  );
}
