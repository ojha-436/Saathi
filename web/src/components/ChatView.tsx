"use client";

import clsx from "clsx";
import { Check, Eye, EyeOff, FileText, Gavel, Handshake, Loader2, Paperclip, ScanText, Send, Wand2, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { api, openFile } from "@/lib/api";
import { useMessages } from "@/lib/hooks";
import { DOC_LABEL, chatTitle, clock, dayLabel, dueLabel, timeShort } from "@/lib/format";
import type { Message } from "@/lib/types";
import { Avatar } from "./bits";
import { useWs } from "./ctx";
import { Markdown } from "./Markdown";

type Tab = "messages" | "decisions" | "files";

export function ChatView({ chatId, focusMsg }: { chatId: string; focusMsg?: string }) {
  const { uid, users, chats, toast } = useWs();
  const chat = chats[chatId];
  const messages = useMessages(chatId);
  const [tab, setTab] = useState<Tab>("messages");
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [summary, setSummary] = useState<string | null>(null);
  const [summarizing, setSummarizing] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
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

  async function send() {
    const body = text.trim();
    if (!body || sending) return;
    setSending(true);
    try {
      await api(`/api/chats/${chatId}/messages`, { json: { text: body } });
      setText("");
    } catch (e) {
      toast(`Message not sent: ${(e as Error).message}. Try again.`);
    } finally {
      setSending(false);
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

  async function toggleAi() {
    const next = !chat?.ai_excluded;
    try {
      await api(`/api/chats/${chatId}/ai-exclude`, { json: { excluded: next } });
      toast(next ? "This chat is now hidden from Saathi's search." : "Saathi can search this chat again.");
    } catch (e) {
      toast((e as Error).message);
    }
  }

  if (!chat) return <div className="flex flex-1 items-center justify-center text-muted">Loading…</div>;
  const title = chatTitle(chat, uid, users);
  let lastDay = "";

  return (
    <section className="flex min-h-0 flex-1 flex-col bg-paper" aria-label={`Chat: ${title}`}>
      <header className="border-b border-line bg-paper px-4 pt-3 lg:px-6">
        <div className="flex items-center gap-3">
          <div className="min-w-0 flex-1">
            <h1 className="truncate font-display text-[26px] leading-tight">{title}</h1>
            <p className="truncate text-xs text-muted">{chat.members.map((m) => users[m]?.name?.split(" ")[0]).filter(Boolean).join(" · ")}</p>
          </div>
          <button
            onClick={toggleAi}
            className={clsx(
              "hidden h-10 items-center gap-1.5 rounded-lg border px-3 text-xs font-medium transition sm:flex",
              chat.ai_excluded ? "border-rust/30 bg-rust-soft text-rust" : "border-line text-muted hover:text-ink",
            )}
            aria-pressed={!!chat.ai_excluded}
            title={chat.ai_excluded ? "Saathi cannot see this chat. Click to include it again." : "Hide this chat from Saathi's search"}
          >
            {chat.ai_excluded ? <EyeOff size={14} /> : <Eye size={14} />} {chat.ai_excluded ? "Hidden from AI" : "Visible to AI"}
          </button>
          <button
            onClick={summarize}
            disabled={summarizing || !!chat.ai_excluded}
            className="flex h-10 items-center gap-1.5 rounded-lg bg-ink px-3.5 text-xs font-semibold text-paper transition hover:bg-ink-3 disabled:opacity-50"
          >
            {summarizing ? <Loader2 size={14} className="animate-spin" /> : <Wand2 size={14} className="text-saffron" />} Summarize
          </button>
        </div>
        <div role="tablist" aria-label="Chat sections" className="mt-2 flex gap-5">
          {(
            [
              ["messages", "Messages", messages.length],
              ["decisions", "Decisions", decisions.length],
              ["files", "Files", files.length],
            ] as const
          ).map(([k, label, n]) => (
            <button
              key={k}
              role="tab"
              aria-selected={tab === k}
              onClick={() => setTab(k)}
              className={clsx("relative -mb-px border-b-2 pb-2.5 pt-1 text-sm font-medium transition", tab === k ? "border-saffron text-ink" : "border-transparent text-muted hover:text-ink")}
            >
              {label} <span className="ml-1 font-mono text-[11px] text-muted">{n}</span>
            </button>
          ))}
        </div>
      </header>

      {summary && (
        <div className="mx-4 mt-3 rounded-xl border border-saffron/40 bg-saffron-soft/60 p-4 text-sm lg:mx-6" role="region" aria-label="Chat summary">
          <div className="mb-1 flex items-center justify-between">
            <span className="font-mono text-[11px] uppercase tracking-wider text-saffron-ink">Saathi summary</span>
            <button onClick={() => setSummary(null)} aria-label="Close summary" className="flex h-8 w-8 items-center justify-center rounded-md text-muted hover:bg-paper">
              <X size={14} />
            </button>
          </div>
          <Markdown text={summary} />
        </div>
      )}

      {tab === "messages" && (
        <div className="scrollbar-thin flex-1 overflow-y-auto px-4 py-4 lg:px-6">
          {messages.map((m) => {
            const day = dayLabel(m.ts);
            const showDay = day !== lastDay;
            lastDay = day;
            return (
              <div key={m.id}>
                {showDay && (
                  <div className="my-5 flex items-center gap-3 font-mono text-[10.5px] uppercase tracking-wider text-muted">
                    <div className="h-px flex-1 bg-line" />
                    {day}
                    <div className="h-px flex-1 bg-line" />
                  </div>
                )}
                <MessageRow m={m} mine={m.sender === uid} highlight={flash === m.id} chatId={chatId} />
              </div>
            );
          })}
          <div ref={bottomRef} />
        </div>
      )}

      {tab === "decisions" && (
        <div className="scrollbar-thin flex-1 overflow-y-auto px-4 py-5 lg:px-6">
          {decisions.length === 0 ? (
            <Empty icon={Gavel} text="No decisions recorded yet. When someone writes “Final: …” or “approved”, Saathi logs it here." />
          ) : (
            <ol className="relative ml-3 border-l-2 border-line">
              {[...decisions].reverse().map((m) => (
                <li key={m.id} className="relative mb-5 pl-6">
                  <span className="absolute -left-[9px] top-1 h-4 w-4 rounded-full border-2 border-paper bg-moss" aria-hidden />
                  <p className="font-mono text-[11px] text-muted">
                    {dayLabel(m.ts)} · {m.sender_name}
                  </p>
                  <p className="mt-1 font-medium">{m.decision}</p>
                  <button onClick={() => { setFlash(m.id); setTab("messages"); }} className="mt-1 text-xs font-medium text-blueprint hover:underline">
                    View in conversation
                  </button>
                </li>
              ))}
            </ol>
          )}
        </div>
      )}

      {tab === "files" && (
        <div className="scrollbar-thin flex-1 overflow-y-auto px-4 py-5 lg:px-6">
          {files.length === 0 ? (
            <Empty icon={FileText} text="No files shared in this chat yet. Drop a PDF or image and Saathi will read it." />
          ) : (
            <div className="grid gap-3 xl:grid-cols-2">
              {[...files].reverse().map((m) => (
                <div key={m.id}>
                  <p className="mb-1 font-mono text-[11px] text-muted">
                    {m.sender_name} · {timeShort(m.ts)}
                  </p>
                  <FileCard file={m.file!} />
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="border-t border-line bg-paper px-4 py-3 lg:px-6">
        <div className="flex items-end gap-2 rounded-2xl border border-line bg-white px-2 py-1.5 transition focus-within:border-ink focus-within:ring-4 focus-within:ring-saffron/15">
          <input ref={fileRef} type="file" className="hidden" accept=".pdf,image/*" onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
          <button onClick={() => fileRef.current?.click()} className="flex h-10 w-10 items-center justify-center rounded-lg text-muted hover:bg-paper-2 hover:text-ink" title="Attach a PDF or image" aria-label="Attach file">
            <Paperclip size={18} />
          </button>
          <label htmlFor="composer" className="sr-only">
            Message {title}
          </label>
          <textarea
            id="composer"
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
            rows={1}
            placeholder={`Message ${title}`}
            className="max-h-32 min-h-10 flex-1 resize-none bg-transparent py-2.5 text-[15px] outline-none"
          />
          <button onClick={send} disabled={sending || !text.trim()} className="flex h-10 w-10 items-center justify-center rounded-xl bg-ink text-paper transition hover:bg-ink-3 disabled:opacity-30" aria-label="Send message">
            {sending ? <Loader2 size={17} className="animate-spin" /> : <Send size={17} />}
          </button>
        </div>
        <p className="mt-1.5 hidden font-mono text-[10.5px] text-muted sm:block">Enter to send · Shift+Enter for a new line · Saathi detects promises and decisions automatically</p>
      </div>
    </section>
  );
}

function Empty({ icon: Icon, text }: { icon: typeof Gavel; text: string }) {
  return (
    <div className="mx-auto mt-16 max-w-sm text-center">
      <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-paper-2 text-muted">
        <Icon size={20} />
      </span>
      <p className="mt-3 text-sm text-muted">{text}</p>
    </div>
  );
}

function MessageRow({ m, mine, highlight, chatId }: { m: Message; mine: boolean; highlight: boolean; chatId: string }) {
  return (
    <div id={`m-${m.id}`} className={clsx("group flex gap-3 rounded-xl px-2 py-2 transition-colors duration-500", highlight && "bg-saffron-soft ring-2 ring-saffron/60")}>
      <Avatar name={m.sender_name} size={36} />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <span className={clsx("text-sm font-semibold", mine && "text-blueprint")}>{m.sender_name}</span>
          <span className="font-mono text-[10.5px] text-muted">{clock(m.ts)}</span>
        </div>
        {m.text && <p className="whitespace-pre-wrap text-[15px] leading-relaxed text-ink/90">{m.text}</p>}
        {m.file && <FileCard file={m.file} />}
        {m.decision && (
          <div className="mt-2 inline-flex items-start gap-1.5 rounded-lg border border-moss/25 bg-moss-soft px-2.5 py-1.5 text-xs text-moss">
            <Gavel size={13} className="mt-px shrink-0" aria-hidden /> <span><b>Decision logged:</b> {m.decision}</span>
          </div>
        )}
        {m.promise && <PromiseChip m={m} chatId={chatId} />}
      </div>
    </div>
  );
}

function FileCard({ file }: { file: NonNullable<Message["file"]> }) {
  const doc = file.doc;
  const processing = file.status === "processing";
  return (
    <button
      onClick={() => openFile(file.id)}
      className="mt-2 flex w-full max-w-lg items-stretch overflow-hidden rounded-xl border border-line bg-white text-left shadow-[0_1px_0_rgba(11,27,43,0.04)] transition hover:border-ink/30"
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
              <span className="rounded bg-paper-2 px-1.5 py-0.5 uppercase text-ink/70">{DOC_LABEL[doc.doc_type ?? "other"] ?? doc.doc_type}</span>
              {doc.drawing_no && <span className="rounded bg-blueprint-soft px-1.5 py-0.5 text-blueprint">{doc.drawing_no}</span>}
              {doc.revision && <span className="rounded bg-saffron-soft px-1.5 py-0.5 text-saffron-ink">REV {doc.revision}</span>}
              {doc.approved_by && <span className="rounded bg-moss-soft px-1.5 py-0.5 text-moss">✓ {doc.approved_by}</span>}
              {file.ocr?.confidence != null && (
                <span className="inline-flex items-center gap-1 rounded bg-paper-2 px-1.5 py-0.5 text-ink/70" title={`${file.ocr.engine} · ${file.ocr.pages} page(s)`}>
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

  async function act(action: "track" | "dismiss") {
    setBusy(true);
    try {
      await api(`/api/chats/${chatId}/messages/${m.id}/${action}`, { method: "POST" });
      if (action === "track") toast("Added to your tasks. Saathi will nudge you when it's due.");
    } catch (e) {
      toast((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-2 flex max-w-lg flex-wrap items-center gap-2 rounded-xl border border-plum/20 bg-plum-soft px-3 py-2 text-xs text-plum">
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
          <button onClick={() => act("track")} disabled={busy} className="h-8 rounded-lg bg-plum px-3 font-semibold text-white transition hover:brightness-110 disabled:opacity-60">
            Track
          </button>
          <button onClick={() => act("dismiss")} disabled={busy} className="flex h-8 w-8 items-center justify-center rounded-lg hover:bg-white/60" aria-label="Dismiss promise suggestion">
            <X size={13} />
          </button>
        </span>
      )}
    </div>
  );
}
