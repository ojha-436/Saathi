"use client";

import { Building2, Loader2, MailCheck } from "@/lib/icons";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { LogoMark } from "@/components/Logo";
import { Workspace } from "@/components/Workspace";
import { api } from "@/lib/api";
import { onAuth, refreshToken, reloadUser, resendVerification, signOut, type AuthUser } from "@/lib/auth";
import { getFbAuth } from "@/lib/firebase";
import type { Account } from "@/lib/types";

export function AppShell() {
  const router = useRouter();
  const [user, setUser] = useState<AuthUser | null | undefined>(undefined);
  const [account, setAccount] = useState<Account | null>(null);
  const [verify, setVerify] = useState("");
  const [failed, setFailed] = useState("");
  const [sent, setSent] = useState(false);
  const [orgName, setOrgName] = useState("");
  const [savingOrg, setSavingOrg] = useState(false);
  const [orgDone, setOrgDone] = useState(false);

  async function load() {
    setFailed("");
    try {
      // First sign-in joins a workspace (invite, verified domain, or a new one) and sets the token's workspace claims.
      const a = await api<Account>("/api/me");
      await refreshToken(); // pick up {org_id, org_role} claims so security rules see the workspace
      setVerify("");
      setAccount(a);
    } catch (e) {
      const msg = (e as Error).message;
      if (msg.startsWith("verify-email:")) setVerify(msg.slice(13).trim());
      else if (msg.startsWith("invite-expired:")) setFailed(msg.slice(15).trim());
      else if (msg.includes("organisation") || msg.includes("deactivated")) {
        await signOut();
        router.replace(`/login?error=${msg.includes("deactivated") ? "deactivated" : "domain"}`);
      } else setFailed(msg);
    }
  }

  async function submitOrg(e: React.FormEvent) {
    e.preventDefault();
    if (!orgName.trim() || savingOrg) return;
    setSavingOrg(true);
    try {
      await api("/api/admin/org", { method: "PATCH", json: { name: orgName.trim() } });
      if (account) {
        setAccount({ ...account, org: { ...account.org, name: orgName.trim() } });
      }
      setOrgDone(true);
    } catch (err) {
      alert((err as Error).message);
    } finally {
      setSavingOrg(false);
    }
  }

  useEffect(
    () =>
      onAuth((u) => {
        setUser(u);
        setAccount(null);
        if (!u) return router.replace("/login");
        if (!u.emailVerified && !u.email?.endsWith("@saathi.demo")) {
          setVerify("Please verify your email address before opening your workspace.");
          return;
        }
        load();
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [router],
  );

  if (verify && user)
    return (
      <div className="flex h-dvh flex-col items-center justify-center gap-3 px-6 text-center" role="alert">
        <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-soft text-brand">
          <MailCheck size={26} />
        </span>
        <h1 className="text-xl font-bold">Verify your email</h1>
        <p className="max-w-sm text-sm text-muted">
          {verify} We sent a link to <b>{user.email}</b>.
        </p>
        <div className="mt-2 flex gap-2">
          <button
            onClick={async () => {
              await resendVerification().catch(() => {});
              setSent(true);
            }}
            className="h-10 rounded-lg border border-border px-4 text-sm font-semibold hover:bg-canvas"
          >
            {sent ? "Sent again" : "Resend link"}
          </button>
          <button
            onClick={async () => {
              await reloadUser();
              const currentUser = getFbAuth().currentUser;
              if (currentUser?.emailVerified) {
                setVerify("");
                await refreshToken();
                load();
              } else {
                alert("Your email has not been verified yet. Please check your inbox (and spam folder) and click the verification link.");
              }
            }}
            className="h-10 rounded-lg bg-brand px-4 text-sm font-semibold text-white"
          >
            I&rsquo;ve verified
          </button>
        </div>
        <button onClick={() => signOut()} className="mt-3 text-sm text-muted hover:underline">
          Use a different account
        </button>
      </div>
    );

  if (failed)
    return (
      <div className="flex h-dvh flex-col items-center justify-center gap-3 px-6 text-center" role="alert">
        <LogoMark size={44} />
        <p className="font-semibold">We couldn&rsquo;t open your workspace.</p>
        <p className="text-sm text-muted">{failed}</p>
        <button onClick={() => location.reload()} className="mt-2 h-10 rounded-lg bg-brand px-4 text-sm font-semibold text-white">
          Try again
        </button>
        <button onClick={() => signOut()} className="text-sm text-muted hover:underline">
          Use a different account
        </button>
      </div>
    );
  if (!user || !account)
    return (
      <div className="flex h-dvh flex-col items-center justify-center gap-4" role="status" aria-label="Loading workspace">
        <LogoMark size={44} className="animate-pulse" />
        <span className="font-mono text-xs uppercase tracking-widest text-muted">Opening workspace</span>
      </div>
    );

  if (account.org_role === "owner" && account.org.name.endsWith(" workspace") && !orgDone) {
    return (
      <div className="flex h-dvh flex-col items-center justify-center p-6 bg-canvas">
        <div className="w-full max-w-md bg-surface border border-border p-8 rounded-2xl shadow-xl text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-brand/10 text-brand">
            <Building2 size={24} />
          </div>
          <h1 className="text-xl font-bold tracking-tight">Name your organization</h1>
          <p className="mt-1.5 text-sm text-muted">
            You&apos;re setting up a new workspace. What is the name of your company or organization?
          </p>
          <form onSubmit={submitOrg} className="mt-6 text-left">
            <label htmlFor="org" className="block text-xs font-semibold text-muted uppercase tracking-wider mb-2">
              Organization Name
            </label>
            <input
              id="org"
              autoFocus
              required
              value={orgName}
              onChange={(e) => setOrgName(e.target.value)}
              placeholder="e.g. Acme Components"
              className="w-full h-11 px-3 border border-border rounded-lg text-sm bg-surface outline-none focus:border-brand text-ink"
            />
            <button
              type="submit"
              disabled={savingOrg || orgName.trim().length < 2}
              className="mt-5 w-full h-11 bg-brand text-white text-sm font-semibold rounded-lg hover:bg-brand-strong transition disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {savingOrg ? <Loader2 size={16} className="animate-spin" /> : "Continue to Workspace"}
            </button>
          </form>
        </div>
      </div>
    );
  }

  return <Workspace key={user.uid} uid={user.uid} account={account} />;
}
