"use client";

import clsx from "clsx";
import { ArrowRight, ArrowUp, BarChart3, ChevronDown, FileSearch, Handshake, History, Loader2, Radar, RotateCcw, ShieldCheck, Sparkles, Timer, Workflow } from "@/lib/icons";
import { LogoMark } from "./Logo";
import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import { useAssistant } from "@/lib/hooks";
import type { AssistantMsg, Task } from "@/lib/types";
import { useWs } from "./ctx";
import { ChartCard } from "./Knowledge";
import { Markdown } from "./Markdown";
import { MicButton } from "./Quality";
import { SaathiTabs } from "./Research";
import { ProposedTaskCard } from "./Tasks";

const STARTERS = [
  { icon: FileSearch, text: "Which revision of SRC-BF-2041 is latest and who approved it?" },
  { icon: ShieldCheck, text: "Is heat H-77812 within spec for drawing SRC-BF-2041?" },
  { icon: History, text: "Side frame casting me porosity aa rahi hai, pehle hua hai kya?" },
  { icon: Workflow, text: "Should we keep Om Castings for side frame castings?" },
  { icon: BarChart3, text: "NCRs by vendor this year" },
  { icon: Handshake, text: "What have people promised me this week?" },
  { icon: Timer, text: "Kal subah 10 baje Om Castings ko call karne ka reminder laga do" },
];

const RANGES = [
  { label: "Today", hours: 24 },
  { label: "Last 3 days", hours: 72 },
  { label: "This week", hours: 168 },
];

export function AssistantView({ tasks, prompt, onPromptUsed }: { tasks: Task[]; prompt?: string; onPromptUsed: () => void }) {
  const { uid, me, toast, dialog, account, open } = useWs();
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
    dispatchEvent(new Event("saathi:asked")); // the guided tour waits for this
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
        <LogoMark size={32} />
        <div className="min-w-0 flex-1">
          <h1 className="text-[15px] font-bold leading-tight">Ask Saathi</h1>
          <p className="hidden truncate text-xs text-muted sm:block">Searches only the chats and files you can access · every answer cites its source</p>
        </div>
        {account.org.settings.voice_us && account.org_role !== "guest" && (
          <button onClick={() => dialog("voice")} className="flex h-9 items-center gap-1.5 rounded-lg bg-ink px-3 text-xs font-semibold text-white hover:bg-ink-3" title="Talk to Saathi (hands-free)">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden>
              <rect x="9" y="3" width="6" height="11" rx="3" />
              <path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
            </svg>
            Talk
          </button>
        )}
        <SaathiTabs active="ask" />
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

            {/* catch-up and research cards */}
            <div className="rise mt-8 grid gap-4 lg:grid-cols-2" style={{ animationDelay: "120ms" }}>
              <div className="relative flex flex-col justify-between overflow-hidden rounded-2xl bg-rail p-6 text-paper">
                <div className="blueprint-grid absolute inset-0 opacity-70" aria-hidden />
                <div className="relative">
                  <p className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-widest text-saffron">
                    <Radar size={14} /> Catch up
                  </p>
                  <p className="mt-2 font-display text-2xl leading-tight">Been away? Get the brief.</p>
                  <p className="mt-1 text-xs text-paper/70">Decisions, asks for you, files shared and open promises from every chat and channel, each line with its source.</p>
                </div>
                <div className="relative mt-4 flex flex-wrap gap-2">
                  {RANGES.map((r) => (
                    <button
                      key={r.hours}
                      onClick={() => ask(`What did I miss in the last ${r.hours} hours?`)}
                      disabled={busy}
                      className="h-8 rounded-lg border border-paper/20 bg-paper/5 px-2.5 text-xs font-medium transition hover:border-saffron hover:bg-saffron hover:text-ink disabled:opacity-50"
                    >
                      {r.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="relative flex flex-col justify-between overflow-hidden rounded-2xl border border-border bg-gradient-to-br from-white via-surface to-canvas p-6 text-ink shadow-xs">
                <div>
                  <p className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-widest text-brand">
                    <Sparkles size={14} /> Saathi Research
                  </p>
                  <p className="mt-2 font-display text-2xl leading-tight">Need an inspection dossier or vendor comparison?</p>
                  <p className="mt-1 text-xs text-muted">Parallel research agents check drawings, certificates, NCRs and promises, verify every claim, and turn gaps into tasks.</p>
                </div>
                <div className="mt-4">
                  <button
                    onClick={() => open({ kind: "research" })}
                    className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-brand px-3.5 text-xs font-semibold text-white transition hover:bg-brand-strong"
                  >
                    Open Saathi Research <ArrowRight size={13} />
                  </button>
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
                <LogoMark size={32} className="shrink-0" />
                <div className="min-w-0 flex-1 rounded-2xl rounded-tl-md border border-border bg-surface px-5 py-4 text-[15px]">
                  {m.pending && !m.text ? (
                    <div className="space-y-2" role="status" aria-label="Saathi is searching">
                      <span className="flex items-center gap-2 text-sm text-muted">
                        <Loader2 size={14} className="animate-spin" /> Searching your chats and files…
                      </span>
                      <span className="block h-3 w-4/5 animate-pulse rounded bg-canvas" />
                      <span className="block h-3 w-3/5 animate-pulse rounded bg-canvas" />
                    </div>
                  ) : (
                    <>
                      <Markdown text={m.text} />
                      {m.pending && <span className="caret ml-0.5 inline-block h-4 w-1.5 translate-y-0.5 rounded-sm bg-saffron" aria-label="Writing" />}
                    </>
                  )}
                  {m.charts?.map((c, i) => <ChartCard key={i} chart={c} />)}
                  {m.tasks?.map((id) => (taskById[id] ? <ProposedTaskCard key={id} task={taskById[id]} /> : null))}
                  {!m.pending && (m.tool_calls || m.provenance) && <AnswerProvenance m={m} tourTarget={!busy && m.id === messages.at(-1)?.id} />}
                </div>
              </div>
            ),
          )}
          <div ref={bottomRef} />
        </div>
      </div>

      <div className="px-4 pb-3 pt-1 lg:px-6">
        <form
          data-tour="ask-box"
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
          <MicButton onText={(t) => setText((prev) => (prev ? `${prev} ${t}` : t))} className="h-10" />
          <button disabled={busy || !text.trim()} className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand text-white transition hover:bg-brand-strong disabled:opacity-30" aria-label="Ask">
            {busy ? <Loader2 size={17} className="animate-spin" /> : <ArrowUp size={18} strokeWidth={2.5} />}
          </button>
        </form>
      </div>
    </section>
  );
}

const TOOL_NAME: Record<string, string> = {
  search_workspace: "Searched chats and files",
  get_message_context: "Read the surrounding conversation",
  catch_up: "Collected recent activity",
  lookup_document: "Read documents",
  revision_status: "Checked the drawing register",
  find_decisions: "Looked up the decision log",
  similar_incidents: "Checked plant memory",
  promise_record: "Checked a promise record",
  plant_data: "Queried plant data (BigQuery)",
  shift_handover: "Read shift handovers",
  spec_check: "Checked certificate verdicts",
  standards_library: "Searched the standards library",
  propose_task: "Drafted a task",
  assign_task: "Drafted a task for a colleague",
  list_tasks: "Listed your tasks",
  who_owes: "Checked what others owe you",
  get_calendar: "Read your calendar",
};

/** "How Saathi got this": the steps behind an answer, so every answer is explainable. */
function AnswerProvenance({ m, tourTarget }: { m: AssistantMsg; tourTarget?: boolean }) {
  const [open, setOpen] = useState(false);
  const cited = Array.from(new Set(m.text.match(/\[((?:msg|file|meet|mail|drive|rec|dec|ho|kn|std):[^\]]+)\]/g) ?? [])).length;
  const p = m.provenance;
  const steps = m.tool_calls ?? [];
  const uniqueTools = Array.from(new Set(steps.map((c) => TOOL_NAME[c.tool] ?? c.tool)));

  return (
    <div className="mt-3 border-t border-border pt-2.5">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        data-tour={tourTarget ? "answer-proof" : undefined}
        className="group flex flex-wrap items-center gap-1.5 rounded-lg border border-border/80 bg-canvas/60 px-2.5 py-1.5 text-left text-xs transition hover:border-brand/40 hover:bg-canvas"
      >
        <span className="flex items-center gap-1 font-semibold text-ink">
          <Workflow size={13} className="shrink-0 text-brand" aria-hidden />
          How Saathi got this
        </span>

        <span className="text-muted/60">·</span>

        <span className="rounded bg-surface px-1.5 py-0.5 font-medium text-muted">
          {steps.length + (p?.prefetched?.length ? 1 : 0)} step{steps.length + (p?.prefetched?.length ? 1 : 0) === 1 ? "" : "s"}
        </span>

        {cited > 0 && (
          <span className="flex items-center gap-1 rounded bg-moss-soft px-1.5 py-0.5 font-medium text-moss">
            <ShieldCheck size={12} className="shrink-0" />
            {cited} cited
          </span>
        )}

        {p?.latency_ms ? (
          <span className="rounded bg-surface px-1.5 py-0.5 font-mono text-[11px] text-muted">
            ⚡ {(p.latency_ms / 1000).toFixed(1)}s
          </span>
        ) : null}

        <ChevronDown size={13} className={clsx("ml-auto shrink-0 text-muted transition", open && "rotate-180")} aria-hidden />
      </button>

      {open && (
        <div className="mt-2.5 space-y-2 rounded-xl border border-border bg-canvas/40 p-3 text-xs">
          {uniqueTools.length > 0 && (
            <div className="flex flex-wrap items-center gap-1 pb-1">
              <span className="text-[11px] font-medium text-muted">Tools executed:</span>
              {uniqueTools.map((t) => (
                <span key={t} className="rounded-md border border-border bg-surface px-1.5 py-0.5 text-[11px] font-medium text-ink">
                  {t}
                </span>
              ))}
            </div>
          )}

          <ol className="space-y-1.5">
            {!!p?.prefetched?.length && (
              <li className="flex items-start gap-2 rounded-lg border border-border/70 bg-surface px-2.5 py-1.5">
                <span className="font-mono text-[11px] font-semibold text-muted">01</span>
                <div>
                  <span className="font-medium text-ink">Workspace retrieval:</span>
                  <span className="ml-1 text-muted">Searched permission-filtered chats and files ({p.prefetched.length} matching fragments)</span>
                </div>
              </li>
            )}

            {steps.map((c, i) => {
              const arg = Object.values(c.args ?? {}).filter((v) => typeof v === "string" && v).join(" · ");
              const stepNum = String(i + 1 + (p?.prefetched?.length ? 1 : 0)).padStart(2, "0");
              return (
                <li key={i} className="flex items-start gap-2 rounded-lg border border-border/70 bg-surface px-2.5 py-1.5">
                  <span className="font-mono text-[11px] font-semibold text-muted">{stepNum}</span>
                  <div className="min-w-0 flex-1">
                    <span className="font-semibold text-ink">{TOOL_NAME[c.tool] ?? c.tool}</span>
                    {arg ? <p className="truncate text-[11px] text-muted">“{String(arg).slice(0, 80)}”</p> : null}
                  </div>
                </li>
              );
            })}
          </ol>

          <div className="border-t border-border/60 pt-2 text-[11px] text-muted">
            Searched only chats and files you can access
            {p?.model ? ` · ${p.model}` : ""}
            {p?.first_token_ms ? ` · first token ${(p.first_token_ms / 1000).toFixed(1)}s` : ""}.
            {" "}Grounding invariants enforced: text inside files is treated strictly as passive data.
          </div>
        </div>
      )}
    </div>
  );
}
