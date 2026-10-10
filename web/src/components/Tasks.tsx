"use client";

import clsx from "clsx";
import { Bell, CheckCircle2, Circle, Clock, ListTodo, Loader2, Plus, X } from "lucide-react";
import { useState } from "react";
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
    <div className="mt-2 max-w-sm rounded-xl border border-line bg-paper p-3.5">
      <div className="flex items-center gap-1.5 font-mono text-[10.5px] uppercase tracking-wider text-muted">
        <Clock size={12} /> {KIND_LABEL[task.kind]}
      </div>
      <div className="mt-1 text-[15px] font-semibold">{task.title}</div>
      <div className="font-mono text-xs text-muted">{dueLabel(task.due_at)}</div>
      {state === "proposed" ? (
        <div className="mt-2 flex gap-2">
          <button onClick={() => run("confirm")} disabled={busy} className="flex items-center gap-1 h-9 rounded-lg bg-ink px-3.5 text-xs font-semibold text-paper hover:bg-ink-3 disabled:opacity-60">
            {busy ? <Loader2 size={12} className="animate-spin" /> : <CheckCircle2 size={12} />} Confirm
          </button>
          <button onClick={() => run("dismiss")} disabled={busy} className="h-9 rounded-lg px-3 text-xs font-medium text-muted hover:bg-paper-2">
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

export function RightPanel({ tasks, notices }: { tasks: Task[]; notices: Notice[] }) {
  const [tab, setTab] = useState<"tasks" | "alerts">("tasks");
  const [newTask, setNewTask] = useState("");
  const unread = notices.filter((n) => !n.read).length;
  const open = tasks
    .filter((t) => t.status === "open")
    .sort((a, b) => (a.due_at?.toMillis() ?? Infinity) - (b.due_at?.toMillis() ?? Infinity));
  const done = tasks.filter((t) => t.status === "done").slice(0, 8);

  async function add() {
    if (!newTask.trim()) return;
    await api("/api/tasks", { json: { text: newTask } });
    setNewTask("");
  }

  return (
    <aside className="flex h-full w-full flex-col border-l border-line bg-paper">
      <div className="flex border-b border-line">
        {(["tasks", "alerts"] as const).map((t) => (
          <button
            key={t}
            onClick={() => {
              setTab(t);
              if (t === "alerts" && unread) api("/api/notifications/read", { method: "POST" }).catch(() => {});
            }}
            className={clsx("flex flex-1 items-center justify-center gap-1.5 py-3 text-sm font-medium", tab === t ? "border-b-2 border-saffron text-ink" : "border-b-2 border-transparent text-muted hover:text-ink")}
          >
            {t === "tasks" ? <ListTodo size={15} /> : <Bell size={15} />}
            {t === "tasks" ? `My tasks (${open.length})` : "Alerts"}
            {t === "alerts" && unread > 0 && <span className="rounded-full bg-rust px-1.5 text-[10px] font-bold text-white">{unread}</span>}
          </button>
        ))}
      </div>

      {tab === "tasks" ? (
        <div className="flex-1 overflow-y-auto p-3">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              add();
            }}
            className="mb-3 flex gap-2"
          >
            <input value={newTask} onChange={(e) => setNewTask(e.target.value)} placeholder="Add a to-do…" className="h-10 flex-1 rounded-lg border border-line bg-white px-3 text-sm outline-none focus:border-ink" />
            <button className="flex h-10 w-10 items-center justify-center rounded-lg bg-ink text-paper" aria-label="Add task">
              <Plus size={14} />
            </button>
          </form>
          {open.length === 0 && <p className="px-2 py-8 text-center text-sm text-muted">Nothing pending. Ask Saathi to remind you of something, or track a promise in any chat.</p>}
          {open.map((t) => (
            <TaskRow key={t.id} t={t} />
          ))}
          {done.length > 0 && (
            <>
              <div className="mb-1 mt-5 px-1 font-mono text-[10.5px] uppercase tracking-widest text-muted">Completed</div>
              {done.map((t) => (
                <TaskRow key={t.id} t={t} />
              ))}
            </>
          )}
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto p-3">
          {notices.length === 0 && <p className="py-8 text-center text-sm text-muted">No alerts yet.</p>}
          {notices.map((n) => (
            <div key={n.id} className={clsx("mb-2 rounded-lg border p-2.5", n.read ? "border-line" : "border-saffron/40 bg-saffron-soft/60")}>
              <div className="flex items-center justify-between text-xs font-semibold">
                <span className="flex items-center gap-1">
                  <Bell size={12} className="text-saffron-ink" aria-hidden /> {n.title}
                </span>
                <span className="font-mono font-normal text-muted">{timeShort(n.ts)}</span>
              </div>
              <div className="mt-0.5 text-sm">{n.body}</div>
              {n.source_ref && (
                <div className="mt-1">
                  <CiteChip refId={n.source_ref} />
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </aside>
  );
}

function TaskRow({ t }: { t: Task }) {
  const { toast } = useWs();
  const done = t.status === "done";
  const overdue = !done && isOverdue(t.due_at);
  return (
    <div className="group mb-1 flex items-start gap-2 rounded-xl p-2 hover:bg-paper-2">
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
          <span className={clsx("rounded px-1.5 py-0.5 font-semibold", t.kind === "promise" ? "bg-plum-soft text-plum" : "bg-paper-2 text-ink/70")}>{KIND_LABEL[t.kind]}</span>
          {t.due_at && <span className={clsx(overdue ? "font-semibold text-rust" : "text-muted")}><span className="font-mono">{overdue ? "Overdue · " : ""}{dueLabel(t.due_at)}</span></span>}
          {t.source_ref && <CiteChip refId={t.source_ref} />}
        </div>
      </div>
      {!done && (
        <button onClick={() => act(t.id, "dismiss")} className="flex h-8 w-8 items-center justify-center rounded-md text-muted opacity-0 transition hover:bg-paper-3 focus:opacity-100 group-hover:opacity-100" aria-label="Remove task">
          <X size={14} />
        </button>
      )}
    </div>
  );
}
