"use client";

import clsx from "clsx";
import { signOut } from "firebase/auth";
import { BarChart3, EyeOff, LogOut, Plus, Search, Sparkles, Users } from "lucide-react";
import { useRouter } from "next/navigation";
import { getFbAuth } from "@/lib/firebase";
import { chatTitle, timeShort } from "@/lib/format";
import type { Chat } from "@/lib/types";
import { Avatar } from "./bits";
import { useWs, type View } from "./ctx";
import { LogoMark } from "./Logo";

export function Sidebar({
  chatList,
  onNavigate,
  onNewChat,
  onPalette,
}: {
  chatList: Chat[];
  onNavigate?: () => void;
  onNewChat: () => void;
  onPalette: () => void;
}) {
  const { uid, me, users, view, open } = useWs();
  const router = useRouter();
  const go = (v: View) => {
    open(v);
    onNavigate?.();
  };
  const navItem = (active: boolean) =>
    clsx("flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm transition", active ? "bg-paper/10 text-paper" : "text-paper/75 hover:bg-paper/5 hover:text-paper");

  return (
    <aside className="flex h-full w-full flex-col bg-ink text-paper" aria-label="Workspace navigation">
      <div className="flex items-center gap-2.5 px-4 pb-3 pt-4">
        <LogoMark size={30} />
        <div className="min-w-0">
          <div className="font-display text-[22px] leading-none">Saathi</div>
          <div className="mt-0.5 truncate font-mono text-[10px] uppercase tracking-wider text-paper/50">Shakti Rail Components</div>
        </div>
      </div>

      <button
        onClick={onPalette}
        className="mx-3 mb-3 flex items-center gap-2 rounded-lg border border-paper/10 bg-paper/5 px-3 py-2 text-left text-sm text-paper/60 transition hover:border-paper/25 hover:text-paper"
      >
        <Search size={15} aria-hidden /> <span className="flex-1">Search or ask…</span>
        <kbd className="rounded border border-paper/15 px-1.5 font-mono text-[10px]">⌘K</kbd>
      </button>

      <nav className="space-y-1 px-3" aria-label="Main">
        <button onClick={() => go({ kind: "assistant" })} className={navItem(view.kind === "assistant")} aria-current={view.kind === "assistant" ? "page" : undefined}>
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-saffron text-ink">
            <Sparkles size={15} aria-hidden />
          </span>
          <span className="flex-1 font-medium">Ask Saathi</span>
        </button>
        <button onClick={() => go({ kind: "insights" })} className={navItem(view.kind === "insights")} aria-current={view.kind === "insights" ? "page" : undefined}>
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-paper/10">
            <BarChart3 size={15} aria-hidden />
          </span>
          <span className="flex-1 font-medium">My insights</span>
        </button>
      </nav>

      <div className="mt-5 flex items-center justify-between px-5 pb-1.5">
        <span className="font-mono text-[10.5px] uppercase tracking-[0.14em] text-paper/45">Chats</span>
        <button onClick={onNewChat} className="flex h-8 w-8 items-center justify-center rounded-md text-paper/60 hover:bg-paper/10 hover:text-paper" aria-label="New chat" title="New chat">
          <Plus size={16} />
        </button>
      </div>
      <nav className="scrollbar-thin flex-1 overflow-y-auto px-2 pb-2" aria-label="Chats">
        {chatList.map((c) => {
          const title = chatTitle(c, uid, users);
          const active = view.kind === "chat" && view.chatId === c.id;
          return (
            <button
              key={c.id}
              onClick={() => go({ kind: "chat", chatId: c.id })}
              aria-current={active ? "page" : undefined}
              className={clsx("relative flex w-full items-center gap-3 rounded-xl px-2.5 py-2 text-left transition", active ? "bg-paper/10" : "hover:bg-paper/5")}
            >
              {active && <span className="absolute left-0 top-2 bottom-2 w-[3px] rounded-r bg-saffron" aria-hidden />}
              {c.type === "group" ? (
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-ink-3 text-paper/80">
                  <Users size={16} aria-hidden />
                </span>
              ) : (
                <Avatar name={title} />
              )}
              <span className="min-w-0 flex-1">
                <span className="flex items-baseline justify-between gap-2">
                  <span className="flex min-w-0 items-center gap-1 truncate text-sm font-medium text-paper">
                    <span className="truncate">{title}</span>
                    {c.ai_excluded && <EyeOff size={12} className="shrink-0 text-paper/50" aria-label="Excluded from AI" />}
                  </span>
                  <span className="shrink-0 font-mono text-[10px] text-paper/40">{timeShort(c.last_ts)}</span>
                </span>
                <span className="block truncate text-xs text-paper/55">
                  {c.type === "group" && c.last_sender ? `${c.last_sender.split(" ")[0]}: ` : ""}
                  {c.last_text}
                </span>
              </span>
            </button>
          );
        })}
      </nav>

      <div className="flex items-center gap-3 border-t border-paper/10 px-4 py-3">
        <Avatar name={me?.name ?? "?"} size={34} />
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium">{me?.name}</div>
          <div className="truncate text-[11px] text-paper/50">{me?.role}</div>
        </div>
        <button
          onClick={async () => {
            await signOut(getFbAuth());
            router.replace("/");
          }}
          className="flex h-10 w-10 items-center justify-center rounded-lg text-paper/50 hover:bg-paper/10 hover:text-paper"
          title="Sign out"
          aria-label="Sign out"
        >
          <LogOut size={16} />
        </button>
      </div>
    </aside>
  );
}
