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
  FontColor,
  Highlighter,
  Indent,
  Outdent,
  Redo,
  Undo,
  LinkSimple,
  ListBullets,
  ListNumbers,
  MessageSquareQuote,
  TextAa,
  Heading,
  TextBold,
  TextItalic,
  TextStrike,
  TextUnderline,
  X,
  AlertTriangle,
  MessagesSquare,
  RefreshCw,
  Reply,
} from "@/lib/icons";
import { useEffect, useLayoutEffect, useMemo, useReducer, useRef, useState } from "react";
import { api, openFile } from "@/lib/api";
import { useMessages } from "@/lib/hooks";
import { DOC_LABEL, REACTION_EMOJI, chatTitle, reactionEmoji, reactionKey, clock, dayLabel, dueLabel, isUnread, timeShort } from "@/lib/format";
import type { Chat, Message, Reaction, UserProfile } from "@/lib/types";
import { ChatText } from "./ChatText";
import { docToText, needsDoc, type DocNode } from "@/lib/richtext";
import { RichDoc } from "./RichDoc";
import { useEditor, EditorContent } from "@tiptap/react";
import type { Editor } from "@tiptap/core";
import "opengrammer/styles";
import { Grammar } from "@/lib/grammarExtension";
import { TextSelection } from "@tiptap/pm/state";
import StarterKit from "@tiptap/starter-kit";
import Highlight from "@tiptap/extension-highlight";
import Placeholder from "@tiptap/extension-placeholder";
import { Color, FontSize, TextStyle } from "@tiptap/extension-text-style";
import { EmojiPopover } from "./EmojiPopover";
import { Avatar, ChatIcon, Menu, RoleBadge, Switch, UserAvatar, type MenuItem } from "./bits";
import { useWs } from "./ctx";
import { Markdown } from "./Markdown";
import { MicButton } from "./Quality";
import { ReportBody } from "./Research";
import { SpecBadge } from "./SpecCheck";
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

const GROUP_GAP_MS = 5 * 60 * 1000;

export function ChatView({ chatId, focusMsg }: { chatId: string; focusMsg?: string }) {
  const { uid, users, chats, toast, open, showList, settings, reads } = useWs();
  const chat = chats[chatId];
  const messages = useMessages(chatId);
  const [tab, setTab] = useState<Tab>("messages");
  const [panel, setPanel] = useState<Panel>(null);
  const [summary, setSummary] = useState<string | null>(null);
  const [summarizing, setSummarizing] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const [flash, setFlash] = useState<string | undefined>(focusMsg);
  // Thread panel: an explicit choice, or (when opened from a link to a reply) the reply's parent. "" = closed by the user.
  const [threadSel, setThread] = useState<string | null>(null);
  const focusParent = messages.find((m) => m.id === focusMsg)?.parent_id ?? null;
  const threadId = threadSel === "" ? null : (threadSel ?? focusParent);
  const mainMessages = useMemo(() => messages.filter((m) => !m.parent_id), [messages]);
  const threadRoot = threadId ? messages.find((m) => m.id === threadId) : undefined;
  const threadReplies = useMemo(() => (threadId ? messages.filter((m) => m.parent_id === threadId) : []), [messages, threadId]);
  const openThread = (id: string) => {
    setPanel(null);
    setThread(id);
  };

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
      const el = document.getElementById(`m-${flash}`) ?? document.getElementById(`t-${flash}`);
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
        const t = setTimeout(() => setFlash(undefined), 2600);
        return () => clearTimeout(t);
      }
    } else bottomRef.current?.scrollIntoView();
  }, [flash, messages.length, tab, threadId]);

  // Mark the conversation read while it is open.
  const lastTs = chat?.last_ts?.toMillis();
  useEffect(() => {
    if (chat && isUnread(chat, uid, reads)) api(`/api/chats/${chatId}/read`, { method: "POST" }).catch(() => {});
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
              {chat.type !== "dm" && (
                <button
                  onClick={() => open({ kind: "handover", chatId: chat.id })}
                  className="flex h-9 items-center gap-1.5 rounded-lg border border-border px-3 text-[13px] font-semibold text-ink transition hover:bg-hover"
                  title="Shift handover"
                >
                  <RefreshCw size={15} className="text-muted" />
                  <span className="hidden md:inline">Handover</span>
                </button>
              )}
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
            <MessageList messages={mainMessages} chat={chat} title={title} flash={flash} onOpenThread={openThread} />
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

      {threadRoot && (
        <>
          <button className="fixed inset-0 z-40 bg-ink/40 xl:hidden" onClick={() => setThread("")} aria-label="Close thread" />
          <ThreadPanel chat={chat} title={title} root={threadRoot} replies={threadReplies} flash={flash} onClose={() => setThread("")} />
        </>
      )}
      {panel && !threadRoot && (
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

function MessageList({ messages, chat, title, flash, onOpenThread }: { messages: Message[]; chat: Chat; title: string; flash?: string; onOpenThread: (id: string) => void }) {
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
              <MessageRow m={m} mine={m.sender === uid} grouped={grouped && !prev?.reply_count} bubbles={chat.type !== "channel"} highlight={flash === m.id} chatId={chat.id} chatName={title} onOpenThread={onOpenThread} />
            )}
          </div>
        );
      })}
    </div>
  );
}

function MessageRow({
  m, mine, grouped, bubbles, highlight, chatId, chatName, onOpenThread, domPrefix = "m",
}: {
  m: Message; mine: boolean; grouped: boolean; bubbles: boolean; highlight: boolean; chatId: string; chatName: string;
  onOpenThread?: (id: string) => void; domPrefix?: string;
}) {
  const { uid, users, showProfile, open } = useWs();
  const right = bubbles && mine;
  const body = (
    <>
      {m.text && (m.doc ? <RichDoc doc={m.doc} plain={(t) => withMentions(t, m.mentions, users, uid)} /> : <ChatText text={m.text} plain={(t) => withMentions(t, m.mentions, users, uid)} />)}
      {m.file && <FileCard file={m.file} />}
      {m.file?.spec && <SpecBadge file={m.file} chatId={chatId} />}
      {m.research && (
        <div className="mt-2 w-full max-w-2xl rounded-xl border border-border bg-surface p-3">
          <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-saffron-ink">
            <Sparkles size={13} aria-hidden /> Saathi Research · shared by {m.research.by}
            {m.research.removed > 0 && <span className="font-normal text-muted">· {m.research.removed} item(s) left out (sources not visible to everyone here)</span>}
          </p>
          <p className="mb-2 text-sm font-semibold">{m.research.report.title}</p>
          <ReportBody report={m.research.report} compact />
        </div>
      )}
      {m.handover_id && (
        <button
          onClick={() => open({ kind: "handover", chatId, id: m.handover_id })}
          className="mt-2 flex items-center gap-1.5 rounded-lg border border-blueprint/25 bg-blueprint-soft px-2.5 py-1.5 text-xs font-semibold text-blueprint hover:border-blueprint/50"
        >
          <RefreshCw size={13} aria-hidden /> Open the shift handover
        </button>
      )}
      {m.decision && (
        <div className="mt-2 flex items-start gap-1.5 rounded-lg border border-moss/25 bg-moss-soft px-2.5 py-1.5 text-xs text-moss">
          <Gavel size={13} className="mt-px shrink-0" aria-hidden />
          <span>
            <b>Decision logged:</b> {m.decision}{" "}
            <button onClick={() => open({ kind: "decisions", id: `m_${m.id}` })} className="font-semibold underline-offset-2 hover:underline">
              Why →
            </button>
          </span>
        </div>
      )}
      {m.promise && <PromiseChip m={m} chatId={chatId} />}
    </>
  );

  return (
    <div
      id={`${domPrefix}-${m.id}`}
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
        {onOpenThread && !!m.reply_count && <ThreadSummary m={m} onOpen={() => onOpenThread(m.id)} />}
      </div>
      <MessageActions m={m} chatId={chatId} chatName={chatName} align={right ? "left" : "right"} onReply={onOpenThread && (() => onOpenThread(m.id))} />
    </div>
  );
}

function MessageActions({ m, chatId, chatName, align, onReply }: { m: Message; chatId: string; chatName: string; align: "left" | "right"; onReply?: () => void }) {
  const { open, toast, newTask, uid } = useWs();
  const [picking, setPicking] = useState(false);
  const moreRef = useRef<HTMLButtonElement>(null);
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
        <button key={r} onClick={() => react(reactionKey(REACTION_EMOJI[r]))} className={clsx(btn, "text-base")} aria-label={`React ${REACTION_EMOJI[r]}`} title={`React ${REACTION_EMOJI[r]}`}>
          {REACTION_EMOJI[r]}
        </button>
      ))}
      <button ref={moreRef} onClick={() => setPicking((v) => !v)} className={btn} aria-label="Add another reaction" aria-expanded={picking} title="More reactions">
        <Smile size={15} />
      </button>
      {picking && <EmojiPopover anchor={moreRef.current} onPick={(e) => react(reactionKey(e))} onClose={() => setPicking(false)} />}
      <span className="mx-0.5 h-5 w-px bg-border" aria-hidden />
      {onReply && (
        <button onClick={onReply} className={btn} aria-label="Reply in thread" title="Reply in thread">
          <Reply size={15} />
        </button>
      )}
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
  // group by the emoji shown, so an old "like" and a picked 👍 count together
  const groups = new Map<string, { who: Set<string>; keys: string[] }>();
  for (const [key, who] of Object.entries(m.reactions ?? {})) {
    if (!who || !who.length) continue;
    const e = reactionEmoji(key);
    const g = groups.get(e) ?? { who: new Set<string>(), keys: [] };
    who.forEach((w) => g.who.add(w));
    g.keys.push(key);
    groups.set(e, g);
  }
  if (!groups.size) return null;
  return (
    <div className="mt-1 flex flex-wrap gap-1">
      {[...groups.entries()].map(([emoji, g]) => {
        const mineKey = g.keys.find((k) => m.reactions?.[k]?.includes(uid));
        const mineOn = !!mineKey;
        return (
          <button
            key={emoji}
            onClick={() => api(`/api/chats/${chatId}/messages/${m.id}/react`, { json: { reaction: mineKey ?? g.keys[0] } }).catch((e) => toast((e as Error).message))}
            title={[...g.who].map((w) => users[w]?.name ?? "Someone").join(", ")}
            aria-pressed={mineOn}
            className={clsx("flex h-6 items-center gap-1 rounded-full border px-2 text-xs transition", mineOn ? "border-brand/40 bg-brand-soft text-brand" : "border-border bg-surface text-muted hover:border-brand/40")}
          >
            <span>{emoji}</span>
            <span className="font-semibold">{g.who.size}</span>
          </button>
        );
      })}
      <span className="sr-only">Reactions</span>
    </div>
  );
}

const TEXT_COLORS = ["#202124", "#d93025", "#e37400", "#1e8e3e", "#1a73e8", "#8430ce", "#5f6368"];
const HIGHLIGHTS = ["#fff3a3", "#ceead6", "#d2e3fc", "#fad2cf", "#fde7c3", "#f3e8fd"];
const FONT_SIZES = [12, 14, 16, 18, 20, 24, 28];

/** Slash commands: type "/" in the message box, then a name (/h1, /bold, /red…) and press Enter. */
type SlashCtx = { editor: Editor; link: () => void; quote: () => void };
type SlashCmd = { id: string; label: string; hint: string; keys: string; icon: typeof Heading; run: (c: SlashCtx) => void };
const SLASH: SlashCmd[] = [
  { id: "text", label: "Normal text", hint: "/text", keys: "text normal paragraph clear plain reset", icon: TextAa, run: ({ editor }) => editor.chain().focus().setParagraph().unsetAllMarks().run() },
  { id: "h1", label: "Heading 1", hint: "/h1", keys: "h1 heading1 heading title", icon: Heading, run: ({ editor }) => editor.chain().focus().setHeading({ level: 1 }).run() },
  { id: "h2", label: "Heading 2", hint: "/h2", keys: "h2 heading2 heading subtitle", icon: Heading, run: ({ editor }) => editor.chain().focus().setHeading({ level: 2 }).run() },
  { id: "h3", label: "Heading 3", hint: "/h3", keys: "h3 heading3 heading", icon: Heading, run: ({ editor }) => editor.chain().focus().setHeading({ level: 3 }).run() },
  { id: "bold", label: "Bold", hint: "/bold", keys: "bold b strong", icon: TextBold, run: ({ editor }) => editor.chain().focus().toggleBold().run() },
  { id: "italic", label: "Italic", hint: "/italic", keys: "italic i emphasis", icon: TextItalic, run: ({ editor }) => editor.chain().focus().toggleItalic().run() },
  { id: "underline", label: "Underline", hint: "/underline", keys: "underline u", icon: TextUnderline, run: ({ editor }) => editor.chain().focus().toggleUnderline().run() },
  { id: "strike", label: "Strikethrough", hint: "/strike", keys: "strike strikethrough cross delete", icon: TextStrike, run: ({ editor }) => editor.chain().focus().toggleStrike().run() },
  { id: "highlight", label: "Highlight (yellow)", hint: "/highlight", keys: "highlight yellow marker", icon: Highlighter, run: ({ editor }) => editor.chain().focus().setHighlight({ color: "#fff3a3" }).run() },
  { id: "highlight-green", label: "Highlight green", hint: "/highlight-green", keys: "highlight green marker", icon: Highlighter, run: ({ editor }) => editor.chain().focus().setHighlight({ color: "#ceead6" }).run() },
  { id: "highlight-blue", label: "Highlight blue", hint: "/highlight-blue", keys: "highlight blue marker", icon: Highlighter, run: ({ editor }) => editor.chain().focus().setHighlight({ color: "#d2e3fc" }).run() },
  { id: "highlight-pink", label: "Highlight pink", hint: "/highlight-pink", keys: "highlight pink red marker", icon: Highlighter, run: ({ editor }) => editor.chain().focus().setHighlight({ color: "#fad2cf" }).run() },
  { id: "nohighlight", label: "Remove highlight", hint: "/nohighlight", keys: "nohighlight remove highlight clear", icon: Highlighter, run: ({ editor }) => editor.chain().focus().unsetHighlight().run() },
  { id: "red", label: "Red text", hint: "/red", keys: "red color colour text", icon: FontColor, run: ({ editor }) => editor.chain().focus().setColor("#d93025").run() },
  { id: "orange", label: "Orange text", hint: "/orange", keys: "orange color colour text", icon: FontColor, run: ({ editor }) => editor.chain().focus().setColor("#e37400").run() },
  { id: "green", label: "Green text", hint: "/green", keys: "green color colour text", icon: FontColor, run: ({ editor }) => editor.chain().focus().setColor("#1e8e3e").run() },
  { id: "blue", label: "Blue text", hint: "/blue", keys: "blue color colour text", icon: FontColor, run: ({ editor }) => editor.chain().focus().setColor("#1a73e8").run() },
  { id: "purple", label: "Purple text", hint: "/purple", keys: "purple color colour text", icon: FontColor, run: ({ editor }) => editor.chain().focus().setColor("#8430ce").run() },
  { id: "nocolor", label: "Default text colour", hint: "/nocolor", keys: "nocolor default color colour clear black", icon: FontColor, run: ({ editor }) => editor.chain().focus().unsetColor().run() },
  { id: "small", label: "Small text", hint: "/small", keys: "small size smaller", icon: TextAa, run: ({ editor }) => editor.chain().focus().setFontSize("12px").run() },
  { id: "large", label: "Large text", hint: "/large", keys: "large size bigger big", icon: TextAa, run: ({ editor }) => editor.chain().focus().setFontSize("20px").run() },
  { id: "huge", label: "Huge text", hint: "/huge", keys: "huge size biggest", icon: TextAa, run: ({ editor }) => editor.chain().focus().setFontSize("28px").run() },
  { id: "normalsize", label: "Default text size", hint: "/normalsize", keys: "normalsize default size reset", icon: TextAa, run: ({ editor }) => editor.chain().focus().unsetFontSize().run() },
  { id: "bullet", label: "Bulleted list", hint: "/bullet", keys: "bullet bullets list ul unordered", icon: ListBullets, run: ({ editor }) => editor.chain().focus().toggleBulletList().run() },
  { id: "numbered", label: "Numbered list", hint: "/numbered", keys: "numbered number list ol ordered", icon: ListNumbers, run: ({ editor }) => editor.chain().focus().toggleOrderedList().run() },
  { id: "indent", label: "Increase indent", hint: "/indent", keys: "indent nest tab", icon: Indent, run: ({ editor }) => editor.chain().focus().sinkListItem("listItem").run() },
  { id: "outdent", label: "Decrease indent", hint: "/outdent", keys: "outdent unindent", icon: Outdent, run: ({ editor }) => editor.chain().focus().liftListItem("listItem").run() },
  { id: "quote", label: "Quotation marks", hint: "/quote", keys: "quote quotation marks", icon: MessageSquareQuote, run: ({ quote }) => quote() },
  { id: "link", label: "Link", hint: "/link", keys: "link url href", icon: LinkSimple, run: ({ link }) => link() },
  { id: "undo", label: "Undo", hint: "/undo", keys: "undo back", icon: Undo, run: ({ editor }) => editor.chain().focus().undo().run() },
  { id: "redo", label: "Redo", hint: "/redo", keys: "redo forward", icon: Redo, run: ({ editor }) => editor.chain().focus().redo().run() },
];

function Composer({ chat, title, parentId, inputId = "composer" }: { chat: Chat; title: string; parentId?: string; inputId?: string }) {
  const { toast, users, uid, account } = useWs();
  const chatId = chat.id;
  const isChannel = chat.type === "channel";
  const [text, setText] = useState(""); // plain-text copy of the editor, used for the send button and the upload caption
  const [mentioned, setMentioned] = useState<Record<string, string>>({}); // uid -> inserted "@Name"
  const [query, setQuery] = useState<string | null>(null);
  const [sel, setSel] = useState(0);
  const [sending, setSending] = useState(false);
  const [emoji, setEmoji] = useState(false);
  const [fmt, setFmt] = useState(false);
  const [palette, setPalette] = useState<null | "color" | "highlight">(null);
  const [slash, setSlash] = useState<string | null>(null); // text after "/" while the command menu is open
  const [slashSel, setSlashSel] = useState(0);
  const [linkUrl, setLinkUrl] = useState<string | null>(null); // address being typed in the link bar (null = bar closed)
  const [, redraw] = useReducer((n: number) => n + 1, 0);
  const fileRef = useRef<HTMLInputElement>(null);
  const emojiBtnRef = useRef<HTMLButtonElement>(null);
  const keyRef = useRef<(e: KeyboardEvent) => boolean>(() => false);
  const placeholder = parentId ? "Reply in thread" : isChannel ? `Post in ${title}` : `Message ${title}`;

  const canChannel = isChannel && (chat.owners?.includes(uid) || account.org_role === "owner" || account.org_role === "admin");
  const candidates = query === null ? [] : [
    ...(canChannel && "channel".startsWith(query.toLowerCase()) ? [{ id: "channel", name: "channel", role: "Notify everyone in this channel" }] : []),
    ...chat.members
      .filter((m) => m !== uid && users[m])
      .map((m) => ({ id: m, name: users[m].name, role: users[m].role }))
      .filter((u) => u.name.toLowerCase().includes(query.toLowerCase())),
  ].slice(0, 6);

  // The editor must be created once: giving useEditor fresh options on every render (the chat list polls)
  // would reconfigure it and wipe what is being typed. Handlers reach the latest state through `live`.
  const live = useRef({ detectMention: () => {}, redraw: () => {}, setText: (_t: string) => {}, placeholder, title, grammarClick: (_e: MouseEvent) => {} });
  live.current = { detectMention, redraw, setText, placeholder, title, grammarClick };
  const editorOptions = useMemo(
    () => ({
      immediatelyRender: false, // the page is server-rendered; the editor mounts in the browser
      extensions: [
        StarterKit.configure({
          heading: { levels: [1, 2, 3] as ( 1 | 2 | 3)[] },
          horizontalRule: false as const,
          link: { openOnClick: false, autolink: true, defaultProtocol: "https", isAllowedUri: (url: string) => /^(https?:\/\/|mailto:)/i.test(url) },
        }),
        TextStyle,
        Color,
        FontSize,
        Highlight.configure({ multicolor: true }),
        Grammar,
        Placeholder.configure({ placeholder: () => live.current.placeholder }),
      ],
      editorProps: {
        attributes: { id: inputId, role: "textbox", "aria-multiline": "true", "aria-label": parentId ? "Reply in thread" : "Message", spellcheck: "true" },
        handleKeyDown: (_v: unknown, e: KeyboardEvent) => keyRef.current(e),
        // pasted images/files are not supported here; plain and rich text paste normally
        handlePaste: (_v: unknown, e: ClipboardEvent) => (e.clipboardData?.files?.length ?? 0) > 0,
        handleDOMEvents: { click: (_v: unknown, e: Event) => { live.current.grammarClick(e as MouseEvent); return false; } },
      },
      onUpdate: ({ editor: ed }: { editor: Editor }) => {
        live.current.setText(docToText(ed.getJSON() as DocNode));
        live.current.detectMention();
      },
      onSelectionUpdate: () => live.current.detectMention(),
      onTransaction: () => live.current.redraw(),
    }),
    [],
  );
  const editor = useEditor(editorOptions);

  // Clicking an underlined word opens the fix popover (the library's own hover tooltip is hidden in globals.css).
  type GrammarFix = { left: number; bottom: number; from: number; to: number; message: string; suggestions: string[] };
  const [fix, setFix] = useState<GrammarFix | null>(null);
  function grammarClick(e: MouseEvent) {
    const el = (e.target as HTMLElement | null)?.closest?.(".grammar-error") as HTMLElement | null;
    if (!el || !editor) {
      setFix(null);
      return;
    }
    let suggestions: string[] = [];
    try {
      suggestions = JSON.parse(el.getAttribute("data-suggestions") || "[]");
    } catch {}
    const from = editor.view.posAtDOM(el, 0);
    const r = el.getBoundingClientRect();
    setFix({ left: Math.min(r.left, window.innerWidth - 280), bottom: window.innerHeight - r.top + 8, from, to: from + (el.textContent ?? "").length, message: el.getAttribute("data-message") || "Check this", suggestions });
  }
  function applyFix(text: string) {
    if (!editor || !fix) return;
    const was = editor.state.doc.textBetween(fix.from, fix.to);
    const fixed = was && was[0] !== was[0].toLowerCase() ? text.charAt(0).toUpperCase() + text.slice(1) : text; // keep a leading capital
    editor.chain().focus().insertContentAt({ from: fix.from, to: fix.to }, fixed).run();
    setFix(null);
  }
  useEffect(() => {
    if (!fix) return;
    const close = (e: Event) => {
      if (!(e.target as HTMLElement | null)?.closest?.("[data-grammar-fix]")) setFix(null);
    };
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setFix(null);
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", esc);
    };
  }, [fix]);


  /** Is an "@name" being typed right before the cursor? */
  function mentionBefore(): { q: string; len: number } | null {
    if (!editor) return null;
    const { from, empty } = editor.state.selection;
    if (!empty) return null;
    const before = editor.state.doc.textBetween(Math.max(0, from - 40), from, "\n", "\n");
    const m = /(^|\s)@([\w.]*)$/.exec(before);
    return m ? { q: m[2], len: m[2].length + 1 } : null;
  }
  /** Is a "/command" being typed right before the cursor (start of a line or after a space)? */
  function slashBefore(): { q: string; len: number } | null {
    if (!editor) return null;
    const { from, empty } = editor.state.selection;
    if (!empty) return null;
    const before = editor.state.doc.textBetween(Math.max(0, from - 30), from, "\n", "\n");
    const m = /(^|\s)\/([a-z0-9-]*)$/i.exec(before);
    return m ? { q: m[2].toLowerCase(), len: m[2].length + 1 } : null;
  }
  function detectMention() {
    const m = mentionBefore();
    setQuery(m ? m.q : null);
    setSel(0);
    const c = m ? null : slashBefore();
    setSlash(c ? c.q : null);
    setSlashSel(0);
  }
  const slashItems =
    slash === null
      ? []
      : SLASH.map((c, i) => ({ c, i, rank: c.id === slash ? 0 : c.id.startsWith(slash) ? 1 : !slash || c.keys.split(" ").some((k) => k.startsWith(slash)) ? 2 : 3 }))
          .filter((x) => x.rank < 3)
          .sort((a, b) => a.rank - b.rank || a.i - b.i) // exact name first, then names that start with it, then keyword matches
          .map((x) => x.c)
          .slice(0, 9);

  function runSlash(c: SlashCmd) {
    if (!editor) return;
    const m = slashBefore();
    if (m) {
      const to = editor.state.selection.from;
      editor.chain().focus().deleteRange({ from: to - m.len, to }).run();
    }
    setSlash(null);
    if (c.id === "link") setFmt(true);
    c.run({ editor, link: setLink, quote: quoteMarks });
  }

  function pick(c: { id: string; name: string }) {
    const m = mentionBefore();
    if (!editor || !m) return;
    const to = editor.state.selection.from;
    editor.chain().focus().deleteRange({ from: to - m.len, to }).insertContent(`@${c.name} `).run();
    setMentioned((x) => ({ ...x, [c.id]: `@${c.name}` }));
    setQuery(null);
  }

  function clear() {
    editor?.chain().clearContent(true).unsetAllMarks().run();
    setText("");
    setMentioned({});
  }

  async function send() {
    if (!editor || sending) return;
    const doc = editor.getJSON() as DocNode;
    const body = docToText(doc).trim();
    if (!body) return;
    setSending(true);
    try {
      const mentions = Object.entries(mentioned)
        .filter(([, tag]) => body.includes(tag))
        .map(([id]) => id);
      await api(`/api/chats/${chatId}/messages`, { json: { text: body, mentions, parent_id: parentId ?? null, ...(needsDoc(doc) ? { doc } : {}) } });
      clear();
    } catch (e) {
      toast(`Message not sent: ${(e as Error).message}. Try again.`);
    } finally {
      setSending(false);
      editor.commands.focus();
    }
  }

  async function upload(file: File) {
    if (file.size > 20 * 1024 * 1024) return toast("That file is over 20 MB. Share a smaller PDF or image.");
    const form = new FormData();
    form.append("file", file);
    form.append("text", text.trim());
    if (parentId) form.append("parent_id", parentId);
    setSending(true);
    try {
      await api(`/api/chats/${chatId}/files`, { form });
      clear();
      toast("File shared. Saathi is reading it…");
    } catch (e) {
      toast(`Upload failed: ${(e as Error).message}`);
    } finally {
      setSending(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  /** Put “curly quotation marks” around the selection (or an empty pair at the cursor); again removes them. */
  function quoteMarks() {
    if (!editor) return;
    const doc = editor.state.doc;
    const sel0 = editor.state.selection;
    // Select-all covers the whole document; pull it in to the text so the marks land inside the paragraph
    const norm = TextSelection.between(doc.resolve(sel0.from), doc.resolve(sel0.to));
    const { from, to } = norm;
    const empty = from === to;
    const before = from > 1 ? doc.textBetween(from - 1, from) : "";
    const after = to < doc.content.size - 1 ? doc.textBetween(to, to + 1) : "";
    if (!empty && before === "“" && after === "”") {
      editor.chain().focus().deleteRange({ from: to, to: to + 1 }).deleteRange({ from: from - 1, to: from }).run();
    } else if (empty) {
      editor.chain().focus().insertContent("“”").command(({ tr }) => {
        tr.setSelection(TextSelection.create(tr.doc, tr.selection.from - 1));
        return true;
      }).run();
    } else {
      editor.chain().focus().command(({ tr }) => {
        tr.insertText("”", to).insertText("“", from);
        tr.setSelection(TextSelection.create(tr.doc, from + 1, to + 1));
        return true;
      }).run();
    }
  }
  function setLink() {
    if (!editor) return;
    setLinkUrl((editor.getAttributes("link").href as string | undefined) ?? "https://");
  }
  function applyLink(raw: string) {
    if (!editor) return;
    const href = raw.trim();
    setLinkUrl(null);
    if (!href) {
      editor.chain().focus().extendMarkRange("link").unsetLink().run();
      return;
    }
    if (!/^(https?:\/\/|mailto:)[^\s<>"']+$/i.test(href)) {
      editor.commands.focus();
      return toast("Links must start with http://, https:// or mailto:");
    }
    if (editor.state.selection.empty && !editor.isActive("link")) {
      editor.chain().focus().insertContent({ type: "text", text: href, marks: [{ type: "link", attrs: { href } }] }).run();
    } else {
      editor.chain().focus().extendMarkRange("link").setLink({ href }).run();
    }
  }

  // Latest-state key handler (the editor keeps the first closure it was given).
  keyRef.current = (e) => {
    if (!editor) return false;
    const mod = e.ctrlKey || e.metaKey;
    if (mod && !e.altKey && e.key.toLowerCase() === "k") {
      e.preventDefault();
      setFmt(true);
      setLink();
      return true;
    }
    if (mod && e.shiftKey && e.key.toLowerCase() === "x") {
      e.preventDefault();
      setFmt((v) => !v);
      return true;
    }
    if (candidates.length) {
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        setSel((i) => (i + (e.key === "ArrowDown" ? 1 : candidates.length - 1)) % candidates.length);
        return true;
      }
      if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        pick(candidates[sel]);
        return true;
      }
      if (e.key === "Escape") {
        setQuery(null);
        return true;
      }
    }
    if (slashItems.length) {
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        setSlashSel((i) => (i + (e.key === "ArrowDown" ? 1 : slashItems.length - 1)) % slashItems.length);
        return true;
      }
      if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        runSlash(slashItems[Math.min(slashSel, slashItems.length - 1)]);
        return true;
      }
      if (e.key === "Escape") {
        setSlash(null);
        return true;
      }
    }
    if (e.key === "Enter" && !e.isComposing) {
      // inside a list, quote or code block Enter adds the next line; Ctrl+Enter always sends
      const inBlock = editor.isActive("listItem") || editor.isActive("blockquote") || editor.isActive("codeBlock");
      if (mod || (!e.shiftKey && !inBlock)) {
        e.preventDefault();
        send();
        return true;
      }
    }
    return false;
  };

  const tb = (on: boolean, off = false) =>
    clsx("flex h-8 w-8 shrink-0 items-center justify-center rounded-md hover:bg-hover hover:text-ink disabled:opacity-35 disabled:hover:bg-transparent", on ? "bg-brand-soft text-brand" : "text-muted", off && "pointer-events-none");
  const ed = editor;
  const run = (fn: () => void) => () => {
    fn();
    setPalette(null);
  };
  const heading = !ed ? "0" : ed.isActive("heading", { level: 1 }) ? "1" : ed.isActive("heading", { level: 2 }) ? "2" : ed.isActive("heading", { level: 3 }) ? "3" : "0";
  const curSize = ((ed?.getAttributes("textStyle").fontSize as string | undefined) ?? "").replace("px", "");
  const curColor = (ed?.getAttributes("textStyle").color as string | undefined) ?? "";
  const curHl = (ed?.getAttributes("highlight").color as string | undefined) ?? "";
  const inList = !!ed && ed.isActive("listItem");

  return (
    <div className="shrink-0 px-3 pb-3 pt-1 lg:px-5">
      <div className="relative rounded-xl border border-border bg-surface shadow-[0_1px_2px_rgba(11,27,43,0.05)] transition focus-within:border-brand focus-within:ring-2 focus-within:ring-brand/15">
        {fmt && ed && (
          <div className="relative border-b border-border">
          <div className="flex flex-nowrap items-center gap-0.5 overflow-x-auto px-1.5 py-1 sm:flex-wrap sm:overflow-visible" role="toolbar" aria-label="Text formatting" onMouseDown={(e) => { if (!(e.target instanceof HTMLSelectElement)) e.preventDefault(); }}>
            <button type="button" className={tb(false)} title="Undo (Ctrl+Z)" aria-label="Undo" disabled={!ed.can().undo()} onClick={() => ed.chain().focus().undo().run()}><Undo size={17} /></button>
            <button type="button" className={tb(false)} title="Redo (Ctrl+Y)" aria-label="Redo" disabled={!ed.can().redo()} onClick={() => ed.chain().focus().redo().run()}><Redo size={17} /></button>
            <span className="mx-1 h-4 w-px bg-border" aria-hidden />
            <select
              aria-label="Font size"
              value={curSize}
              onChange={(e) => (e.target.value ? ed.chain().focus().setFontSize(`${e.target.value}px`).run() : ed.chain().focus().unsetFontSize().run())}
              className="h-8 shrink-0 rounded-md border border-border bg-surface px-1.5 text-xs text-ink"
            >
              <option value="">Size</option>
              {FONT_SIZES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
            <span className="mx-1 h-4 w-px bg-border" aria-hidden />
            <button type="button" className={tb(ed.isActive("bold"))} title="Bold (Ctrl+B)" aria-label="Bold" aria-pressed={ed.isActive("bold")} onClick={run(() => ed.chain().focus().toggleBold().run())}><TextBold size={17} /></button>
            <button type="button" className={tb(ed.isActive("italic"))} title="Italic (Ctrl+I)" aria-label="Italic" aria-pressed={ed.isActive("italic")} onClick={run(() => ed.chain().focus().toggleItalic().run())}><TextItalic size={17} /></button>
            <button type="button" className={tb(ed.isActive("underline"))} title="Underline (Ctrl+U)" aria-label="Underline" aria-pressed={ed.isActive("underline")} onClick={run(() => ed.chain().focus().toggleUnderline().run())}><TextUnderline size={17} /></button>
            <button type="button" className={tb(ed.isActive("strike"))} title="Strikethrough" aria-label="Strikethrough" aria-pressed={ed.isActive("strike")} onClick={run(() => ed.chain().focus().toggleStrike().run())}><TextStrike size={17} /></button>
            <button type="button" className={tb(palette === "color" || !!curColor)} title="Text colour" aria-label="Text colour" aria-expanded={palette === "color"} onClick={() => setPalette((p) => (p === "color" ? null : "color"))}>
              <span className="relative flex flex-col items-center"><FontColor size={17} /><span className="absolute -bottom-0.5 h-[3px] w-4 rounded-full" style={{ background: curColor || "#202124" }} /></span>
            </button>
            <button type="button" className={tb(palette === "highlight" || !!curHl)} title="Highlight" aria-label="Highlight" aria-expanded={palette === "highlight"} onClick={() => setPalette((p) => (p === "highlight" ? null : "highlight"))}>
              <span className="relative flex flex-col items-center"><Highlighter size={17} /><span className="absolute -bottom-0.5 h-[3px] w-4 rounded-full" style={{ background: curHl || "#fff3a3" }} /></span>
            </button>
            <span className="mx-1 h-4 w-px bg-border" aria-hidden />
            <button type="button" className={tb(ed.isActive("bulletList"))} title="Bulleted list" aria-label="Bulleted list" aria-pressed={ed.isActive("bulletList")} onClick={run(() => ed.chain().focus().toggleBulletList().run())}><ListBullets size={17} /></button>
            <button type="button" className={tb(ed.isActive("orderedList"))} title="Numbered list" aria-label="Numbered list" aria-pressed={ed.isActive("orderedList")} onClick={run(() => ed.chain().focus().toggleOrderedList().run())}><ListNumbers size={17} /></button>
            <button type="button" className={tb(false)} title="Decrease indent (Shift+Tab)" aria-label="Decrease indent" disabled={!inList || !ed.can().liftListItem("listItem")} onClick={() => ed.chain().focus().liftListItem("listItem").run()}><Outdent size={17} /></button>
            <button type="button" className={tb(false)} title="Increase indent (Tab)" aria-label="Increase indent" disabled={!inList || !ed.can().sinkListItem("listItem")} onClick={() => ed.chain().focus().sinkListItem("listItem").run()}><Indent size={17} /></button>
            <span className="mx-1 h-4 w-px bg-border" aria-hidden />
            <button type="button" className={tb(false)} title="Quotation marks" aria-label="Quote" onClick={run(quoteMarks)}><MessageSquareQuote size={17} /></button>
            <button type="button" className={tb(ed.isActive("link"))} title="Link (Ctrl+K)" aria-label="Link" aria-pressed={ed.isActive("link")} onClick={run(setLink)}><LinkSimple size={17} /></button>
          </div>
            {palette && (
              <div className="ws-pop absolute left-2 top-full z-30 mt-1 flex items-center gap-1 rounded-xl border border-border bg-surface p-2 shadow-xl" role="group" aria-label={palette === "color" ? "Text colours" : "Highlight colours"}>
                {(palette === "color" ? TEXT_COLORS : HIGHLIGHTS).map((c) => (
                  <button
                    key={c}
                    type="button"
                    aria-label={c}
                    title={c}
                    onClick={() => {
                      if (palette === "color") ed.chain().focus().setColor(c).run();
                      else ed.chain().focus().setHighlight({ color: c }).run();
                      setPalette(null);
                    }}
                    className="h-6 w-6 rounded-full border border-border transition hover:scale-110"
                    style={{ background: c }}
                  />
                ))}
                <button
                  type="button"
                  onClick={() => {
                    if (palette === "color") ed.chain().focus().unsetColor().run();
                    else ed.chain().focus().unsetHighlight().run();
                    setPalette(null);
                  }}
                  className="ml-1 rounded-md px-2 py-1 text-xs text-muted hover:bg-hover hover:text-ink"
                >
                  None
                </button>
              </div>
            )}
          </div>
        )}
        {fmt && linkUrl !== null && (
          <form
            className="flex items-center gap-2 border-b border-border px-2 py-1.5"
            onSubmit={(e) => {
              e.preventDefault();
              applyLink(linkUrl);
            }}
          >
            <LinkSimple size={16} className="text-muted" />
            <input
              autoFocus
              value={linkUrl}
              onChange={(e) => setLinkUrl(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Escape") {
                  setLinkUrl(null);
                  editor?.commands.focus();
                }
              }}
              placeholder="https://example.com"
              aria-label="Link address"
              className="h-8 min-w-0 flex-1 rounded-md border border-border bg-surface px-2 text-sm outline-none focus:border-brand"
            />
            <button type="submit" className="h-8 rounded-md bg-brand px-3 text-xs font-medium text-white hover:bg-brand-strong">Apply</button>
            <button type="button" onClick={() => { setLinkUrl(null); editor?.commands.focus(); }} className="h-8 rounded-md px-2 text-xs text-muted hover:bg-hover">Cancel</button>
          </form>
        )}
        <EditorContent editor={editor} />
        {fix && (
          <div
            data-grammar-fix
            role="dialog"
            aria-label="Grammar suggestion"
            className="ws-pop fixed z-[90] w-64 rounded-xl border border-border bg-surface p-3 shadow-xl"
            style={{ left: fix.left, bottom: fix.bottom }}
          >
            <p className="text-sm text-ink">{fix.message}</p>
            {fix.suggestions.length > 0 ? (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {fix.suggestions.map((sg) => (
                  <button key={sg} onMouseDown={(e) => e.preventDefault()} onClick={() => applyFix(sg)} className="rounded-lg bg-brand-soft px-2.5 py-1 text-sm font-medium text-brand hover:bg-brand hover:text-white">
                    {sg}
                  </button>
                ))}
              </div>
            ) : (
              <p className="mt-1 text-xs text-muted">No automatic suggestion.</p>
            )}
          </div>
        )}
        {slashItems.length > 0 && candidates.length === 0 && (
          <ul role="listbox" aria-label="Formatting commands" className="ws-pop absolute bottom-full left-2 z-30 mb-2 max-h-72 w-72 overflow-y-auto rounded-xl border border-border bg-surface p-1 shadow-xl">
            <li className="px-2 pb-0.5 pt-1 text-[11px] font-medium uppercase tracking-wide text-muted" aria-hidden>Formatting</li>
            {slashItems.map((c, i) => {
              const Ico = c.icon;
              return (
                <li key={c.id} role="option" aria-selected={i === slashSel}>
                  <button
                    onMouseDown={(e) => {
                      e.preventDefault();
                      runSlash(c);
                    }}
                    onMouseEnter={() => setSlashSel(i)}
                    className={clsx("flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left", i === slashSel && "bg-hover")}
                  >
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-brand-soft text-brand"><Ico size={16} /></span>
                    <span className="min-w-0 flex-1 truncate text-sm font-medium">{c.label}</span>
                    <span className="shrink-0 text-[11px] text-muted">{c.hint}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
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
          <button
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => setFmt((v) => !v)}
            className={tb(fmt)}
            title={fmt ? "Hide formatting options (Ctrl+Shift+X)" : "Formatting options (Ctrl+Shift+X)"}
            aria-label="Formatting options"
            aria-pressed={fmt}
          >
            <TextAa size={17} />
          </button>
          <MicButton
            onText={(t) => {
              if (!editor) return;
              editor.chain().focus("end").insertContent((editor.isEmpty ? "" : " ") + t).run();
            }}
          />
          <div className="relative">
            <button
              ref={emojiBtnRef}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => setEmoji((v) => !v)}
              className="flex h-8 w-8 items-center justify-center rounded-md text-muted hover:bg-hover hover:text-ink"
              title="Emoji"
              aria-label="Insert emoji"
              aria-expanded={emoji}
            >
              <Smile size={17} />
            </button>
            {emoji && <EmojiPopover anchor={emojiBtnRef.current} onPick={(e) => editor?.chain().focus().insertContent(e).run()} onClose={() => setEmoji(false)} />}
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

/** Revision Guard: compares a drawing file's revision with the controlled register. */
function RevisionGuard({ drawingNo, revision }: { drawingNo: string; revision: string }) {
  const { register } = useWs();
  const norm = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, "");
  const rev = revision.replace(/\(.*?\)/g, "").replace(/rev(ision)?\.?\s*/i, "").trim().toUpperCase().split(/[\s/,;]+/)[0];
  const d = register.find((x) => norm(x.drawing_no) === norm(drawingNo));
  const r = d?.revisions.find((x) => x.rev === rev);
  if (!d || !r) return null;
  const cur = d.revisions.find((x) => x.rev === d.current_rev);
  if (r.status === "superseded")
    return (
      <span role="alert" className="mt-2 flex items-start gap-1.5 rounded-lg border border-rust/30 bg-rust-soft px-2 py-1.5 text-xs font-medium text-rust">
        <AlertTriangle size={13} className="mt-px shrink-0" aria-hidden /> Superseded. Do not use for production. Current is Rev {d.current_rev}
        {cur?.approved_by ? `, approved by ${cur.approved_by}` : ""}
        {cur?.date ? ` on ${cur.date}` : ""}.
      </span>
    );
  if (r.status === "in_work")
    return (
      <span className="mt-2 flex items-start gap-1.5 rounded-lg border border-saffron/40 bg-saffron-soft px-2 py-1.5 text-xs font-medium text-saffron-ink">
        <AlertTriangle size={13} className="mt-px shrink-0" aria-hidden /> Draft, not released for production{d.current_rev ? ` (released: Rev ${d.current_rev})` : ""}.
      </span>
    );
  return <span className="mt-1.5 block text-[11px] font-semibold text-moss">✓ Current released revision</span>;
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
            {doc.doc_type === "engineering_drawing" && doc.drawing_no && doc.revision && <RevisionGuard drawingNo={doc.drawing_no} revision={doc.revision} />}
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


function ThreadSummary({ m, onOpen }: { m: Message; onOpen: () => void }) {
  const { users } = useWs();
  const who = (m.reply_users ?? []).slice(-3);
  return (
    <button onClick={onOpen} className="mt-1 flex items-center gap-2 rounded-lg px-1.5 py-1 text-xs hover:bg-hover">
      <span className="flex -space-x-1.5">
        {who.map((u) => (
          <span key={u} className="rounded-full ring-2 ring-surface">
            <Avatar name={users[u]?.name ?? "?"} size={18} />
          </span>
        ))}
      </span>
      <span className="font-semibold text-brand">
        {m.reply_count} {m.reply_count === 1 ? "reply" : "replies"}
      </span>
      {m.last_reply_ts && <span className="text-muted">Last reply {timeShort(m.last_reply_ts)}</span>}
    </button>
  );
}

function ThreadPanel({ chat, title, root, replies, flash, onClose }: { chat: Chat; title: string; root: Message; replies: Message[]; flash?: string; onClose: () => void }) {
  const { uid } = useWs();
  const endRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!flash) endRef.current?.scrollIntoView();
  }, [replies.length, flash]);
  return (
    <aside className="ws-pop fixed inset-y-0 right-0 z-50 flex w-[26rem] max-w-[94vw] flex-col border-l border-border bg-surface shadow-2xl xl:static xl:z-auto xl:shadow-none" aria-label="Thread">
      <div className="flex h-12 shrink-0 items-center gap-2 border-b border-border px-3">
        <MessagesSquare size={17} className="text-muted" aria-hidden />
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-bold">Thread</h2>
          <p className="truncate text-[11px] text-muted">{title}</p>
        </div>
        <button onClick={onClose} className="flex h-9 w-9 items-center justify-center rounded-lg text-muted hover:bg-hover" aria-label="Close thread">
          <X size={17} />
        </button>
      </div>
      <div className="scrollbar-thin flex-1 overflow-y-auto px-1 py-3">
        <MessageRow m={root} mine={root.sender === uid} grouped={false} bubbles={false} highlight={flash === root.id} chatId={chat.id} chatName={title} domPrefix="t" />
        <div className="my-2 flex items-center gap-3 px-3 text-xs text-muted" role="separator">
          <span>
            {replies.length} {replies.length === 1 ? "reply" : "replies"}
          </span>
          <div className="h-px flex-1 bg-border" />
        </div>
        {replies.map((r, i) => {
          const prev = replies[i - 1];
          const grouped = !!prev && prev.sender === r.sender && (r.ts?.toMillis() ?? 0) - (prev.ts?.toMillis() ?? 0) < GROUP_GAP_MS;
          return <MessageRow key={r.id} m={r} mine={r.sender === uid} grouped={grouped} bubbles={false} highlight={flash === r.id} chatId={chat.id} chatName={title} domPrefix="t" />;
        })}
        <div ref={endRef} />
      </div>
      <Composer chat={chat} title={title} parentId={root.id} inputId="thread-composer" />
    </aside>
  );
}
