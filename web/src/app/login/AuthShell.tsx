"use client";

import { GoogleAuthProvider, signInWithPopup } from "firebase/auth";
import { Loader2, LockKeyhole, ShieldCheck, Sparkles } from "lucide-react";
import Link from "next/link";
import { Logo } from "@/components/Logo";
import { getFbAuth } from "@/lib/firebase";

/** Two-column sign-in layout shared by /login and /signup. */
export function AuthShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-dvh bg-surface text-ink lg:grid-cols-[1fr_1.05fr]">
      <aside className="blueprint-grid relative hidden flex-col justify-between overflow-hidden p-12 text-paper lg:flex">
        <Link href="/" aria-label="Saathi home">
          <Logo dark />
        </Link>
        <div className="max-w-md">
          <p className="font-mono text-xs uppercase tracking-[0.16em] text-saffron">Your AI colleague</p>
          <h1 className="mt-4 font-display text-6xl leading-[1.02]">
            Pick up exactly <em className="text-saffron">where the work is.</em>
          </h1>
          <p className="mt-5 text-paper/70">Chats, channels and files in one place, with an assistant that finds anything, briefs you on what you missed and tracks every promise.</p>
        </div>
        <ul className="space-y-3 text-sm text-paper/75">
          {[
            [ShieldCheck, "Permission-aware: Saathi only searches what you can already see"],
            [LockKeyhole, "Data stays in asia-south1 (Mumbai) on Google Cloud"],
            [Sparkles, "Every answer cites its source"],
          ].map(([Icon, text]) => {
            const I = Icon as typeof ShieldCheck;
            return (
              <li key={text as string} className="flex items-center gap-2.5">
                <I size={16} className="shrink-0 text-saffron" aria-hidden /> {text as string}
              </li>
            );
          })}
        </ul>
      </aside>

      <main className="flex flex-col px-5 py-8 sm:px-10">
        <Link href="/" className="mb-8 inline-block lg:hidden" aria-label="Saathi home">
          <Logo />
        </Link>
        <div className="mx-auto flex w-full max-w-[420px] flex-1 flex-col justify-center">{children}</div>
        <p className="mx-auto mt-8 max-w-[420px] text-center text-xs text-muted">
          Protected by Firebase Authentication. By continuing you agree to use Saathi for work purposes in line with your organisation&rsquo;s policies.
        </p>
      </main>
    </div>
  );
}

/** Maps Firebase Auth error codes to plain-language messages. */
export function authMessage(err: unknown): { field: "email" | "password" | "name" | "form"; text: string } | null {
  const code = (err as { code?: string }).code ?? "";
  if (code.includes("popup-closed-by-user") || code.includes("cancelled-popup-request")) return null;
  if (code.includes("invalid-email")) return { field: "email", text: "That doesn't look like a valid work email." };
  if (code.includes("email-already-in-use")) return { field: "email", text: "An account already exists for this email. Sign in instead." };
  if (code.includes("weak-password")) return { field: "password", text: "Use at least 8 characters, mixing letters and numbers." };
  if (code.includes("too-many-requests")) return { field: "form", text: "Too many attempts. Wait a minute, then try again." };
  if (code.includes("operation-not-allowed")) return { field: "form", text: "Google sign-in isn't enabled for this workspace yet. Use your email and password." };
  if (code.includes("unauthorized-domain")) return { field: "form", text: "Google sign-in isn't allowed from this address yet. Use your email and password." };
  if (code.includes("account-exists-with-different-credential")) return { field: "form", text: "This email already has a password account. Sign in with your email and password." };
  if (code.includes("popup-blocked")) return { field: "form", text: "Your browser blocked the Google window. Allow pop-ups for this site and try again." };
  if (code.includes("network-request-failed")) return { field: "form", text: "Can't reach the sign-in service. Check your connection and try again." };
  if (code.includes("invalid-credential") || code.includes("wrong-password") || code.includes("user-not-found"))
    return { field: "password", text: "Email or password is incorrect. Check both and try again." };
  return { field: "form", text: "Something went wrong signing you in. Try again." };
}

export async function signInWithGoogle() {
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: "select_account" });
  return signInWithPopup(getFbAuth(), provider);
}

export function GoogleButton({ label, busy, disabled, onClick }: { label: string; busy: boolean; disabled: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="flex h-11 w-full items-center justify-center gap-3 rounded-lg border border-[#c5cad3] bg-white text-[15px] font-semibold text-ink transition hover:bg-canvas disabled:opacity-60"
    >
      {busy ? (
        <Loader2 size={18} className="animate-spin" />
      ) : (
        <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden>
          <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.1 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
          <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.1 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
          <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
          <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
        </svg>
      )}
      {label}
    </button>
  );
}

export function Divider({ text }: { text: string }) {
  return (
    <div className="my-6 flex items-center gap-3 text-xs font-medium uppercase tracking-wider text-muted">
      <span className="h-px flex-1 bg-border" /> {text} <span className="h-px flex-1 bg-border" />
    </div>
  );
}

export const inputCls =
  "h-11 w-full rounded-lg border border-[#c5cad3] bg-white px-3.5 text-[15px] outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/20 aria-[invalid=true]:border-rust";
