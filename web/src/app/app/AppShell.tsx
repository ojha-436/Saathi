"use client";

import { onAuthStateChanged, sendEmailVerification, signOut, type User } from "firebase/auth";
import { MailCheck } from "@/lib/icons";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { LogoMark } from "@/components/Logo";
import { Workspace } from "@/components/Workspace";
import { api } from "@/lib/api";
import { getFbAuth } from "@/lib/firebase";
import type { Account } from "@/lib/types";

export function AppShell() {
  const router = useRouter();
  const [user, setUser] = useState<User | null | undefined>(undefined);
  const [account, setAccount] = useState<Account | null>(null);
  const [verify, setVerify] = useState("");
  const [failed, setFailed] = useState("");
  const [sent, setSent] = useState(false);

  async function load(u: User) {
    setFailed("");
    try {
      // First sign-in joins a workspace (invite, verified domain, or a new one) and sets the token's workspace claims.
      const a = await api<Account>("/api/me");
      await u.getIdToken(true); // pick up {org_id, org_role} claims so security rules see the workspace
      setVerify("");
      setAccount(a);
    } catch (e) {
      const msg = (e as Error).message;
      if (msg.startsWith("verify-email:")) setVerify(msg.slice(13).trim());
      else if (msg.includes("organisation") || msg.includes("deactivated")) {
        await signOut(getFbAuth());
        router.replace(`/login?error=${msg.includes("deactivated") ? "deactivated" : "domain"}`);
      } else setFailed(msg);
    }
  }

  useEffect(
    () =>
      onAuthStateChanged(getFbAuth(), (u) => {
        setUser(u);
        setAccount(null);
        if (!u) return router.replace("/login");
        load(u);
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
              await sendEmailVerification(user).catch(() => {});
              setSent(true);
            }}
            className="h-10 rounded-lg border border-border px-4 text-sm font-semibold hover:bg-canvas"
          >
            {sent ? "Sent again" : "Resend link"}
          </button>
          <button
            onClick={async () => {
              await user.reload();
              await user.getIdToken(true);
              load(user);
            }}
            className="h-10 rounded-lg bg-brand px-4 text-sm font-semibold text-white"
          >
            I&rsquo;ve verified
          </button>
        </div>
        <button onClick={() => signOut(getFbAuth())} className="mt-3 text-sm text-muted hover:underline">
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
      </div>
    );
  if (!user || !account)
    return (
      <div className="flex h-dvh flex-col items-center justify-center gap-4" role="status" aria-label="Loading workspace">
        <LogoMark size={44} className="animate-pulse" />
        <span className="font-mono text-xs uppercase tracking-widest text-muted">Opening workspace</span>
      </div>
    );
  return <Workspace key={user.uid} uid={user.uid} account={account} />;
}
