"use client";

import { onAuthStateChanged, signOut, type User } from "firebase/auth";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { LogoMark } from "@/components/Logo";
import { Workspace } from "@/components/Workspace";
import { api } from "@/lib/api";
import { getFbAuth } from "@/lib/firebase";

export function AppShell() {
  const router = useRouter();
  const [user, setUser] = useState<User | null | undefined>(undefined);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState("");

  useEffect(
    () =>
      onAuthStateChanged(getFbAuth(), (u) => {
        setUser(u);
        setReady(false);
        if (!u) return router.replace("/login");
        // First sign-in (sign-up or Google SSO) creates the directory profile on the API side.
        api("/api/me")
          .then(() => setReady(true))
          .catch(async (e: Error) => {
            if (e.message.includes("organisation")) {
              await signOut(getFbAuth());
              router.replace("/login?error=domain");
            } else setFailed(e.message);
          });
      }),
    [router],
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
  if (!user || !ready)
    return (
      <div className="flex h-dvh flex-col items-center justify-center gap-4" role="status" aria-label="Loading workspace">
        <LogoMark size={44} className="animate-pulse" />
        <span className="font-mono text-xs uppercase tracking-widest text-muted">Opening workspace</span>
      </div>
    );
  return <Workspace key={user.uid} uid={user.uid} />;
}
