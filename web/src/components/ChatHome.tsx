"use client";

import { Compass, Hash, Loader2, MessageSquare, MessageSquarePlus, Search, Users } from "@/lib/icons";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { STATUS_META, presence, statusText } from "@/lib/format";
import type { ChannelSummary } from "@/lib/types";
import { RoleBadge, UserAvatar } from "./bits";
import { useWs } from "./ctx";

/** Shown when Chat is opened without a conversation selected (and as onboarding when you have none yet). */
export function ChatHome({ empty }: { empty: boolean }) {
  const { uid, users, account, open, dialog, toast } = useWs();
  const [q, setQ] = useState("");
  const [channels, setChannels] = useState<ChannelSummary[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const guest = account.org_role === "guest";

  useEffect(() => {
    if (guest) return;
    api<ChannelSummary[]>("/api/channels/browse")
      .then((r) => setChannels(r.filter((c) => !c.joined).slice(0, 6)))
      .catch(() => setChannels([]));
  }, [guest]);

  const t = q.trim().toLowerCase();
  const people = Object.values(users)
    .filter((u) => u.id !== uid && !u.deactivated && (!t || u.name.toLowerCase().includes(t) || u.role.toLowerCase().includes(t)))
    .sort((a, b) => Number(presence(b) === "available") - Number(presence(a) === "available") || a.name.localeCompare(b.name))
    .slice(0, 12);

  async function message(id: string) {
    setBusy(id);
    try {
      const r = await api<{ id: string }>("/api/chats", { json: { member_ids: [id], name: null } });
      open({ kind: "chat", chatId: r.id });
    } catch (e) {
      toast((e as Error).message);
      setBusy(null);
    }
  }
  async function join(c: ChannelSummary) {
    setBusy(c.id);
    try {
      await api(`/api/channels/${c.id}/join`, { method: "POST" });
      setTimeout(() => open({ kind: "chat", chatId: c.id }), 400);
    } catch (e) {
      toast((e as Error).message);
      setBusy(null);
    }
  }

  return (
    <section className="scrollbar-thin flex min-h-0 flex-1 flex-col overflow-y-auto bg-canvas/50" aria-label="Chat home">
      <div className="mx-auto w-full max-w-4xl px-4 py-8 lg:px-8">
        <div className="text-center">
          <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-soft text-brand">
            <MessageSquare size={26} />
          </span>
          <h1 className="mt-3 text-2xl font-bold tracking-tight">{empty ? "Start your first conversation" : "Chat"}</h1>
          <p className="mt-1 text-sm text-muted">
            {empty ? `Message a colleague at ${account.org.name}, or join a channel to follow a team or project.` : "Pick a conversation on the left, or start a new one."}
          </p>
          <div className="mt-4 flex flex-wrap justify-center gap-2">
            <button onClick={() => dialog("new-chat")} className="flex h-10 items-center gap-2 rounded-lg bg-brand px-4 text-sm font-semibold text-white hover:bg-brand-strong">
              <MessageSquarePlus size={16} /> New chat
            </button>
            {!guest && (
              <>
                <button onClick={() => dialog("new-channel")} className="flex h-10 items-center gap-2 rounded-lg border border-border bg-surface px-4 text-sm font-semibold hover:bg-hover">
                  <Hash size={16} /> Create a channel
                </button>
                <button onClick={() => dialog("browse-channels")} className="flex h-10 items-center gap-2 rounded-lg border border-border bg-surface px-4 text-sm font-semibold hover:bg-hover">
                  <Compass size={16} /> Browse channels
                </button>
              </>
            )}
          </div>
        </div>

        <div className="mt-8 grid gap-4 lg:grid-cols-[1.4fr_1fr]">
          <section className="rounded-2xl border border-border bg-surface" aria-label="People">
            <header className="flex items-center gap-2 border-b border-border px-4 py-3">
              <Users size={16} className="text-muted" aria-hidden />
              <h2 className="flex-1 text-sm font-bold">People {guest ? "you work with" : `at ${account.org.name}`}</h2>
            </header>
            <div className="border-b border-border px-4 py-2">
              <div className="relative">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" aria-hidden />
                <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by name or role" aria-label="Search people" className="h-9 w-full rounded-lg border border-border pl-8 pr-3 text-sm outline-none focus:border-brand" />
              </div>
            </div>
            {people.length === 0 ? (
              <p className="px-4 py-8 text-center text-sm text-muted">{t ? `No one matches “${q}”.` : "No one else here yet. Invite your team from Admin → Invites."}</p>
            ) : (
              <ul>
                {people.map((u) => (
                  <li key={u.id} className="flex items-center gap-3 border-b border-border px-4 py-2.5 last:border-b-0">
                    <UserAvatar uid={u.id} size={36} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 truncate text-sm font-semibold">
                        {u.name} <RoleBadge role={u.org_role} />
                      </div>
                      <div className="truncate text-xs text-muted">
                        {u.role || STATUS_META[presence(u)].label}
                        {statusText(u) && ` · ${statusText(u)}`}
                      </div>
                    </div>
                    <button onClick={() => message(u.id)} disabled={busy === u.id} className="flex h-8 items-center gap-1.5 rounded-lg border border-border px-3 text-xs font-semibold hover:bg-hover disabled:opacity-50">
                      {busy === u.id ? <Loader2 size={13} className="animate-spin" /> : <MessageSquare size={13} />} Message
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {!guest && (
            <section className="rounded-2xl border border-border bg-surface" aria-label="Channels to join">
              <header className="flex items-center gap-2 border-b border-border px-4 py-3">
                <Hash size={16} className="text-muted" aria-hidden />
                <h2 className="flex-1 text-sm font-bold">Channels you can join</h2>
              </header>
              {channels === null ? (
                <p className="flex items-center justify-center gap-2 px-4 py-8 text-sm text-muted">
                  <Loader2 size={14} className="animate-spin" /> Loading…
                </p>
              ) : channels.length === 0 ? (
                <p className="px-4 py-8 text-center text-sm text-muted">You&rsquo;re in every public channel. Create one for your team or project.</p>
              ) : (
                <ul>
                  {channels.map((c) => (
                    <li key={c.id} className="flex items-center gap-3 border-b border-border px-4 py-2.5 last:border-b-0">
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-soft text-brand" aria-hidden>
                        <Hash size={16} />
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-semibold">{c.name}</div>
                        <div className="truncate text-xs text-muted">
                          {c.member_count} members{c.description && ` · ${c.description}`}
                        </div>
                      </div>
                      <button onClick={() => join(c)} disabled={busy === c.id} className="flex h-8 items-center gap-1 rounded-lg bg-brand px-3 text-xs font-semibold text-white hover:bg-brand-strong disabled:opacity-50">
                        {busy === c.id && <Loader2 size={12} className="animate-spin" />} Join
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}
        </div>
      </div>
    </section>
  );
}
