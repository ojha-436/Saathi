"use client";

import clsx from "clsx";
import { useEffect, useMemo, useRef, useState } from "react";
import { BookmarkFill, FileSearch, Loader2, MoreHorizontal, Pencil, Plus, Search, ShieldCheck, Trash2, X } from "@/lib/icons";
import { api } from "@/lib/api";
import { timeShort } from "@/lib/format";
import { useResearchRuns } from "@/lib/hooks";
import type { AssistantSession, ResearchRun } from "@/lib/types";
import { Menu, type MenuItem } from "./bits";
import { useWs } from "./ctx";
import { LogoMark } from "./Logo";
import { READINESS, STATUS } from "./Research";

const ACTIVE = ["planning", "queued", "running", "retrying", "cancelling"];

/** The view for a fresh conversation (a unique key, so the conversation pane starts over). */
export const newConversation = () => ({ kind: "assistant" as const, session: `new-${Date.now()}` });

/** Today / Yesterday / Previous 7 days / Previous 30 days / Older, like any assistant's history. Pinned ones go first. */
function bucket(d: Date | null): string {
  if (!d) return "Older";
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const day = 86_400_000;
  const t = d.getTime();
  if (t >= start.getTime()) return "Today";
  if (t >= start.getTime() - day) return "Yesterday";
  if (t >= start.getTime() - 7 * day) return "Previous 7 days";
  if (t >= start.getTime() - 30 * day) return "Previous 30 days";
  return "Older";
}

function grouped<T>(items: T[], pinned: (x: T) => boolean, when: (x: T) => Date | null): [string, T[]][] {
  const out = new Map<string, T[]>();
  for (const x of items) {
    const k = pinned(x) ? "Pinned" : bucket(when(x));
    out.set(k, [...(out.get(k) ?? []), x]);
  }
  return ["Pinned", "Today", "Yesterday", "Previous 7 days", "Previous 30 days", "Older"].filter((k) => out.has(k)).map((k) => [k, out.get(k)!]);
}

/** The matched words in a search result, highlighted. */
function Marked({ text, q }: { text: string; q: string }) {
  const i = q ? text.toLowerCase().indexOf(q.toLowerCase()) : -1;
  if (i < 0) return <>{text}</>;
  return (
    <>
      {text.slice(0, i)}
      <mark className="rounded bg-saffron-soft px-0.5 text-ink">{text.slice(i, i + q.length)}</mark>
      {text.slice(i + q.length)}
    </>
  );
}

/** Saathi's left pane: conversation history (Ask) or research reports (Research), searchable, with pin, rename and delete. */
export function SaathiSidebar({ mode, activeId, onNavigate }: { mode: "ask" | "research"; activeId?: string; onNavigate?: () => void }) {
  const { open } = useWs();
  const [q, setQ] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);
  const ask = mode === "ask";

  return (
    <aside className="flex h-full w-full flex-col border-r border-border bg-canvas" aria-label={ask ? "Saathi conversations" : "Your research reports"}>
      <div className="flex items-center gap-2.5 px-4 pb-2 pt-4">
        <LogoMark size={28} className="shrink-0" />
        <div className="min-w-0 flex-1">
          <h2 className="text-[17px] font-bold leading-tight">Saathi</h2>
          <p className="truncate text-[11px] text-muted">{ask ? "Your conversations" : "Your research reports"}</p>
        </div>
      </div>
      <div className="space-y-2 px-3 pb-2">
        <button
          onClick={() => {
            open(ask ? newConversation() : { kind: "research", id: "new" });
            onNavigate?.();
          }}
          className="flex h-9 w-full items-center justify-center gap-1.5 rounded-lg bg-brand text-[13px] font-semibold text-white transition hover:bg-brand-strong"
        >
          {ask ? <Plus size={15} aria-hidden /> : <FileSearch size={15} aria-hidden />} {ask ? "New conversation" : "New research"}
        </button>
        <label className="relative block">
          <span className="sr-only">{ask ? "Search conversations" : "Search research"}</span>
          <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted" aria-hidden />
          <input
            ref={searchRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => e.key === "Escape" && setQ("")}
            placeholder={ask ? "Search conversations" : "Search research"}
            className="h-9 w-full rounded-lg border border-border bg-surface pl-8 pr-8 text-[13px] outline-none focus:border-brand focus:ring-2 focus:ring-brand/15"
          />
          {q && (
            <button onClick={() => (setQ(""), searchRef.current?.focus())} className="absolute right-1.5 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-md text-muted hover:bg-hover" aria-label="Clear search">
              <X size={13} />
            </button>
          )}
        </label>
      </div>
      {ask ? <Conversations q={q.trim()} activeId={activeId} onNavigate={onNavigate} /> : <Reports q={q.trim()} activeId={activeId} onNavigate={onNavigate} />}
      <p className="flex items-center gap-1.5 border-t border-border px-4 py-2.5 text-[11px] text-muted">
        <ShieldCheck size={13} className="shrink-0 text-moss" aria-hidden />
        {ask ? "Private to you · every answer cites its source" : "Uses only sources you can open · claims are verified"}
      </p>
    </aside>
  );
}

function Conversations({ q, activeId, onNavigate }: { q: string; activeId?: string; onNavigate?: () => void }) {
  const { open, toast } = useWs();
  const [rows, setRows] = useState<AssistantSession[] | null>(null);
  const [reload, setReload] = useState(0);
  // the conversation open on the right (a new one only gets its id when the first question is asked)
  const [current, setCurrent] = useState<string | undefined>(activeId && !activeId.startsWith("new") ? activeId : undefined);
  const [prevActive, setPrevActive] = useState(activeId);
  if (prevActive !== activeId) {
    setPrevActive(activeId);
    setCurrent(activeId && !activeId.startsWith("new") ? activeId : undefined);
  }

  useEffect(() => {
    const changed = () => setReload((n) => n + 1);
    const opened = (e: Event) => setCurrent((e as CustomEvent<string>).detail);
    addEventListener("saathi:answered", changed);
    addEventListener("saathi:session", opened);
    return () => {
      removeEventListener("saathi:answered", changed);
      removeEventListener("saathi:session", opened);
    };
  }, []);

  useEffect(() => {
    let live = true;
    const t = setTimeout(
      () =>
        api<AssistantSession[]>(`/api/assistant/sessions${q ? `?q=${encodeURIComponent(q)}` : ""}`)
          .then((r) => live && setRows(r))
          .catch((e) => live && (setRows((r) => r ?? []), toast((e as Error).message))),
      q ? 250 : 0,
    );
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [q, reload, toast]);

  async function patch(s: AssistantSession, body: { title?: string; pinned?: boolean }) {
    try {
      await api(`/api/assistant/sessions/${s.id}`, { method: "PATCH", json: body });
      setReload((n) => n + 1);
    } catch (e) {
      toast((e as Error).message);
    }
  }
  async function remove(s: AssistantSession) {
    if (!confirm(`Delete “${s.title}”? Its questions and answers are removed for good.`)) return;
    try {
      await api(`/api/assistant/sessions/${s.id}`, { method: "DELETE" });
      setRows((r) => (r ?? []).filter((x) => x.id !== s.id));
      if (current === s.id) open(newConversation());
      toast("Conversation deleted.");
    } catch (e) {
      toast((e as Error).message);
    }
  }

  if (rows === null)
    return (
      <p className="flex flex-1 items-start gap-2 px-5 py-6 text-sm text-muted">
        <Loader2 size={14} className="mt-0.5 animate-spin" /> Loading conversations…
      </p>
    );
  const groups = q ? ([[`${rows.length} result${rows.length === 1 ? "" : "s"}`, rows]] as [string, AssistantSession[]][]) : grouped(rows, (s) => s.pinned, (s) => (s.updated_at ? new Date(s.updated_at) : null));
  return (
    <nav className="scrollbar-thin flex-1 overflow-y-auto px-2 pb-3" aria-label="Conversation history">
      {rows.length === 0 ? (
        <p className="px-4 py-10 text-center text-sm text-muted">{q ? "No conversation mentions that." : "Your conversations with Saathi appear here."}</p>
      ) : (
        groups.map(([label, items]) => (
          <section key={label} className="mt-2">
            <h3 className="px-2.5 pb-1 text-[11px] font-semibold uppercase tracking-wide text-muted">{label}</h3>
            <ul className="space-y-px">
              {items.map((s) => (
                <Row
                  key={s.id}
                  active={current === s.id}
                  title={s.title}
                  q={q}
                  meta={
                    q && s.match ? (
                      <Marked text={s.match} q={q} />
                    ) : (
                      <>
                        {s.questions} question{s.questions === 1 ? "" : "s"} · {timeShort(s.updated_at ? new Date(s.updated_at) : null)}
                      </>
                    )
                  }
                  pinned={s.pinned}
                  onOpen={() => {
                    open({ kind: "assistant", session: s.id });
                    onNavigate?.();
                  }}
                  onRename={(title) => patch(s, { title })}
                  onPin={() => patch(s, { pinned: !s.pinned })}
                  onDelete={() => remove(s)}
                />
              ))}
            </ul>
          </section>
        ))
      )}
    </nav>
  );
}

function Reports({ q, activeId, onNavigate }: { q: string; activeId?: string; onNavigate?: () => void }) {
  const { uid, open, toast } = useWs();
  const runs = useResearchRuns(uid);
  const shown = useMemo(() => {
    const n = q.toLowerCase();
    return n ? runs.filter((r) => `${r.title ?? ""} ${r.goal} ${r.report?.title ?? ""}`.toLowerCase().includes(n)) : runs;
  }, [runs, q]);
  const current = activeId === "new" ? undefined : (activeId ?? runs[0]?.id);

  async function patch(r: ResearchRun, body: { title?: string; pinned?: boolean }) {
    try {
      await api(`/api/research/${r.id}`, { method: "PATCH", json: body });
    } catch (e) {
      toast((e as Error).message);
    }
  }
  async function remove(r: ResearchRun) {
    if (!confirm(`Delete “${r.title || r.goal}”? The report and its evidence trail are removed.`)) return;
    try {
      await api(`/api/research/${r.id}`, { method: "DELETE" });
      if (current === r.id) open({ kind: "research" });
      toast("Research deleted.");
    } catch (e) {
      toast((e as Error).message);
    }
  }

  const groups = q ? ([[`${shown.length} result${shown.length === 1 ? "" : "s"}`, shown]] as [string, ResearchRun[]][]) : grouped(shown, (r) => !!r.pinned, (r) => r.created_at?.toDate() ?? null);
  return (
    <nav className="scrollbar-thin flex-1 overflow-y-auto px-2 pb-3" aria-label="Research history">
      {shown.length === 0 ? (
        <p className="px-4 py-10 text-center text-sm text-muted">{q ? "No research matches that." : "Your research reports appear here."}</p>
      ) : (
        groups.map(([label, items]) => (
          <section key={label} className="mt-2">
            <h3 className="px-2.5 pb-1 text-[11px] font-semibold uppercase tracking-wide text-muted">{label}</h3>
            <ul className="space-y-px">
              {items.map((r) => {
                const verdict = r.status === "done" && r.report ? READINESS[r.report.readiness] : null;
                return (
                  <Row
                    key={r.id}
                    active={current === r.id}
                    title={r.title || r.goal}
                    q={q}
                    pinned={!!r.pinned}
                    meta={
                      <span className="flex flex-wrap items-center gap-1">
                        {ACTIVE.includes(r.status) && <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-brand" aria-hidden />}
                        <span className={clsx("rounded-full px-1.5 py-px font-semibold", STATUS[r.status].cls)}>{STATUS[r.status].label}</span>
                        {verdict && <span className={clsx("rounded-full border px-1.5 py-px font-semibold", verdict.cls)}>{verdict.label}</span>}
                        <span>{timeShort(r.created_at)}</span>
                      </span>
                    }
                    onOpen={() => {
                      open({ kind: "research", id: r.id });
                      onNavigate?.();
                    }}
                    onRename={(title) => patch(r, { title })}
                    onPin={() => patch(r, { pinned: !r.pinned })}
                    onDelete={() => remove(r)}
                  />
                );
              })}
            </ul>
          </section>
        ))
      )}
    </nav>
  );
}

/** One history row: opens on click; ⋯ for rename (inline), pin and delete. */
function Row({ active, title, q, meta, pinned, onOpen, onRename, onPin, onDelete }: {
  active: boolean; title: string; q: string; meta: React.ReactNode; pinned: boolean;
  onOpen: () => void; onRename: (t: string) => void; onPin: () => void; onDelete: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(title);
  const items: MenuItem[] = [
    { label: "Rename", icon: Pencil, onSelect: () => (setDraft(title), setEditing(true)) },
    { label: pinned ? "Unpin" : "Pin to top", icon: BookmarkFill, onSelect: onPin },
    "sep",
    { label: "Delete", icon: Trash2, onSelect: onDelete, danger: true },
  ];
  if (editing)
    return (
      <li className="px-1 py-1">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            setEditing(false);
            if (draft.trim() && draft.trim() !== title) onRename(draft.trim());
          }}
        >
          <input
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={() => setEditing(false)}
            onKeyDown={(e) => e.key === "Escape" && setEditing(false)}
            maxLength={80}
            aria-label="New name"
            className="h-9 w-full rounded-lg border border-brand bg-surface px-2.5 text-[13px] outline-none ring-2 ring-brand/15"
          />
        </form>
      </li>
    );
  return (
    <li className="group relative">
      <button
        onClick={onOpen}
        aria-current={active ? "page" : undefined}
        className={clsx("w-full rounded-lg py-2 pl-2.5 pr-9 text-left transition", active ? "bg-surface shadow-[0_1px_2px_rgba(11,27,43,0.08)]" : "hover:bg-hover")}
      >
        <span className="flex items-center gap-1.5">
          {pinned && (
            <span role="img" aria-label="Pinned" className="inline-flex shrink-0">
              <BookmarkFill size={11} className="text-saffron-ink" />
            </span>
          )}
          <span className="truncate text-[13px] font-medium">
            <Marked text={title} q={q} />
          </span>
        </span>
        <span className="mt-0.5 block truncate text-[11px] text-muted">{meta}</span>
      </button>
      <div className={clsx("absolute right-1 top-1.5", active ? "block" : "hidden group-focus-within:block group-hover:block")}>
        <Menu label={`Actions for ${title}`} trigger={<MoreHorizontal size={15} />} items={items} className="flex h-7 w-7 items-center justify-center rounded-md text-muted hover:bg-canvas hover:text-ink" />
      </div>
    </li>
  );
}
