"use client";

import clsx from "clsx";
import { FileText, Hash, Lock, MessageSquare, Users } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { openFile } from "@/lib/api";
import { avatarColor, chatTitle, initials } from "@/lib/format";
import type { Chat } from "@/lib/types";
import { useWs } from "./ctx";

export function Avatar({ name, size = 36 }: { name: string; size?: number }) {
  return (
    <span
      className={clsx("inline-flex shrink-0 items-center justify-center rounded-full font-semibold text-white", avatarColor(name))}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.36) }}
      aria-hidden
    >
      {initials(name)}
    </span>
  );
}

/** A clickable source chip for refs like msg:CHAT/MSG or file:ID produced by the assistant. */
export function CiteChip({ refId }: { refId: string }) {
  const { chats, files, users, uid, openRef } = useWs();
  let label = "source";
  let isFile = false;
  if (refId.startsWith("file:")) {
    isFile = true;
    label = files[refId.slice(5)]?.name ?? "file";
  } else if (refId.startsWith("msg:")) {
    const chatId = refId.slice(4).split("/")[0];
    label = chatTitle(chats[chatId], uid, users) || "message";
  }
  return (
    <button
      type="button"
      onClick={() => (isFile ? openFile(refId.slice(5)) : openRef(refId))}
      title={isFile ? `Open ${label}` : `Jump to the message in ${label}`}
      className="mx-0.5 inline-flex max-w-[16rem] items-center gap-1 rounded-md border border-blueprint/20 bg-blueprint-soft px-1.5 py-0.5 align-middle font-mono text-[11px] text-blueprint transition hover:border-blueprint/50"
    >
      {isFile ? <FileText size={11} aria-hidden /> : <MessageSquare size={11} aria-hidden />}
      <span className="truncate">{label}</span>
    </button>
  );
}

export function IconButton({ label, onClick, children, className }: { label: string; onClick?: () => void; children: React.ReactNode; className?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className={clsx("inline-flex h-9 w-9 items-center justify-center rounded-lg text-muted transition hover:bg-hover hover:text-ink", className)}
    >
      {children}
    </button>
  );
}

/** Avatar for a DM, a people icon for a group, # or a lock for a channel. */
export function ChatIcon({ chat, title, size = 36 }: { chat: Chat; title: string; size?: number }) {
  if (chat.type === "dm") return <Avatar name={title} size={size} />;
  const Icon = chat.type === "group" ? Users : chat.visibility === "private" ? Lock : Hash;
  return (
    <span
      className={clsx("inline-flex shrink-0 items-center justify-center rounded-lg text-white", chat.type === "group" ? "bg-[#3d4f8f]" : avatarColor(chat.name))}
      style={{ width: size, height: size }}
      aria-hidden
    >
      <Icon size={Math.round(size * 0.45)} strokeWidth={2.4} />
    </span>
  );
}

export type MenuItem = { label: string; icon?: typeof Hash; onSelect: () => void; danger?: boolean; hint?: string } | "sep";

/** Small accessible dropdown menu anchored to its trigger. */
export function Menu({ label, trigger, items, align = "right", className }: { label: string; trigger: React.ReactNode; items: MenuItem[]; align?: "left" | "right"; className?: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);
  return (
    <div ref={ref} className="relative">
      <button type="button" onClick={() => setOpen((o) => !o)} aria-haspopup="menu" aria-expanded={open} aria-label={label} title={label} className={className}>
        {trigger}
      </button>
      {open && (
        <div role="menu" className={clsx("ws-pop absolute top-full z-50 mt-1 min-w-56 rounded-xl border border-border bg-surface p-1 shadow-xl", align === "right" ? "right-0" : "left-0")}>
          {items.map((it, i) =>
            it === "sep" ? (
              <div key={i} className="my-1 h-px bg-border" />
            ) : (
              <button
                key={it.label}
                role="menuitem"
                type="button"
                onClick={() => {
                  setOpen(false);
                  it.onSelect();
                }}
                className={clsx("flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm transition hover:bg-hover", it.danger ? "text-rust" : "text-ink")}
              >
                {it.icon && <it.icon size={15} className={it.danger ? "" : "text-muted"} aria-hidden />}
                <span className="flex-1">{it.label}</span>
                {it.hint && <span className="text-xs text-muted">{it.hint}</span>}
              </button>
            ),
          )}
        </div>
      )}
    </div>
  );
}

export function Switch({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={() => onChange(!on)}
      className={clsx("relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition", on ? "bg-brand" : "bg-[#c5cad3]")}
    >
      <span className={clsx("inline-block h-5 w-5 rounded-full bg-white shadow transition", on ? "translate-x-5" : "translate-x-0.5")} />
    </button>
  );
}
