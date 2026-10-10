"use client";

import clsx from "clsx";
import { createUserWithEmailAndPassword, onAuthStateChanged, updateProfile } from "firebase/auth";
import { Check, Eye, EyeOff, Loader2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import { getFbAuth } from "@/lib/firebase";
import { AuthShell, Divider, GoogleButton, authMessage, inputCls, signInWithGoogle } from "../login/AuthShell";

const RULES = [
  { label: "8+ characters", test: (p: string) => p.length >= 8 },
  { label: "A letter", test: (p: string) => /[a-z]/i.test(p) },
  { label: "A number", test: (p: string) => /\d/.test(p) },
];

export function SignupForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [role, setRole] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<ReturnType<typeof authMessage>>(null);
  const creating = useRef(false);

  // Already signed in? Go straight to the workspace (but not while this form is creating the account).
  useEffect(
    () =>
      onAuthStateChanged(getFbAuth(), (u) => {
        if (u && !creating.current) router.replace("/app");
      }),
    [router],
  );

  const passed = RULES.filter((r) => r.test(password)).length;

  async function submit(ev: React.FormEvent) {
    ev.preventDefault();
    if (name.trim().length < 2) return setError({ field: "name", text: "Enter your full name." });
    if (!email.trim()) return setError({ field: "email", text: "Enter your work email." });
    if (passed < RULES.length) return setError({ field: "password", text: "Use at least 8 characters with a letter and a number." });
    setBusy("form");
    setError(null);
    creating.current = true;
    try {
      const cred = await createUserWithEmailAndPassword(getFbAuth(), email.trim(), password);
      await updateProfile(cred.user, { displayName: name.trim() });
      await cred.user.getIdToken(true); // so the workspace is created with the typed name, not the email
      await api("/api/me/profile", { json: { name: name.trim(), role: role.trim() } });
      router.replace("/app");
    } catch (err) {
      creating.current = false;
      const msg = (err as Error).message;
      // The API refuses email domains outside the organisation's allow-list
      if (msg.includes("organisation")) {
        await getFbAuth().currentUser?.delete().catch(() => {});
        setError({ field: "email", text: msg });
      } else setError(authMessage(err));
      setBusy(null);
    }
  }

  async function google() {
    setBusy("google");
    setError(null);
    try {
      await signInWithGoogle();
      router.replace("/app");
    } catch (err) {
      setError(authMessage(err));
      setBusy(null);
    }
  }

  const field = (f: "name" | "email" | "password") => (error?.field === f ? error.text : null);

  return (
    <AuthShell>
      <h2 className="text-[28px] font-bold tracking-tight">Create your account</h2>
      <p className="mt-1.5 text-muted">
        Already have one?{" "}
        <Link href="/login" className="font-semibold text-brand hover:underline">
          Sign in
        </Link>
      </p>

      {error?.field === "form" && (
        <p role="alert" className="mt-6 rounded-lg border border-rust/30 bg-rust-soft px-3 py-2.5 text-sm text-rust">
          {error.text}
        </p>
      )}

      <div className="mt-7">
        <GoogleButton label="Sign up with Google" busy={busy === "google"} disabled={!!busy} onClick={google} />
        <Divider text="or use your work email" />
      </div>

      <form onSubmit={submit} noValidate className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="name" className="text-sm font-semibold">
              Full name
            </label>
            <input id="name" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} aria-invalid={!!field("name")} aria-describedby={field("name") ? "name-err" : undefined} className={`mt-1.5 ${inputCls}`} placeholder="Priya Sharma" />
            {field("name") && (
              <p id="name-err" role="alert" className="mt-1.5 text-sm text-rust">
                {field("name")}
              </p>
            )}
          </div>
          <div>
            <label htmlFor="role" className="text-sm font-semibold">
              Job title <span className="font-normal text-muted">(optional)</span>
            </label>
            <input id="role" autoComplete="organization-title" value={role} onChange={(e) => setRole(e.target.value)} className={`mt-1.5 ${inputCls}`} placeholder="QA Engineer" />
          </div>
        </div>
        <div>
          <label htmlFor="email" className="text-sm font-semibold">
            Work email
          </label>
          <input id="email" type="email" autoComplete="email" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} aria-invalid={!!field("email")} aria-describedby={field("email") ? "email-err" : undefined} className={`mt-1.5 ${inputCls}`} placeholder="you@company.com" />
          {field("email") && (
            <p id="email-err" role="alert" className="mt-1.5 text-sm text-rust">
              {field("email")}{" "}
              {error?.text.includes("already exists") && (
                <Link href="/login" className="font-semibold underline">
                  Sign in
                </Link>
              )}
            </p>
          )}
        </div>
        <div>
          <label htmlFor="password" className="text-sm font-semibold">
            Password
          </label>
          <div className="relative mt-1.5">
            <input id="password" type={show ? "text" : "password"} autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} aria-invalid={!!field("password")} aria-describedby="pw-rules" className={`${inputCls} pr-12`} />
            <button type="button" onClick={() => setShow((s) => !s)} className="absolute right-1 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-md text-muted hover:bg-canvas hover:text-ink" aria-label={show ? "Hide password" : "Show password"}>
              {show ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>
          <div className="mt-2 flex gap-1" aria-hidden>
            {RULES.map((_, i) => (
              <span key={i} className={clsx("h-1 flex-1 rounded-full transition", i < passed ? (passed === RULES.length ? "bg-moss" : "bg-saffron") : "bg-border")} />
            ))}
          </div>
          <ul id="pw-rules" className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs">
            {RULES.map((r) => {
              const ok = r.test(password);
              return (
                <li key={r.label} className={clsx("flex items-center gap-1", ok ? "text-moss" : "text-muted")}>
                  <Check size={12} className={ok ? "" : "opacity-30"} aria-hidden /> {r.label}
                  <span className="sr-only">{ok ? "(met)" : "(not met)"}</span>
                </li>
              );
            })}
          </ul>
          {field("password") && (
            <p role="alert" className="mt-1.5 text-sm text-rust">
              {field("password")}
            </p>
          )}
        </div>
        <button type="submit" disabled={!!busy} className="flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-brand text-[15px] font-semibold text-white transition hover:bg-brand-strong disabled:opacity-60">
          {busy === "form" ? <Loader2 size={18} className="animate-spin" /> : "Create account"}
        </button>
      </form>
    </AuthShell>
  );
}
