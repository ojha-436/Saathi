"use client";

import { onAuthStateChanged, type User } from "firebase/auth";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { LogoMark } from "@/components/Logo";
import { Workspace } from "@/components/Workspace";
import { getFbAuth } from "@/lib/firebase";

export function AppShell() {
  const router = useRouter();
  const [user, setUser] = useState<User | null | undefined>(undefined);

  useEffect(
    () =>
      onAuthStateChanged(getFbAuth(), (u) => {
        setUser(u);
        if (!u) router.replace("/login");
      }),
    [router],
  );

  if (!user)
    return (
      <div className="flex h-dvh flex-col items-center justify-center gap-4" role="status" aria-label="Loading workspace">
        <LogoMark size={44} className="animate-pulse" />
        <span className="font-mono text-xs uppercase tracking-widest text-muted">Opening workspace</span>
      </div>
    );
  return <Workspace key={user.uid} uid={user.uid} />;
}
