"use client";

import clsx from "clsx";
import { useMemo, useState } from "react";
import { api } from "@/lib/api";
import { dueLabel, timeShort } from "@/lib/format";
import { AtSign, CheckCircle2, Clock, Gavel, Handshake, ListTodo, RefreshCw, Sparkles } from "@/lib/icons";
import type { Notice, Task } from "@/lib/types";
import { Menu } from "./bits";
import { useWs } from "./ctx";

type Category = "all" | "tasks" | "quality" | "mentions";

type Item = {
  key: string;
  cat: Exclude<Category, "all">;
  rank: number;
  icon: typeof Clock;
  tone: string;
  title: string;
  sub: string;
  primary?: { label: string; run: () => Promise<unknown> | void };
  open?: () => void;
};

const LIVE = ["open", "in_progress", "blocked"];

/** One ranked list of everything waiting on you, across chat, tasks, records and email (Phase 3a: A1). */
export function NeedsYou({ tasks, notices }: { tasks: Task[]; notices: Notice[] }) {
  const { uid, records, emails, settings, openRef, open, toast } = useWs();
  const [now] = useState(() => Date.now());
  const [busy, setBusy] = useState<string | null>(null);
  const [cat, setCat] = useState<Category>("all");
  const endOfDay = useMemo(() => {
    const d = new Date(now);
    d.setHours(23, 59, 59, 999);
    return d.getTime();
  }, [now]);

  const snoozed = settings.snoozed ?? {};
  const isSnoozed = (key: string) => {
    const until = snoozed[key.replace("/", "|").replace(".", "_")];
    return !!until && new Date(until).getTime() > now;
  };

  const items = useMemo(() => {
    const out: Item[] = [];
    for (const t of tasks) {
      const mine = (t.assignee ?? t.owner) === uid;
      if (mine && LIVE.includes(t.status) && t.due_at && t.due_at.toMillis() <= endOfDay) {
        const overdue = t.due_at.toMillis() < now;
        out.push({
          key: `task:${t.id}`,
          cat: "tasks",
          rank: overdue ? 0 : 3,
          icon: ListTodo,
          tone: overdue ? "text-rust bg-rust-soft" : "text-brand bg-brand-soft",
          title: t.title,
          sub: `${overdue ? "Overdue · " : "Due "}${dueLabel(t.due_at)}${t.creator_name && t.creator !== uid ? ` · from ${t.creator_name}` : ""}`,
          primary: { label: "Done", run: () => api(`/api/tasks/${t.id}/done`, { method: "POST" }) },
          open: () => open({ kind: "tasks" }),
        });
      }
      if (t.status === "proposed" && (t.creator ?? t.owner) === uid) {
        out.push({
          key: `draft:${t.id}`,
          cat: "tasks",
          rank: 5,
          icon: Sparkles,
          tone: "text-warn-ink bg-warn-soft",
          title: t.title,
          sub: "Drafted by Saathi, waiting for your confirmation",
          primary: { label: "Confirm", run: () => api(`/api/tasks/${t.id}/confirm`, { method: "POST" }) },
        });
      }
    }
    for (const r of Object.values(records)) {
      if (r.owner === uid && r.status !== "closed") {
        out.push({
          key: `rec:${r.id}`,
          cat: "quality",
          rank: r.fields.severity === "critical" ? 0 : 1,
          icon: Gavel,
          tone: r.fields.severity === "critical" ? "text-rust bg-rust-soft" : "text-plum bg-plum-soft",
          title: `${r.number}: ${r.fields.title ?? ""}`,
          sub: `${r.status.replace("_", " ")} · ${r.anonymous ? "anonymous" : r.reporter_name} · ${timeShort(r.created_at)}`,
          open: () => open({ kind: "quality", recordId: r.id }),
        });
      }
    }
    for (const n of notices) {
      if (!n.read && n.kind === "handover") {
        out.push({
          key: `note:${n.id}`,
          cat: "quality",
          rank: 0.5,
          icon: RefreshCw,
          tone: "text-blueprint bg-blueprint-soft",
          title: n.title,
          sub: n.body,
          open: () => n.source_ref && openRef(n.source_ref),
        });
        continue;
      }
      if (!n.read && (n.kind === "mention" || n.kind === "thread_reply")) {
        out.push({
          key: `note:${n.id}`,
          cat: "mentions",
          rank: 4,
          icon: AtSign,
          tone: "text-brand bg-brand-soft",
          title: n.title,
          sub: n.body,
          open: () => n.source_ref && openRef(n.source_ref),
        });
      }
    }
    for (const e of Object.values(emails)) {
      if (e.promise && !e.task_id && !e.dismissed) {
        out.push({
          key: `mail:${e.id}`,
          cat: "tasks",
          rank: 6,
          icon: Handshake,
          tone: "text-plum bg-plum-soft",
          title: `${e.promise.committer}: ${e.promise.action}`,
          sub: `${e.promise.due_at ? `due ${dueLabel(e.promise.due_at)} · ` : ""}email from ${e.from_name}`,
          primary: { label: "Track", run: () => api(`/api/connectors/items/${encodeURIComponent(e.id)}/track`, { method: "POST" }) },
          open: () => open({ kind: "gmail" }),
        });
      }
    }
    return out.filter((i) => !isSnoozed(i.key)).sort((a, b) => a.rank - b.rank);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tasks, records, notices, emails, settings, uid, now, endOfDay]);

  const filtered = useMemo(() => (cat === "all" ? items : items.filter((i) => i.cat === cat)), [items, cat]);
  const counts = useMemo(
    () => ({
      all: items.length,
      tasks: items.filter((i) => i.cat === "tasks").length,
      quality: items.filter((i) => i.cat === "quality").length,
      mentions: items.filter((i) => i.cat === "mentions").length,
    }),
    [items],
  );

  async function snooze(key: string, hours: number | "tomorrow" | "week") {
    const d = new Date();
    if (hours === "tomorrow") {
      d.setDate(d.getDate() + 1);
      d.setHours(9, 0, 0, 0);
    } else if (hours === "week") {
      d.setDate(d.getDate() + ((8 - d.getDay()) % 7 || 7));
      d.setHours(9, 0, 0, 0);
    } else d.setTime(d.getTime() + hours * 3600_000);
    try {
      await api("/api/me/settings", { json: { snooze: { key, until: d.toISOString() } } });
      toast("Snoozed.");
    } catch (e) {
      toast((e as Error).message);
    }
  }

  return (
    <section className="rounded-2xl border border-border bg-surface" aria-label="Needs you" data-tour="needs-you">
      <header className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-3">
        <Clock size={16} className="text-muted" aria-hidden />
        <h2 className="mr-auto text-sm font-bold">
          Needs you {items.length > 0 && <span className="ml-1 rounded-full bg-canvas px-1.5 text-[11px] font-semibold text-muted">{items.length}</span>}
        </h2>
        {items.length > 0 && (
          <div role="tablist" aria-label="Filter priority items" className="flex flex-wrap items-center gap-1">
            {(
              [
                ["all", "All", counts.all],
                ["tasks", "Tasks & Promises", counts.tasks],
                ["quality", "Quality & Handovers", counts.quality],
                ["mentions", "Mentions", counts.mentions],
              ] as const
            ).map(([k, label, n]) => (
              <button
                key={k}
                role="tab"
                aria-selected={cat === k}
                onClick={() => setCat(k)}
                className={clsx(
                  "rounded-full px-2.5 py-1 text-xs font-medium transition",
                  cat === k ? "bg-brand text-white" : "bg-canvas text-muted hover:bg-hover hover:text-ink",
                )}
              >
                {label} {n > 0 && <span className={clsx("ml-0.5 text-[10.5px]", cat === k ? "text-white/90" : "text-muted")}>({n})</span>}
              </button>
            ))}
          </div>
        )}
      </header>
      {filtered.length === 0 ? (
        <p className="flex items-center justify-center gap-2 px-4 py-6 text-sm text-muted">
          <CheckCircle2 size={16} className="text-moss" /> {items.length === 0 ? "You’re clear. Nothing is waiting on you." : "Nothing waiting in this category."}
        </p>
      ) : (
        <ul>
          {filtered.slice(0, 8).map((i) => (
            <li key={i.key} className="group flex items-center gap-3 border-b border-border px-4 py-2.5 last:border-b-0 hover:bg-canvas/60">
              <span className={clsx("flex h-8 w-8 shrink-0 items-center justify-center rounded-full", i.tone)} aria-hidden>
                <i.icon size={15} />
              </span>
              <button onClick={i.open} disabled={!i.open} className="min-w-0 flex-1 text-left">
                <span className="block truncate text-sm font-semibold">{i.title}</span>
                <span className="block truncate text-xs text-muted">{i.sub}</span>
              </button>
              {i.primary && (
                <button
                  onClick={async () => {
                    setBusy(i.key);
                    try {
                      await i.primary!.run();
                    } catch (e) {
                      toast((e as Error).message);
                    } finally {
                      setBusy(null);
                    }
                  }}
                  disabled={busy === i.key}
                  className="h-8 rounded-lg bg-brand px-3 text-xs font-semibold text-white hover:bg-brand-strong disabled:opacity-50"
                >
                  {i.primary.label}
                </button>
              )}
              <Menu
                label="Snooze"
                className="flex h-8 w-8 items-center justify-center rounded-md text-muted opacity-60 hover:bg-border hover:opacity-100 focus:opacity-100 group-hover:opacity-100"
                trigger={<Clock size={14} />}
                items={[
                  { label: "Snooze 1 hour", onSelect: () => snooze(i.key, 1) },
                  { label: "Until tomorrow 9 am", onSelect: () => snooze(i.key, "tomorrow") },
                  { label: "Until next week", onSelect: () => snooze(i.key, "week") },
                ]}
              />
            </li>
          ))}
        </ul>
      )}
      {filtered.length > 8 && <p className="px-4 py-2 text-xs text-muted">+{filtered.length - 8} more</p>}
    </section>
  );
}
