"use client";

import clsx from "clsx";
import {
  ArrowLeft,
  Check,
  Copy,
  Eye,
  EyeOff,
  FileText,
  Gavel,
  Handshake,
  Info,
  Bell,
  BellOff,
  AtSign,
  ListPlus,
  Loader2,
  LogOut,
  MoreHorizontal,
  Paperclip,
  ScanText,
  SendHorizontal,
  Smile,
  Sparkles,
  Star,
  Trash2,
  UserPlus,
  Users,
  Wand2,
  X,
} from "lucide-react";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { api, openFile } from "@/lib/api";
import { useMessages } from "@/lib/hooks";
import { DOC_LABEL, REACTION_EMOJI, chatTitle, clock, dayLabel, dueLabel, isUnread, timeShort } from "@/lib/format";
import type { Chat, Message, Reaction, UserProfile } from "@/lib/types";
import { Avatar, ChatIcon, Menu, RoleBadge, Switch, UserAvatar, type MenuItem } from "./bits";
import { useWs } from "./ctx";
import { Markdown } from "./Markdown";
import { notifyLevel } from "./Sidebar";

/** Highlights @Name tokens for people actually mentioned on the message (and @channel). */
function withMentions(text: string, mentions: string[] | undefined, users: Record<string, UserProfile>, me: string) {
  if (!mentions?.length) return text;
  const tags = mentions
    .map((m) => (m === "channel" ? { tag: "@channel", me: true } : users[m] ? { tag: `@${users[m].name}`, me: m === me } : null))
    .filter(Boolean) as { tag: string; me: boolean }[];
  if (!tags.length) return text;
  const re = new RegExp(`(${tags.map((t) => t.tag.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).sort((a, b) => b.length - a.length).join("|")})`, "g");
  return text.split(re).map((part, i) => {
    const t = tags.find((x) => x.tag === part);
    return t ? (
      <span key={i} className={clsx("rounded px-0.5 font-semibold", t.me ? "bg-saffron-soft text-saffron-ink" : "text-brand")}>
        {part}
      </span>
    ) : (
      part
    );
  });
}

type Tab = "messages" | "decisions" | "files";
type Panel = null | "about" | "members";

const COMPOSER_EMOJI = ["👍", "🙏", "✅", "👌", "🎉", "😄", "🙂", "🤔", "👀", "🔥", "⚠️", "📌", "📎", "🚚", "🏭", "🔧", "📐", "🧪", "⏰", "❤️"];
const GROUP_GAP_MS = 5 * 60 * 1000;

export function ChatView({ chatId, focusMsg }: { chatId: string; focusMsg?: string }) {
  const { uid, users, chats, toast, open, showList, settings } = useWs();
  const chat = chats[chatId];
  const messages = useMessages(chatId);
  const [tab, setTab] = useState<Tab>("messages");
  const [panel, setPanel] = useState<Panel>(null);
  const [summary, setSummary] = useState<string | null>(null);
  const [summarizing, setSummarizing] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const [flash, setFlash] = useState<string | undefined>(focusMsg);

  const decisions = useMemo(() => messages.filter((m) => m.decision), [messages]);
  const files = useMemo(() => messages.filter((m) => m.file), [messages]);

  useEffect(() => {
    if (focusMsg) {
      setTab("messages");
      setFlash(focusMsg);
    }
  }, [focusMsg]);

  useEffect(() => {
    if (tab !== "messages") return;
    if (flash) {
      const el = document.getElementById(`m-${flash}`);
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
        const t = setTimeout(() => setFlash(undefined), 2600);
        return () => clearTimeout(t);
      }
    } else bottomRef.current?.scrollIntoView();
  }, [flash, messages.length, tab]);

  // Mark the conversation read while it is open.
  const lastTs = chat?.last_ts?.toMillis();
  useEffect(() => {
    if (chat && isUnread(chat, uid)) api(`/api/chats/${chatId}/read`, { method: "POST" }).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chatId, lastTs]);

  async function summarize() {
    setSummarizing(true);
    try {
      const r = await api<{ summary: string }>(`/api/chats/${chatId}/summarize`, { method: "POST" });
      setSummary(r.summary);
    } catch (e) {
      toast((e as Error).message);
    } finally {
      setSummarizing(false);
    }
  }

  async function toggleAi(visible: boolean) {
    try {
      await api(`/api/chats/${chatId}/ai-exclude`, { json: { excluded: !visible } });
      toast(visible ? "Saathi can search this conversation again." : "This conversation is now hidden from Saathi's search.");
    } catch (e) {
      toast((e as Error).message);
    }
  }

  async function setLevel(level: "all" | "mentions" | "off") {
    try {
      await api("/api/me/settings", { json: { chat_id: chatId, level } });
      toast(level === "off" ? "Muted. Mentions still reach you." : level === "mentions" ? "You'll be notified for @mentions only." : "You'll be notified of every message.");
    } catch (e) {
      toast((e as Error).message);
    }
  }

  async function favorite(on: boolean) {
    try {
      await api(`/api/chats/${chatId}/favorite`, { json: { favorite: on } });
    } catch (e) {
      toast((e as Error).message);
    }
  }

  async function leave() {
    if (!confirm(`Leave ${chatTitle(chat, uid, users)}? You'll lose access to its messages and files.`)) return;
    try {
      await api(`/api/chats/${chatId}/members/${uid}`, { method: "DELETE" });
      toast("You left the conversation.");
      open({ kind: "assistant" });
    } catch (e) {
      toast((e as Error).message);
    }
  }

  if (!chat)
    return (
      <div className="flex flex-1 items-center justify-center text-sm text-muted" role="status">
        <Loader2 size={16} className="mr-2 animate-spin" /> Opening conversation…
      </div>
    );

  const title = chatTitle(chat, uid, users);
  const isChannel = chat.type === "channel";
  const isOwner = !!chat.owners?.includes(uid);
  const fav = !!chat.favorite_of?.includes(uid);
  const kindLabel = isChannel ? "channel" : chat.type === "group" ? "group chat" : "chat";
  const subtitle = isChannel
    ? [chat.visibility === "private" ? "Private channel" : "Public channel", `${chat.members.length} members`, chat.description].filter(Boolean).join(" · ")
    : chat.type === "group"
      ? chat.members.map((m) => users[m]?.name?.split(" ")[0]).filter(Boolean).join(", ")
      : users[chat.members.find((m) => m !== uid) ?? ""]?.role ?? "";

  const tabs = (
    <div role="tablist" aria-label="Conversation sections" className="flex gap-1">
      {(
        [
          ["messages", isChannel ? "Posts" : "Chat", 0],
          ["decisions", "Decisions", decisions.length],
          ["files", "Files", files.length],
        ] as const
      ).map(([k, label, n]) => (
        <button
          key={k}
          role="tab"
          aria-selected={tab === k}
          onClick={() => setTab(k)}
          className={clsx("relative h-12 px-2.5 text-sm font-medium transition", tab === k ? "text-ink" : "text-muted hover:text-ink")}
        >
          {label}
          {n > 0 && <span className="ml-1.5 rounded-full bg-canvas px-1.5 py-px text-[11px] text-muted">{n}</span>}
          {tab === k && <span className="absolute inset-x-2 bottom-0 h-[3px] rounded-t bg-brand" aria-hidden />}
        </button>
      ))}
    </div>
  );

  return (
    <div className="flex min-h-0 flex-1">
      <section className="flex min-h-0 min-w-0 flex-1 flex-col" aria-label={`${kindLabel}: ${title}`}>
        <header className="shrink-0 border-b border-border bg-surface">
          <div className="flex h-14 items-center gap-2 px-2 lg:h-12 lg:px-5">
            <button onClick={showList} className="flex h-10 w-10 items-center justify-center rounded-lg text-muted hover:bg-hover lg:hidden" aria-label="Back to chats">
              <ArrowLeft size={19} />
            </button>
            <button onClick={() => setPanel(panel === "about" ? null : "about")} className="flex min-w-0 items-center gap-2.5 rounded-lg py-1 pr-2 text-left hover:bg-hover lg:pl-1" title={`About this ${kindLabel}`}>
              <ChatIcon chat={chat} title={title} size={30} />
              <span className="min-w-0">
                <h1 className="truncate text-[15px] font-bold leading-tight">{title}</h1>
                <p className="truncate text-xs text-muted lg:hidden">{subtitle}</p>
              </span>
            </button>
            <div className="ml-2 hidden lg:block">{tabs}</div>

            <div className="ml-auto flex items-center gap-1">
              {chat.ai_excluded && (
                <span className="hidden items-center gap-1 rounded-full bg-rust-soft px-2.5 py-1 text-xs font-medium text-rust md:flex" title="Saathi cannot search this conversation">
                  <EyeOff size={12} /> Hidden from AI
                </span>
              )}
              <button
                onClick={() => setPanel(panel === "members" ? null : "members")}
                className="flex h-9 items-center gap-1.5 rounded-lg px-2 text-sm text-muted hover:bg-hover hover:text-ink"
                aria-label={`${chat.members.length} members`}
                title="Members"
              >
                <span className="hidden -space-x-2 sm:flex">
                  {chat.members.slice(0, 3).map((m) => (
                    <span key={m} className="rounded-full ring-2 ring-surface">
                      <UserAvatar uid={m} size={24} dot={false} clickable={false} />
                    </span>
                  ))}
                </span>
                <Users size={16} className="sm:hidden" />
                <span className="font-medium">{chat.members.length}</span>
              </button>
              <button
                onClick={summarize}
                disabled={summarizing || !!chat.ai_excluded}
                className="flex h-9 items-center gap-1.5 rounded-lg border border-border px-3 text-[13px] font-semibold text-ink transition hover:border-saffron hover:bg-saffron-soft disabled:opacity-50"
                title={chat.ai_excluded ? "Hidden from AI" : "Summarize with Saathi"}
              >
                {summarizing ? <Loader2 size={15} className="animate-spin" /> : <Wand2 size={15} className="text-saffron-ink" />}
                <span className="hidden sm:inline">Summarize</span>
              </button>
              <Menu
                label="More options"
                className="flex h-9 w-9 items-center justify-center rounded-lg text-muted hover:bg-hover hover:text-ink"
                trigger={<MoreHorizontal size={18} />}
                items={[
                  { label: fav ? "Remove from favorites" : "Add to favorites", icon: Star, onSelect: () => favorite(!fav) },
                  "sep",
                  ...(["all", "mentions", "off"] as const).map((lvl) => ({
                    label: lvl === "all" ? "Notify: all messages" : lvl === "mentions" ? "Notify: @mentions only" : "Mute notifications",
                    icon: lvl === "all" ? Bell : lvl === "mentions" ? AtSign : BellOff,
                    hint: notifyLevel(chat, settings) === lvl ? "✓" : undefined,
                    onSelect: () => setLevel(lvl),
                  })),
                  "sep",
                  { label: `About this ${kindLabel}`, icon: Info, onSelect: () => setPanel("about") },
                  ...(chat.type !== "dm" ? [{ label: "Add people", icon: UserPlus, onSelect: () => setPanel("members") }] : []),
                  { label: chat.ai_excluded ? "Make visible to Saathi" : "Hide from Saathi", icon: chat.ai_excluded ? Eye : EyeOff, onSelect: () => toggleAi(!!chat.ai_excluded) },
                  ...(chat.type !== "dm" ? (["sep", { label: `Leave ${kindLabel}`, icon: LogOut, danger: true, onSelect: leave }] satisfies MenuItem[]) : []),
                ]}
              />
            </div>
          </div>
          <div className="border-t border-border px-2 lg:hidden">{tabs}</div>
        </header>

        {summary && (
          <div className="mx-4 mt-3 rounded-xl border border-saffron/40 bg-saffron-soft/50 p-4 text-sm lg:mx-6" role="region" aria-label="Conversation summary">
            <div className="mb-1 flex items-center justify-between">
              <span className="flex items-center gap-1.5 text-xs font-semibold text-saffron-ink">
                <Sparkles size={13} /> Summary by Saathi
              </span>
              <button onClick={() => setSummary(null)} aria-label="Close summary" className="flex h-8 w-8 items-center justify-center rounded-md text-muted hover:bg-surface">
                <X size={14} />
              </button>
            </div>
            <Markdown text={summary} />
          </div>
        )}

        {tab === "messages" && (
          <div className="scrollbar-thin flex-1 overflow-y-auto px-2 py-4 lg:px-5">
            <Welcome chat={chat} title={title} onAddPeople={() => setPanel("members")} empty={!messages.some((m) => !m.system)} />
            <MessageList messages={messages} chat={chat} title={title} flash={flash} />
            <div ref={bottomRef} />
          </div>
        )}

        {tab === "decisions" && (
          <div className="scrollbar-thin flex-1 overflow-y-auto px-4 py-5 lg:px-8">
            {decisions.length === 0 ? (
              <Empty icon={Gavel} text="No decisions recorded yet. When someone writes “Final: …” or “approved”, Saathi logs it here." />
            ) : (
              <ol className="relative ml-3 max-w-3xl border-l-2 border-border">
                {[...decisions].reverse().map((m) => (
                  <li key={m.id} className="relative mb-5 pl-6">
                    <span className="absolute -left-[9px] top-1 h-4 w-4 rounded-full border-2 border-surface bg-moss" aria-hidden />
                    <p className="text-xs text-muted">
                      {dayLabel(m.ts)} · {m.sender_name}
                    </p>
                    <p className="mt-1 font-medium">{m.decision}</p>
                    <button
                      onClick={() => {
                        setFlash(m.id);
                        setTab("messages");
                      }}
                      className="mt-1 text-xs font-medium text-brand hover:underline"
                    >
                      View in conversation
                    </button>
                  </li>
                ))}
              </ol>
            )}
          </div>
        )}

        {tab === "files" && (
          <div className="scrollbar-thin flex-1 overflow-y-auto px-4 py-5 lg:px-8">
            {files.length === 0 ? (
              <Empty icon={FileText} text="No files shared here yet. Drop a PDF or image and Saathi will read it." />
            ) : (
              <div className="grid gap-3 xl:grid-cols-2">
                {[...files].reverse().map((m) => (
                  <div key={m.id}>
                    <p className="mb-1 text-xs text-muted">
                      {m.sender_name} · {timeShort(m.ts)}
                    </p>
                    <FileCard file={m.file!} />
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        <Composer chat={chat} title={title} />
      </section>

      {panel && (
        <>
          <button className="fixed inset-0 z-40 bg-ink/40 xl:hidden" onClick={() => setPanel(null)} aria-label="Close details" />
          <DetailsPanel chat={chat} title={title} tab={panel} setTab={setPanel} isOwner={isOwner} onToggleAi={toggleAi} onLeave={leave} />
        </>
      )}
    </div>
  );
}

function Welcome({ chat, title, empty, onAddPeople }: { chat: Chat; title: string; empty: boolean; onAddPeople: () => void }) {
  const { open, users } = useWs();
  if (!empty) return null;
  return (
    <div className="mx-auto my-8 max-w-md rounded-2xl border border-border bg-surface p-6 text-center">
      <span className="inline-flex">
        <ChatIcon chat={chat} title={title} size={52} />
      </span>
      <h2 className="mt-3 text-lg font-bold">{chat.type === "channel" ? `Welcome to ${title}` : `This is the start of your chat with ${title}`}</h2>
      <p className="mt-1 text-sm text-muted">
        {chat.type === "channel"
          ? chat.description || `Created by ${users[chat.created_by ?? ""]?.name ?? "a colleague"}. Share updates, drawings and decisions here.`
          : "Messages, files and promises shared here are searchable by Saathi for the people in this chat."}
      </p>
      <div className="mt-4 flex justify-center gap-2">
        {chat.type !== "dm" && (
          <button onClick={onAddPeople} className="flex h-9 items-center gap-1.5 rounded-lg bg-brand px-3 text-[13px] font-semibold text-white hover:bg-brand-strong">
            <UserPlus size={15} /> Add people
          </button>
        )}
        <button onClick={() => open({ kind: "assistant" })} className="flex h-9 items-center gap-1.5 rounded-lg border border-border px-3 text-[13px] font-semibold hover:bg-hover">
          <Sparkles size={15} className="text-saffron-ink" /> Ask Saathi
        </button>
      </div>
    </div>
  );
}

function MessageList({ messages, chat, title, flash }: { messages: Message[]; chat: Chat; title: string; flash?: string }) {
  const { uid } = useWs();
  let lastDay = "";
  return (
    <div className="space-y-px">
      {messages.map((m, i) => {
        const day = dayLabel(m.ts);
        const showDay = day !== lastDay;
        lastDay = day;
        const prev = messages[i - 1];
        const grouped =
          !showDay && !!prev && !prev.system && !m.system && prev.sender === m.sender && (m.ts?.toMillis() ?? 0) - (prev.ts?.toMillis() ?? 0) < GROUP_GAP_MS;
        return (
          <div key={m.id}>
            {showDay && (
              <div className="my-4 flex items-center gap-3 text-xs font-medium text-muted" role="separator">
                <div className="h-px flex-1 bg-border" />
                <span className="rounded-full border border-border bg-surface px-3 py-0.5">{day}</span>
                <div className="h-px flex-1 bg-border" />
              </div>
            )}
            {m.system ? (
              <p className="my-2 text-center text-xs text-muted">
                {m.text} · {clock(m.ts)}
              </p>
            ) : (
              <MessageRow m={m} mine={m.sender === uid} grouped={grouped} bubbles={chat.type !== "channel"} highlight={flash === m.id} chatId={chat.id} chatName={title} />
            )}
          </div>
        );
      })}
    </div>
  );
}

function MessageRow({ m, mine, grouped, bubbles, highlight, chatId, chatName }: { m: Message; mine: boolean; grouped: boolean; bubbles: boolean; highlight: boolean; chatId: string; chatName: string }) {
  const { uid, users, showProfile } = useWs();
  const right = bubbles && mine;
  const body = (
    <>
      {m.text && <p className="whitespace-pre-wrap break-words text-[14.5px] leading-relaxed text-ink">{withMentions(m.text, m.mentions, users, uid)}</p>}
      {m.file && <FileCard file={m.file} />}
      {m.decision && (
        <div className="mt-2 flex items-start gap-1.5 rounded-lg border border-moss/25 bg-moss-soft px-2.5 py-1.5 text-xs text-moss">
          <Gavel size={13} className="mt-px shrink-0" aria-hidden />
          <span>
            <b>Decision logged:</b> {m.decision}
          </span>
        </div>
      )}
      {m.promise && <PromiseChip m={m} chatId={chatId} />}
    </>
  );

  return (
    <div
      id={`m-${m.id}`}
      className={clsx(
        "group relative flex gap-2.5 rounded-xl px-2 transition-colors duration-500",
        grouped ? "py-0.5" : "pt-2.5 pb-0.5",
        right && "flex-row-reverse",
        !bubbles && "hover:bg-canvas/70",
        highlight && "bg-saffron-soft ring-2 ring-saffron/60",
        !highlight && !right && (m.mentions?.includes(uid) || m.mentions?.includes("channel")) && "bg-saffron-soft/40 shadow-[inset_3px_0_0_var(--color-saffron)]",
      )}
    >
      {!right && (grouped ? <span className="w-9 shrink-0" /> : <UserAvatar uid={m.sender} size={36} />)}
      <div className={clsx("flex min-w-0 flex-col", right ? "items-end" : "items-start", bubbles ? "max-w-[min(42rem,85%)]" : "flex-1")}>
        {!grouped && (
          <div className={clsx("mb-0.5 flex items-baseline gap-2 text-xs", right && "flex-row-reverse")}>
            {!right && (
              <button onClick={() => showProfile(m.sender)} className="text-[13px] font-semibold text-ink hover:underline">
                {m.sender_name}
              </button>
            )}
            {!right && <RoleBadge role={users[m.sender]?.org_role === "guest" ? "guest" : undefined} />}
            <span className="text-muted">{clock(m.ts)}</span>
          </div>
        )}
        {bubbles ? (
          <div className={clsx("w-fit max-w-full rounded-2xl px-3.5 py-2", right ? "rounded-tr-md bg-brand-soft" : "rounded-tl-md bg-canvas", grouped && (right ? "rounded-tr-2xl" : "rounded-tl-2xl"))}>{body}</div>
        ) : (
          <div className="w-full max-w-3xl">{body}</div>
        )}
        <Reactions m={m} chatId={chatId} />
      </div>
      <MessageActions m={m} chatId={chatId} chatName={chatName} align={right ? "left" : "right"} />
    </div>
  );
}

function MessageActions({ m, chatId, chatName, align }: { m: Message; chatId: string; chatName: string; align: "left" | "right" }) {
  const { open, toast, newTask, uid } = useWs();
  async function react(r: Reaction) {
    try {
      await api(`/api/chats/${chatId}/messages/${m.id}/react`, { json: { reaction: r } });
    } catch (e) {
      toast((e as Error).message);
    }
  }
  function addTask() {
    const text = m.text || m.file?.name || "message";
    newTask({ title: (m.sender === uid ? text : `Follow up: ${m.sender_name.split(" ")[0]} — ${text}`).slice(0, 200), sourceRef: `msg:${chatId}/${m.id}` });
  }
  const btn = "flex h-8 w-8 items-center justify-center rounded-md text-muted transition hover:bg-hover hover:text-ink";
  return (
    <div
      className={clsx(
        "absolute -top-3 z-10 hidden items-center gap-0.5 rounded-lg border border-border bg-surface p-0.5 shadow-md group-focus-within:flex group-hover:flex",
        align === "right" ? "right-3" : "left-3",
      )}
      role="toolbar"
      aria-label="Message actions"
    >
      {(Object.keys(REACTION_EMOJI) as Reaction[]).slice(0, 5).map((r) => (
        <button key={r} onClick={() => react(r)} className={clsx(btn, "text-base")} aria-label={`React ${REACTION_EMOJI[r]}`} title={`React ${REACTION_EMOJI[r]}`}>
          {REACTION_EMOJI[r]}
        </button>
      ))}
      <span className="mx-0.5 h-5 w-px bg-border" aria-hidden />
      <button onClick={addTask} className={btn} aria-label="Create task from message" title="Create task…">
        <ListPlus size={15} />
      </button>
      <button
        onClick={() => open({ kind: "assistant", prompt: `Give me the context and any follow-ups for this message from ${m.sender_name} in ${chatName}: "${(m.text || m.file?.name || "").slice(0, 300)}"` })}
        className={btn}
        aria-label="Ask Saathi about this message"
        title="Ask Saathi about this"
      >
        <Sparkles size={15} className="text-saffron-ink" />
      </button>
      {m.text && (
        <button
          onClick={() => {
            navigator.clipboard?.writeText(m.text).then(() => toast("Copied."), () => toast("Couldn't copy."));
          }}
          className={btn}
          aria-label="Copy text"
          title="Copy text"
        >
          <Copy size={14} />
        </button>
      )}
    </div>
  );
}

function Reactions({ m, chatId }: { m: Message; chatId: string }) {
  const { uid, users, toast } = useWs();
  const entries = Object.entries(m.reactions ?? {}).filter(([, who]) => who && who.length) as [Reaction, string[]][];
  if (!entries.length) return null;
  return (
    <div className="mt-1 flex flex-wrap gap-1">
      {entries.map(([r, who]) => {
        const mineOn = who.includes(uid);
        return (
          <button
            key={r}
            onClick={() => api(`/api/chats/${chatId}/messages/${m.id}/react`, { json: { reaction: r } }).catch((e) => toast((e as Error).message))}
            title={who.map((w) => users[w]?.name ?? "Someone").join(", ")}
            aria-pressed={mineOn}
            className={clsx("flex h-6 items-center gap-1 rounded-full border px-2 text-xs transition", mineOn ? "border-brand/40 bg-brand-soft text-brand" : "border-border bg-surface text-muted hover:border-[#c5cad3]")}
          >
            <span>{REACTION_EMOJI[r]}</span>
            <span className="font-semibold">{who.length}</span>
          </button>
        );
      })}
      <span className="sr-only">Reactions</span>
    </div>
  );
}

function Composer({ chat, title }: { chat: Chat; title: string }) {
  const { toast, users, uid, account } = useWs();
  const chatId = chat.id;
  const isChannel = chat.type === "channel";
  const [text, setText] = useState("");
  const [mentioned, setMentioned] = useState<Record<string, string>>({}); // uid -> inserted "@Name"
  const [query, setQuery] = useState<string | null>(null);
  const [sel, setSel] = useState(0);
  const canChannel = isChannel && (chat.owners?.includes(uid) || account.org_role === "owner" || account.org_role === "admin");
  const candidates = query === null ? [] : [
    ...(canChannel && "channel".startsWith(query.toLowerCase()) ? [{ id: "channel", name: "channel", role: "Notify everyone in this channel" }] : []),
    ...chat.members
      .filter((m) => m !== uid && users[m])
      .map((m) => ({ id: m, name: users[m].name, role: users[m].role }))
      .filter((u) => u.name.toLowerCase().includes(query.toLowerCase())),
  ].slice(0, 6);

  function onChange(v: string, caret: number) {
    setText(v);
    const m = /(^|\s)@([\w.]*)$/.exec(v.slice(0, caret));
    setQuery(m ? m[2] : null);
    setSel(0);
  }

  function pick(c: { id: string; name: string }) {
    const el = inputRef.current;
    const caret = el?.selectionStart ?? text.length;
    const before = text.slice(0, caret).replace(/@([\w.]*)$/, `@${c.name} `);
    const next = before + text.slice(caret);
    setText(next);
    setMentioned((m) => ({ ...m, [c.id]: `@${c.name}` }));
    setQuery(null);
    caretRef.current = before.length; // placed synchronously after React writes the new value (see layout effect)
  }

  const caretRef = useRef<number | null>(null);
  useLayoutEffect(() => {
    const el = inputRef.current;
    if (el && caretRef.current !== null) {
      el.focus();
      el.setSelectionRange(caretRef.current, caretRef.current);
      caretRef.current = null;
    }
  }, [text]);
  const [sending, setSending] = useState(false);
  const [emoji, setEmoji] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, [text]);

  async function send() {
    const body = text.trim();
    if (!body || sending) return;
    setSending(true);
    try {
      const mentions = Object.entries(mentioned)
        .filter(([, tag]) => body.includes(tag))
        .map(([id]) => id);
      await api(`/api/chats/${chatId}/messages`, { json: { text: body, mentions } });
      setText("");
      setMentioned({});
    } catch (e) {
      toast(`Message not sent: ${(e as Error).message}. Try again.`);
    } finally {
      setSending(false);
      inputRef.current?.focus();
    }
  }

  async function upload(file: File) {
    if (file.size > 20 * 1024 * 1024) return toast("That file is over 20 MB. Share a smaller PDF or image.");
    const form = new FormData();
    form.append("file", file);
    form.append("text", text.trim());
    setSending(true);
    try {
      await api(`/api/chats/${chatId}/files`, { form });
      setText("");
      toast("File shared. Saathi is reading it…");
    } catch (e) {
      toast(`Upload failed: ${(e as Error).message}`);
    } finally {
      setSending(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  return (
    <div className="shrink-0 px-3 pb-3 pt-1 lg:px-5">
      <div className="relative rounded-xl border border-border bg-surface shadow-[0_1px_2px_rgba(11,27,43,0.05)] transition focus-within:border-brand focus-within:ring-2 focus-within:ring-brand/15">
        <label htmlFor="composer" className="sr-only">
          Message {title}
        </label>
        <textarea
          id="composer"
          ref={inputRef}
          value={text}
          onChange={(e) => onChange(e.target.value, e.target.selectionStart ?? e.target.value.length)}
          onKeyDown={(e) => {
            if (candidates.length) {
              if (e.key === "ArrowDown" || e.key === "ArrowUp") {
                e.preventDefault();
                setSel((i) => (i + (e.key === "ArrowDown" ? 1 : candidates.length - 1)) % candidates.length);
                return;
              }
              if (e.key === "Enter" || e.key === "Tab") {
                e.preventDefault();
                pick(candidates[sel]);
                return;
              }
              if (e.key === "Escape") {
                setQuery(null);
                return;
              }
            }
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              send();
            }
          }}
          rows={1}
          placeholder={isChannel ? `Post in ${title} · type @ to mention` : `Type a message to ${title}`}
          className="block max-h-40 min-h-11 w-full resize-none bg-transparent px-3.5 pt-3 pb-1 text-[14.5px] outline-none"
          aria-autocomplete="list"
        />
        {candidates.length > 0 && (
          <ul role="listbox" aria-label="Mention someone" className="ws-pop absolute bottom-full left-2 z-30 mb-2 w-72 rounded-xl border border-border bg-surface p-1 shadow-xl">
            {candidates.map((c, i) => (
              <li key={c.id} role="option" aria-selected={i === sel}>
                <button
                  onMouseDown={(e) => {
                    e.preventDefault();
                    pick(c);
                  }}
                  onMouseEnter={() => setSel(i)}
                  className={clsx("flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left", i === sel && "bg-hover")}
                >
                  {c.id === "channel" ? (
                    <span className="flex h-7 w-7 items-center justify-center rounded-full bg-saffron-soft text-saffron-ink">
                      <AtSign size={14} />
                    </span>
                  ) : (
                    <UserAvatar uid={c.id} size={28} clickable={false} />
                  )}
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium">{c.id === "channel" ? "@channel" : c.name}</span>
                    <span className="block truncate text-[11px] text-muted">{c.role}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
        <div className="flex items-center gap-0.5 px-1.5 pb-1.5">
          <input ref={fileRef} type="file" className="hidden" accept=".pdf,image/*,.docx,.xlsx,.txt" onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
          <button onClick={() => fileRef.current?.click()} className="flex h-8 w-8 items-center justify-center rounded-md text-muted hover:bg-hover hover:text-ink" title="Attach a PDF or image" aria-label="Attach file">
            <Paperclip size={17} />
          </button>
          <div className="relative">
            <button onClick={() => setEmoji((v) => !v)} className="flex h-8 w-8 items-center justify-center rounded-md text-muted hover:bg-hover hover:text-ink" title="Emoji" aria-label="Insert emoji" aria-expanded={emoji}>
              <Smile size={17} />
            </button>
            {emoji && (
              <div className="ws-pop absolute bottom-full left-0 z-30 mb-2 grid w-64 grid-cols-8 gap-0.5 rounded-xl border border-border bg-surface p-2 shadow-xl" role="dialog" aria-label="Emoji">
                {COMPOSER_EMOJI.map((e) => (
                  <button
                    key={e}
                    onClick={() => {
                      setText((t) => t + e);
                      setEmoji(false);
                      inputRef.current?.focus();
                    }}
                    className="flex h-7 w-7 items-center justify-center rounded-md text-lg hover:bg-hover"
                  >
                    {e}
                  </button>
                ))}
              </div>
            )}
          </div>
          <span className="ml-2 hidden min-w-0 flex-1 truncate text-[11px] text-muted md:block">
            <Sparkles size={11} className="mr-1 inline text-saffron-ink" aria-hidden />
            Saathi spots promises and decisions as you type · Shift+Enter for a new line
          </span>
          <button
            onClick={send}
            disabled={sending || !text.trim()}
            className="ml-auto flex h-8 w-8 items-center justify-center rounded-lg bg-brand text-white transition hover:bg-brand-strong disabled:bg-transparent disabled:text-muted/50"
            aria-label="Send message"
          >
            {sending ? <Loader2 size={16} className="animate-spin" /> : <SendHorizontal size={17} />}
          </button>
        </div>
      </div>
    </div>
  );
}

function DetailsPanel({
  chat,
  title,
  tab,
  setTab,
  isOwner,
  onToggleAi,
  onLeave,
}: {
  chat: Chat;
  title: string;
  tab: "about" | "members";
  setTab: (p: Panel) => void;
  isOwner: boolean;
  onToggleAi: (visible: boolean) => void;
  onLeave: () => void;
}) {
  const { uid, users, toast, open } = useWs();
  const [name, setName] = useState(chat.name);
  const [desc, setDesc] = useState(chat.description ?? "");
  const [saving, setSaving] = useState(false);
  const [adding, setAdding] = useState(false);
  const [picked, setPicked] = useState<string[]>([]);
  const [q, setQ] = useState("");
  const isChannel = chat.type === "channel";
  const canEdit = chat.type === "group" || (isChannel && isOwner);
  const canRemove = chat.type === "group" || (isChannel && isOwner);
  const dirty = name.trim() !== chat.name || desc.trim() !== (chat.description ?? "");
  const candidates = Object.values(users).filter((u) => !chat.members.includes(u.id) && (!q || u.name.toLowerCase().includes(q.toLowerCase()) || u.role.toLowerCase().includes(q.toLowerCase())));
  const members = [...chat.members].sort((a, b) => Number(chat.owners?.includes(b)) - Number(chat.owners?.includes(a)) || (users[a]?.name ?? "").localeCompare(users[b]?.name ?? ""));

  async function save() {
    setSaving(true);
    try {
      await api(`/api/chats/${chat.id}`, { method: "PATCH", json: { name, description: desc } });
      toast("Saved.");
    } catch (e) {
      toast((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function add() {
    try {
      await api(`/api/chats/${chat.id}/members`, { json: { member_ids: picked } });
      setPicked([]);
      setAdding(false);
      toast(`Added ${picked.length} ${picked.length === 1 ? "person" : "people"}.`);
    } catch (e) {
      toast((e as Error).message);
    }
  }

  async function remove(m: string) {
    if (!confirm(`Remove ${users[m]?.name} from ${title}? They'll lose access to its history.`)) return;
    try {
      await api(`/api/chats/${chat.id}/members/${m}`, { method: "DELETE" });
    } catch (e) {
      toast((e as Error).message);
    }
  }

  async function del() {
    if (!confirm(`Delete ${title} for everyone? Its messages, files and search index are removed. This can't be undone.`)) return;
    try {
      await api(`/api/chats/${chat.id}`, { method: "DELETE" });
      toast("Channel deleted.");
      open({ kind: "assistant" });
    } catch (e) {
      toast((e as Error).message);
    }
  }

  return (
    <aside className="ws-pop fixed inset-y-0 right-0 z-50 flex w-[22rem] max-w-[92vw] flex-col border-l border-border bg-surface shadow-2xl xl:static xl:z-auto xl:shadow-none" aria-label="Details">
      <div className="flex h-12 shrink-0 items-center gap-1 border-b border-border px-2">
        {(["about", "members"] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)} aria-pressed={tab === t} className={clsx("relative h-12 px-3 text-sm font-medium capitalize", tab === t ? "text-ink" : "text-muted hover:text-ink")}>
            {t === "members" ? `Members (${chat.members.length})` : "About"}
            {tab === t && <span className="absolute inset-x-2 bottom-0 h-[3px] rounded-t bg-brand" aria-hidden />}
          </button>
        ))}
        <button onClick={() => setTab(null)} className="ml-auto flex h-9 w-9 items-center justify-center rounded-lg text-muted hover:bg-hover" aria-label="Close details">
          <X size={17} />
        </button>
      </div>

      {tab === "about" ? (
        <div className="scrollbar-thin flex-1 space-y-5 overflow-y-auto p-4">
          <div className="flex items-center gap-3">
            <ChatIcon chat={chat} title={title} size={44} />
            <div className="min-w-0">
              <div className="truncate font-bold">{title}</div>
              <div className="text-xs text-muted">
                {isChannel ? (chat.visibility === "private" ? "Private channel · invite only" : "Public channel · anyone can find and join") : chat.type === "group" ? "Group chat" : "Direct message"}
              </div>
            </div>
          </div>

          {chat.type !== "dm" && (
            <div className="space-y-3">
              <div>
                <label htmlFor="d-name" className="text-xs font-semibold text-muted">
                  Name
                </label>
                <input id="d-name" value={name} onChange={(e) => setName(e.target.value)} disabled={!canEdit} maxLength={60} className="mt-1 h-10 w-full rounded-lg border border-border bg-surface px-3 text-sm outline-none focus:border-brand disabled:bg-canvas" />
              </div>
              {isChannel && (
                <div>
                  <label htmlFor="d-desc" className="text-xs font-semibold text-muted">
                    Description
                  </label>
                  <textarea id="d-desc" value={desc} onChange={(e) => setDesc(e.target.value)} disabled={!canEdit} maxLength={300} rows={3} placeholder={canEdit ? "What is this channel for?" : "No description"} className="mt-1 w-full resize-none rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-brand disabled:bg-canvas" />
                </div>
              )}
              {canEdit && dirty && (
                <button onClick={save} disabled={saving || name.trim().length < 2} className="flex h-9 items-center gap-1.5 rounded-lg bg-brand px-3.5 text-[13px] font-semibold text-white hover:bg-brand-strong disabled:opacity-50">
                  {saving && <Loader2 size={14} className="animate-spin" />} Save changes
                </button>
              )}
              {isChannel && !isOwner && <p className="text-xs text-muted">Only channel owners can edit the name and description.</p>}
              {isChannel && chat.created_by && <p className="text-xs text-muted">Created by {users[chat.created_by]?.name ?? "a colleague"}</p>}
            </div>
          )}

          <div className="rounded-xl border border-border p-3.5">
            <div className="flex items-center gap-3">
              <Sparkles size={18} className="shrink-0 text-saffron-ink" aria-hidden />
              <div className="min-w-0 flex-1">
                <div className="text-sm font-semibold">Visible to Saathi</div>
                <div className="text-xs text-muted">Members can ask Saathi about messages and files here. Turn off to remove it from the AI index.</div>
              </div>
              <Switch on={!chat.ai_excluded} onChange={onToggleAi} label="Visible to Saathi" />
            </div>
          </div>

          {chat.type !== "dm" && (
            <div className="space-y-2 border-t border-border pt-4">
              <button onClick={onLeave} className="flex h-9 w-full items-center gap-2 rounded-lg px-2 text-sm font-medium text-rust hover:bg-rust-soft">
                <LogOut size={15} /> Leave {isChannel ? "channel" : "group"}
              </button>
              {isChannel && isOwner && (
                <button onClick={del} className="flex h-9 w-full items-center gap-2 rounded-lg px-2 text-sm font-medium text-rust hover:bg-rust-soft">
                  <Trash2 size={15} /> Delete channel
                </button>
              )}
            </div>
          )}
        </div>
      ) : (
        <div className="scrollbar-thin flex-1 overflow-y-auto p-3">
          {chat.type !== "dm" &&
            (adding ? (
              <div className="mb-3 rounded-xl border border-border p-2">
                <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search people" aria-label="Search people" className="h-9 w-full rounded-lg border border-border px-3 text-sm outline-none focus:border-brand" />
                <ul className="mt-1 max-h-56 overflow-y-auto">
                  {candidates.length === 0 && <li className="px-2 py-4 text-center text-xs text-muted">Everyone is already here.</li>}
                  {candidates.map((u) => {
                    const on = picked.includes(u.id);
                    return (
                      <li key={u.id}>
                        <button onClick={() => setPicked((p) => (on ? p.filter((x) => x !== u.id) : [...p, u.id]))} aria-pressed={on} className={clsx("flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left", on ? "bg-brand-soft" : "hover:bg-hover")}>
                          <Avatar name={u.name} size={28} />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm">{u.name}</span>
                            <span className="block truncate text-[11px] text-muted">{u.role}</span>
                          </span>
                          <span className={clsx("flex h-4 w-4 items-center justify-center rounded border", on ? "border-brand bg-brand text-white" : "border-[#c5cad3]")}>{on && <Check size={11} />}</span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
                <div className="mt-2 flex justify-end gap-2">
                  <button onClick={() => setAdding(false)} className="h-8 rounded-lg px-3 text-xs font-medium text-muted hover:bg-hover">
                    Cancel
                  </button>
                  <button onClick={add} disabled={!picked.length} className="h-8 rounded-lg bg-brand px-3 text-xs font-semibold text-white disabled:opacity-40">
                    Add {picked.length || ""}
                  </button>
                </div>
              </div>
            ) : (
              <button onClick={() => setAdding(true)} className="mb-2 flex h-10 w-full items-center gap-2.5 rounded-lg px-2 text-sm font-medium text-brand hover:bg-brand-soft">
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-soft">
                  <UserPlus size={15} />
                </span>
                Add people
              </button>
            ))}
          <ul>
            {members.map((m) => (
              <li key={m} className="group flex items-center gap-2.5 rounded-lg px-2 py-1.5 hover:bg-hover">
                <UserAvatar uid={m} size={32} />
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5 text-sm">
                    <span className="truncate">{users[m]?.name ?? "Unknown"}</span>
                    {m === uid && <span className="text-xs text-muted">(you)</span>}
                  </span>
                  <span className="block truncate text-[11px] text-muted">{users[m]?.role}</span>
                </span>
                {users[m]?.org_role === "guest" && <RoleBadge role="guest" />}
                {chat.owners?.includes(m) && <span className="rounded-full bg-canvas px-2 py-0.5 text-[10.5px] font-semibold text-muted">Owner</span>}
                {canRemove && m !== uid && (
                  <button onClick={() => remove(m)} className="flex h-7 w-7 items-center justify-center rounded-md text-muted opacity-0 hover:bg-border hover:text-rust focus:opacity-100 group-hover:opacity-100" aria-label={`Remove ${users[m]?.name}`}>
                    <X size={14} />
                  </button>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </aside>
  );
}

function Empty({ icon: Icon, text }: { icon: typeof Gavel; text: string }) {
  return (
    <div className="mx-auto mt-16 max-w-sm text-center">
      <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-canvas text-muted">
        <Icon size={20} />
      </span>
      <p className="mt-3 text-sm text-muted">{text}</p>
    </div>
  );
}

function FileCard({ file }: { file: NonNullable<Message["file"]> }) {
  const doc = file.doc;
  const processing = file.status === "processing";
  return (
    <button
      onClick={() => openFile(file.id)}
      className="mt-1.5 flex w-full max-w-md items-stretch overflow-hidden rounded-xl border border-border bg-surface text-left transition hover:border-[#c5cad3] hover:shadow-sm"
      aria-label={`Open ${file.name}`}
    >
      <span className="flex w-12 shrink-0 items-center justify-center bg-rust-soft text-rust">
        <FileText size={20} aria-hidden />
      </span>
      <span className="min-w-0 flex-1 p-3">
        <span className="block truncate text-sm font-medium">{file.name}</span>
        {processing ? (
          <span className="mt-1 flex items-center gap-1.5 text-xs text-muted">
            <Loader2 size={12} className="animate-spin" /> Saathi is reading this document…
          </span>
        ) : doc ? (
          <>
            <span className="mt-1.5 flex flex-wrap gap-1 font-mono text-[10.5px]">
              <span className="rounded bg-canvas px-1.5 py-0.5 uppercase text-ink/70">{DOC_LABEL[doc.doc_type ?? "other"] ?? doc.doc_type}</span>
              {doc.drawing_no && <span className="rounded bg-blueprint-soft px-1.5 py-0.5 text-blueprint">{doc.drawing_no}</span>}
              {doc.revision && <span className="rounded bg-saffron-soft px-1.5 py-0.5 text-saffron-ink">REV {doc.revision}</span>}
              {doc.approved_by && <span className="rounded bg-moss-soft px-1.5 py-0.5 text-moss">✓ {doc.approved_by}</span>}
              {file.ocr?.confidence != null && (
                <span className="inline-flex items-center gap-1 rounded bg-canvas px-1.5 py-0.5 text-ink/70" title={`${file.ocr.engine} · ${file.ocr.pages} page(s)`}>
                  <ScanText size={10} aria-hidden /> OCR {Math.round(file.ocr.confidence * 100)}%
                </span>
              )}
            </span>
            {doc.summary && <span className="mt-1.5 line-clamp-2 block text-xs leading-relaxed text-muted">{doc.summary}</span>}
          </>
        ) : null}
      </span>
    </button>
  );
}

function PromiseChip({ m, chatId }: { m: Message; chatId: string }) {
  const { uid, toast } = useWs();
  const [busy, setBusy] = useState(false);
  const p = m.promise!;
  if (p.dismissed_by?.includes(uid)) return null;
  const tracked = p.tracked_by?.includes(uid);

  async function act(action: "track" | "dismiss", assign = false) {
    setBusy(true);
    try {
      await api(`/api/chats/${chatId}/messages/${m.id}/${action}`, action === "track" ? { json: { assign } } : { method: "POST" });
      if (action === "track")
        toast(assign ? `Assigned to ${m.sender_name.split(" ")[0]}. You're watching it.` : "Added to your tasks. Saathi will nudge you when it's due.");
    } catch (e) {
      toast((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-2 flex max-w-md flex-wrap items-center gap-2 rounded-xl border border-plum/20 bg-plum-soft px-3 py-2 text-xs text-plum">
      <Handshake size={15} className="shrink-0" aria-hidden />
      <span className="min-w-0 flex-1 leading-snug">
        <b>Promise</b> · {p.committer} — {p.action}
        {p.due_at && <span className="font-mono"> · due {dueLabel(p.due_at)}</span>}
      </span>
      {tracked ? (
        <span className="flex items-center gap-1 font-semibold text-moss">
          <Check size={13} /> Tracking
        </span>
      ) : (
        <span className="flex gap-1">
          {m.sender !== uid && (
            <button onClick={() => act("track", true)} disabled={busy} className="h-7 rounded-lg border border-plum/40 bg-white/70 px-2.5 font-semibold text-plum transition hover:bg-white disabled:opacity-60" title={`Create a task assigned to ${m.sender_name}, with you watching`}>
              Assign to {m.sender_name.split(" ")[0]}
            </button>
          )}
          <button onClick={() => act("track")} disabled={busy} className="h-7 rounded-lg bg-plum px-3 font-semibold text-white transition hover:brightness-110 disabled:opacity-60">
            Track
          </button>
          <button onClick={() => act("dismiss")} disabled={busy} className="flex h-7 w-7 items-center justify-center rounded-lg hover:bg-white/60" aria-label="Dismiss promise suggestion">
            <X size={13} />
          </button>
        </span>
      )}
    </div>
  );
}

