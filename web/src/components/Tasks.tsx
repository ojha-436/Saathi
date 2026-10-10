"use client";

import clsx from "clsx";
import { AtSign, Bell, CalendarClock, CheckCircle2, Circle, CircleDot, Clock, ListTodo, Loader2, Octagon, Plus, Sparkles, UserCheck, Users, X } from "@/lib/icons";
import { useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import { dueLabel, isOverdue, timeShort } from "@/lib/format";
import type { Notice, Task } from "@/lib/types";
import { Avatar, CiteChip, Menu, UserAvatar } from "./bits";
import { useWs, type TaskPrefill } from "./ctx";
import { Modal, ModalHeader } from "./Dialogs";

const KIND_LABEL: Record<Task["kind"], string> = { reminder: "Reminder", todo: "To-do", follow_up: "Follow-up", promise: "Promise" };
const STATUS_LABEL: Record<Task["status"], string> = { proposed: "Draft", open: "To do", in_progress: "In progress", blocked: "Blocked", done: "Done", dismissed: "Dismissed" };
const LIVE = ["open", "in_progress", "blocked"];

async function act(id: string, action: string) {
  await api(`/api/tasks/${id}/${action}`, { method: "POST" });
}

const assigneeOf = (t: Task) => t.assignee ?? t.owner;
const creatorOf = (t: Task) => t.creator ?? t.owner;

/** Card shown in the assistant chat for a task Saathi proposed. */
export function ProposedTaskCard({ task }: { task: Task }) {
  const { uid, users } = useWs();
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
  const other = assigneeOf(task) !== uid ? users[assigneeOf(task)]?.name : null;
  return (
    <div className="mt-3 max-w-sm rounded-xl border border-border bg-canvas/60 p-3.5">
      <div className="flex items-center gap-1.5 font-mono text-[10.5px] uppercase tracking-wider text-muted">
        <Clock size={12} /> {other ? "Assign task" : KIND_LABEL[task.kind]}
      </div>
      <div className="mt-1 text-[15px] font-semibold">{task.title}</div>
      {other && (
        <div className="mt-1 flex items-center gap-1.5 text-xs">
          <UserAvatar uid={assigneeOf(task)} size={18} dot={false} clickable={false} /> Assigned to <b>{other}</b>
        </div>
      )}
      <div className="font-mono text-xs text-muted">{dueLabel(task.due_at)}</div>
      {state === "proposed" ? (
        <div className="mt-2 flex gap-2">
          <button onClick={() => run("confirm")} disabled={busy} className="flex h-9 items-center gap-1 rounded-lg bg-brand px-3.5 text-xs font-semibold text-white hover:bg-brand-strong disabled:opacity-60">
            {busy ? <Loader2 size={12} className="animate-spin" /> : <CheckCircle2 size={12} />} {other ? `Confirm & notify ${other.split(" ")[0]}` : "Confirm"}
          </button>
          <button onClick={() => run("dismiss")} disabled={busy} className="h-9 rounded-lg px-3 text-xs font-medium text-muted hover:bg-hover">
            Discard
          </button>
        </div>
      ) : (
        <div className={clsx("mt-2 flex items-center gap-1 text-xs font-semibold", state === "dismissed" ? "text-muted" : "text-moss")}>
          {state === "dismissed" ? "Discarded" : state === "done" ? "Done" : other ? `Assigned. ${other.split(" ")[0]} has been notified.` : "Saved. Saathi will remind you."}
        </div>
      )}
    </div>
  );
}

/** Create a task for yourself or a colleague (from anywhere: chat message, profile card, ⌘K, Tasks page). */
export function TaskDialog({ prefill, onClose }: { prefill: TaskPrefill; onClose: () => void }) {
  const { uid, users, toast } = useWs();
  const [title, setTitle] = useState(prefill.title ?? "");
  const [assignee, setAssignee] = useState(prefill.assignee ?? uid);
  const [due, setDue] = useState(prefill.due ?? "");
  const [busy, setBusy] = useState(false);
  const people = Object.values(users)
    .filter((u) => !u.deactivated)
    .sort((a, b) => (a.id === uid ? -1 : b.id === uid ? 1 : a.name.localeCompare(b.name)));

  async function save() {
    setBusy(true);
    try {
      await api("/api/tasks", {
        json: { text: title, assignee, due_at: due ? new Date(due).toISOString() : null, source_ref: prefill.sourceRef ?? null },
      });
      toast(assignee === uid ? "Task added." : `Task assigned to ${users[assignee]?.name.split(" ")[0]}. They've been notified.`);
      onClose();
    } catch (e) {
      toast((e as Error).message);
      setBusy(false);
    }
  }

  return (
    <Modal title="New task" onClose={onClose}>
      <ModalHeader title="New task" sub={prefill.sourceRef ? "Linked to the message it came from." : undefined} onClose={onClose} />
      <form
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
        className="space-y-4 p-5"
      >
        <label className="block text-sm font-medium">
          What needs doing?
          <textarea autoFocus value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} rows={2} placeholder="e.g. Send revised PO to Om Castings" className="mt-1 w-full resize-none rounded-lg border border-border px-3 py-2 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-brand/15" />
        </label>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block text-sm font-medium">
            Assign to
            <select value={assignee} onChange={(e) => setAssignee(e.target.value)} className="mt-1 h-10 w-full rounded-lg border border-border bg-surface px-2 text-sm">
              {people.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.id === uid ? `Me (${u.name})` : `${u.name}${u.role ? ` · ${u.role}` : ""}`}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm font-medium">
            Due
            <input type="datetime-local" value={due} onChange={(e) => setDue(e.target.value)} className="mt-1 h-10 w-full rounded-lg border border-border bg-surface px-2 text-sm" />
          </label>
        </div>
        {assignee !== uid && <p className="rounded-lg bg-brand-soft/60 px-3 py-2 text-xs text-brand">{users[assignee]?.name} gets a notification. You&rsquo;ll be told when it&rsquo;s started, blocked or done.</p>}
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="h-9 rounded-lg px-4 text-sm font-medium text-muted hover:bg-hover">
            Cancel
          </button>
          <button disabled={busy || !title.trim()} className="flex h-9 items-center gap-2 rounded-lg bg-brand px-4 text-sm font-semibold text-white hover:bg-brand-strong disabled:opacity-40">
            {busy && <Loader2 size={14} className="animate-spin" />} {assignee === uid ? "Add task" : "Assign task"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

export function PageHeader({ icon: Icon, title, sub, children }: { icon: typeof Bell; title: string; sub: string; children?: React.ReactNode }) {
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

type TaskTab = "mine" | "delegated" | "watching";

export function TasksView({ tasks }: { tasks: Task[] }) {
  const { uid, toast, newTask } = useWs();
  const [tab, setTab] = useState<TaskTab>("mine");
  const [quick, setQuick] = useState("");
  const [adding, setAdding] = useState(false);

  const lists = useMemo(() => {
    const mine = tasks.filter((t) => assigneeOf(t) === uid && t.status !== "proposed");
    const delegated = tasks.filter((t) => creatorOf(t) === uid && assigneeOf(t) !== uid && t.status !== "proposed");
    const watching = tasks.filter((t) => t.watchers?.includes(uid) && creatorOf(t) !== uid && t.status !== "proposed");
    return { mine, delegated, watching };
  }, [tasks, uid]);
  const list = lists[tab];
  const live = list.filter((t) => LIVE.includes(t.status)).sort((a, b) => (a.due_at?.toMillis() ?? Infinity) - (b.due_at?.toMillis() ?? Infinity));
  const overdue = live.filter((t) => isOverdue(t.due_at));
  const upcoming = live.filter((t) => t.due_at && !isOverdue(t.due_at));
  const undated = live.filter((t) => !t.due_at);
  const done = list.filter((t) => t.status === "done").slice(0, 10);

  async function add() {
    if (!quick.trim()) return;
    setAdding(true);
    try {
      await api("/api/tasks", { json: { text: quick } });
      setQuick("");
    } catch (e) {
      toast((e as Error).message);
    } finally {
      setAdding(false);
    }
  }

  const group = (label: string, rows: Task[], tone?: string) =>
    rows.length > 0 && (
      <section className="mt-5" aria-label={label}>
        <h2 className={clsx("mb-1 px-2 text-xs font-semibold", tone ?? "text-muted")}>
          {label} <span className="font-normal">· {rows.length}</span>
        </h2>
        <div className="rounded-xl border border-border bg-surface">
          {rows.map((t) => (
            <TaskRow key={t.id} t={t} perspective={tab} />
          ))}
        </div>
      </section>
    );

  const tabs: [TaskTab, string, typeof UserCheck][] = [
    ["mine", "Assigned to me", UserCheck],
    ["delegated", "Delegated", Users],
    ["watching", "Watching", CircleDot],
  ];

  return (
    <section className="flex min-h-0 flex-1 flex-col" aria-label="Tasks">
      <PageHeader icon={ListTodo} title="Tasks" sub="Your to-dos, work you've assigned to others, and promises you're tracking.">
        <button onClick={() => newTask()} className="flex h-9 items-center gap-1.5 rounded-lg bg-brand px-3 text-[13px] font-semibold text-white hover:bg-brand-strong">
          <Plus size={15} /> New task
        </button>
      </PageHeader>
      <div className="border-b border-border px-4 lg:px-6">
        <div role="tablist" className="flex gap-1">
          {tabs.map(([k, label, I]) => {
            const n = lists[k].filter((t) => LIVE.includes(t.status)).length;
            return (
              <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)} className={clsx("relative flex h-11 items-center gap-1.5 px-2.5 text-sm font-medium", tab === k ? "text-ink" : "text-muted hover:text-ink")}>
                <I size={15} aria-hidden /> {label}
                {n > 0 && <span className="rounded-full bg-canvas px-1.5 text-[11px]">{n}</span>}
                {tab === k && <span className="absolute inset-x-2 bottom-0 h-[3px] rounded-t bg-brand" aria-hidden />}
              </button>
            );
          })}
        </div>
      </div>
      <div className="scrollbar-thin flex-1 overflow-y-auto bg-canvas/50 px-4 py-5 lg:px-8">
        <div className="mx-auto max-w-3xl">
          {tab === "mine" && (
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
              <input id="new-task" value={quick} onChange={(e) => setQuick(e.target.value)} placeholder="Quick to-do… or ask Saathi “Rahul ko PO ka task do Friday tak”" className="h-9 flex-1 bg-transparent text-sm outline-none" />
              <button disabled={adding || !quick.trim()} className="h-9 rounded-lg bg-brand px-4 text-[13px] font-semibold text-white hover:bg-brand-strong disabled:opacity-40">
                Add
              </button>
            </form>
          )}
          {live.length === 0 && (
            <div className="mt-16 text-center">
              <CheckCircle2 size={28} className="mx-auto text-moss" aria-hidden />
              <p className="mt-2 font-semibold">{tab === "mine" ? "Nothing pending" : tab === "delegated" ? "Nothing delegated" : "Not watching anything"}</p>
              <p className="mt-1 text-sm text-muted">
                {tab === "mine"
                  ? "Ask Saathi to remind you of something, or track a promise in any chat."
                  : tab === "delegated"
                    ? "Assign work from a message (⋯ → Create task), a colleague's profile, or a meeting's action items."
                    : "When someone assigns a task you're copied on, it shows up here."}
              </p>
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

export function TaskRow({ t, perspective = "mine", compact }: { t: Task; perspective?: TaskTab; compact?: boolean }) {
  const { uid, users, toast } = useWs();
  const done = t.status === "done";
  const overdue = !done && isOverdue(t.due_at);
  const assignee = assigneeOf(t);
  const canEdit = assignee === uid || creatorOf(t) === uid;
  const run = (a: string) => act(t.id, a).catch((e) => toast(e.message));
  const who = perspective === "mine" ? (creatorOf(t) !== uid ? { uid: creatorOf(t), label: "from" } : null) : { uid: assignee, label: "→" };
  return (
    <div className={clsx("group flex items-start gap-2.5 border-b border-border px-3 last:border-b-0 hover:bg-canvas/60", compact ? "py-2" : "py-2.5")}>
      <button
        onClick={() => canEdit && run(done ? "reopen" : "done")}
        disabled={!canEdit}
        className={clsx("mt-0.5", done ? "text-moss" : "text-muted/60 hover:text-moss disabled:hover:text-muted/60")}
        aria-label={done ? "Mark as open" : "Mark as done"}
      >
        {done ? <CheckCircle2 size={18} /> : t.status === "blocked" ? <Octagon size={18} className="text-rust" /> : t.status === "in_progress" ? <CircleDot size={18} className="text-brand" /> : <Circle size={18} />}
      </button>
      <div className="min-w-0 flex-1">
        <div className={clsx("text-sm", done ? "text-muted line-through" : "")}>{t.title}</div>
        <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11px]">
          {t.status !== "open" && !done && (
            <span className={clsx("rounded px-1.5 py-0.5 font-semibold", t.status === "blocked" ? "bg-rust-soft text-rust" : "bg-brand-soft text-brand")}>{STATUS_LABEL[t.status]}</span>
          )}
          <span className={clsx("rounded px-1.5 py-0.5 font-semibold", t.kind === "promise" ? "bg-plum-soft text-plum" : "bg-canvas text-ink/70")}>{KIND_LABEL[t.kind]}</span>
          {who && users[who.uid] && (
            <span className="flex items-center gap-1 text-muted">
              {who.label} <Avatar name={users[who.uid].name} size={16} /> {users[who.uid].name.split(" ")[0]}
            </span>
          )}
          {t.due_at && (
            <span className={clsx("flex items-center gap-1", overdue ? "font-semibold text-rust" : "text-muted")}>
              <CalendarClock size={11} aria-hidden />
              <span className="font-mono">
                {overdue ? "Overdue · " : ""}
                {dueLabel(t.due_at)}
              </span>
            </span>
          )}
          {t.source_ref && !compact && <CiteChip refId={t.source_ref} />}
        </div>
      </div>
      {canEdit && !done && (
        <Menu
          label="Task options"
          className="flex h-8 w-8 items-center justify-center rounded-md text-muted opacity-60 hover:bg-border hover:opacity-100 focus:opacity-100 group-hover:opacity-100"
          trigger={<span className="text-lg leading-none">⋯</span>}
          items={[
            ...(t.status !== "in_progress" ? [{ label: "Mark in progress", icon: CircleDot, onSelect: () => run("start") }] : []),
            ...(t.status !== "blocked" ? [{ label: "Mark blocked", icon: Octagon, onSelect: () => run("block") }] : []),
            ...(t.status !== "open" ? [{ label: "Back to to-do", icon: Circle, onSelect: () => run("reopen") }] : []),
            { label: "Mark done", icon: CheckCircle2, onSelect: () => run("done") },
            ...(creatorOf(t) === uid ? (["sep", { label: "Remove task", icon: X, danger: true, onSelect: () => run("dismiss") }] as const) : []),
          ]}
        />
      )}
    </div>
  );
}

const NOTICE_ICON: Record<string, typeof Bell> = { mention: AtSign, task_assigned: UserCheck, task_update: CheckCircle2, reminder: Clock, meeting: Users };

export function ActivityView({ notices }: { notices: Notice[] }) {
  const { openRef, open } = useWs();
  const [filter, setFilter] = useState<"all" | "mention" | "task" | "reminder">("all");
  const unread = notices.filter((n) => !n.read).length;
  useEffect(() => {
    if (unread) {
      const t = setTimeout(() => api("/api/notifications/read", { method: "POST" }).catch(() => {}), 1500);
      return () => clearTimeout(t);
    }
  }, [unread]);
  const rows = notices.filter((n) => filter === "all" || (filter === "task" ? n.kind?.startsWith("task") : n.kind === filter));
  return (
    <section className="flex min-h-0 flex-1 flex-col" aria-label="Activity">
      <PageHeader icon={Bell} title="Activity" sub="Mentions, tasks assigned to you, task updates, reminders and meeting summaries." />
      <div className="flex gap-1.5 border-b border-border px-4 py-2 lg:px-6" role="group" aria-label="Filter">
        {(["all", "mention", "task", "reminder"] as const).map((f) => (
          <button key={f} onClick={() => setFilter(f)} aria-pressed={filter === f} className={clsx("h-7 rounded-full border px-2.5 text-xs font-medium capitalize", filter === f ? "border-brand bg-brand-soft text-brand" : "border-border text-muted hover:text-ink")}>
            {f === "mention" ? "@Mentions" : f === "task" ? "Tasks" : f === "reminder" ? "Reminders" : "All"}
          </button>
        ))}
      </div>
      <div className="scrollbar-thin flex-1 overflow-y-auto bg-canvas/50 px-4 py-5 lg:px-8">
        <div className="mx-auto max-w-3xl">
          {rows.length === 0 && (
            <div className="mt-16 text-center">
              <Bell size={28} className="mx-auto text-muted" aria-hidden />
              <p className="mt-2 font-semibold">No activity yet</p>
              <p className="mt-1 text-sm text-muted">Mentions, assignments and reminders show up here.</p>
            </div>
          )}
          <ul className="space-y-2">
            {rows.map((n) => {
              const I = NOTICE_ICON[n.kind ?? "reminder"] ?? Clock;
              const go = () => (n.source_ref ? openRef(n.source_ref) : n.task_id ? open({ kind: "tasks" }) : undefined);
              return (
                <li key={n.id}>
                  <button onClick={go} className={clsx("flex w-full gap-3 rounded-xl border bg-surface p-3.5 text-left transition hover:border-[#c5cad3]", n.read ? "border-border" : "border-saffron/50 shadow-[inset_3px_0_0_var(--color-saffron)]")}>
                    <span className={clsx("flex h-9 w-9 shrink-0 items-center justify-center rounded-full", n.kind === "mention" ? "bg-brand-soft text-brand" : n.kind?.startsWith("task") ? "bg-moss-soft text-moss" : "bg-saffron-soft text-saffron-ink")} aria-hidden>
                      <I size={16} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="text-sm font-semibold">{n.title}</span>
                        <span className="shrink-0 text-xs text-muted">{timeShort(n.ts)}</span>
                      </div>
                      <div className="mt-0.5 line-clamp-2 text-sm text-ink/80">{n.body}</div>
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </section>
  );
}
