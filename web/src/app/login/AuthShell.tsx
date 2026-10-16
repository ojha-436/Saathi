"use client";

import { GoogleAuthProvider, signInWithPopup } from "firebase/auth";
import { Loader2, LockKeyhole, ShieldCheck, Sparkles } from "@/lib/icons";
import Link from "next/link";
import { Logo } from "@/components/Logo";
import { getFbAuth } from "@/lib/firebase";
import { googleUnavailableLocally, isLocal } from "@/lib/auth";

/** Two-column sign-in layout shared by /login and /signup. */
export function AuthShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-dvh bg-paper-2 text-ink lg:grid-cols-[0.95fr_1.05fr]">
      <aside className="blueprint-grid relative hidden flex-col justify-between overflow-hidden p-12 text-paper lg:flex">
        <div className="flex items-center justify-between">
          <Link href="/" aria-label="Saathi home">
            <Logo dark />
          </Link>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-400/30 bg-emerald-400/10 px-2.5 py-0.5 font-mono text-[10.5px] font-semibold text-emerald-300">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" /> SHAKTI RAIL · ONLINE
          </span>
        </div>
        <div className="max-w-md">
          <p className="font-mono text-xs font-semibold uppercase tracking-[0.16em] text-mint">Enterprise & Shop-Floor AI OS</p>
          <h1 className="mt-4 font-display text-5xl leading-[1.04] text-white">
            Pick up <em className="text-mint">where the plant work happens.</em>
          </h1>
          <p className="mt-4 text-sm leading-relaxed text-slate-300">
            Every drawing revision, mill test certificate, shift handover, and vendor promise—indexed, verified, and cited for your exact role.
          </p>
          <div className="mt-6 grid grid-cols-2 gap-2.5 rounded-2xl border border-white/10 bg-white/5 p-3.5 font-mono text-xs">
            <div className="rounded-xl bg-white/5 p-2.5">
              <span className="text-[10px] text-slate-400">DRAWING REGISTER</span>
              <p className="mt-0.5 font-bold text-white">SRC-BF-2041 Rev C</p>
              <span className="text-[10px] text-emerald-300">✓ Released · QR Active</span>
            </div>
            <div className="rounded-xl bg-white/5 p-2.5">
              <span className="text-[10px] text-slate-400">SPEC CHECK</span>
              <p className="mt-0.5 font-bold text-white">EN 10025 S355J2</p>
              <span className="text-[10px] text-amber-300">! Heat H-77812 Flagged</span>
            </div>
          </div>
        </div>
        <ul className="space-y-2.5 text-xs text-slate-300">
          {[
            [ShieldCheck, "Permission-scoped ADK tools: you only see what your role and channels allow"],
            [LockKeyhole, "Data residency in asia-south1 (Mumbai) with Cloud KMS encryption"],
            [Sparkles, "Every AI answer and research claim cites its exact source"],
          ].map(([Icon, text]) => {
            const I = Icon as typeof ShieldCheck;
            return (
              <li key={text as string} className="flex items-center gap-2.5">
                <I size={15} className="shrink-0 text-mint" aria-hidden /> {text as string}
              </li>
            );
          })}
        </ul>
      </aside>

      <main className="flex flex-col px-5 py-8 sm:px-10">
        <Link href="/" className="mb-8 inline-block lg:hidden" aria-label="Saathi home">
          <Logo />
        </Link>
        <div className="mx-auto flex w-full max-w-[480px] flex-1 flex-col justify-center">{children}</div>
        <p className="mx-auto mt-8 max-w-[480px] text-center text-xs text-muted">
          Protected by Firebase Authentication. By continuing you agree to use Saathi for work purposes in line with your organisation&rsquo;s policies. See our{" "}
          <Link href="/privacy" className="font-medium underline">
            Privacy Policy
          </Link>
          .
        </p>
      </main>
    </div>
  );
}

/** Maps Firebase Auth error codes to plain-language messages. */
export function authMessage(err: unknown): { field: "email" | "password" | "name" | "form"; text: string } | null {
  const code = (err as { code?: string }).code ?? "";
  if (code.includes("popup-closed-by-user") || code.includes("cancelled-popup-request")) return null;
  if (code.includes("unverified-email")) return { field: "form", text: (err as Error).message || "Please verify your email address before signing in." };
  if (code.includes("invalid-email")) return { field: "email", text: "That doesn't look like a valid work email." };
  if (code.includes("email-already-in-use")) return { field: "email", text: "An account already exists for this email. Sign in instead." };
  if (code.includes("weak-password")) return { field: "password", text: "Use at least 8 characters, mixing letters and numbers." };
  if (code.includes("too-many-requests")) return { field: "form", text: "Too many attempts. Wait a minute, then try again." };
  if (code.includes("operation-not-allowed")) return { field: "form", text: "Google sign-in isn't enabled for this workspace yet. Use your email and password." };
  if (code.includes("unauthorized-domain")) return { field: "form", text: "Google sign-in isn't allowed from this address yet. Use your email and password." };
  if (code.includes("account-exists-with-different-credential")) return { field: "form", text: "This email already has a password account. Sign in with your email and password." };
  if (code.includes("popup-blocked")) return { field: "form", text: "Your browser blocked the Google window. Allow pop-ups for this site and try again." };
  if (code.includes("user-disabled")) return { field: "form", text: "This account has been deactivated by its workspace admin." };
  if (code.includes("network-request-failed")) return { field: "form", text: "Can't reach the sign-in service. Check your connection and try again." };
  if (code.includes("invalid-credential") || code.includes("wrong-password") || code.includes("user-not-found"))
    return { field: "password", text: "Email or password is incorrect. Check both and try again." };
  return { field: "form", text: "Something went wrong signing you in. Try again." };
}

export const PASSWORD_RULES = [
  { label: "8+ characters", test: (p: string) => p.length >= 8 },
  { label: "A letter", test: (p: string) => /[a-z]/i.test(p) },
  { label: "A number", test: (p: string) => /\d/.test(p) },
];

export async function signInWithGoogle() {
  if (isLocal()) throw googleUnavailableLocally();
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
