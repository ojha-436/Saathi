"use client";

import { ArrowRight, AtSign, CalendarDays, CheckCircle2, FileText, Hand, ListTodo, Plus, Radar, Sun, Users } from "lucide-react";
import { useState } from "react";
import { toDate } from "@/lib/format";
import type { Notice, Task } from "@/lib/types";
import { useWs } from "./ctx";
import { TaskRow } from "./Tasks";

const LIVE = ["open", "in_progress", "blocked"];

function Card({ icon: Icon, title, count, action, children }: { icon: typeof Sun; title: string; count?: number; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="flex min-h-0 flex-col rounded-2xl border border-border bg-surface" aria-label={title}>
      <header className="flex items-center gap-2 border-b border-border px-4 py-3">
        <Icon size={16} className="text-muted" aria-hidden />
        <h2 className="flex-1 text-sm font-bold">
          {title} {count ? <span className="ml-1 rounded-full bg-canvas px-1.5 text-[11px] font-semibold text-muted">{count}</span> : null}
        </h2>
        {action}
      </header>
      <div className="min-h-0 flex-1">{children}</div>
    </section>
  );
}

function Empty({ text }: { text: string }) {
  return <p className="px-4 py-6 text-center text-sm text-muted">{text}</p>;
}

/** Start-of-day home: what I owe, what's owed to me, meetings, mentions, and a one-click brief. */
export function MyDayView({ tasks, notices }: { tasks: Task[]; notices: Notice[] }) {
  const { uid, me, account, meetings, open, openRef, dialog, newTask } = useWs();
  // Clock captured once per mount (render must stay pure)
  const [{ now, endOfToday }] = useState(() => {
    const d = new Date();
    const n = d.getTime();
    d.setHours(23, 59, 59, 999);
    return { now: n, endOfToday: d.getTime() };
  });

  const mine = tasks.filter((t) => (t.assignee ?? t.owner) === uid && LIVE.includes(t.status));
  const dueToday = mine.filter((t) => t.due_at && t.due_at.toMillis() <= endOfToday).sort((a, b) => a.due_at!.toMillis() - b.due_at!.toMillis());
  const nextUp = mine.filter((t) => !dueToday.includes(t)).sort((a, b) => (a.due_at?.toMillis() ?? Infinity) - (b.due_at?.toMillis() ?? Infinity)).slice(0, 3);
  const owed = tasks
    .filter((t) => (t.creator === uid || t.watchers?.includes(uid)) && (t.assignee ?? t.owner) !== uid && LIVE.includes(t.status))
    .sort((a, b) => (a.due_at?.toMillis() ?? Infinity) - (b.due_at?.toMillis() ?? Infinity));
  const mentions = notices.filter((n) => n.kind === "mention").slice(0, 5);
  const recentMeetings = Object.values(meetings)
    .sort((a, b) => (b.held_at?.toMillis() ?? 0) - (a.held_at?.toMillis() ?? 0))
    .slice(0, 4);

  const first = me?.name.split(" ")[0] ?? "";
  const hour = +new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata", hour: "numeric", hour12: false });
  const greet = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  const overdue = mine.filter((t) => t.due_at && t.due_at.toMillis() < now).length;

  return (
    <section className="scrollbar-thin flex min-h-0 flex-1 flex-col overflow-y-auto bg-canvas/50" aria-label="My Day">
      <div className="mx-auto w-full max-w-6xl px-4 py-6 lg:px-8">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-muted">
              {new Date().toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata", weekday: "long", day: "numeric", month: "long" })} · {account.org.name}
            </p>
            <h1 className="mt-1 text-[28px] font-bold tracking-tight">
              {greet}, {first}.
            </h1>
            <p className="mt-1 text-sm text-muted">
              {dueToday.length ? `${dueToday.length} due today` : "Nothing due today"}
              {overdue ? ` · ${overdue} overdue` : ""} · {owed.length} owed to you · {mentions.filter((m) => !m.read).length} new mentions
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button onClick={() => open({ kind: "assistant", prompt: "What did I miss in the last 24 hours?" })} className="flex h-10 items-center gap-2 rounded-lg bg-ink px-4 text-sm font-semibold text-white hover:bg-ink-3">
              <Radar size={16} className="text-saffron" /> Brief me
            </button>
            <button onClick={() => newTask()} className="flex h-10 items-center gap-2 rounded-lg border border-border bg-surface px-3.5 text-sm font-semibold hover:bg-hover">
              <Plus size={16} /> Task
            </button>
            <button onClick={() => dialog("meeting-new")} className="flex h-10 items-center gap-2 rounded-lg border border-border bg-surface px-3.5 text-sm font-semibold hover:bg-hover">
              <Users size={16} /> Meeting notes
            </button>
          </div>
        </div>

        <div className="mt-6 grid gap-4 lg:grid-cols-2">
          <Card icon={ListTodo} title="Due today" count={dueToday.length} action={<GoLink onClick={() => open({ kind: "tasks" })} />}>
            {dueToday.length ? dueToday.map((t) => <TaskRow key={t.id} t={t} compact />) : <Empty text="Nothing due today. 🎉" />}
            {nextUp.length > 0 && (
              <>
                <p className="border-t border-border px-4 pb-1 pt-3 text-[11px] font-semibold uppercase tracking-wide text-muted">Coming up</p>
                {nextUp.map((t) => (
                  <TaskRow key={t.id} t={t} compact />
                ))}
              </>
            )}
          </Card>

          <Card icon={Hand} title="Owed to you" count={owed.length} action={<GoLink onClick={() => open({ kind: "tasks" })} />}>
            {owed.length ? owed.slice(0, 6).map((t) => <TaskRow key={t.id} t={t} perspective="delegated" compact />) : <Empty text="Nobody owes you anything right now. Assign work from any message or meeting." />}
          </Card>

          <Card icon={CalendarDays} title="Meetings" count={recentMeetings.length} action={<button onClick={() => dialog("meeting-new")} className="text-xs font-semibold text-brand hover:underline">+ Add notes</button>}>
            {recentMeetings.length ? (
              <ul>
                {recentMeetings.map((m) => {
                  const open_ = m.action_items.filter((a) => !a.task_id).length;
                  return (
                    <li key={m.id}>
                      <button onClick={() => open({ kind: "meeting", id: m.id })} className="flex w-full items-center gap-3 border-b border-border px-4 py-2.5 text-left last:border-b-0 hover:bg-canvas/60">
                        <span className="flex h-9 w-9 shrink-0 flex-col items-center justify-center rounded-lg bg-brand-soft text-brand" aria-hidden>
                          <span className="text-[9px] font-bold uppercase leading-none">{toDate(m.held_at)?.toLocaleDateString("en-IN", { month: "short" })}</span>
                          <span className="text-sm font-bold leading-none">{toDate(m.held_at)?.getDate()}</span>
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-semibold">{m.title}</span>
                          <span className="block truncate text-xs text-muted">
                            {m.participants.length} people · {m.decisions.length} decisions · {open_ ? `${open_} action items to assign` : "all action items tracked"}
                          </span>
                        </span>
                        <ArrowRight size={15} className="text-muted" aria-hidden />
                      </button>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <div className="px-4 py-6 text-center text-sm text-muted">
                <FileText size={22} className="mx-auto mb-2" aria-hidden />
                Paste notes or upload a transcript from Meet, Teams or Zoom. Saathi pulls out decisions and action items with owners.
                <p className="mt-2 text-xs">Calendar sync for Google and Microsoft is coming next.</p>
              </div>
            )}
          </Card>

          <Card icon={AtSign} title="Mentions" count={mentions.filter((m) => !m.read).length} action={<GoLink onClick={() => open({ kind: "activity" })} />}>
            {mentions.length ? (
              <ul>
                {mentions.map((n) => (
                  <li key={n.id}>
                    <button onClick={() => n.source_ref && openRef(n.source_ref)} className="flex w-full flex-col border-b border-border px-4 py-2.5 text-left last:border-b-0 hover:bg-canvas/60">
                      <span className="flex items-center gap-1.5 text-xs font-semibold">
                        {!n.read && <span className="h-1.5 w-1.5 rounded-full bg-brand" aria-label="Unread" />} {n.title}
                      </span>
                      <span className="line-clamp-1 text-sm text-ink/80">{n.body}</span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <Empty text="No mentions yet." />
            )}
          </Card>
        </div>

        {!mine.length && !owed.length && !recentMeetings.length && (
          <p className="mt-6 flex items-center justify-center gap-2 text-sm text-muted">
            <CheckCircle2 size={16} className="text-moss" /> Tip: in any chat, hover a message → ⋯ → Create task, or type @ to mention a colleague.
          </p>
        )}
      </div>
    </section>
  );
}

function GoLink({ onClick }: { onClick: () => void }) {
  return (
    <button onClick={onClick} className="flex items-center gap-1 text-xs font-semibold text-brand hover:underline">
      View all <ArrowRight size={12} />
    </button>
  );
}
