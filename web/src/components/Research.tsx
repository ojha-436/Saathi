"use client";

import clsx from "clsx";
import {
  AlertTriangle,
  ArrowLeft,
  BarChart3,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronDown,
  FileSearch,
  Gavel,
  Handshake,
  History,
  ListTodo,
  Loader2,
  MessageSquare,
  Octagon,
  Plus,
  RotateCcw,
  ScanText,
  Search,
  Send,
  ShieldCheck,
  Sparkles,
  Trash2,
  Users,
  Workflow,
  X,
} from "@/lib/icons";
import { useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import { chatTitle, timeShort } from "@/lib/format";
import { useResearchEvents, useResearchRuns } from "@/lib/hooks";
import type { ResearchEvent, ResearchGap, ResearchReport, ResearchRun, ResearchStep } from "@/lib/types";
import { CiteChip, UserAvatar } from "./bits";
import { useWs } from "./ctx";
import { ChartCard } from "./Knowledge";
import { Markdown } from "./Markdown";

const TEMPLATES = [
  {
    id: "readiness",
    label: "Inspection readiness",
    icon: ShieldCheck,
    hint: "Drawings, certificates, NCRs, test reports, decisions and promises, checked before the inspector does.",
    example: "Are we ready for the RDSO inspection of the BG coach bogie prototype on 20 Oct?",
  },
  {
    id: "vendor",
    label: "Vendor comparison",
    icon: Handshake,
    hint: "Quality record, promises kept, open NCRs, quotes and past decisions, side by side.",
    example: "Compare Om Castings and Bharat Foundry for bogie side frame castings",
  },
  {
    id: "custom",
    label: "Custom research",
    icon: FileSearch,
    hint: "Any question that needs evidence from many chats, files and records.",
    example: "What is blocking dispatch of the axle box housings this month?",
  },
] as const;

const TOOL_LABEL: Record<string, { label: string; icon: typeof Search }> = {
  search_workspace: { label: "Search", icon: Search },
  lookup_document: { label: "Documents", icon: ScanText },
  revision_status: { label: "Drawing register", icon: FileSearch },
  find_decisions: { label: "Decisions", icon: Workflow },
  similar_incidents: { label: "Plant memory", icon: History },
  promise_record: { label: "Promises", icon: Handshake },
  plant_data: { label: "Plant data", icon: BarChart3 },
  shift_handover: { label: "Handovers", icon: Gavel },
  who_owes: { label: "Pending tasks", icon: ListTodo },
  get_calendar: { label: "Calendar", icon: CalendarDays },
  get_message_context: { label: "Conversation", icon: MessageSquare },
  archive_search: { label: "Full history (BigQuery)", icon: History },
  spec_check: { label: "Spec Check", icon: ShieldCheck },
  standards_library: { label: "Standards library", icon: FileSearch },
};

const STATUS: Record<ResearchRun["status"], { label: string; cls: string }> = {
  planning: { label: "Planning", cls: "bg-brand-soft text-brand" },
  awaiting_plan: { label: "Review plan", cls: "bg-warn-soft text-warn-ink" },
  queued: { label: "Queued", cls: "bg-brand-soft text-brand" },
  running: { label: "Researching", cls: "bg-brand-soft text-brand" },
  retrying: { label: "Retrying", cls: "bg-warn-soft text-warn-ink" },
  cancelling: { label: "Stopping", cls: "bg-canvas text-muted" },
  done: { label: "Report ready", cls: "bg-moss-soft text-moss" },
  cancelled: { label: "Stopped", cls: "bg-canvas text-muted" },
  failed: { label: "Failed", cls: "bg-rust-soft text-rust" },
};

const READINESS: Record<ResearchReport["readiness"], { label: string; cls: string; icon: typeof Check } | null> = {
  ready: { label: "Ready", cls: "bg-moss-soft text-moss border-moss/30", icon: CheckCircle2 },
  at_risk: { label: "At risk", cls: "bg-warn-soft text-warn-ink border-warn-border/40", icon: AlertTriangle },
  not_ready: { label: "Not ready", cls: "bg-rust-soft text-rust border-rust/30", icon: Octagon },
  not_applicable: null,
};

const ACTIVE = ["planning", "queued", "running", "retrying", "cancelling"];

/** Ask | Research switch shown in both Saathi headers. */
export function SaathiTabs({ active }: { active: "ask" | "research" }) {
  const { open } = useWs();
  return (
    <div role="tablist" aria-label="Saathi mode" className="flex rounded-lg bg-canvas p-0.5">
      {(
        [
          ["ask", "Ask", () => open({ kind: "assistant" })],
          ["research", "Research", () => open({ kind: "research" })],
        ] as const
      ).map(([k, label, go]) => (
        <button
          key={k}
          role="tab"
          aria-selected={active === k}
          onClick={go}
          className={clsx("h-7 rounded-md px-3 text-xs font-semibold transition", active === k ? "bg-surface text-ink shadow-sm" : "text-muted hover:text-ink")}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

function fmtDuration(ms?: number) {
  if (!ms) return "";
  const s = Math.round(ms / 1000);
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, "0")}s`;
}

export function ResearchView({ focusId }: { focusId?: string }) {
  const { uid } = useWs();
  const runs = useResearchRuns(uid);
  // The workspace re-mounts this view (key) when a different run is opened from a citation or notification
  const [selected, setSelected] = useState<string | "new" | undefined>(focusId);
  // selected: a run id, "new" for the form, or undefined (desktop: latest run; phones: the list)
  const current = selected && selected !== "new" ? runs.find((r) => r.id === selected) : undefined;
  const effective = selected === "new" ? undefined : (current ?? (!selected ? runs[0] : undefined));
  const loadingNew = !!selected && selected !== "new" && !current;

  return (
    <section className="flex min-h-0 flex-1 flex-col bg-surface" aria-label="Saathi Research">
      <header className="flex h-14 shrink-0 items-center gap-3 border-b border-border bg-surface px-4 lg:h-12 lg:px-6">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-brand to-rail text-white">
          <Sparkles size={18} aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <h1 className="text-[15px] font-bold leading-tight">Saathi Research</h1>
          <p className="hidden truncate text-xs text-muted sm:block">Research agents gather evidence in parallel, verify every claim, and turn gaps into tasks</p>
        </div>
        <SaathiTabs active="research" />
      </header>

      <div className="flex min-h-0 flex-1">
        <aside className={clsx("w-full shrink-0 flex-col border-r border-border bg-canvas/40 lg:flex lg:w-72", selected ? "hidden" : "flex")} aria-label="Your research">
          <div className="p-3">
            <button
              onClick={() => setSelected("new")}
              className="flex h-9 w-full items-center justify-center gap-1.5 rounded-lg bg-brand text-[13px] font-semibold text-white transition hover:bg-brand-strong"
            >
              <Plus size={15} aria-hidden /> New research
            </button>
          </div>
          <ul className="scrollbar-thin flex-1 space-y-0.5 overflow-y-auto px-2 pb-3">
            {runs.length === 0 && <li className="px-3 py-6 text-center text-xs text-muted">Your research reports appear here.</li>}
            {runs.map((r) => {
              const on = (effective?.id ?? selected) === r.id && selected !== "new";
              return (
                <li key={r.id}>
                  <button
                    onClick={() => setSelected(r.id)}
                    aria-current={on ? "page" : undefined}
                    className={clsx("w-full rounded-lg px-2.5 py-2 text-left transition", on ? "bg-surface shadow-[0_1px_2px_rgba(11,27,43,0.08)]" : "hover:bg-hover")}
                  >
                    <span className="line-clamp-2 text-[13px] font-medium leading-snug">{r.title || r.goal}</span>
                    <span className="mt-1 flex items-center gap-1.5 text-[11px] text-muted">
                      <span className={clsx("rounded-full px-1.5 py-px font-semibold", STATUS[r.status].cls)}>{STATUS[r.status].label}</span>
                      {timeShort(r.created_at)}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </aside>

        <div className={clsx("min-w-0 flex-1 flex-col lg:flex", selected ? "flex" : "hidden")}>
          {selected && (
            <button onClick={() => setSelected(undefined)} className="flex h-10 items-center gap-1.5 border-b border-border px-3 text-sm text-muted lg:hidden">
              <ArrowLeft size={16} /> All research
            </button>
          )}
          {effective ? (
            <RunView key={effective.id} run={effective} onDeleted={() => setSelected(undefined)} onRetry={(id) => setSelected(id)} />
          ) : loadingNew ? (
            <div className="flex flex-1 items-center justify-center gap-2 text-sm text-muted" role="status">
              <Loader2 size={16} className="animate-spin" /> Opening research…
            </div>
          ) : (
            <NewResearch onStarted={(id) => setSelected(id)} />
          )}
        </div>
      </div>
    </section>
  );
}

function NewResearch({ onStarted }: { onStarted: (id: string) => void }) {
  const { toast } = useWs();
  const [template, setTemplate] = useState<(typeof TEMPLATES)[number]["id"]>("readiness");
  const [goal, setGoal] = useState("");
  const [due, setDue] = useState("");
  const [subject, setSubject] = useState("");
  const [busy, setBusy] = useState(false);
  const t = TEMPLATES.find((x) => x.id === template)!;

  async function start() {
    if (goal.trim().length < 8 || busy) return;
    setBusy(true);
    try {
      const context: Record<string, string> = {};
      if (due) context.due_date = `${due}T10:00:00+05:30`;
      if (subject.trim()) context[template === "vendor" ? "vendors" : "product"] = subject.trim();
      const r = await api<{ id: string }>("/api/research", { json: { goal, template, context } });
      onStarted(r.id);
    } catch (e) {
      toast((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="scrollbar-thin flex-1 overflow-y-auto px-4 py-6 lg:px-8">
      <div className="mx-auto max-w-3xl">
        <p className="rise font-mono text-xs uppercase tracking-[0.16em] text-saffron-ink">Saathi Research</p>
        <h2 className="rise mt-2 font-display text-4xl leading-[1.05] sm:text-5xl" style={{ animationDelay: "60ms" }}>
          Hand over the legwork. <em className="text-muted">Get a cited report.</em>
        </h2>
        <p className="rise mt-3 max-w-2xl text-sm text-muted" style={{ animationDelay: "100ms" }}>
          Saathi plans the questions, sends research agents through your drawings, certificates, NCRs, decisions, promises and plant data at the same time, checks every claim against its
          source, and turns every gap into a task you can assign in one click. It only sees what you can see.
        </p>

        <div className="mt-6 grid gap-2 sm:grid-cols-3" role="radiogroup" aria-label="Research type">
          {TEMPLATES.map((x) => (
            <button
              key={x.id}
              role="radio"
              aria-checked={template === x.id}
              onClick={() => setTemplate(x.id)}
              className={clsx(
                "flex flex-col gap-1 rounded-xl border p-3 text-left transition",
                template === x.id ? "border-brand bg-brand-soft/60 ring-1 ring-brand" : "border-border hover:border-[#c5cad3]",
              )}
            >
              <span className="flex items-center gap-2 text-sm font-semibold">
                <x.icon size={16} className={template === x.id ? "text-brand" : "text-muted"} aria-hidden /> {x.label}
              </span>
              <span className="text-xs leading-snug text-muted">{x.hint}</span>
            </button>
          ))}
        </div>

        <label htmlFor="r-goal" className="mt-5 block text-sm font-medium">
          What should Saathi find out?
        </label>
        <textarea
          id="r-goal"
          value={goal}
          onChange={(e) => setGoal(e.target.value)}
          rows={3}
          maxLength={600}
          placeholder={t.example}
          className="mt-1 w-full resize-none rounded-xl border border-border bg-surface px-3.5 py-3 text-[15px] outline-none focus:border-brand focus:ring-2 focus:ring-brand/15"
        />
        <button onClick={() => setGoal(t.example)} className="mt-1 text-xs font-medium text-brand hover:underline">
          Use example: “{t.example}”
        </button>

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {template !== "vendor" && (
            <div>
              <label htmlFor="r-due" className="text-sm font-medium">
                {template === "readiness" ? "Inspection date" : "Deadline"} <span className="font-normal text-muted">(optional)</span>
              </label>
              <input id="r-due" type="date" value={due} onChange={(e) => setDue(e.target.value)} className="mt-1 h-10 w-full rounded-lg border border-border bg-surface px-3 text-sm outline-none focus:border-brand" />
            </div>
          )}
          <div>
            <label htmlFor="r-subject" className="text-sm font-medium">
              {template === "vendor" ? "Vendors" : "Product, part or drawing"} <span className="font-normal text-muted">(optional)</span>
            </label>
            <input
              id="r-subject"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder={template === "vendor" ? "Om Castings, Bharat Foundry" : "BG coach bogie prototype"}
              className="mt-1 h-10 w-full rounded-lg border border-border bg-surface px-3 text-sm outline-none focus:border-brand"
            />
          </div>
        </div>

        <div className="mt-5 flex items-center gap-3">
          <button
            onClick={start}
            disabled={busy || goal.trim().length < 8}
            className="flex h-10 items-center gap-2 rounded-lg bg-brand px-5 text-sm font-semibold text-white transition hover:bg-brand-strong disabled:opacity-40"
          >
            {busy ? <Loader2 size={15} className="animate-spin" /> : <Sparkles size={15} />} Plan research
          </button>
          <span className="text-xs text-muted">You&rsquo;ll review the plan before the agents start.</span>
        </div>
      </div>
    </div>
  );
}

function RunView({ run, onDeleted, onRetry }: { run: ResearchRun; onDeleted: () => void; onRetry: (id: string) => void }) {
  const { toast } = useWs();
  const events = useResearchEvents(ACTIVE.includes(run.status) || run.status === "done" || run.status === "cancelled" ? run.id : undefined);

  async function cancel() {
    try {
      await api(`/api/research/${run.id}/cancel`, { method: "POST" });
    } catch (e) {
      toast((e as Error).message);
    }
  }

  async function remove() {
    if (!confirm("Delete this research report?")) return;
    try {
      await api(`/api/research/${run.id}`, { method: "DELETE" });
      onDeleted();
    } catch (e) {
      toast((e as Error).message);
    }
  }

  async function retry() {
    try {
      const r = await api<{ id: string }>("/api/research", { json: { goal: run.goal, template: run.template, context: run.context ?? {} } });
      onRetry(r.id);
    } catch (e) {
      toast((e as Error).message);
    }
  }

  return (
    <div className="scrollbar-thin flex-1 overflow-y-auto px-4 py-5 lg:px-8">
      <div className="mx-auto max-w-4xl">
        <div className="flex flex-wrap items-start gap-2">
          <div className="min-w-0 flex-1">
            <p className="text-xs font-medium text-muted">
              {TEMPLATES.find((t) => t.id === run.template)?.label ?? "Research"} · {timeShort(run.created_at)}
            </p>
            <h2 className="mt-0.5 text-lg font-bold leading-snug">{run.report?.title || run.title || run.goal}</h2>
            {(run.report?.title || run.title) && <p className="mt-0.5 text-sm text-muted">“{run.goal}”</p>}
          </div>
          <span className={clsx("mt-1 rounded-full px-2.5 py-1 text-xs font-semibold", STATUS[run.status].cls)}>{STATUS[run.status].label}</span>
        </div>

        {run.status === "planning" && (
          <div className="mt-6 flex items-center gap-3 rounded-xl border border-border p-4 text-sm text-muted" role="status">
            <Loader2 size={16} className="animate-spin text-brand" /> Breaking the goal into research questions…
          </div>
        )}
        {run.status === "awaiting_plan" && run.plan && <PlanEditor run={run} onCancel={cancel} />}
        {["queued", "running", "retrying", "cancelling"].includes(run.status) && <Progress run={run} events={events} onStop={cancel} />}
        {run.status === "failed" && (
          <div className="mt-6 rounded-xl border border-rust/30 bg-rust-soft p-4 text-sm text-rust" role="alert">
            {run.error || "The research failed."}
            <button onClick={retry} className="ml-3 inline-flex items-center gap-1 font-semibold underline">
              <RotateCcw size={13} /> Try again
            </button>
          </div>
        )}
        {(run.status === "done" || run.status === "cancelled") && run.report && (
          <>
            <ReportBody run={run} report={run.report} />
            <Provenance run={run} events={events} />
          </>
        )}

        {!ACTIVE.includes(run.status) && (
          <div className="mt-8 flex flex-wrap gap-2 border-t border-border pt-4">
            {run.status === "done" && <ShareButton run={run} />}
            {run.status !== "awaiting_plan" && (
              <button onClick={retry} className="flex h-9 items-center gap-1.5 rounded-lg border border-border px-3 text-[13px] font-medium hover:bg-hover">
                <RotateCcw size={14} /> Run again
              </button>
            )}
            <button onClick={remove} className="flex h-9 items-center gap-1.5 rounded-lg px-3 text-[13px] font-medium text-rust hover:bg-rust-soft">
              <Trash2 size={14} /> Delete
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function PlanEditor({ run, onCancel }: { run: ResearchRun; onCancel: () => void }) {
  const { toast } = useWs();
  const [steps, setSteps] = useState<ResearchStep[]>(run.plan!.steps);
  const [busy, setBusy] = useState(false);

  async function approve() {
    setBusy(true);
    try {
      await api(`/api/research/${run.id}/approve`, { json: { steps: steps.filter((s) => s.question.trim()) } });
    } catch (e) {
      toast((e as Error).message);
      setBusy(false);
    }
  }

  return (
    <div className="mt-5">
      <p className="text-sm text-muted">
        Saathi will send <b className="text-ink">{steps.length} research agents</b>, one per question, all at once. Edit, remove or add questions, then start.
      </p>
      <ol className="mt-3 space-y-2">
        {steps.map((s, i) => (
          <li key={i} className="flex items-start gap-3 rounded-xl border border-border bg-surface p-3">
            <span className="mt-1.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-soft text-xs font-bold text-brand">{i + 1}</span>
            <div className="min-w-0 flex-1">
              <label htmlFor={`q-${i}`} className="sr-only">
                Question {i + 1}
              </label>
              <textarea
                id={`q-${i}`}
                value={s.question}
                rows={2}
                onChange={(e) => setSteps((all) => all.map((x, j) => (j === i ? { ...x, question: e.target.value } : x)))}
                className="w-full resize-none rounded-lg border border-transparent bg-transparent px-1.5 py-1 text-sm outline-none hover:border-border focus:border-brand"
              />
              <div className="mt-1 flex flex-wrap items-center gap-1 px-1.5">
                {s.tools.map((t) => {
                  const meta = TOOL_LABEL[t];
                  return meta ? (
                    <span key={t} className="inline-flex items-center gap-1 rounded-md bg-canvas px-1.5 py-0.5 text-[11px] text-muted">
                      <meta.icon size={11} aria-hidden /> {meta.label}
                    </span>
                  ) : null;
                })}
                {s.why && <span className="text-[11px] text-muted">· {s.why}</span>}
              </div>
            </div>
            <button
              onClick={() => setSteps((all) => all.filter((_, j) => j !== i))}
              disabled={steps.length <= 1}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted hover:bg-hover hover:text-rust disabled:opacity-30"
              aria-label={`Remove question ${i + 1}`}
            >
              <X size={15} />
            </button>
          </li>
        ))}
      </ol>
      {steps.length < 7 && (
        <button
          onClick={() => setSteps((all) => [...all, { question: "", tools: ["search_workspace"], why: "" }])}
          className="mt-2 flex h-9 items-center gap-1.5 rounded-lg px-2 text-[13px] font-medium text-brand hover:bg-brand-soft"
        >
          <Plus size={14} /> Add a question
        </button>
      )}
      <div className="mt-4 flex items-center gap-2">
        <button onClick={approve} disabled={busy || !steps.some((s) => s.question.trim())} className="flex h-10 items-center gap-2 rounded-lg bg-brand px-5 text-sm font-semibold text-white hover:bg-brand-strong disabled:opacity-40">
          {busy ? <Loader2 size={15} className="animate-spin" /> : <Sparkles size={15} />} Start research
        </button>
        <button onClick={onCancel} className="h-10 rounded-lg px-4 text-sm font-medium text-muted hover:bg-hover">
          Cancel
        </button>
      </div>
    </div>
  );
}

type StepView = { done: boolean; lines: { text: string; tool?: string; result?: string }[] };

function groupEvents(events: ResearchEvent[], n: number): { steps: StepView[]; phases: ResearchEvent[] } {
  const steps: StepView[] = Array.from({ length: n }, () => ({ done: false, lines: [] }));
  const phases: ResearchEvent[] = [];
  for (const e of events) {
    if (e.step === null || e.step === undefined || !steps[e.step]) {
      if (e.kind === "phase" || e.kind === "done" || e.kind === "error") phases.push(e);
      continue;
    }
    const s = steps[e.step];
    if (e.kind === "tool") s.lines.push({ text: e.text, tool: e.tool });
    else if (e.kind === "result") {
      const open = [...s.lines].reverse().find((l) => l.tool === e.tool && l.result === undefined);
      if (open) open.result = e.text;
    } else if (e.kind === "step_done") s.done = true;
  }
  return { steps, phases };
}

function Progress({ run, events, onStop }: { run: ResearchRun; events: ResearchEvent[]; onStop: () => void }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const steps = run.plan?.steps ?? [];
  const { steps: views, phases } = useMemo(() => groupEvents(events, steps.length), [events, steps.length]);
  const started = run.started_at?.toMillis();
  const done = views.filter((v) => v.done).length;
  const lastPhase = phases.at(-1)?.text;

  return (
    <div className="mt-5" aria-live="polite">
      <div className="flex items-center gap-3 rounded-xl border border-brand/30 bg-brand-soft/50 px-4 py-3">
        <Loader2 size={17} className="animate-spin text-brand" aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">
            {run.status === "queued" ? "Waiting for a research slot…" : run.status === "cancelling" ? "Stopping…" : lastPhase || "Research agents at work"}
          </p>
          <p className="text-xs text-muted">
            {done}/{steps.length} questions answered{started ? ` · ${fmtDuration(now - started)}` : ""} · you can leave this page, the research keeps going
          </p>
        </div>
        {run.status !== "cancelling" && (
          <button onClick={onStop} className="h-8 rounded-lg border border-border bg-surface px-3 text-xs font-semibold hover:bg-hover">
            Stop
          </button>
        )}
      </div>
      <ol className="mt-3 grid gap-2 md:grid-cols-2">
        {steps.map((s, i) => {
          const v = views[i];
          return (
            <li key={i} className={clsx("rounded-xl border p-3 transition", v?.done ? "border-moss/30 bg-moss-soft/30" : "border-border bg-surface")}>
              <p className="flex items-start gap-2 text-[13px] font-semibold leading-snug">
                {v?.done ? <CheckCircle2 size={16} className="mt-px shrink-0 text-moss" aria-label="Done" /> : <Loader2 size={15} className="mt-0.5 shrink-0 animate-spin text-brand" aria-label="Working" />}
                {s.question}
              </p>
              <ul className="mt-2 space-y-1 pl-6">
                {(v?.lines ?? []).slice(-4).map((l, j) => {
                  const Icon = TOOL_LABEL[l.tool ?? ""]?.icon ?? Search;
                  return (
                    <li key={j} className="flex items-start gap-1.5 text-xs text-muted">
                      <Icon size={12} className="mt-0.5 shrink-0" aria-hidden />
                      <span className="min-w-0">
                        {l.text}
                        {l.result && <span className="text-ink/70"> → {l.result}</span>}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function Chips({ refs }: { refs: string[] }) {
  if (!refs?.length) return null;
  return (
    <span className="ml-0.5 inline">
      {refs.slice(0, 4).map((r) => (
        <CiteChip key={r} refId={r} />
      ))}
      {refs.length > 4 && <span className="text-[11px] text-muted"> +{refs.length - 4}</span>}
    </span>
  );
}

const CHECK_ICON = {
  ok: <CheckCircle2 size={17} className="text-moss" aria-label="OK" />,
  risk: <AlertTriangle size={17} className="text-warn" aria-label="At risk" />,
  gap: <Octagon size={17} className="text-rust" aria-label="Gap" />,
};

/** The report itself. `compact` is the version shown on a chat message when a report is shared. */
export function ReportBody({ run, report, compact = false }: { run?: ResearchRun; report: ResearchReport; compact?: boolean }) {
  const r = READINESS[report.readiness];
  return (
    <div className={clsx(!compact && "mt-5")}>
      <div className={clsx("rounded-xl border p-4", r ? r.cls : "border-border bg-canvas/50")}>
        {r && (
          <p className="mb-1 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide">
            <r.icon size={14} aria-hidden /> {r.label}
          </p>
        )}
        <p className="text-[14.5px] leading-relaxed text-ink">{report.verdict}</p>
        {run?.metrics && !compact && (
          <p className="mt-2 text-xs text-muted">
            {run.metrics.sources_cited} sources cited · {run.metrics.tool_calls} checks by {run.metrics.agents} agents · {fmtDuration(run.metrics.duration_ms)}
            {run.metrics.dropped_unverified ? ` · ${run.metrics.dropped_unverified} unverified claims removed` : " · every claim verified against its source"}
          </p>
        )}
      </div>

      {report.checklist.length > 0 && (
        <section className="mt-5" aria-label="Checklist">
          <h3 className="mb-2 text-sm font-bold">Checklist</h3>
          <ul className="divide-y divide-border rounded-xl border border-border">
            {(compact ? report.checklist.slice(0, 5) : report.checklist).map((c, i) => (
              <li key={i} className="flex gap-3 px-3.5 py-3">
                <span className="mt-0.5 shrink-0">{CHECK_ICON[c.status]}</span>
                <div className="min-w-0 text-sm leading-relaxed">
                  <b>{c.item}.</b> {c.detail} <Chips refs={c.refs} />
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {!compact && run && report.gaps.length > 0 && <GapsToTasks run={run} gaps={report.gaps} />}
      {compact && report.gaps.length > 0 && (
        <p className="mt-3 text-xs font-medium text-rust">
          {report.gaps.length} gap{report.gaps.length === 1 ? "" : "s"} to close: {report.gaps.slice(0, 3).map((g) => g.title).join(" · ")}
          {report.gaps.length > 3 ? " …" : ""}
        </p>
      )}

      {!compact && report.findings.length > 0 && (
        <section className="mt-6" aria-label="Key findings">
          <h3 className="mb-2 text-sm font-bold">Key findings</h3>
          <ul className="space-y-2">
            {report.findings.map((f, i) => (
              <li key={i} className="flex gap-2 text-sm leading-relaxed">
                <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-saffron" aria-hidden />
                <span>
                  {f.text} <Chips refs={f.refs} />
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
      {!compact && report.charts?.map((c) => <ChartCard key={c.ref} chart={c} />)}
      {!compact && report.unknowns.length > 0 && (
        <section className="mt-6" aria-label="Unknowns">
          <h3 className="mb-2 text-sm font-bold">What Saathi couldn&rsquo;t determine</h3>
          <ul className="list-disc space-y-1 pl-5 text-sm text-muted">
            {report.unknowns.map((u, i) => (
              <li key={i}>{u}</li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

const toDateInput = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" }) : "");

function GapsToTasks({ run, gaps }: { run: ResearchRun; gaps: ResearchGap[] }) {
  const { users, toast, uid } = useWs();
  const [edit, setEdit] = useState<Record<string, { on: boolean; title: string; owner: string; due: string }>>(() =>
    Object.fromEntries(gaps.map((g) => [g.id, { on: !g.task_id, title: g.title, owner: g.owner_uid ?? "", due: toDateInput(g.due_at) }])),
  );
  const [busy, setBusy] = useState(false);
  const people = useMemo(() => Object.values(users).filter((u) => !u.deactivated).sort((a, b) => a.name.localeCompare(b.name)), [users]);
  const pending = gaps.filter((g) => !g.task_id && edit[g.id]?.on);

  async function create() {
    setBusy(true);
    try {
      const r = await api<{ created: string[] }>(`/api/research/${run.id}/tasks`, {
        json: {
          gaps: pending.map((g) => ({
            id: g.id,
            title: edit[g.id].title,
            owner_uid: edit[g.id].owner || null,
            due_at: edit[g.id].due ? `${edit[g.id].due}T18:00:00+05:30` : null,
          })),
        },
      });
      toast(`${r.created.length} task${r.created.length === 1 ? "" : "s"} created. Assignees have been notified.`);
    } catch (e) {
      toast((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const sev = { high: "bg-rust", medium: "bg-warn-border", low: "bg-[#9aa3af]" };
  return (
    <section className="mt-6" aria-label="Gaps to close">
      <div className="mb-2 flex items-center gap-2">
        <h3 className="flex-1 text-sm font-bold">
          Gaps to close <span className="font-normal text-muted">· each becomes a task</span>
        </h3>
        <button onClick={create} disabled={busy || pending.length === 0} className="flex h-8 items-center gap-1.5 rounded-lg bg-brand px-3 text-xs font-semibold text-white hover:bg-brand-strong disabled:opacity-40">
          {busy ? <Loader2 size={13} className="animate-spin" /> : <ListTodo size={13} />} Create {pending.length || ""} task{pending.length === 1 ? "" : "s"}
        </button>
      </div>
      <ul className="space-y-2">
        {gaps.map((g) => {
          const e = edit[g.id];
          return (
            <li key={g.id} className={clsx("rounded-xl border p-3", g.task_id ? "border-moss/30 bg-moss-soft/30" : "border-border")}>
              <div className="flex items-start gap-2.5">
                {g.task_id ? (
                  <CheckCircle2 size={18} className="mt-1 shrink-0 text-moss" aria-label="Task created" />
                ) : (
                  <input
                    type="checkbox"
                    checked={e?.on ?? false}
                    onChange={(ev) => setEdit((x) => ({ ...x, [g.id]: { ...x[g.id], on: ev.target.checked } }))}
                    className="mt-1.5 h-4 w-4 shrink-0 accent-[var(--color-brand)]"
                    aria-label={`Create a task for: ${g.title}`}
                  />
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className={clsx("h-2 w-2 shrink-0 rounded-full", sev[g.severity])} title={`${g.severity} severity`} aria-hidden />
                    {g.task_id ? (
                      <span className="text-sm font-semibold">{g.title}</span>
                    ) : (
                      <input
                        value={e?.title ?? g.title}
                        onChange={(ev) => setEdit((x) => ({ ...x, [g.id]: { ...x[g.id], title: ev.target.value } }))}
                        aria-label="Task title"
                        className="min-w-0 flex-1 rounded-md border border-transparent bg-transparent px-1 py-0.5 text-sm font-semibold outline-none hover:border-border focus:border-brand"
                      />
                    )}
                  </div>
                  <p className="mt-1 text-[13px] leading-relaxed text-muted">
                    {g.detail} <Chips refs={g.refs} />
                  </p>
                  {g.task_id ? (
                    <p className="mt-1.5 flex items-center gap-1.5 text-xs font-semibold text-moss">
                      <Check size={12} /> Task created{g.assignee_uid && g.assignee_uid !== uid ? ` for ${users[g.assignee_uid]?.name ?? "a colleague"}` : " for you"}
                    </p>
                  ) : (
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <label className="flex items-center gap-1.5 text-xs text-muted">
                        {e?.owner ? <UserAvatar uid={e.owner} size={20} dot={false} clickable={false} /> : <Users size={14} aria-hidden />}
                        <select
                          value={e?.owner ?? ""}
                          onChange={(ev) => setEdit((x) => ({ ...x, [g.id]: { ...x[g.id], owner: ev.target.value } }))}
                          className="h-8 rounded-md border border-border bg-surface px-2 text-xs text-ink outline-none focus:border-brand"
                          aria-label="Assign to"
                        >
                          <option value="">Me{g.owner_name && !g.owner_uid ? ` (vendor: ${g.owner_name})` : ""}</option>
                          {people.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.name}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="flex items-center gap-1.5 text-xs text-muted">
                        <CalendarDays size={14} aria-hidden />
                        <input
                          type="date"
                          value={e?.due ?? ""}
                          onChange={(ev) => setEdit((x) => ({ ...x, [g.id]: { ...x[g.id], due: ev.target.value } }))}
                          className="h-8 rounded-md border border-border bg-surface px-2 text-xs text-ink outline-none focus:border-brand"
                          aria-label="Due date"
                        />
                      </label>
                    </div>
                  )}
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/** "How Saathi got this": the plan, what each agent checked, and the agents' raw notes. */
function Provenance({ run, events }: { run: ResearchRun; events: ResearchEvent[] }) {
  const [open, setOpen] = useState(false);
  const steps = run.plan?.steps ?? [];
  const { steps: views } = useMemo(() => groupEvents(events, steps.length), [events, steps.length]);
  return (
    <section className="mt-6 rounded-xl border border-border">
      <button onClick={() => setOpen((o) => !o)} aria-expanded={open} className="flex w-full items-center gap-2 px-4 py-3 text-left text-sm font-semibold">
        <Workflow size={15} className="text-brand" aria-hidden /> How Saathi got this
        <span className="ml-1 text-xs font-normal text-muted">
          {steps.length} agents · {run.metrics?.tool_calls ?? 0} tool calls · {run.metrics?.evidence_seen ?? 0} sources read
        </span>
        <ChevronDown size={15} className={clsx("ml-auto transition", open && "rotate-180")} aria-hidden />
      </button>
      {open && (
        <ol className="space-y-3 border-t border-border px-4 py-3">
          {steps.map((s, i) => (
            <li key={i}>
              <p className="text-[13px] font-semibold">
                Agent {i + 1}: {s.question}
              </p>
              <ul className="mt-1 space-y-0.5 pl-4">
                {(views[i]?.lines ?? []).map((l, j) => (
                  <li key={j} className="list-disc text-xs text-muted">
                    {l.text}
                    {l.result && ` → ${l.result}`}
                  </li>
                ))}
              </ul>
              {run.notes?.[i] && (
                <details className="mt-1 pl-4">
                  <summary className="cursor-pointer text-xs font-medium text-brand">Agent notes</summary>
                  <div className="mt-1 text-xs">
                    <Markdown text={run.notes[i]} />
                  </div>
                </details>
              )}
            </li>
          ))}
          <li className="text-xs text-muted">
            A verifying agent then rebuilt the report from these notes, and every citation was re-checked in code against the sources the tools returned. Saathi only read what you have access
            to.
          </li>
        </ol>
      )}
    </section>
  );
}

function ShareButton({ run }: { run: ResearchRun }) {
  const { chats, uid, users, toast, open } = useWs();
  const [show, setShow] = useState(false);
  const [q, setQ] = useState("");
  const [picked, setPicked] = useState<string | null>(null);
  const [check, setCheck] = useState<{ removed: number; kept: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const list = Object.values(chats)
    .filter((c) => !q || chatTitle(c, uid, users).toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => (b.last_ts?.toMillis() ?? 0) - (a.last_ts?.toMillis() ?? 0))
    .slice(0, 12);

  async function pick(chatId: string) {
    setPicked(chatId);
    setCheck(null);
    try {
      setCheck(await api<{ removed: number; kept: number }>(`/api/research/${run.id}/share`, { json: { chat_id: chatId } }));
    } catch (e) {
      toast((e as Error).message);
    }
  }

  async function confirmShare() {
    if (!picked) return;
    setBusy(true);
    try {
      await api(`/api/research/${run.id}/share`, { json: { chat_id: picked, confirm: true } });
      toast("Report shared.");
      setShow(false);
      open({ kind: "chat", chatId: picked });
    } catch (e) {
      toast((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button onClick={() => setShow(true)} className="flex h-9 items-center gap-1.5 rounded-lg bg-brand px-3.5 text-[13px] font-semibold text-white hover:bg-brand-strong">
        <Send size={14} /> Share to a chat
      </button>
      {show && (
        <div className="fixed inset-0 z-[60] flex items-start justify-center bg-ink/45 px-4 pt-[12vh]" onMouseDown={() => setShow(false)}>
          <div role="dialog" aria-modal="true" aria-label="Share report" onMouseDown={(e) => e.stopPropagation()} className="ws-pop w-full max-w-md overflow-hidden rounded-2xl border border-border bg-surface shadow-2xl">
            <div className="flex items-center justify-between border-b border-border px-5 py-4">
              <h2 className="text-lg font-bold">Share report</h2>
              <button onClick={() => setShow(false)} aria-label="Close" className="flex h-9 w-9 items-center justify-center rounded-lg text-muted hover:bg-hover">
                <X size={18} />
              </button>
            </div>
            <div className="p-4">
              <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search chats and channels" aria-label="Search chats" className="h-10 w-full rounded-lg border border-border px-3 text-sm outline-none focus:border-brand" />
              <ul className="mt-2 max-h-64 overflow-y-auto">
                {list.map((c) => (
                  <li key={c.id}>
                    <button onClick={() => pick(c.id)} aria-pressed={picked === c.id} className={clsx("flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm", picked === c.id ? "bg-brand-soft" : "hover:bg-hover")}>
                      <MessageSquare size={14} className="text-muted" aria-hidden /> <span className="truncate">{chatTitle(c, uid, users)}</span>
                      <span className="ml-auto text-xs text-muted">{c.members.length}</span>
                    </button>
                  </li>
                ))}
              </ul>
              {picked && (
                <div className={clsx("mt-3 rounded-lg px-3 py-2 text-xs", check?.kept === 0 ? "bg-rust-soft text-rust" : check?.removed ? "bg-saffron-soft text-saffron-ink" : "bg-moss-soft text-moss")} role="status">
                  {!check ? (
                    <span className="flex items-center gap-1.5">
                      <Loader2 size={12} className="animate-spin" /> Checking who can see each source…
                    </span>
                  ) : check.kept === 0 ? (
                    "Nothing in this report can be shared here: every source is in a chat some members of this one can't open. Pick a smaller group."
                  ) : check.removed ? (
                    `${check.removed} item${check.removed === 1 ? "" : "s"} will be left out because some members of this chat can't open their sources. ${check.kept} will be shared.`
                  ) : (
                    "Everyone in this chat can open every source in the report."
                  )}
                </div>
              )}
            </div>
            <div className="flex justify-end gap-2 border-t border-border bg-canvas/60 px-5 py-3">
              <button onClick={() => setShow(false)} className="h-9 rounded-lg px-4 text-sm font-medium text-muted hover:bg-hover">
                Cancel
              </button>
              <button onClick={confirmShare} disabled={!check || check.kept === 0 || busy} className="flex h-9 items-center gap-2 rounded-lg bg-brand px-4 text-sm font-semibold text-white hover:bg-brand-strong disabled:opacity-40">
                {busy && <Loader2 size={14} className="animate-spin" />} Share
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
