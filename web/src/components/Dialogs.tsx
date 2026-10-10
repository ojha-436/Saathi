"use client";

import clsx from "clsx";
import { ArrowRight, Check, CornerDownLeft, FileText, Loader2, MessageSquare, Search, Sparkles, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "@/lib/api";
import { chatTitle } from "@/lib/format";
import type { Chat } from "@/lib/types";
import { Avatar } from "./bits";
import { useWs } from "./ctx";

function Modal({ title, onClose, children, wide }: { title: string; onClose: () => void; children: React.ReactNode; wide?: boolean }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center bg-ink/55 px-4 pt-[12vh] backdrop-blur-[2px]" onMouseDown={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onMouseDown={(e) => e.stopPropagation()}
        className={clsx("rise w-full overflow-hidden rounded-2xl border border-line bg-paper shadow-2xl", wide ? "max-w-2xl" : "max-w-md")}
        style={{ animationDuration: "180ms" }}
      >
        {children}
      </div>
    </div>
  );
}

export function NewChatDialog({ onClose }: { onClose: () => void }) {
  const { uid, users, open, toast } = useWs();
  const [picked, setPicked] = useState<string[]>([]);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const others = Object.values(users).filter((u) => u.id !== uid);
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
      <div className="flex items-center justify-between border-b border-line px-5 py-4">
        <h2 className="font-display text-2xl">New conversation</h2>
        <button onClick={onClose} aria-label="Close" className="flex h-9 w-9 items-center justify-center rounded-lg text-muted hover:bg-paper-2">
          <X size={18} />
        </button>
      </div>
      <div className="max-h-[50vh] overflow-y-auto p-3">
        <p className="px-2 pb-2 text-sm text-muted">Pick one colleague for a direct message, or several for a group.</p>
        {others.map((u) => {
          const on = picked.includes(u.id);
          return (
            <button
              key={u.id}
              onClick={() => setPicked((p) => (on ? p.filter((x) => x !== u.id) : [...p, u.id]))}
              aria-pressed={on}
              className={clsx("flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left transition", on ? "bg-saffron-soft" : "hover:bg-paper-2")}
            >
              <Avatar name={u.name} size={34} />
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium">{u.name}</span>
                <span className="block text-xs text-muted">{u.role}</span>
              </span>
              <span className={clsx("flex h-5 w-5 items-center justify-center rounded-md border", on ? "border-ink bg-ink text-paper" : "border-line")}>{on && <Check size={13} />}</span>
            </button>
          );
        })}
      </div>
      {isGroup && (
        <div className="border-t border-line px-5 py-3">
          <label htmlFor="group-name" className="text-sm font-medium">
            Group name
          </label>
          <input id="group-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. RDSO inspection prep" className="mt-1 h-11 w-full rounded-lg border border-line bg-white px-3 outline-none focus:border-ink" />
        </div>
      )}
      <div className="flex justify-end gap-2 border-t border-line bg-paper-2/50 px-5 py-3">
        <button onClick={onClose} className="h-10 rounded-lg px-4 text-sm font-medium text-muted hover:bg-paper-2">
          Cancel
        </button>
        <button onClick={create} disabled={!picked.length || busy} className="flex h-10 items-center gap-2 rounded-lg bg-ink px-4 text-sm font-semibold text-paper disabled:opacity-40">
          {busy && <Loader2 size={15} className="animate-spin" />} {isGroup ? "Create group" : "Start chat"}
        </button>
      </div>
    </Modal>
  );
}

/** ⌘K: jump to any chat or file, or send the query straight to Saathi. */
export function CommandPalette({ chatList, onClose }: { chatList: Chat[]; onClose: () => void }) {
  const { uid, users, files, open } = useWs();
  const [q, setQ] = useState("");
  const [idx, setIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => inputRef.current?.focus(), []);

  const items = useMemo(() => {
    const t = q.trim().toLowerCase();
    const chatItems = chatList
      .map((c) => ({ key: `c-${c.id}`, label: chatTitle(c, uid, users), sub: c.type === "group" ? "Group" : "Direct message", kind: "chat" as const, id: c.id }))
      .filter((c) => !t || c.label.toLowerCase().includes(t));
    const fileItems = Object.values(files)
      .map((f) => ({ key: `f-${f.id}`, label: f.name, sub: f.doc?.drawing_no ? `${f.doc.drawing_no}${f.doc.revision ? ` · Rev ${f.doc.revision}` : ""}` : "File", kind: "file" as const, id: f.id, chatId: f.chat_id }))
      .filter((f) => t && (f.label.toLowerCase().includes(t) || f.sub.toLowerCase().includes(t)));
    const ask = t ? [{ key: "ask", label: `Ask Saathi: “${q.trim()}”`, sub: "Searches every chat and file you can access", kind: "ask" as const, id: "" }] : [];
    return [...ask, ...chatItems.slice(0, 6), ...fileItems.slice(0, 5)];
  }, [q, chatList, files, uid, users]);

  function choose(i: number) {
    const it = items[i];
    if (!it) return;
    if (it.kind === "ask") open({ kind: "assistant", prompt: q.trim() });
    else if (it.kind === "chat") open({ kind: "chat", chatId: it.id });
    else if (it.kind === "file") open({ kind: "chat", chatId: (it as { chatId: string }).chatId });
    onClose();
  }

  return (
    <Modal title="Search or ask" onClose={onClose} wide>
      <div className="flex items-center gap-3 border-b border-line px-4">
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
          placeholder="Jump to a chat or file, or ask Saathi anything…"
          aria-label="Search chats and files, or ask Saathi"
          className="h-14 flex-1 bg-transparent text-base outline-none focus-visible:outline-none"
        />
        <kbd className="rounded border border-line px-1.5 font-mono text-[10px] text-muted">ESC</kbd>
      </div>
      <ul role="listbox" aria-label="Results" className="max-h-[55vh] overflow-y-auto p-2">
        {items.length === 0 && <li className="px-3 py-8 text-center text-sm text-muted">Type to search chats and files, or press Enter to ask Saathi.</li>}
        {items.map((it, i) => (
          <li key={it.key} role="option" aria-selected={i === idx}>
            <button
              onMouseEnter={() => setIdx(i)}
              onClick={() => choose(i)}
              className={clsx("flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left", i === idx ? "bg-paper-2" : "")}
            >
              <span className={clsx("flex h-8 w-8 items-center justify-center rounded-lg", it.kind === "ask" ? "bg-saffron text-ink" : "bg-paper-3 text-ink/70")}>
                {it.kind === "ask" ? <Sparkles size={15} /> : it.kind === "file" ? <FileText size={15} /> : <MessageSquare size={15} />}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">{it.label}</span>
                <span className="block truncate font-mono text-[11px] text-muted">{it.sub}</span>
              </span>
              {i === idx && (it.kind === "ask" ? <CornerDownLeft size={15} className="text-muted" /> : <ArrowRight size={15} className="text-muted" />)}
            </button>
          </li>
        ))}
      </ul>
    </Modal>
  );
}
