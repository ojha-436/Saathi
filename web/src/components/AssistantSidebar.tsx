"use client";

import clsx from "clsx";
import { Check, ChevronRight, Folder, FolderPlus, MoreHorizontal, Pencil, Pin, Search, Trash2, X } from "@/lib/icons";
import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "@/lib/api";
import type { AssistantProject, AssistantThread } from "@/lib/types";
import { useWs } from "./ctx";

/** Where the sidebar sends the main area: a conversation id, a blank new chat, or the old long conversation. */
export type ActiveChat = string | "new" | "legacy";

const ms = (t?: { toMillis?: () => number } | null) => t?.toMillis?.() ?? 0;

function groupLabel(t: number): string {
  if (!t) return "Earlier";
  const days = Math.floor((Date.now() - t) / 86_400_000);
  return days < 1 ? "Today" : days < 2 ? "Yesterday" : days < 8 ? "Previous 7 days" : days < 31 ? "Previous 30 days" : "Older";
}

export function AssistantSidebar({
  threads, projects, hasLegacy, active, onSelect, onClose,
}: {
  threads: AssistantThread[];
  projects: AssistantProject[];
  hasLegacy: boolean;
  active: ActiveChat;
  onSelect: (id: ActiveChat) => void;
  onClose?: () => void; // small screens: closes the drawer after a choice
}) {
  const { toast } = useWs();
  const [filter, setFilter] = useState("");
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [naming, setNaming] = useState(false);

  const call = (path: string, method: string, json?: unknown) =>
    api(path, { method, ...(json !== undefined ? { json } : {}) }).catch((e) => toast(`Couldn't do that: ${(e as Error).message}`));
  const pick = (id: ActiveChat) => {
    onSelect(id);
    onClose?.();
  };

  const q = filter.trim().toLowerCase();
  const match = (t: AssistantThread) => !q || t.title.toLowerCase().includes(q);
  const sorted = useMemo(() => [...threads].sort((a, b) => ms(b.updated_at) - ms(a.updated_at)), [threads]);
  const pinned = sorted.filter((t) => t.pinned && match(t));
  const recents = sorted.filter((t) => !t.pinned && !t.project_id && match(t));
  const inProject = (pid: string) => sorted.filter((t) => !t.pinned && t.project_id === pid && match(t));
  const groups = useMemo(() => {
    const out: { label: string; rows: AssistantThread[] }[] = [];
    for (const t of recents) {
      const label = groupLabel(ms(t.updated_at));
      const last = out.at(-1);
      if (last?.label === label) last.rows.push(t);
      else out.push({ label, rows: [t] });
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recents.map((t) => `${t.id}:${t.updated_at?.toMillis?.()}:${t.title}`).join("|")]);

  const row = (t: AssistantThread) => (
    <ThreadRow key={t.id} t={t} active={active === t.id} projects={projects} onOpen={() => pick(t.id)}
      onPin={() => call(`/api/assistant/threads/${t.id}`, "PATCH", { pinned: !t.pinned })}
      onRename={(title) => call(`/api/assistant/threads/${t.id}`, "PATCH", { title })}
      onMove={(project_id) => call(`/api/assistant/threads/${t.id}`, "PATCH", { project_id })}
      onDelete={async () => {
        if (active === t.id) onSelect("new");
        await call(`/api/assistant/threads/${t.id}`, "DELETE");
      }} />
  );

  const btn = "flex h-9 w-full items-center gap-2.5 rounded-lg px-2.5 text-left text-sm font-medium text-ink transition hover:bg-hover";

  return (
    <nav aria-label="Saathi conversations" className="flex h-full w-72 shrink-0 flex-col border-r border-border bg-canvas">
      <div className="space-y-0.5 p-2 pb-1">
        <button onClick={() => pick("new")} className={clsx(btn, active === "new" && "bg-brand-soft text-brand")}>
          <Pencil size={16} aria-hidden /> New chat
        </button>
        <div className="relative pt-1">
          <Search size={14} className="pointer-events-none absolute left-2.5 top-[1.15rem] text-muted" aria-hidden />
          <input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Search chats"
            aria-label="Search chats"
            className="h-8 w-full rounded-lg border border-border bg-surface pl-8 pr-2 text-xs outline-none focus:border-brand"
          />
        </div>
      </div>

      <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto px-2 pb-3">
        {pinned.length > 0 && (
          <Section label="Pinned">
            {pinned.map(row)}
          </Section>
        )}

        <Section
          label="Projects"
          action={
            <button onClick={() => setNaming(true)} className="flex h-6 w-6 items-center justify-center rounded text-muted hover:bg-hover hover:text-ink" title="New project" aria-label="New project">
              <FolderPlus size={15} />
            </button>
          }
        >
          {naming && (
            <InlineInput placeholder="Project name" onSave={async (name) => { setNaming(false); if (name) await call("/api/assistant/projects", "POST", { name }); }} onCancel={() => setNaming(false)} />
          )}
          {projects.length === 0 && !naming && <p className="px-2.5 py-1 text-xs text-muted">Group chats by topic, e.g. “Drawing release”.</p>}
          {[...projects].sort((a, b) => a.name.localeCompare(b.name)).map((p) => {
            const rows = inProject(p.id);
            const expanded = open[p.id] ?? rows.some((t) => t.id === active);
            return (
              <div key={p.id}>
                <ProjectRow p={p} count={rows.length} expanded={expanded} onToggle={() => setOpen((o) => ({ ...o, [p.id]: !expanded }))}
                  onRename={(name) => call(`/api/assistant/projects/${p.id}`, "PATCH", { name })}
                  onDelete={() => call(`/api/assistant/projects/${p.id}`, "DELETE")} />
                {expanded && <div className="ml-3 border-l border-border pl-1">{rows.length ? rows.map(row) : <p className="px-2.5 py-1 text-xs text-muted">No chats yet. Use ⋯ on a chat → Move to project.</p>}</div>}
              </div>
            );
          })}
        </Section>

        <Section label="Recents">
          {groups.map((g) => (
            <div key={g.label}>
              <p className="px-2.5 pb-0.5 pt-2 text-[11px] font-medium text-muted">{g.label}</p>
              {g.rows.map(row)}
            </div>
          ))}
          {hasLegacy && !q && (
            <div>
              <p className="px-2.5 pb-0.5 pt-2 text-[11px] font-medium text-muted">Before chats existed</p>
              <LegacyRow active={active === "legacy"} onOpen={() => pick("legacy")} onDelete={async () => { if (active === "legacy") onSelect("new"); await call("/api/assistant/threads/legacy", "DELETE"); }} />
            </div>
          )}
          {recents.length === 0 && !hasLegacy && <p className="px-2.5 py-1 text-xs text-muted">{q ? "No chats match." : "Your chats with Saathi will appear here."}</p>}
        </Section>
      </div>
    </nav>
  );
}

function Section({ label, action, children }: { label: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="mt-3">
      <div className="flex items-center justify-between px-2.5">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-muted">{label}</h2>
        {action}
      </div>
      <div className="mt-1 space-y-0.5">{children}</div>
    </section>
  );
}

/** Small popover menu next to a row. Closes on outside click or Escape. */
function RowMenu({ children, label }: { children: (close: () => void) => React.ReactNode; label: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const down = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const key = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", down);
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("mousedown", down);
      document.removeEventListener("keydown", key);
    };
  }, [open]);
  return (
    <div ref={ref} className="relative">
      <button
        onClick={(e) => { e.stopPropagation(); setOpen((o) => !o); }}
        aria-label={label}
        aria-expanded={open}
        className={clsx("flex h-7 w-7 items-center justify-center rounded-md text-muted hover:bg-surface hover:text-ink", open ? "opacity-100" : "opacity-0 focus:opacity-100 group-hover:opacity-100")}
      >
        <MoreHorizontal size={16} />
      </button>
      {open && <div role="menu" className="ws-pop absolute right-0 top-8 z-40 w-52 rounded-xl border border-border bg-surface p-1 shadow-xl">{children(() => setOpen(false))}</div>}
    </div>
  );
}

const item = "flex h-8 w-full items-center gap-2 rounded-lg px-2 text-left text-sm hover:bg-hover";

function InlineInput({ initial = "", placeholder, onSave, onCancel }: { initial?: string; placeholder?: string; onSave: (v: string) => void; onCancel: () => void }) {
  const [v, setV] = useState(initial);
  return (
    <form className="flex items-center gap-1 px-1" onSubmit={(e) => { e.preventDefault(); onSave(v.trim()); }}>
      <input
        autoFocus
        value={v}
        maxLength={60}
        placeholder={placeholder}
        aria-label={placeholder ?? "Name"}
        onChange={(e) => setV(e.target.value)}
        onKeyDown={(e) => e.key === "Escape" && onCancel()}
        onFocus={(e) => e.currentTarget.select()}
        className="h-8 min-w-0 flex-1 rounded-lg border border-brand bg-surface px-2 text-sm outline-none"
      />
      <button type="submit" aria-label="Save" className="flex h-7 w-7 items-center justify-center rounded-md text-brand hover:bg-brand-soft"><Check size={15} /></button>
      <button type="button" onClick={onCancel} aria-label="Cancel" className="flex h-7 w-7 items-center justify-center rounded-md text-muted hover:bg-hover"><X size={15} /></button>
    </form>
  );
}

function ThreadRow({ t, active, projects, onOpen, onPin, onRename, onMove, onDelete }: {
  t: AssistantThread; active: boolean; projects: AssistantProject[];
  onOpen: () => void; onPin: () => void; onRename: (title: string) => void; onMove: (projectId: string) => void; onDelete: () => void;
}) {
  const [renaming, setRenaming] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [moving, setMoving] = useState(false);
  if (renaming) return <InlineInput initial={t.title} onSave={(v) => { setRenaming(false); if (v && v !== t.title) onRename(v); }} onCancel={() => setRenaming(false)} />;
  return (
    <div className={clsx("group flex items-center rounded-lg pr-1 transition", active ? "bg-brand-soft" : "hover:bg-hover")}>
      <button onClick={onOpen} aria-current={active ? "page" : undefined} className={clsx("flex h-9 min-w-0 flex-1 items-center gap-2 px-2.5 text-left text-sm", active ? "font-semibold text-brand" : "text-ink")}>
        {t.pinned && <Pin size={13} className="shrink-0 text-muted" aria-label="Pinned" />}
        <span className="truncate">{t.title}</span>
      </button>
      <RowMenu label={`Options for ${t.title}`}>
        {(close) => (
          <>
            <button role="menuitem" className={item} onClick={() => { close(); onPin(); }}><Pin size={15} /> {t.pinned ? "Unpin" : "Pin"}</button>
            <button role="menuitem" className={item} onClick={() => { close(); setRenaming(true); }}><Pencil size={15} /> Rename</button>
            <button role="menuitem" className={item} onClick={() => setMoving((m) => !m)} aria-expanded={moving}><Folder size={15} /> Move to project <ChevronRight size={13} className={clsx("ml-auto transition", moving && "rotate-90")} /></button>
            {moving && (
              <div className="ml-2 max-h-40 overflow-y-auto border-l border-border pl-1">
                {projects.length === 0 && <p className="px-2 py-1 text-xs text-muted">Create a project first (the folder + above).</p>}
                {t.project_id && <button role="menuitem" className={item} onClick={() => { close(); onMove(""); }}>No project</button>}
                {projects.filter((p) => p.id !== t.project_id).map((p) => (
                  <button key={p.id} role="menuitem" className={clsx(item, "truncate")} onClick={() => { close(); onMove(p.id); }}>{p.name}</button>
                ))}
              </div>
            )}
            <button
              role="menuitem"
              className={clsx(item, "text-rust hover:bg-rust-soft")}
              onClick={() => { if (confirm) { close(); onDelete(); } else setConfirm(true); }}
            >
              <Trash2 size={15} /> {confirm ? "Click again to delete" : "Delete"}
            </button>
          </>
        )}
      </RowMenu>
    </div>
  );
}

function LegacyRow({ active, onOpen, onDelete }: { active: boolean; onOpen: () => void; onDelete: () => void }) {
  const [confirm, setConfirm] = useState(false);
  return (
    <div className={clsx("group flex items-center rounded-lg pr-1", active ? "bg-brand-soft" : "hover:bg-hover")}>
      <button onClick={onOpen} className={clsx("flex h-9 min-w-0 flex-1 items-center px-2.5 text-left text-sm", active ? "font-semibold text-brand" : "text-ink")}>
        <span className="truncate">Earlier conversation</span>
      </button>
      <RowMenu label="Options for the earlier conversation">
        {(close) => (
          <button role="menuitem" className={clsx(item, "text-rust hover:bg-rust-soft")} onClick={() => { if (confirm) { close(); onDelete(); } else setConfirm(true); }}>
            <Trash2 size={15} /> {confirm ? "Click again to delete" : "Delete"}
          </button>
        )}
      </RowMenu>
    </div>
  );
}

function ProjectRow({ p, count, expanded, onToggle, onRename, onDelete }: {
  p: AssistantProject; count: number; expanded: boolean; onToggle: () => void; onRename: (name: string) => void; onDelete: () => void;
}) {
  const [renaming, setRenaming] = useState(false);
  const [confirm, setConfirm] = useState(false);
  if (renaming) return <InlineInput initial={p.name} onSave={(v) => { setRenaming(false); if (v && v !== p.name) onRename(v); }} onCancel={() => setRenaming(false)} />;
  return (
    <div className="group flex items-center rounded-lg pr-1 hover:bg-hover">
      <button onClick={onToggle} aria-expanded={expanded} className="flex h-9 min-w-0 flex-1 items-center gap-2 px-2.5 text-left text-sm font-medium text-ink">
        <ChevronRight size={13} className={clsx("shrink-0 text-muted transition", expanded && "rotate-90")} aria-hidden />
        <Folder size={15} className="shrink-0 text-muted" aria-hidden />
        <span className="truncate">{p.name}</span>
        {count > 0 && <span className="ml-auto text-[11px] text-muted">{count}</span>}
      </button>
      <RowMenu label={`Options for project ${p.name}`}>
        {(close) => (
          <>
            <button role="menuitem" className={item} onClick={() => { close(); setRenaming(true); }}><Pencil size={15} /> Rename</button>
            <button role="menuitem" className={clsx(item, "text-rust hover:bg-rust-soft")} onClick={() => { if (confirm) { close(); onDelete(); } else setConfirm(true); }}>
              <Trash2 size={15} /> {confirm ? "Click again (chats stay)" : "Delete project"}
            </button>
          </>
        )}
      </RowMenu>
    </div>
  );
}


