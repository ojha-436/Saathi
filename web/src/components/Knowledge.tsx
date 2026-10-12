"use client";

import clsx from "clsx";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { BarChart3, History, Loader2, Search, Sparkles, Users, Workflow } from "@/lib/icons";
import type { Chart, Decision, Lesson } from "@/lib/types";
import { CiteChip } from "./bits";
import { useWs } from "./ctx";

const day = (iso?: string | null) => (iso ? new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "");

/** A BigQuery answer as horizontal bars (no chart library: rows are few and labels matter more than axes). */
export function ChartCard({ chart }: { chart: Chart }) {
  const max = Math.max(...chart.rows.map((r) => r.value ?? 0), 1);
  const fmt = (v: number | null) => (v === null ? "–" : `${Number.isInteger(v) ? v : v.toFixed(1)}${chart.unit === "%" ? "%" : chart.unit ? ` ${chart.unit}` : ""}`);
  return (
    <figure className="mt-3 rounded-xl border border-border bg-surface p-3" aria-label={chart.title}>
      <figcaption className="mb-2 flex items-center gap-1.5 text-[13px] font-semibold">
        <BarChart3 size={14} className="text-brand" aria-hidden /> {chart.title}
      </figcaption>
      <ul className="space-y-1.5">
        {chart.rows.map((r) => (
          <li key={r.label} className="grid grid-cols-[minmax(0,9rem)_1fr_auto] items-center gap-2 text-xs">
            <span className="truncate text-muted" title={r.label}>{r.label}</span>
            <span className="h-4 rounded bg-canvas">
              <span className="block h-4 rounded bg-brand/70 transition-[width]" style={{ width: `${Math.max(((r.value ?? 0) / max) * 100, 2)}%` }} />
            </span>
            <span className="w-14 text-right font-semibold tabular-nums">{fmt(r.value)}</span>
          </li>
        ))}
      </ul>
      <p className="mt-2 text-[11px] text-muted">
        {chart.source} · {chart.scope}
      </p>
    </figure>
  );
}

/** "This happened before": similar past NCRs/downtime with their root cause and fix. */
export function LessonsPanel({ lessons, compact }: { lessons: Lesson[]; compact?: boolean }) {
  const { openRef } = useWs();
  if (!lessons.length) return null;
  return (
    <section className="rounded-xl border border-saffron/30 bg-saffron-soft/50 p-3" aria-label="This happened before">
      <h3 className="mb-2 flex items-center gap-1.5 text-[13px] font-bold text-saffron-ink">
        <History size={15} aria-hidden /> This happened before
      </h3>
      <ul className="space-y-2">
        {lessons.map((l) => (
          <li key={l.id} className="rounded-lg bg-surface p-2.5 text-xs shadow-sm">
            <button onClick={() => openRef(l.ref)} className="block text-left font-semibold text-ink hover:underline">
              {l.number}: {l.title}
            </button>
            <p className="mt-0.5 text-muted">
              {day(l.reported)}
              {l.vendor ? ` · ${l.vendor}` : ""}
              {l.machine ? ` · ${l.machine}` : ""}
              {l.status !== "closed" ? ` · still ${l.status.replace("_", " ")}` : ""}
            </p>
            {l.root_cause && (
              <p className="mt-1.5">
                <span className="font-semibold">Cause:</span> {l.root_cause}
              </p>
            )}
            {l.corrective_action && (
              <p className="mt-0.5">
                <span className="font-semibold">Fix that worked:</span> {l.corrective_action}
              </p>
            )}
            {!compact && l.owner && <p className="mt-1 text-muted">Ask {l.owner}, who owned it.</p>}
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Similar past incidents for an existing record. */
export function SimilarIncidents({ recordId, text, fields }: { recordId: string; text: string; fields: Record<string, unknown> }) {
  const [lessons, setLessons] = useState<Lesson[] | null>(null);
  useEffect(() => {
    let live = true;
    api<{ lessons: Lesson[] }>("/api/memory/similar", { json: { text, fields, exclude: recordId } })
      .then((r) => live && setLessons(r.lessons))
      .catch(() => live && setLessons([]));
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recordId]);
  if (lessons === null) return <p className="flex items-center gap-1.5 text-xs text-muted"><Loader2 size={13} className="animate-spin" /> Checking plant memory…</p>;
  return <LessonsPanel lessons={lessons} />;
}

function DecisionCard({ d, focused }: { d: Decision; focused: boolean }) {
  const { open } = useWs();
  return (
    <li id={`dec-${d.id}`} className={clsx("rounded-xl border bg-surface p-4", focused ? "border-brand ring-2 ring-brand/20" : "border-border", d.status !== "active" && "opacity-75")}>
      <div className="flex flex-wrap items-start gap-2">
        <h3 className="min-w-0 flex-1 text-[15px] font-semibold leading-snug">{d.title}</h3>
        {d.status === "superseded" && <span className="rounded-full bg-rust-soft px-2 py-0.5 text-[11px] font-semibold text-rust">Superseded</span>}
      </div>
      <p className="mt-0.5 text-xs text-muted">
        {d.decided_by ? `${d.decided_by} · ` : ""}
        {day(d.decided_at)} · {d.where}
      </p>
      {d.rationale && (
        <p className="mt-2 text-sm">
          <span className="font-semibold">Why: </span>
          {d.rationale}
        </p>
      )}
      {d.alternatives.length > 0 && (
        <p className="mt-1 text-sm text-muted">
          <span className="font-semibold text-ink">Not chosen: </span>
          {d.alternatives.join("; ")}
        </p>
      )}
      {d.superseded_by && (
        <button onClick={() => open({ kind: "decisions", id: d.superseded_by!.id })} className="mt-2 text-left text-xs font-semibold text-brand hover:underline">
          Replaced by: {d.superseded_by.title} →
        </button>
      )}
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        {d.tags.slice(0, 6).map((t) => (
          <span key={t} className="rounded-md bg-canvas px-1.5 py-0.5 font-mono text-[11px] text-muted">{t}</span>
        ))}
        <span className="flex-1" />
        {d.source_ref && <CiteChip refId={d.source_ref} />}
      </div>
    </li>
  );
}

/** The decision log: what was decided, why, and what replaced it. Each person sees decisions from their own chats and meetings. */
export function DecisionsView({ focusId }: { focusId?: string }) {
  const { open } = useWs();
  const [q, setQ] = useState("");
  const [shown, setShown] = useState<"active" | "all">("active");
  const [rows, setRows] = useState<Decision[] | null>(null);
  const [ask, setAsk] = useState("");

  useEffect(() => {
    let live = true;
    const t = setTimeout(() => {
      api<Decision[]>(`/api/decisions?q=${encodeURIComponent(q)}`)
        .then((r) => live && setRows(r))
        .catch(() => live && setRows([]));
    }, q ? 300 : 0);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [q]);

  useEffect(() => {
    if (focusId && rows) document.getElementById(`dec-${focusId}`)?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [focusId, rows]);

  const list = (rows ?? []).filter((d) => d.status !== "dismissed" && (shown === "all" || d.status === "active" || d.id === focusId));

  return (
    <section className="flex min-h-0 flex-1 flex-col" aria-label="Decisions">
      <header className="flex h-14 shrink-0 items-center gap-3 border-b border-border px-4 lg:h-12 lg:px-6">
        <Workflow size={18} className="text-muted" aria-hidden />
        <div className="min-w-0 flex-1">
          <h1 className="text-[15px] font-bold leading-tight">Decisions</h1>
          <p className="hidden truncate text-xs text-muted sm:block">Captured from your chats and meetings: what was decided, why, and what replaced it.</p>
        </div>
      </header>
      <div className="scrollbar-thin flex-1 overflow-y-auto bg-canvas/50 px-4 py-4 lg:px-8">
        <div className="mx-auto max-w-3xl space-y-4">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (ask.trim()) open({ kind: "assistant", prompt: `Decision brief: ${ask.trim()}` });
            }}
            className="rounded-xl border border-brand/25 bg-brand-soft/40 p-3"
          >
            <label htmlFor="brief" className="flex items-center gap-1.5 text-[13px] font-semibold">
              <Sparkles size={15} className="text-brand" /> Get a decision brief
            </label>
            <p className="mt-0.5 text-xs text-muted">Saathi gathers past decisions, similar incidents, vendor track record and the numbers, then lays out the options. The decision stays yours.</p>
            <div className="mt-2 flex gap-2">
              <input
                id="brief"
                value={ask}
                onChange={(e) => setAsk(e.target.value)}
                placeholder="e.g. Should we keep Om Castings for side frame castings?"
                className="h-9 min-w-0 flex-1 rounded-lg border border-border bg-surface px-3 text-sm outline-none focus:border-brand"
              />
              <button disabled={!ask.trim()} className="h-9 rounded-lg bg-brand px-3 text-[13px] font-semibold text-white hover:bg-brand-strong disabled:opacity-50">
                Brief me
              </button>
            </div>
          </form>

          <div className="flex flex-wrap items-center gap-2">
            <label className="flex h-9 min-w-0 flex-1 items-center gap-2 rounded-lg border border-border bg-surface px-3">
              <Search size={14} className="text-muted" aria-hidden />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search decisions: vendor, drawing, topic…" aria-label="Search decisions" className="min-w-0 flex-1 bg-transparent text-sm outline-none" />
            </label>
            {(["active", "all"] as const).map((f) => (
              <button key={f} onClick={() => setShown(f)} aria-pressed={shown === f} className={clsx("h-7 rounded-full border px-2.5 text-xs font-medium", shown === f ? "border-brand bg-brand-soft text-brand" : "border-border text-muted")}>
                {f === "active" ? "In force" : "Include superseded"}
              </button>
            ))}
          </div>

          {rows === null ? (
            <p className="flex items-center gap-2 text-sm text-muted"><Loader2 size={15} className="animate-spin" /> Loading decisions…</p>
          ) : list.length === 0 ? (
            <div className="mt-10 text-center">
              <Users size={28} className="mx-auto text-muted" aria-hidden />
              <p className="mt-2 font-semibold">{q ? "No matching decisions" : "No decisions yet"}</p>
              <p className="mt-1 text-sm text-muted">When someone writes “Final: …” or “Decided …” in a chat, or a meeting summary records a decision, it shows up here with the reasons.</p>
            </div>
          ) : (
            <ul className="space-y-3">
              {list.map((d) => (
                <DecisionCard key={d.id} d={d} focused={d.id === focusId} />
              ))}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}
