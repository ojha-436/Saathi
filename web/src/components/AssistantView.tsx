"use client";

import { ArrowUp, FileSearch, Handshake, Loader2, Radar, RotateCcw, Sparkles, Timer } from "@/lib/icons";
import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import { useAssistant } from "@/lib/hooks";
import type { Task } from "@/lib/types";
import { useWs } from "./ctx";
import { Markdown } from "./Markdown";
import { ProposedTaskCard } from "./Tasks";

const STARTERS = [
  { icon: FileSearch, text: "Find the bogie side frame drawing Amit sent me" },
  { icon: FileSearch, text: "Which revision of SRC-BF-2041 is latest and who approved it?" },
  { icon: Handshake, text: "What have people promised me this week?" },
  { icon: Timer, text: "Kal subah 10 baje Om Castings ko call karne ka reminder laga do" },
];

const RANGES = [
  { label: "Today", hours: 24 },
  { label: "Last 3 days", hours: 72 },
  { label: "This week", hours: 168 },
];

export function AssistantView({ tasks, prompt, onPromptUsed }: { tasks: Task[]; prompt?: string; onPromptUsed: () => void }) {
  const { uid, me, toast } = useWs();
  const messages = useAssistant(uid);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const taskById = Object.fromEntries(tasks.map((t) => [t.id, t]));

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length, messages.at(-1)?.text]);

  useEffect(() => {
    if (prompt) {
      ask(prompt);
      onPromptUsed();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prompt]);

  async function ask(q: string) {
    const body = q.trim();
    if (!body || busy) return;
    setBusy(true);
    setText("");
    try {
      await api("/api/assistant", { json: { text: body } });
    } catch (e) {
      toast(`Saathi couldn't answer: ${(e as Error).message}. Try again in a moment.`);
    } finally {
      setBusy(false);
      inputRef.current?.focus();
    }
  }

  const firstName = me?.name.split(" ")[0] ?? "";
  const hour = new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata", hour: "numeric", hour12: false });
  const greet = +hour < 12 ? "Good morning" : +hour < 17 ? "Good afternoon" : "Good evening";

  return (
    <section className="flex min-h-0 flex-1 flex-col bg-surface" aria-label="Ask Saathi">
      <header className="flex h-14 shrink-0 items-center gap-3 border-b border-border bg-surface px-4 lg:h-12 lg:px-6">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-saffron to-[#d4691a] text-white">
          <Sparkles size={18} aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <h1 className="text-[15px] font-bold leading-tight">Ask Saathi</h1>
          <p className="hidden truncate text-xs text-muted sm:block">Searches only the chats and files you can access · every answer cites its source</p>
        </div>
        {messages.length > 0 && (
          <button
            onClick={() => api("/api/assistant/clear", { method: "POST" })}
            className="flex h-9 items-center gap-1.5 rounded-lg px-3 text-xs font-medium text-muted hover:bg-hover hover:text-ink"
          >
            <RotateCcw size={14} /> New conversation
          </button>
        )}
      </header>

      <div className="scrollbar-thin flex-1 overflow-y-auto px-4 py-6 lg:px-6">
        {messages.length === 0 && (
          <div className="mx-auto max-w-3xl">
            <p className="rise font-mono text-xs uppercase tracking-[0.16em] text-saffron-ink">{greet}</p>
            <h2 className="rise mt-2 font-display text-5xl leading-[1.05]" style={{ animationDelay: "60ms" }}>
              Namaste {firstName}. <em className="text-muted">What can I find for you?</em>
            </h2>

            {/* catch-up card */}
            <div className="rise relative mt-8 overflow-hidden rounded-2xl bg-rail p-6 text-paper" style={{ animationDelay: "120ms" }}>
              <div className="blueprint-grid absolute inset-0 opacity-70" aria-hidden />
              <div className="relative flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <p className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-widest text-saffron">
                    <Radar size={14} /> Catch up
                  </p>
                  <p className="mt-2 font-display text-3xl leading-tight">Been away? Get the brief.</p>
                  <p className="mt-1 max-w-md text-sm text-paper/70">Decisions, asks for you, files shared and open promises from every chat and channel, each line with its source.</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {RANGES.map((r) => (
                    <button
                      key={r.hours}
                      onClick={() => ask(`What did I miss in the last ${r.hours} hours?`)}
                      disabled={busy}
                      className="h-10 rounded-lg border border-paper/20 bg-paper/5 px-3.5 text-sm font-medium transition hover:border-saffron hover:bg-saffron hover:text-ink disabled:opacity-50"
                    >
                      {r.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <p className="mt-8 font-mono text-[11px] uppercase tracking-widest text-muted">Try asking</p>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              {STARTERS.map((s, i) => (
                <button
                  key={s.text}
                  onClick={() => ask(s.text)}
                  className="rise flex min-h-[64px] items-start gap-3 rounded-xl border border-border bg-surface px-4 py-3 text-left text-sm transition hover:border-[#c5cad3] hover:shadow-sm"
                  style={{ animationDelay: `${180 + i * 40}ms` }}
                >
                  <s.icon size={16} className="mt-0.5 shrink-0 text-saffron-ink" aria-hidden />
                  {s.text}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="mx-auto max-w-3xl space-y-6" aria-live="polite">
          {messages.map((m) =>
            m.role === "user" ? (
              <div key={m.id} className="flex justify-end">
                <div className="max-w-[85%] rounded-2xl rounded-tr-md bg-brand-soft px-4 py-2.5 text-[15px] text-ink">{m.text}</div>
              </div>
            ) : (
              <div key={m.id} className="flex gap-3">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-saffron to-[#d4691a] text-white">
                  <Sparkles size={14} aria-hidden />
                </span>
                <div className="min-w-0 flex-1 rounded-2xl rounded-tl-md border border-border bg-surface px-5 py-4 text-[15px]">
                  {m.pending ? (
                    <div className="space-y-2" role="status" aria-label="Saathi is searching">
                      <span className="flex items-center gap-2 text-sm text-muted">
                        <Loader2 size={14} className="animate-spin" /> Searching your chats and files…
                      </span>
                      <span className="block h-3 w-4/5 animate-pulse rounded bg-canvas" />
                      <span className="block h-3 w-3/5 animate-pulse rounded bg-canvas" />
                    </div>
                  ) : (
                    <Markdown text={m.text} />
                  )}
                  {m.tasks?.map((id) => (taskById[id] ? <ProposedTaskCard key={id} task={taskById[id]} /> : null))}
                </div>
              </div>
            ),
          )}
          <div ref={bottomRef} />
        </div>
      </div>

      <div className="px-4 pb-3 pt-1 lg:px-6">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            ask(text);
          }}
          className="mx-auto flex max-w-3xl items-end gap-2 rounded-2xl border border-border bg-surface p-2 transition focus-within:border-brand focus-within:ring-2 focus-within:ring-brand/15"
        >
          <label htmlFor="ask" className="sr-only">
            Ask Saathi
          </label>
          <textarea
            id="ask"
            ref={inputRef}
            rows={1}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                ask(text);
              }
            }}
            placeholder="Ask anything about your work, in English or Hinglish…"
            className="max-h-32 min-h-10 flex-1 resize-none bg-transparent px-2 py-2.5 text-[15px] outline-none"
          />
          <button disabled={busy || !text.trim()} className="flex h-10 w-10 items-center justify-center rounded-xl bg-saffron text-ink transition hover:brightness-105 disabled:opacity-30" aria-label="Ask">
            {busy ? <Loader2 size={17} className="animate-spin" /> : <ArrowUp size={18} strokeWidth={2.5} />}
          </button>
        </form>
      </div>
    </section>
  );
}
