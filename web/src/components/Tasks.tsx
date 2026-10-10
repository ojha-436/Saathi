"use client";

import clsx from "clsx";
import { Bell, CheckCircle2, Circle, Clock, ListTodo, Loader2, Plus, Sparkles, X } from "lucide-react";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { dueLabel, isOverdue, timeShort } from "@/lib/format";
import type { Notice, Task } from "@/lib/types";
import { CiteChip } from "./bits";
import { useWs } from "./ctx";

const KIND_LABEL: Record<Task["kind"], string> = { reminder: "Reminder", todo: "To-do", follow_up: "Follow-up", promise: "Promise" };

async function act(id: string, action: string) {
  await api(`/api/tasks/${id}/${action}`, { method: "POST" });
}

/** Card shown in the assistant chat for a task Saathi proposed. */
export function ProposedTaskCard({ task }: { task: Task }) {
  const [busy, setBusy] = useState(false);
  const run = async (a: string) => {
    setBusy(true);
    try {
      await act(task.id, a);
    } finally {
      setBusy(false);
    }
  };
  const state = task.status;
  return (
    <div className="mt-3 max-w-sm rounded-xl border border-border bg-canvas/60 p-3.5">
      <div className="flex items-center gap-1.5 font-mono text-[10.5px] uppercase tracking-wider text-muted">
        <Clock size={12} /> {KIND_LABEL[task.kind]}
      </div>
      <div className="mt-1 text-[15px] font-semibold">{task.title}</div>
      <div className="font-mono text-xs text-muted">{dueLabel(task.due_at)}</div>
      {state === "proposed" ? (
        <div className="mt-2 flex gap-2">
          <button onClick={() => run("confirm")} disabled={busy} className="flex h-9 items-center gap-1 rounded-lg bg-brand px-3.5 text-xs font-semibold text-white hover:bg-brand-strong disabled:opacity-60">
            {busy ? <Loader2 size={12} className="animate-spin" /> : <CheckCircle2 size={12} />} Confirm
          </button>
          <button onClick={() => run("dismiss")} disabled={busy} className="h-9 rounded-lg px-3 text-xs font-medium text-muted hover:bg-hover">
            Discard
          </button>
        </div>
      ) : (
        <div className={clsx("mt-2 flex items-center gap-1 text-xs font-semibold", state === "dismissed" ? "text-muted" : "text-moss")}>
          {state === "dismissed" ? "Discarded" : state === "done" ? "Done" : "Saved. Saathi will remind you."}
        </div>
      )}
    </div>
  );
}

function PageHeader({ icon: Icon, title, sub, children }: { icon: typeof Bell; title: string; sub: string; children?: React.ReactNode }) {
  const { open } = useWs();
  return (
    <header className="flex h-14 shrink-0 items-center gap-3 border-b border-border px-4 lg:h-12 lg:px-6">
      <Icon size={18} className="text-muted" aria-hidden />
      <div className="min-w-0 flex-1">
        <h1 className="text-[15px] font-bold leading-tight">{title}</h1>
        <p className="hidden truncate text-xs text-muted sm:block">{sub}</p>
      </div>
      {children}
      <button onClick={() => open({ kind: "assistant" })} className="hidden h-9 items-center gap-1.5 rounded-lg border border-border px-3 text-[13px] font-semibold hover:bg-hover sm:flex">
        <Sparkles size={14} className="text-saffron-ink" /> Ask Saathi
      </button>
    </header>
  );
}

export function TasksView({ tasks }: { tasks: Task[] }) {
  const { toast } = useWs();
  const [newTask, setNewTask] = useState("");
  const [adding, setAdding] = useState(false);
  const open = tasks
    .filter((t) => t.status === "open")
    .sort((a, b) => (a.due_at?.toMillis() ?? Infinity) - (b.due_at?.toMillis() ?? Infinity));
  const overdue = open.filter((t) => isOverdue(t.due_at));
  const upcoming = open.filter((t) => t.due_at && !isOverdue(t.due_at));
  const undated = open.filter((t) => !t.due_at);
  const done = tasks.filter((t) => t.status === "done").slice(0, 10);

  async function add() {
    if (!newTask.trim()) return;
    setAdding(true);
    try {
      await api("/api/tasks", { json: { text: newTask } });
      setNewTask("");
    } catch (e) {
      toast((e as Error).message);
    } finally {
      setAdding(false);
    }
  }

  const group = (label: string, list: Task[], tone?: string) =>
    list.length > 0 && (
      <section className="mt-5" aria-label={label}>
        <h2 className={clsx("mb-1 px-2 text-xs font-semibold", tone ?? "text-muted")}>
          {label} <span className="font-normal">· {list.length}</span>
        </h2>
        <div className="rounded-xl border border-border bg-surface">
          {list.map((t) => (
            <TaskRow key={t.id} t={t} />
          ))}
        </div>
      </section>
    );

  return (
    <section className="flex min-h-0 flex-1 flex-col" aria-label="My tasks">
      <PageHeader icon={ListTodo} title="Tasks" sub="Reminders, follow-ups and promises you're tracking. Saathi nudges you when they're due." />
      <div className="scrollbar-thin flex-1 overflow-y-auto bg-canvas/50 px-4 py-5 lg:px-8">
        <div className="mx-auto max-w-3xl">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              add();
            }}
            className="flex gap-2 rounded-xl border border-border bg-surface p-1.5 focus-within:border-brand focus-within:ring-2 focus-within:ring-brand/15"
          >
            <Plus size={16} className="ml-2 self-center text-muted" aria-hidden />
            <label htmlFor="new-task" className="sr-only">
              Add a to-do
            </label>
            <input id="new-task" value={newTask} onChange={(e) => setNewTask(e.target.value)} placeholder="Add a to-do… or ask Saathi “remind me kal subah 10 baje”" className="h-9 flex-1 bg-transparent text-sm outline-none" />
            <button disabled={adding || !newTask.trim()} className="h-9 rounded-lg bg-brand px-4 text-[13px] font-semibold text-white hover:bg-brand-strong disabled:opacity-40">
              Add
            </button>
          </form>
          {open.length === 0 && (
            <div className="mt-16 text-center">
              <CheckCircle2 size={28} className="mx-auto text-moss" aria-hidden />
              <p className="mt-2 font-semibold">Nothing pending</p>
              <p className="mt-1 text-sm text-muted">Ask Saathi to remind you of something, or track a promise in any chat.</p>
            </div>
          )}
          {group("Overdue", overdue, "text-rust")}
          {group("Upcoming", upcoming)}
          {group("No due date", undated)}
          {group("Completed", done)}
        </div>
      </div>
    </section>
  );
}

export function ActivityView({ notices }: { notices: Notice[] }) {
  const unread = notices.filter((n) => !n.read).length;
  useEffect(() => {
    if (unread) api("/api/notifications/read", { method: "POST" }).catch(() => {});
  }, [unread]);
  return (
    <section className="flex min-h-0 flex-1 flex-col" aria-label="Activity">
      <PageHeader icon={Bell} title="Activity" sub="Reminders and follow-ups that came due." />
      <div className="scrollbar-thin flex-1 overflow-y-auto bg-canvas/50 px-4 py-5 lg:px-8">
        <div className="mx-auto max-w-3xl">
          {notices.length === 0 && (
            <div className="mt-16 text-center">
              <Bell size={28} className="mx-auto text-muted" aria-hidden />
              <p className="mt-2 font-semibold">No activity yet</p>
              <p className="mt-1 text-sm text-muted">When a reminder or tracked promise comes due, it shows up here.</p>
            </div>
          )}
          <ul className="space-y-2">
            {notices.map((n) => (
              <li key={n.id} className={clsx("flex gap-3 rounded-xl border bg-surface p-3.5", n.read ? "border-border" : "border-saffron/50 shadow-[inset_3px_0_0_var(--color-saffron)]")}>
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-saffron-soft text-saffron-ink" aria-hidden>
                  <Clock size={16} />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-sm font-semibold">{n.title}</span>
                    <span className="shrink-0 text-xs text-muted">{timeShort(n.ts)}</span>
                  </div>
                  <div className="mt-0.5 text-sm">{n.body}</div>
                  {n.source_ref && (
                    <div className="mt-1.5">
                      <CiteChip refId={n.source_ref} />
                    </div>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}

function TaskRow({ t }: { t: Task }) {
  const { toast } = useWs();
  const done = t.status === "done";
  const overdue = !done && isOverdue(t.due_at);
  return (
    <div className="group flex items-start gap-2.5 border-b border-border px-3 py-2.5 last:border-b-0 hover:bg-canvas/60">
      <button
        onClick={() => act(t.id, done ? "reopen" : "done").catch((e) => toast(e.message))}
        className={clsx("mt-0.5", done ? "text-moss" : "text-muted/60 hover:text-moss")}
        aria-label={done ? "Mark as open" : "Mark as done"}
      >
        {done ? <CheckCircle2 size={18} /> : <Circle size={18} />}
      </button>
      <div className="min-w-0 flex-1">
        <div className={clsx("text-sm", done ? "text-muted line-through" : "")}>{t.title}</div>
        <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11px]">
          <span className={clsx("rounded px-1.5 py-0.5 font-semibold", t.kind === "promise" ? "bg-plum-soft text-plum" : "bg-canvas text-ink/70")}>{KIND_LABEL[t.kind]}</span>
          {t.due_at && <span className={clsx(overdue ? "font-semibold text-rust" : "text-muted")}><span className="font-mono">{overdue ? "Overdue · " : ""}{dueLabel(t.due_at)}</span></span>}
          {t.source_ref && <CiteChip refId={t.source_ref} />}
        </div>
      </div>
      {!done && (
        <button onClick={() => act(t.id, "dismiss")} className="flex h-8 w-8 items-center justify-center rounded-md text-muted opacity-0 transition hover:bg-border focus:opacity-100 group-hover:opacity-100" aria-label="Remove task">
          <X size={14} />
        </button>
      )}
    </div>
  );
}
