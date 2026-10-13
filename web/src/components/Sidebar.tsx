"use client";

import clsx from "clsx";
import { BarChart3, Bell, BellOff, ChevronDown, Compass, EyeOff, Hash, ListTodo, Lock, MessageSquare, MessageSquarePlus, ShieldCheck, Sparkles, Star, Sun, UserPlus, Mail, CalendarDays, DriveIcon, Gavel, Radar, Workflow } from "@/lib/icons";
import { useMemo, useState } from "react";
import { api } from "@/lib/api";
import { chatTitle, isUnread, timeShort } from "@/lib/format";
import type { Chat, NotifyLevel, UserSettings } from "@/lib/types";
import { ChatIcon, Menu } from "./bits";
import { useWs, type View } from "./ctx";

export type RailKey = "home" | "activity" | "chat" | "assistant" | "tasks" | "quality" | "decisions" | "live" | "insights" | "admin" | "gmail" | "calendar" | "drive";

export function railKey(view: View): RailKey {
  if (view.kind === "research") return "assistant";
  return view.kind === "meeting" ? "home" : view.kind === "chats" || view.kind === "handover" ? "chat" : view.kind;
}

export function notifyLevel(chat: Chat, settings: UserSettings): NotifyLevel {
  return settings.notify?.[chat.id] ?? settings.defaults?.[chat.type] ?? "all";
}

/** Teams-style app bar: vertical on desktop, bottom navigation on phones. */
export function AppRail({ unreadChats, unreadAlerts, openTasks, active, onSelect, mobile, admin, connected = [], emailPromises = 0, openRecords = 0, guest = false }: {
  unreadChats: number;
  unreadAlerts: number;
  openTasks: number;
  active: RailKey;
  onSelect: (k: RailKey) => void;
  mobile?: boolean;
  admin?: boolean;
  connected?: string[];
  emailPromises?: number;
  openRecords?: number;
  guest?: boolean;
}) {
  const all: { key: RailKey; label: string; icon: typeof Bell; badge?: number; dot?: boolean }[] = [
    { key: "home", label: "My Day", icon: Sun },
    { key: "activity", label: "Activity", icon: Bell, badge: unreadAlerts },
    { key: "chat", label: "Chat", icon: MessageSquare, badge: unreadChats },
    { key: "assistant", label: "Saathi", icon: Sparkles },
    { key: "tasks", label: "Tasks", icon: ListTodo, badge: openTasks, dot: true },
    ...(!guest ? [{ key: "quality" as const, label: "Quality", icon: Gavel, badge: openRecords, dot: true }] : []),
    { key: "decisions", label: "Decisions", icon: Workflow },
    ...(!guest ? [{ key: "live" as const, label: "Live", icon: Radar }] : []),
    // Connected apps: shown only for services this person has connected
    ...(connected.includes("gmail") ? [{ key: "gmail" as const, label: "Gmail", icon: Mail, badge: emailPromises, dot: true }] : []),
    ...(connected.includes("calendar") ? [{ key: "calendar" as const, label: "Calendar", icon: CalendarDays }] : []),
    ...(connected.includes("drive") ? [{ key: "drive" as const, label: "Drive", icon: DriveIcon as typeof Bell }] : []),
    { key: "insights", label: "Insights", icon: BarChart3 },
    ...(admin ? [{ key: "admin" as const, label: "Admin", icon: ShieldCheck }] : []),
  ];
  // Phones: five most-used destinations; Insights and Admin are in the profile menu.
  const items = mobile ? all.filter((i) => !["insights", "admin", "gmail", "calendar", "drive", "quality", "decisions", "live"].includes(i.key)) : all;
  return (
    <nav
      aria-label="Apps"
      className={clsx(
        mobile
          ? "flex border-t border-border bg-surface pb-[env(safe-area-inset-bottom)] lg:hidden"
          : "hidden w-[68px] shrink-0 flex-col items-center gap-1 bg-rail py-2 lg:flex",
      )}
    >
      {items.map((it) => {
        const on = active === it.key;
        return (
          <button
            key={it.key}
            onClick={() => onSelect(it.key)}
            aria-current={on ? "page" : undefined}
            className={clsx(
              "relative flex flex-col items-center justify-center gap-0.5 text-[10.5px] font-medium transition",
              mobile ? "h-14 flex-1" : "h-14 w-14 rounded-xl",
              mobile ? (on ? "text-brand" : "text-muted") : on ? "bg-white/12 text-white" : "text-white/60 hover:bg-white/6 hover:text-white",
            )}
          >
            {!mobile && on && <span className="absolute left-[-6px] top-3 bottom-3 w-[3px] rounded-r bg-saffron" aria-hidden />}
            <span className="relative">
              <it.icon size={20} strokeWidth={on ? 2.4 : 1.9} className={clsx(it.key === "assistant" && (mobile ? on && "text-saffron-ink" : "text-saffron"))} aria-hidden />
              {!!it.badge && (
                <span
                  className={clsx(
                    "absolute -right-2.5 -top-1.5 min-w-[17px] rounded-full px-1 text-center text-[10px] font-bold leading-[17px] text-white",
                    it.dot ? "bg-[#5b6573]" : "bg-rust",
                    !mobile && "ring-2 ring-rail",
                  )}
                >
                  {it.badge > 99 ? "99+" : it.badge}
                </span>
              )}
            </span>
            {it.label}
          </button>
        );
      })}
    </nav>
  );
}

type Filter = "all" | "unread" | "channels" | "chats";

function useCollapsed() {
  // The workspace only renders client-side (after auth), so reading storage during the first render is safe.
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>(() => {
    try {
      return JSON.parse(localStorage.getItem("saathi.sections") || "{}");
    } catch {
      return {};
    }
  });
  const toggle = (k: string) =>
    setCollapsed((c) => {
      const next = { ...c, [k]: !c[k] };
      try {
        localStorage.setItem("saathi.sections", JSON.stringify(next));
      } catch {}
      return next;
    });
  return [collapsed, toggle] as const;
}

/** One list for chats and channels (the Teams "Chat and channels" pattern), with Favorites on top. */
export function ChatList({ chatList, onNavigate }: { chatList: Chat[]; onNavigate?: () => void }) {
  const { uid, users, view, open, dialog, toast, settings, account } = useWs();
  const guest = account.org_role === "guest";
  const [filter, setFilter] = useState<Filter>("all");
  const [collapsed, toggle] = useCollapsed();

  const go = (v: View) => {
    open(v);
    onNavigate?.();
  };

  const { favorites, channels, chats } = useMemo(() => {
    const keep = (c: Chat) =>
      filter === "all" ||
      (filter === "unread" && isUnread(c, uid)) ||
      (filter === "channels" && c.type === "channel") ||
      (filter === "chats" && c.type !== "channel");
    const rows = chatList.filter(keep);
    const fav = rows.filter((c) => c.favorite_of?.includes(uid));
    const rest = rows.filter((c) => !c.favorite_of?.includes(uid));
    return { favorites: fav, channels: rest.filter((c) => c.type === "channel"), chats: rest.filter((c) => c.type !== "channel") };
  }, [chatList, filter, uid]);

  async function favorite(c: Chat, on: boolean) {
    try {
      await api(`/api/chats/${c.id}/favorite`, { json: { favorite: on } });
    } catch (e) {
      toast((e as Error).message);
    }
  }

  const row = (c: Chat) => {
    const title = chatTitle(c, uid, users);
    const active = view.kind === "chat" && view.chatId === c.id;
    const level = notifyLevel(c, settings);
    const unread = !active && isUnread(c, uid) && level !== "off";
    const fav = !!c.favorite_of?.includes(uid);
    const preview = c.type !== "dm" && c.last_sender ? `${c.last_sender.split(" ")[0]}: ${c.last_text}` : c.last_text;
    return (
      <li key={c.id} className="group relative">
        <button
          onClick={() => go({ kind: "chat", chatId: c.id })}
          aria-current={active ? "page" : undefined}
          className={clsx("flex w-full items-center gap-2.5 rounded-lg px-2 py-[7px] text-left transition", active ? "bg-surface shadow-[0_1px_2px_rgba(11,27,43,0.08)]" : "hover:bg-hover")}
        >
          <ChatIcon chat={c} title={title} size={32} />
          <span className="min-w-0 flex-1">
            <span className="flex items-baseline justify-between gap-2">
              <span className={clsx("flex min-w-0 items-center gap-1 text-[13.5px]", unread ? "font-bold text-ink" : "font-medium text-ink/90")}>
                <span className="truncate">{title}</span>
                {c.type === "channel" && c.visibility === "private" && <Lock size={11} className="shrink-0 text-muted" aria-label="Private channel" />}
                {c.ai_excluded && <EyeOff size={11} className="shrink-0 text-muted" aria-label="Hidden from Saathi" />}
                {level === "off" && <BellOff size={11} className="shrink-0 text-muted" aria-label="Muted" />}
              </span>
              <span className={clsx("shrink-0 text-[11px] group-hover:invisible", unread ? "font-semibold text-brand" : "text-muted")}>{timeShort(c.last_ts)}</span>
            </span>
            <span className={clsx("block truncate text-xs", unread ? "font-medium text-ink/85" : "text-muted")}>{preview || (c.type === "channel" ? c.description || "No messages yet" : "No messages yet")}</span>
          </span>
          {unread && <span className="h-2 w-2 shrink-0 rounded-full bg-brand" aria-label="Unread" />}
        </button>
        <button
          onClick={() => favorite(c, !fav)}
          className={clsx("absolute right-1.5 top-1.5 flex h-7 w-7 items-center justify-center rounded-md transition hover:bg-border", fav ? "text-saffron" : "text-muted opacity-0 focus:opacity-100 group-hover:opacity-100")}
          aria-label={fav ? `Remove ${title} from favorites` : `Add ${title} to favorites`}
          title={fav ? "Remove from favorites" : "Add to favorites"}
        >
          <Star size={13} fill={fav ? "currentColor" : "none"} />
        </button>
      </li>
    );
  };

  const section = (key: string, label: string, list: Chat[], footer?: React.ReactNode) =>
    (list.length > 0 || footer) && (
      <section key={key} className="mt-2" aria-label={label}>
        <button
          onClick={() => toggle(key)}
          aria-expanded={!collapsed[key]}
          className="flex w-full items-center gap-1 rounded-md px-2 py-1 text-xs font-semibold text-muted hover:text-ink"
        >
          <ChevronDown size={14} className={clsx("transition", collapsed[key] && "-rotate-90")} aria-hidden />
          {label}
          <span className="ml-auto font-normal">{list.length || ""}</span>
        </button>
        {!collapsed[key] && (
          <ul className="mt-0.5 space-y-px">
            {list.map(row)}
            {footer}
          </ul>
        )}
      </section>
    );

  const assistantActive = view.kind === "assistant";

  return (
    <aside className="flex h-full w-full flex-col border-r border-border bg-canvas" aria-label="Chats and channels">
      <div className="flex items-center gap-1 px-4 pb-2 pt-3">
        <h2 className="flex-1 text-lg font-bold tracking-tight">Chat</h2>
        {!guest && (
          <button onClick={() => dialog("browse-channels")} className="flex h-8 w-8 items-center justify-center rounded-lg text-muted hover:bg-hover hover:text-ink" aria-label="Browse channels" title="Browse channels">
            <Compass size={17} />
          </button>
        )}
        <Menu
          label="New"
          align="right"
          className="flex h-8 items-center gap-1 rounded-lg bg-brand px-2.5 text-xs font-semibold text-white transition hover:bg-brand-strong"
          trigger={
            <>
              <MessageSquarePlus size={15} aria-hidden /> New
            </>
          }
          items={
            guest
              ? [{ label: "New chat", icon: MessageSquare, onSelect: () => dialog("new-chat") }]
              : [
                  { label: "New chat", icon: MessageSquare, onSelect: () => dialog("new-chat") },
                  ...(account.org.settings.channel_creation === "admins" && account.org_role === "member"
                    ? []
                    : [{ label: "Create a channel", icon: Hash, onSelect: () => dialog("new-channel") }]),
                  "sep" as const,
                  { label: "Browse channels", icon: Compass, onSelect: () => dialog("browse-channels") },
                ]
          }
        />
      </div>

      <div className="flex gap-1.5 px-4 pb-2" role="group" aria-label="Filter">
        {(["all", "unread", "channels", "chats"] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            aria-pressed={filter === f}
            className={clsx("h-7 rounded-full border px-2.5 text-xs font-medium capitalize transition", filter === f ? "border-brand bg-brand-soft text-brand" : "border-border bg-surface text-muted hover:text-ink")}
          >
            {f}
          </button>
        ))}
      </div>

      <nav className="scrollbar-thin flex-1 overflow-y-auto px-2 pb-3" aria-label="Conversations">
        <button
          onClick={() => go({ kind: "assistant" })}
          aria-current={assistantActive ? "page" : undefined}
          className={clsx("flex w-full items-center gap-2.5 rounded-lg px-2 py-[7px] text-left transition", assistantActive ? "bg-surface shadow-[0_1px_2px_rgba(11,27,43,0.08)]" : "hover:bg-hover")}
        >
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-saffron to-[#d4691a] text-white" aria-hidden>
            <Sparkles size={16} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[13.5px] font-semibold">Saathi</span>
            <span className="block truncate text-xs text-muted">Your AI colleague · search, catch up, remind</span>
          </span>
        </button>

        {section("favorites", "Favorites", favorites)}
        {section(
          "channels",
          "Channels",
          channels,
          !guest && (filter === "all" || filter === "channels") ? (
            <li>
              <button onClick={() => dialog("browse-channels")} className="flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left text-[13px] text-muted hover:bg-hover hover:text-ink">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg border border-dashed border-[#c5cad3]" aria-hidden>
                  <Compass size={15} />
                </span>
                Browse or create channels
              </button>
            </li>
          ) : undefined,
        )}
        {section(
          "chats",
          "Chats",
          chats,
          filter === "all" || filter === "chats" ? (
            <li>
              <button onClick={() => dialog("new-chat")} className="flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left text-[13px] text-muted hover:bg-hover hover:text-ink">
                <span className="flex h-8 w-8 items-center justify-center rounded-full border border-dashed border-[#c5cad3]" aria-hidden>
                  <UserPlus size={15} />
                </span>
                Start a new chat
              </button>
            </li>
          ) : undefined,
        )}
        {filter === "unread" && !favorites.length && !channels.length && !chats.length && <p className="px-3 py-10 text-center text-sm text-muted">You&rsquo;re all caught up.</p>}
      </nav>
    </aside>
  );
}
