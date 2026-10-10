"use client";

import clsx from "clsx";
import { ArrowRight, Check, Compass, CornerDownLeft, FileText, Globe, Hash, Loader2, Lock, MessageSquare, Search, Sparkles, Users, X } from "@/lib/icons";
import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "@/lib/api";
import { chatTitle } from "@/lib/format";
import type { ChannelSummary, Chat } from "@/lib/types";
import { Avatar } from "./bits";
import { useWs } from "./ctx";

export function Modal({ title, onClose, children, wide }: { title: string; onClose: () => void; children: React.ReactNode; wide?: boolean }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center bg-ink/45 px-4 pt-[10vh]" onMouseDown={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onMouseDown={(e) => e.stopPropagation()}
        className={clsx("ws-pop flex max-h-[80vh] w-full flex-col overflow-hidden rounded-2xl border border-border bg-surface text-ink shadow-2xl", wide ? "max-w-2xl" : "max-w-lg")}
      >
        {children}
      </div>
    </div>
  );
}

export function ModalHeader({ title, sub, onClose }: { title: string; sub?: string; onClose: () => void }) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-border px-5 py-4">
      <div>
        <h2 className="text-lg font-bold">{title}</h2>
        {sub && <p className="mt-0.5 text-sm text-muted">{sub}</p>}
      </div>
      <button onClick={onClose} aria-label="Close" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-muted hover:bg-hover">
        <X size={18} />
      </button>
    </div>
  );
}

export function PeoplePicker({ picked, setPicked, exclude = [] }: { picked: string[]; setPicked: (f: (p: string[]) => string[]) => void; exclude?: string[] }) {
  const { uid, users } = useWs();
  const [q, setQ] = useState("");
  const t = q.trim().toLowerCase();
  const people = Object.values(users)
    .filter((u) => u.id !== uid && !exclude.includes(u.id) && !u.deactivated)
    .filter((u) => !t || u.name.toLowerCase().includes(t) || u.role.toLowerCase().includes(t))
    .sort((a, b) => a.name.localeCompare(b.name));
  return (
    <div>
      <div className="relative">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" aria-hidden />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by name or role" aria-label="Search people" className="h-10 w-full rounded-lg border border-border bg-surface pl-9 pr-3 text-sm outline-none focus:border-brand" />
      </div>
      {picked.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {picked.map((id) => (
            <span key={id} className="flex items-center gap-1 rounded-full bg-brand-soft py-0.5 pl-1 pr-1.5 text-xs font-medium text-brand">
              <Avatar name={users[id]?.name ?? "?"} size={18} /> {users[id]?.name}
              <button onClick={() => setPicked((p) => p.filter((x) => x !== id))} aria-label={`Remove ${users[id]?.name}`} className="rounded-full p-0.5 hover:bg-brand/10">
                <X size={11} />
              </button>
            </span>
          ))}
        </div>
      )}
      <ul className="mt-2 max-h-60 overflow-y-auto">
        {people.length === 0 && <li className="px-2 py-6 text-center text-sm text-muted">No one matches “{q}”.</li>}
        {people.map((u) => {
          const on = picked.includes(u.id);
          return (
            <li key={u.id}>
              <button
                onClick={() => setPicked((p) => (on ? p.filter((x) => x !== u.id) : [...p, u.id]))}
                aria-pressed={on}
                className={clsx("flex w-full items-center gap-3 rounded-lg px-2 py-1.5 text-left transition", on ? "bg-brand-soft" : "hover:bg-hover")}
              >
                <Avatar name={u.name} size={32} />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium">{u.name}</span>
                  <span className="block text-xs text-muted">{u.role}</span>
                </span>
                <span className={clsx("flex h-5 w-5 items-center justify-center rounded-md border", on ? "border-brand bg-brand text-white" : "border-[#c5cad3]")}>{on && <Check size={13} />}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export function NewChatDialog({ onClose }: { onClose: () => void }) {
  const { open, toast, dialog } = useWs();
  const [picked, setPicked] = useState<string[]>([]);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const isGroup = picked.length > 1;

  async function create() {
    setBusy(true);
    try {
      const r = await api<{ id: string }>("/api/chats", { json: { member_ids: picked, name: isGroup ? name.trim() || "New group" : null } });
      open({ kind: "chat", chatId: r.id });
      onClose();
    } catch (e) {
      toast(`Couldn't create the chat: ${(e as Error).message}`);
      setBusy(false);
    }
  }

  return (
    <Modal title="New chat" onClose={onClose}>
      <ModalHeader title="New chat" sub="Pick one colleague for a direct message, or several for a group chat." onClose={onClose} />
      <div className="overflow-y-auto p-4">
        <PeoplePicker picked={picked} setPicked={setPicked} />
        {isGroup && (
          <div className="mt-3">
            <label htmlFor="group-name" className="text-sm font-medium">
              Group name <span className="font-normal text-muted">(optional)</span>
            </label>
            <input id="group-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. RDSO inspection prep" className="mt-1 h-10 w-full rounded-lg border border-border bg-surface px-3 text-sm outline-none focus:border-brand" />
          </div>
        )}
      </div>
      <div className="flex items-center gap-2 border-t border-border bg-canvas/60 px-5 py-3">
        <button onClick={() => dialog("new-channel")} className="mr-auto flex items-center gap-1.5 text-sm font-medium text-brand hover:underline">
          <Hash size={14} /> Create a channel instead
        </button>
        <button onClick={onClose} className="h-9 rounded-lg px-4 text-sm font-medium text-muted hover:bg-hover">
          Cancel
        </button>
        <button onClick={create} disabled={!picked.length || busy} className="flex h-9 items-center gap-2 rounded-lg bg-brand px-4 text-sm font-semibold text-white hover:bg-brand-strong disabled:opacity-40">
          {busy && <Loader2 size={15} className="animate-spin" />} {isGroup ? "Create group" : "Start chat"}
        </button>
      </div>
    </Modal>
  );
}

export function CreateChannelDialog({ onClose }: { onClose: () => void }) {
  const { open, toast } = useWs();
  const [step, setStep] = useState<1 | 2>(1);
  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");
  const [visibility, setVisibility] = useState<"public" | "private">("public");
  const [picked, setPicked] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const valid = name.trim().length >= 2;

  async function create() {
    setBusy(true);
    setError("");
    try {
      const r = await api<{ id: string }>("/api/channels", { json: { name, description: desc, visibility, member_ids: picked } });
      toast(`Channel “${name.trim()}” created.`);
      open({ kind: "chat", chatId: r.id });
      onClose();
    } catch (e) {
      setError((e as Error).message);
      setStep(1);
      setBusy(false);
    }
  }

  return (
    <Modal title="Create a channel" onClose={onClose}>
      <ModalHeader title="Create a channel" sub={step === 1 ? "Channels keep a team, project or topic in one place." : "Add people now, or invite them later."} onClose={onClose} />
      <div className="overflow-y-auto p-5">
        {step === 1 ? (
          <div className="space-y-4">
            <div>
              <label htmlFor="ch-name" className="text-sm font-medium">
                Channel name
              </label>
              <div className="relative mt-1">
                <Hash size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" aria-hidden />
                <input
                  id="ch-name"
                  autoFocus
                  value={name}
                  maxLength={60}
                  onChange={(e) => {
                    setName(e.target.value);
                    setError("");
                  }}
                  onKeyDown={(e) => e.key === "Enter" && valid && setStep(2)}
                  placeholder="e.g. Bogie prototype, Quality – Bay 2"
                  className="h-10 w-full rounded-lg border border-border bg-surface pl-9 pr-14 text-sm outline-none focus:border-brand"
                  aria-invalid={!!error}
                  aria-describedby={error ? "ch-error" : undefined}
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] text-muted">{60 - name.length}</span>
              </div>
              {error && (
                <p id="ch-error" role="alert" className="mt-1 text-xs text-rust">
                  {error}
                </p>
              )}
            </div>
            <div>
              <label htmlFor="ch-desc" className="text-sm font-medium">
                Description <span className="font-normal text-muted">(optional)</span>
              </label>
              <textarea id="ch-desc" value={desc} onChange={(e) => setDesc(e.target.value)} maxLength={300} rows={2} placeholder="What is this channel about?" className="mt-1 w-full resize-none rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-brand" />
            </div>
            <fieldset>
              <legend className="text-sm font-medium">Privacy</legend>
              <div className="mt-1.5 grid gap-2 sm:grid-cols-2">
                {(
                  [
                    ["public", Globe, "Public", "Anyone at Shakti Rail can find, read and join."],
                    ["private", Lock, "Private", "Only people you invite can see it."],
                  ] as const
                ).map(([v, Icon, label, help]) => (
                  <label key={v} className={clsx("flex cursor-pointer gap-3 rounded-xl border p-3 transition", visibility === v ? "border-brand bg-brand-soft/60 ring-1 ring-brand" : "border-border hover:border-[#c5cad3]")}>
                    <input type="radio" name="visibility" value={v} checked={visibility === v} onChange={() => setVisibility(v)} className="sr-only" />
                    <Icon size={18} className={clsx("mt-0.5 shrink-0", visibility === v ? "text-brand" : "text-muted")} aria-hidden />
                    <span>
                      <span className="block text-sm font-semibold">{label}</span>
                      <span className="block text-xs text-muted">{help}</span>
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>
            <p className="flex items-start gap-2 rounded-lg bg-saffron-soft/50 px-3 py-2 text-xs text-saffron-ink">
              <Sparkles size={13} className="mt-px shrink-0" aria-hidden /> Saathi indexes channel messages and files for members only. Owners can hide a channel from AI at any time.
            </p>
          </div>
        ) : (
          <PeoplePicker picked={picked} setPicked={setPicked} />
        )}
      </div>
      <div className="flex justify-end gap-2 border-t border-border bg-canvas/60 px-5 py-3">
        {step === 1 ? (
          <>
            <button onClick={onClose} className="h-9 rounded-lg px-4 text-sm font-medium text-muted hover:bg-hover">
              Cancel
            </button>
            <button onClick={() => setStep(2)} disabled={!valid} className="h-9 rounded-lg bg-brand px-4 text-sm font-semibold text-white hover:bg-brand-strong disabled:opacity-40">
              Next
            </button>
          </>
        ) : (
          <>
            <button onClick={() => setStep(1)} className="mr-auto h-9 rounded-lg px-3 text-sm font-medium text-muted hover:bg-hover">
              Back
            </button>
            <button onClick={create} disabled={busy} className="h-9 rounded-lg px-4 text-sm font-medium text-muted hover:bg-hover">
              Skip for now
            </button>
            <button onClick={create} disabled={busy || !picked.length} className="flex h-9 items-center gap-2 rounded-lg bg-brand px-4 text-sm font-semibold text-white hover:bg-brand-strong disabled:opacity-40">
              {busy && <Loader2 size={15} className="animate-spin" />} Create channel
            </button>
          </>
        )}
      </div>
    </Modal>
  );
}

export function BrowseChannelsDialog({ onClose }: { onClose: () => void }) {
  const { open, toast, dialog } = useWs();
  const [rows, setRows] = useState<ChannelSummary[] | null>(null);
  const [q, setQ] = useState("");
  const [joining, setJoining] = useState<string | null>(null);

  useEffect(() => {
    api<ChannelSummary[]>("/api/channels/browse")
      .then(setRows)
      .catch((e) => {
        toast((e as Error).message);
        setRows([]);
      });
  }, [toast]);

  async function join(c: ChannelSummary) {
    setJoining(c.id);
    try {
      await api(`/api/channels/${c.id}/join`, { method: "POST" });
      toast(`You joined ${c.name}.`);
      // the chat listener delivers the channel a moment later
      setTimeout(() => open({ kind: "chat", chatId: c.id }), 400);
      onClose();
    } catch (e) {
      toast((e as Error).message);
      setJoining(null);
    }
  }

  const t = q.trim().toLowerCase();
  const list = (rows ?? []).filter((c) => !t || c.name.toLowerCase().includes(t) || c.description.toLowerCase().includes(t));

  return (
    <Modal title="Browse channels" onClose={onClose} wide>
      <ModalHeader title="Browse channels" sub="Public channels across Shakti Rail Components." onClose={onClose} />
      <div className="flex gap-2 border-b border-border px-5 py-3">
        <div className="relative flex-1">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" aria-hidden />
          <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search channels" aria-label="Search channels" className="h-10 w-full rounded-lg border border-border bg-surface pl-9 pr-3 text-sm outline-none focus:border-brand" />
        </div>
        <button onClick={() => dialog("new-channel")} className="flex h-10 items-center gap-1.5 rounded-lg bg-brand px-3.5 text-sm font-semibold text-white hover:bg-brand-strong">
          <Hash size={15} /> Create
        </button>
      </div>
      <ul className="flex-1 overflow-y-auto p-2" aria-busy={rows === null}>
        {rows === null && (
          <li className="flex items-center justify-center gap-2 py-12 text-sm text-muted">
            <Loader2 size={15} className="animate-spin" /> Loading channels…
          </li>
        )}
        {rows !== null && list.length === 0 && (
          <li className="px-4 py-12 text-center text-sm text-muted">
            <Compass size={22} className="mx-auto mb-2" aria-hidden />
            {rows.length === 0 ? "No public channels yet. Create the first one." : `No channels match “${q}”.`}
          </li>
        )}
        {list.map((c) => (
          <li key={c.id} className="flex items-center gap-3 rounded-xl px-3 py-2.5 hover:bg-hover">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-brand-soft text-brand" aria-hidden>
              <Hash size={18} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-semibold">{c.name}</span>
              <span className="block truncate text-xs text-muted">
                <Users size={11} className="mr-1 inline" aria-hidden />
                {c.member_count} {c.member_count === 1 ? "member" : "members"}
                {c.description && ` · ${c.description}`}
              </span>
            </span>
            {c.joined ? (
              <button
                onClick={() => {
                  open({ kind: "chat", chatId: c.id });
                  onClose();
                }}
                className="flex h-8 items-center gap-1 rounded-lg border border-border px-3 text-xs font-semibold hover:bg-surface"
              >
                <Check size={13} className="text-moss" /> Open
              </button>
            ) : (
              <button onClick={() => join(c)} disabled={joining === c.id} className="flex h-8 items-center gap-1.5 rounded-lg bg-brand px-3.5 text-xs font-semibold text-white hover:bg-brand-strong disabled:opacity-60">
                {joining === c.id && <Loader2 size={12} className="animate-spin" />} Join
              </button>
            )}
          </li>
        ))}
      </ul>
    </Modal>
  );
}

const KIND_SUB: Record<Chat["type"], string> = { dm: "Direct message", group: "Group chat", channel: "Channel" };

/** ⌘K: jump to any chat, channel or file, or send the query straight to Saathi. */
export function CommandPalette({ chatList, onClose }: { chatList: Chat[]; onClose: () => void }) {
  const { uid, users, files, open, dialog, newTask } = useWs();
  const [q, setQ] = useState("");
  const [idx, setIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => inputRef.current?.focus(), []);

  const items = useMemo(() => {
    const t = q.trim().toLowerCase();
    const chatItems = chatList
      .map((c) => ({ key: `c-${c.id}`, label: chatTitle(c, uid, users), sub: KIND_SUB[c.type], kind: c.type === "channel" ? ("channel" as const) : ("chat" as const), id: c.id }))
      .filter((c) => !t || c.label.toLowerCase().includes(t));
    const fileItems = Object.values(files)
      .map((f) => ({ key: `f-${f.id}`, label: f.name, sub: f.doc?.drawing_no ? `${f.doc.drawing_no}${f.doc.revision ? ` · Rev ${f.doc.revision}` : ""}` : "File", kind: "file" as const, id: f.id, chatId: f.chat_id }))
      .filter((f) => t && (f.label.toLowerCase().includes(t) || f.sub.toLowerCase().includes(t)));
    const ask = t ? [{ key: "ask", label: `Ask Saathi: “${q.trim()}”`, sub: "Searches every chat, channel and file you can access", kind: "ask" as const, id: "" }] : [];
    const actions = !t
      ? [
          { key: "a-task", label: "Create a task", sub: "Action", kind: "action-task" as const, id: "" },
          { key: "a-meeting", label: "Add meeting notes", sub: "Action · summary + action items", kind: "action-meeting" as const, id: "" },
          { key: "a-channel", label: "Create a channel", sub: "Action", kind: "action-channel" as const, id: "" },
          { key: "a-browse", label: "Browse channels", sub: "Action", kind: "action-browse" as const, id: "" },
        ]
      : [];
    return [...ask, ...chatItems.slice(0, 7), ...fileItems.slice(0, 5), ...actions];
  }, [q, chatList, files, uid, users]);

  function choose(i: number) {
    const it = items[i];
    if (!it) return;
    if (it.kind === "ask") open({ kind: "assistant", prompt: q.trim() });
    else if (it.kind === "chat" || it.kind === "channel") open({ kind: "chat", chatId: it.id });
    else if (it.kind === "file") open({ kind: "chat", chatId: (it as { chatId: string }).chatId });
    else if (it.kind === "action-channel") return dialog("new-channel");
    else if (it.kind === "action-meeting") return dialog("meeting-new");
    else if (it.kind === "action-task") {
      newTask();
      onClose();
      return;
    }
    else if (it.kind === "action-browse") return dialog("browse-channels");
    onClose();
  }

  const icon = (k: (typeof items)[number]["kind"]) =>
    k === "ask" ? <Sparkles size={15} /> : k === "file" ? <FileText size={15} /> : k === "channel" || k === "action-channel" ? <Hash size={15} /> : k === "action-browse" ? <Compass size={15} /> : k === "action-task" ? <Check size={15} /> : k === "action-meeting" ? <Users size={15} /> : <MessageSquare size={15} />;

  return (
    <Modal title="Search or ask" onClose={onClose} wide>
      <div className="flex items-center gap-3 border-b border-border px-4">
        <Search size={18} className="text-muted" aria-hidden />
        <input
          ref={inputRef}
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setIdx(0);
          }}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setIdx((i) => Math.min(i + 1, items.length - 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setIdx((i) => Math.max(i - 1, 0));
            } else if (e.key === "Enter") {
              e.preventDefault();
              choose(idx);
            }
          }}
          placeholder="Jump to a chat, channel or file, or ask Saathi anything…"
          aria-label="Search chats, channels and files, or ask Saathi"
          className="h-14 flex-1 bg-transparent text-base outline-none focus-visible:outline-none"
        />
        <kbd className="rounded border border-border px-1.5 font-mono text-[10px] text-muted">ESC</kbd>
      </div>
      <ul role="listbox" aria-label="Results" className="max-h-[55vh] overflow-y-auto p-2">
        {items.length === 0 && <li className="px-3 py-8 text-center text-sm text-muted">Type to search, or press Enter to ask Saathi.</li>}
        {items.map((it, i) => (
          <li key={it.key} role="option" aria-selected={i === idx}>
            <button onMouseEnter={() => setIdx(i)} onClick={() => choose(i)} className={clsx("flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left", i === idx ? "bg-hover" : "")}>
              <span className={clsx("flex h-8 w-8 items-center justify-center rounded-lg", it.kind === "ask" ? "bg-saffron text-ink" : "bg-canvas text-ink/70")}>{icon(it.kind)}</span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">{it.label}</span>
                <span className="block truncate text-[11px] text-muted">{it.sub}</span>
              </span>
              {i === idx && (it.kind === "ask" ? <CornerDownLeft size={15} className="text-muted" /> : <ArrowRight size={15} className="text-muted" />)}
            </button>
          </li>
        ))}
      </ul>
    </Modal>
  );
}

/** Profile editor; also shown once after a first Google sign-in so colleagues see a job title. */
export function ProfileDialog({ onClose, welcome }: { onClose: () => void; welcome?: boolean }) {
  const { me, toast } = useWs();
  const [name, setName] = useState(me?.name ?? "");
  const [role, setRole] = useState(me?.role ?? "");
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    try {
      await api("/api/me/profile", { json: { name, role } });
      toast(welcome ? "You're all set. Welcome to Saathi!" : "Profile updated.");
      onClose();
    } catch (e) {
      toast((e as Error).message);
      setBusy(false);
    }
  }

  return (
    <Modal title={welcome ? "Welcome to Saathi" : "Edit profile"} onClose={onClose}>
      <ModalHeader title={welcome ? `Welcome, ${me?.name.split(" ")[0] ?? ""}` : "Edit profile"} sub={welcome ? "Tell colleagues who you are. This shows next to your name in chats and channels." : undefined} onClose={onClose} />
      <form
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
        className="space-y-4 p-5"
      >
        <div className="flex items-center gap-3">
          <Avatar name={name || "?"} size={48} />
          <div className="min-w-0 text-sm">
            <div className="truncate font-semibold">{name || "Your name"}</div>
            <div className="truncate text-muted">{me?.email}</div>
          </div>
        </div>
        <div>
          <label htmlFor="p-name" className="text-sm font-medium">
            Full name
          </label>
          <input id="p-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} className="mt-1 h-10 w-full rounded-lg border border-border bg-surface px-3 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-brand/15" />
        </div>
        <div>
          <label htmlFor="p-role" className="text-sm font-medium">
            Job title
          </label>
          <input id="p-role" autoFocus={welcome} value={role} onChange={(e) => setRole(e.target.value)} maxLength={80} placeholder="e.g. QA Engineer, Procurement Lead" className="mt-1 h-10 w-full rounded-lg border border-border bg-surface px-3 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-brand/15" />
        </div>
        <div className="flex justify-end gap-2 pt-1">
          <button type="button" onClick={onClose} className="h-9 rounded-lg px-4 text-sm font-medium text-muted hover:bg-hover">
            {welcome ? "Skip" : "Cancel"}
          </button>
          <button disabled={busy || name.trim().length < 2} className="flex h-9 items-center gap-2 rounded-lg bg-brand px-4 text-sm font-semibold text-white hover:bg-brand-strong disabled:opacity-40">
            {busy && <Loader2 size={15} className="animate-spin" />} Save
          </button>
        </div>
      </form>
    </Modal>
  );
}
