"use client";

import { AlertTriangle, BarChart3, CheckCircle2, Gavel, Handshake, ListTodo, RefreshCw, Sparkles } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import type { Insights } from "@/lib/types";
import { useWs } from "./ctx";

const TOOL_LABEL: Record<string, string> = {
  search_workspace: "Search",
  lookup_document: "Document lookup",
  catch_up: "Catch-up brief",
  propose_task: "Task drafting",
  list_tasks: "Task listing",
  get_message_context: "Thread context",
};

export function InsightsView() {
  const { open } = useWs();
  const [data, setData] = useState<Insights | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(() => {
    setError("");
    api<Insights>("/api/insights")
      .then(setData)
      .catch((e) => setError((e as Error).message));
  }, []);
  useEffect(load, [load]);

  const maxMsgs = Math.max(1, ...(data?.chats.map((c) => c.messages) ?? [1]));
  const tools = Object.entries(data?.assistant.tool_use ?? {});
  const maxTool = Math.max(1, ...tools.map(([, n]) => n));

  return (
    <section className="scrollbar-thin flex min-h-0 flex-1 flex-col overflow-y-auto bg-paper" aria-label="My insights">
      <header className="flex items-center gap-3 border-b border-line px-4 py-3 lg:px-6">
        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-ink text-paper">
          <BarChart3 size={18} aria-hidden />
        </span>
        <div className="flex-1">
          <h1 className="font-display text-[26px] leading-tight">My insights</h1>
          <p className="text-xs text-muted">Your last 7 days. Private to you, never shared with managers.</p>
        </div>
        <button onClick={load} className="flex h-10 items-center gap-1.5 rounded-lg px-3 text-xs font-medium text-muted hover:bg-paper-2 hover:text-ink">
          <RefreshCw size={14} /> Refresh
        </button>
      </header>

      <div className="mx-auto w-full max-w-5xl space-y-6 px-4 py-6 lg:px-6">
        {error && (
          <div role="alert" className="flex items-center justify-between rounded-xl border border-rust/30 bg-rust-soft px-4 py-3 text-sm text-rust">
            Couldn&rsquo;t load insights: {error}
            <button onClick={load} className="font-semibold underline">
              Retry
            </button>
          </div>
        )}

        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Kpi icon={ListTodo} label="Open tasks" value={data?.tasks.open} />
          <Kpi icon={AlertTriangle} label="Overdue" value={data?.tasks.overdue} tone={data && data.tasks.overdue > 0 ? "rust" : undefined} />
          <Kpi icon={Handshake} label="Promises tracked" value={data?.tasks.promises_tracked} />
          <Kpi icon={CheckCircle2} label="Completed" value={data?.tasks.done} tone="moss" />
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <Panel title="Where your week went" sub="Messages per chat, last 7 days">
            {!data ? (
              <Skeleton />
            ) : data.chats.length === 0 ? (
              <p className="text-sm text-muted">No activity this week.</p>
            ) : (
              <ul className="space-y-3">
                {data.chats.map((c) => (
                  <li key={c.chat_id}>
                    <button onClick={() => open({ kind: "chat", chatId: c.chat_id })} className="w-full text-left">
                      <span className="flex items-baseline justify-between text-sm">
                        <span className="truncate font-medium hover:underline">{c.name}</span>
                        <span className="ml-2 shrink-0 font-mono text-xs text-muted">
                          {c.messages} msg{c.files ? ` · ${c.files} file${c.files > 1 ? "s" : ""}` : ""}
                        </span>
                      </span>
                      <span className="mt-1.5 block h-2 rounded-full bg-paper-2" aria-hidden>
                        <span className="block h-2 rounded-full bg-blueprint" style={{ width: `${(c.messages / maxMsgs) * 100}%` }} />
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <Panel title="How you used Saathi" sub={data ? `${data.assistant.questions_7d} questions${data.assistant.median_latency_ms ? ` · median answer ${(data.assistant.median_latency_ms / 1000).toFixed(1)} s` : ""}` : " "}>
            {!data ? (
              <Skeleton />
            ) : tools.length === 0 ? (
              <div className="text-sm text-muted">
                No questions yet this week.{" "}
                <button onClick={() => open({ kind: "assistant" })} className="inline-flex items-center gap-1 font-medium text-blueprint hover:underline">
                  <Sparkles size={13} /> Ask Saathi
                </button>
              </div>
            ) : (
              <ul className="space-y-3">
                {tools.map(([tool, n]) => (
                  <li key={tool}>
                    <span className="flex items-baseline justify-between text-sm">
                      <span className="font-medium">{TOOL_LABEL[tool] ?? tool}</span>
                      <span className="font-mono text-xs text-muted">{n}×</span>
                    </span>
                    <span className="mt-1.5 block h-2 rounded-full bg-paper-2" aria-hidden>
                      <span className="block h-2 rounded-full bg-saffron" style={{ width: `${(n / maxTool) * 100}%` }} />
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>

        <Panel title="Decisions made around you" sub="Logged automatically from your chats">
          {!data ? (
            <Skeleton />
          ) : data.decisions.length === 0 ? (
            <p className="text-sm text-muted">No decisions recorded this week.</p>
          ) : (
            <ul className="divide-y divide-line">
              {data.decisions.map((d, i) => (
                <li key={i} className="flex gap-3 py-3">
                  <Gavel size={16} className="mt-0.5 shrink-0 text-moss" aria-hidden />
                  <div>
                    <p className="text-[15px]">{d.decision}</p>
                    <p className="mt-0.5 font-mono text-[11px] text-muted">
                      {d.chat} · {new Date(d.ts).toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "Asia/Kolkata" })}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </section>
  );
}

function Kpi({ icon: Icon, label, value, tone }: { icon: typeof ListTodo; label: string; value?: number; tone?: "rust" | "moss" }) {
  const color = tone === "rust" ? "text-rust" : tone === "moss" ? "text-moss" : "text-ink";
  return (
    <div className="rounded-2xl border border-line bg-white p-4">
      <p className="flex items-center gap-1.5 font-mono text-[10.5px] uppercase tracking-wider text-muted">
        <Icon size={13} aria-hidden /> {label}
      </p>
      <p className={`mt-2 font-display text-5xl leading-none tabular-nums ${color}`}>{value ?? <span className="inline-block h-10 w-10 animate-pulse rounded bg-paper-2" />}</p>
    </div>
  );
}

function Panel({ title, sub, children }: { title: string; sub: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-line bg-white p-5">
      <h2 className="text-base font-semibold">{title}</h2>
      <p className="mb-4 font-mono text-[11px] text-muted">{sub}</p>
      {children}
    </div>
  );
}

function Skeleton() {
  return (
    <div className="space-y-3" aria-hidden>
      {[80, 60, 70].map((w) => (
        <span key={w} className="block h-4 animate-pulse rounded bg-paper-2" style={{ width: `${w}%` }} />
      ))}
    </div>
  );
}
