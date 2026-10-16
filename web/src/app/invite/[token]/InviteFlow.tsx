"use client";

import clsx from "clsx";
import { getAdditionalUserInfo } from "firebase/auth";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { AlertTriangle, Check, Clock, Eye, EyeOff, Hash, Loader2, Lock, LogOut, MailCheck, RefreshCw, UserCheck } from "@/lib/icons";
import {
  createAccountForInvite, deleteCurrentUser, getToken, isLocal, onAuth, refreshToken, reloadUser, sendReset, signInForInvite, signOut, type AuthUser,
} from "@/lib/auth";
import { apiUrl } from "@/lib/firebase";
import { AuthShell, Divider, GoogleButton, PASSWORD_RULES, authMessage, inputCls, signInWithGoogle } from "../../login/AuthShell";

type State = "valid" | "invalid" | "expired" | "revoked" | "accepted" | "offline";
type Invite = {
  state: State;
  message?: string;
  workspace?: string;
  inviter?: string;
  email?: string;
  role?: "admin" | "member" | "guest";
  channels?: string[];
  expires_at?: string;
  account?: "none" | "password" | "google" | "both";
  /** guests: what else they may do, and how long access lasts after joining */
  guest?: { dm: boolean; ai: boolean };
  access_days?: number | null;
  access_until?: string | null;
};
/** Accept refusals the page handles itself (the rest are shown as an error line). */
type Problem = { code: "move_required" | "other_workspace"; message: string; workspace?: string };

const ROLE = { admin: "Admin", member: "Member", guest: "Guest" } as const;
const CLOSED: Record<Exclude<State, "valid">, string> = {
  invalid: "This invite link doesn't work",
  expired: "This invite has expired",
  revoked: "This invite was withdrawn",
  accepted: "This invite has already been used",
  offline: "We couldn't load your invite",
};

/** Same rule as the server: Gmail ignores dots and "+tags", so R.Kumar@gmail.com is rkumar@gmail.com. */
function normEmail(e: string) {
  const v = e.trim().toLowerCase();
  const [local, domain] = v.split("@");
  return domain === "gmail.com" || domain === "googlemail.com" ? `${local.split("+")[0].replace(/\./g, "")}@gmail.com` : v;
}

/** Google refuses sign-in inside in-app browsers (WhatsApp, Instagram, Facebook, Android WebViews). */
const inAppBrowser = () => typeof navigator !== "undefined" && /FBAN|FBAV|Instagram|LinkedInApp|Line\/|WhatsApp|Snapchat|; wv\)/i.test(navigator.userAgent);

const day = (iso?: string) => (iso ? new Date(iso).toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short" }) : "");

export function InviteFlow({ token }: { token: string }) {
  const router = useRouter();
  const [invite, setInvite] = useState<Invite | null>(null);
  const [user, setUser] = useState<AuthUser | null | undefined>(undefined);
  const [mode, setMode] = useState<"create" | "signin">("create");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [problem, setProblem] = useState<Problem | null>(null);
  const [resetSent, setResetSent] = useState(false);
  // Only shown once the invite has loaded (client side), so the server render never differs
  const [inApp] = useState(inAppBrowser);

  useEffect(() => {
    fetch(`${apiUrl()}/api/invites/${encodeURIComponent(token)}`, { cache: "no-store" })
      .then(async (r) => {
        if (r.status === 429) return { state: "offline", message: "Too many attempts from this network. Wait a minute, then reload." } as Invite;
        if (!r.ok) throw new Error(String(r.status));
        return (await r.json()) as Invite;
      })
      .then((d) => {
        setInvite(d);
        if (d.account && d.account !== "none") setMode("signin");
      })
      .catch(() => setInvite({ state: "offline", message: "Check your connection, then reload this page." }));
  }, [token]);

  useEffect(() => onAuth(setUser), []);

  /** Joins the workspace with the signed-in account. `createdHere`: an account this page just made is removed again on failure. */
  async function accept(opts: { move?: boolean; keep?: boolean; createdHere?: boolean } = {}): Promise<boolean> {
    const res = await fetch(`${apiUrl()}/api/invites/${encodeURIComponent(token)}/accept`, {
      method: "POST",
      headers: { Authorization: `Bearer ${await getToken()}`, "Content-Type": "application/json" },
      body: JSON.stringify({ move: !!opts.move, keep: !!opts.keep, name: name.trim() }),
    });
    if (res.ok) {
      await reloadUser().catch(() => {});
      await refreshToken(); // the verified email and the workspace claims arrive on a fresh token
      router.replace("/app");
      return true;
    }
    let detail: unknown = res.statusText;
    try {
      detail = (await res.json()).detail ?? detail;
    } catch {}
    const p = (typeof detail === "string" ? { code: "error", message: detail } : detail) as { code: string; message: string; workspace?: string };
    if (opts.createdHere) await deleteCurrentUser().catch(() => {}); // never leave behind an account that joined nothing
    if (p.code === "move_required" || p.code === "other_workspace") {
      setProblem(p as Problem);
      return false;
    }
    if (res.status === 410) {
      setInvite((i) => ({ ...(i as Invite), state: (p.code as State) in CLOSED ? (p.code as State) : "invalid", message: p.message }));
      return false;
    }
    throw new Error(p.message || "Couldn't accept the invite. Try again.");
  }

  async function run(key: string, fn: () => Promise<boolean | void>) {
    setBusy(key);
    setError("");
    let done = false;
    try {
      done = (await fn()) === true;
    } catch (e) {
      const code = (e as { code?: string }).code;
      setError(code ? authMessage(e)?.text ?? "" : (e as Error).message);
    } finally {
      if (!done) setBusy(null); // on success the page is already moving to /app
    }
  }

  if (!invite || user === undefined)
    return (
      <AuthShell>
        <div className="flex justify-center py-16" role="status" aria-label="Loading your invite">
          <Loader2 size={26} className="animate-spin text-muted" />
        </div>
      </AuthShell>
    );

  if (invite.state !== "valid")
    return (
      <AuthShell>
        <div className="py-6 text-center" role="alert">
          <span className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-saffron-soft text-saffron-ink">
            {invite.state === "accepted" ? <UserCheck size={24} /> : invite.state === "expired" ? <Clock size={24} /> : <AlertTriangle size={24} />}
          </span>
          <h2 className="text-[24px] font-bold tracking-tight">{CLOSED[invite.state]}</h2>
          <p className="mt-2 text-sm text-muted">{invite.message}</p>
          <div className="mt-8 space-y-2">
            {invite.state === "offline" ? (
              <button onClick={() => location.reload()} className="flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-brand text-[15px] font-semibold text-white hover:bg-brand-strong">
                <RefreshCw size={16} /> Reload
              </button>
            ) : (
              <Link href="/login" className="flex h-11 w-full items-center justify-center rounded-lg bg-brand text-[15px] font-semibold text-white hover:bg-brand-strong">
                {invite.state === "accepted" ? `Sign in to ${invite.workspace}` : "Go to sign in"}
              </Link>
            )}
          </div>
        </div>
      </AuthShell>
    );

  const email = invite.email ?? "";
  const role = invite.role ?? "member";
  const channels = invite.channels ?? [];
  // The form and Google flows sign in on the way; the "signed in as" panel is for someone who arrived signed in
  const signedInAs = user && busy !== "form" && busy !== "google" ? user.email ?? "" : "";
  const passed = PASSWORD_RULES.filter((r) => r.test(password)).length;

  const header = (
    <>
      <p className="font-mono text-xs uppercase tracking-[0.16em] text-saffron-ink">You&rsquo;re invited</p>
      <h2 className="mt-2 text-[26px] font-bold leading-tight tracking-tight">
        {invite.inviter || "Your colleague"} invited you to {invite.workspace}
      </h2>
      <div className="mt-4 rounded-lg border border-border bg-canvas px-3.5 py-3 text-sm">
        <p>
          <span className={clsx("mr-2 rounded-full px-2 py-0.5 text-xs font-semibold", role === "guest" ? "bg-saffron-soft text-saffron-ink" : "bg-brand-soft text-brand")}>{ROLE[role]}</span>
          {role === "guest" ? "You'll see only these channels, nothing else in the workspace:" : channels.length ? "You'll join the workspace and these channels:" : "You'll join the whole workspace."}
        </p>
        {channels.length > 0 && (
          <ul className="mt-2 flex flex-wrap gap-1.5">
            {channels.map((c) => (
              <li key={c} className="flex items-center gap-1 rounded-md border border-border bg-surface px-2 py-0.5 text-xs font-medium">
                <Hash size={12} className="text-muted" aria-hidden /> {c}
              </li>
            ))}
          </ul>
        )}
        {role === "guest" && invite.guest && (
          <ul className="mt-3 space-y-1 border-t border-border pt-2.5 text-xs text-ink/80" aria-label="Your guest access">
            <li>
              {invite.guest.dm ? "✓ You can post in these channels and message the people in them directly." : "✓ You can post in these channels. Direct messages aren't included."}
            </li>
            <li>{invite.guest.ai ? "✓ You can ask Saathi (AI) about them." : "✗ Saathi (AI) isn't included."}</li>
            <li>
              {invite.access_until
                ? `Your access lasts until ${day(invite.access_until)}.`
                : invite.access_days
                  ? `Your access lasts ${invite.access_days} days from when you join.`
                  : "Your access has no end date."}{" "}
              Already use Saathi at your company? You keep that workspace and switch between the two.
            </li>
          </ul>
        )}
      </div>
      <p className="mt-3 flex items-start gap-1.5 text-xs text-muted">
        <Lock size={13} className="mt-px shrink-0" aria-hidden />
        <span>
          This invite is for <b className="text-ink">{email}</b>
          {invite.expires_at && <> and works until {day(invite.expires_at)}</>}. Another email address can&rsquo;t accept it.
        </span>
      </p>
    </>
  );

  const errorBox = error && (
    <p role="alert" className="mt-5 rounded-lg border border-rust/30 bg-rust-soft px-3 py-2.5 text-sm text-rust">
      {error}
    </p>
  );

  if (problem)
    return (
      <AuthShell>
        {header}
        <div className="mt-6 rounded-xl border border-border p-4" role="alert">
          {problem.code === "move_required" ? (
            <>
              <h3 className="font-semibold">You already have a workspace</h3>
              <p className="mt-1.5 text-sm text-muted">
                {email} has its own workspace{problem.workspace ? <>, <b className="text-ink">{problem.workspace}</b>,</> : ""} that nobody else uses. Keep it and switch between
                the two from your profile menu, or move your account to {invite.workspace} and close the empty one.
              </p>
              {errorBox}
              <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                <button onClick={() => run("keep", () => accept({ keep: true }))} disabled={!!busy} className="flex h-10 flex-1 items-center justify-center gap-2 rounded-lg bg-brand px-4 text-sm font-semibold text-white hover:bg-brand-strong disabled:opacity-60">
                  {busy === "keep" && <Loader2 size={15} className="animate-spin" />} Keep both and join
                </button>
                <button onClick={() => run("move", () => accept({ move: true }))} disabled={!!busy} className="flex h-10 items-center justify-center gap-2 rounded-lg border border-border px-4 text-sm font-semibold hover:bg-canvas disabled:opacity-60">
                  {busy === "move" && <Loader2 size={15} className="animate-spin" />} Move my account here
                </button>
                <button onClick={() => signOut().then(() => setProblem(null))} disabled={!!busy} className="h-10 rounded-lg border border-border px-4 text-sm font-semibold hover:bg-canvas">
                  Not now
                </button>
              </div>
            </>
          ) : (
            <>
              <h3 className="font-semibold">This account is already in another workspace</h3>
              <p className="mt-1.5 text-sm text-muted">{problem.message}</p>
              <p className="mt-2 text-sm text-muted">Tell {invite.inviter || "the person who invited you"} which other email address to invite.</p>
              <button onClick={() => signOut().then(() => setProblem(null))} className="mt-4 flex h-10 items-center gap-2 rounded-lg border border-border px-4 text-sm font-semibold hover:bg-canvas">
                <LogOut size={15} /> Sign out
              </button>
            </>
          )}
        </div>
      </AuthShell>
    );

  if (signedInAs) {
    const match = normEmail(signedInAs) === normEmail(email);
    return (
      <AuthShell>
        {header}
        {errorBox}
        <div className="mt-6 rounded-xl border border-border p-4">
          <p className="text-sm">
            You&rsquo;re signed in as <b>{signedInAs}</b>.
          </p>
          {match ? (
            <button onClick={() => run("accept", () => accept())} disabled={!!busy} className="mt-3 flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-brand text-[15px] font-semibold text-white hover:bg-brand-strong disabled:opacity-60">
              {busy === "accept" ? <Loader2 size={18} className="animate-spin" /> : <Check size={18} />} Accept and open {invite.workspace}
            </button>
          ) : (
            <>
              <p className="mt-1 text-sm text-muted">This invite is for {email}. Sign out first, then continue with that address.</p>
              <button onClick={() => signOut()} className="mt-3 flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-brand text-[15px] font-semibold text-white hover:bg-brand-strong">
                <LogOut size={17} /> Sign out and continue
              </button>
            </>
          )}
        </div>
      </AuthShell>
    );
  }

  function google() {
    run("google", async () => {
      const cred = await signInWithGoogle();
      const got = (cred.user.email ?? "").toLowerCase();
      const isNew = !!getAdditionalUserInfo(cred)?.isNewUser;
      if (normEmail(got) !== normEmail(email)) {
        if (isNew) await cred.user.delete().catch(() => signOut());
        else await signOut();
        throw new Error(`That Google account is ${got}, but this invite is for ${email}. Pick the Google account for ${email}, or use a password below.`);
      }
      return accept({ createdHere: isNew });
    });
  }

  function submit(ev: React.FormEvent) {
    ev.preventDefault();
    if (mode === "create") {
      if (name.trim().length < 2) return setError("Enter your full name.");
      if (passed < PASSWORD_RULES.length) return setError("Use at least 8 characters with a letter and a number.");
      return run("form", async () => {
        try {
          await createAccountForInvite(email, password, name.trim());
        } catch (e) {
          if ((e as { code?: string }).code?.includes("email-already-in-use")) {
            setMode("signin");
            throw new Error("You already have a Saathi account with this email. Sign in with its password (or Google).");
          }
          throw e;
        }
        return accept({ createdHere: true });
      });
    }
    if (!password) return setError("Enter your password.");
    run("form", async () => {
      await signInForInvite(email, password);
      return accept();
    });
  }

  const googleFirst = invite.account === "google" || invite.account === "both";
  return (
    <AuthShell>
      {header}
      {errorBox}
      {inApp && (
        <p className="mt-5 rounded-lg border border-saffron/40 bg-saffron-soft px-3 py-2.5 text-sm text-saffron-ink">
          Google sign-in doesn&rsquo;t work inside this app&rsquo;s browser. Open this page in Chrome or Safari (menu &rarr; <i>Open in browser</i>), or use a password below.
        </p>
      )}

      {!isLocal() && (
        <div className="mt-6">
          <GoogleButton label="Continue with Google" busy={busy === "google"} disabled={!!busy} onClick={google} />
          {googleFirst && <p className="mt-2 text-center text-xs text-muted">You&rsquo;ve used Google with this email before.</p>}
          <Divider text={mode === "create" ? "or create a password" : "or use your password"} />
        </div>
      )}

      <form onSubmit={submit} noValidate className={clsx("space-y-4", isLocal() && "mt-6")}>
        {mode === "create" && (
          <div>
            <label htmlFor="name" className="text-sm font-semibold">
              Full name
            </label>
            <input id="name" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} className={`mt-1.5 ${inputCls}`} placeholder="Rajesh Kumar" />
          </div>
        )}
        <div>
          <label htmlFor="email" className="text-sm font-semibold">
            Email
          </label>
          <div className="relative mt-1.5">
            <input id="email" type="email" autoComplete="username" value={email} readOnly aria-readonly className={`${inputCls} bg-canvas pr-10 text-muted`} />
            <Lock size={15} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-muted" aria-hidden />
          </div>
        </div>
        <div>
          <div className="flex items-baseline justify-between">
            <label htmlFor="password" className="text-sm font-semibold">
              {mode === "create" ? "Choose a password" : "Password"}
            </label>
            {mode === "signin" && !isLocal() && (
              <button
                type="button"
                onClick={() => sendReset(email).catch(() => {}).finally(() => setResetSent(true))}
                className="text-xs font-semibold text-brand hover:underline"
              >
                Forgot password?
              </button>
            )}
          </div>
          <div className="relative mt-1.5">
            <input id="password" type={show ? "text" : "password"} autoComplete={mode === "create" ? "new-password" : "current-password"} value={password} onChange={(e) => setPassword(e.target.value)} className={`${inputCls} pr-12`} />
            <button type="button" onClick={() => setShow((s) => !s)} className="absolute right-1 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-md text-muted hover:bg-canvas hover:text-ink" aria-label={show ? "Hide password" : "Show password"}>
              {show ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>
          {mode === "create" && (
            <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs">
              {PASSWORD_RULES.map((r) => (
                <li key={r.label} className={clsx("flex items-center gap-1", r.test(password) ? "text-moss" : "text-muted")}>
                  <Check size={12} className={r.test(password) ? "" : "opacity-30"} aria-hidden /> {r.label}
                </li>
              ))}
            </ul>
          )}
          {resetSent && (
            <p className="mt-2 flex items-center gap-1.5 text-xs text-moss" role="status">
              <MailCheck size={13} /> If {email} has a password, a reset link is on its way. Check spam too.
            </p>
          )}
        </div>
        <button type="submit" disabled={!!busy} className="flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-brand text-[15px] font-semibold text-white transition hover:bg-brand-strong disabled:opacity-60">
          {busy === "form" ? <Loader2 size={18} className="animate-spin" /> : mode === "create" ? "Create account and join" : "Sign in and join"}
        </button>
      </form>
      <p className="mt-4 text-center text-sm text-muted">
        {mode === "create" ? "Already have a Saathi account? " : "New to Saathi? "}
        <button
          onClick={() => {
            setMode(mode === "create" ? "signin" : "create");
            setError("");
          }}
          className="font-semibold text-brand hover:underline"
        >
          {mode === "create" ? "Sign in" : "Create your account"}
        </button>
      </p>
    </AuthShell>
  );
}
