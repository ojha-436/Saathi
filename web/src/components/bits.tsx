"use client";

import clsx from "clsx";
import { CalendarDays, FileText, Hash, Lock, Mail, MessageSquare, Users, DriveIcon } from "@/lib/icons";
import { useEffect, useRef, useState } from "react";
import { openFile } from "@/lib/api";
import { STATUS_META, avatarColor, chatTitle, initials, presence } from "@/lib/format";
import type { Chat } from "@/lib/types";
import { useWs } from "./ctx";

/** Initials on a per-person pastel circle (photos, when present, are shown by UserAvatar). */
export function Avatar({ name, size = 36 }: { name: string; size?: number }) {
  return (
    <span
      className={clsx("inline-flex shrink-0 items-center justify-center rounded-full font-semibold text-ink ring-2 ring-white", avatarColor(name))}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.36) }}
      role="img"
      aria-label={name}
    >
      <span aria-hidden>{initials(name)}</span>
    </span>
  );
}

/** A clickable source chip for refs like msg:CHAT/MSG or file:ID produced by the assistant. */
export function CiteChip({ refId }: { refId: string }) {
  const { chats, files, users, uid, openRef, meetings, emails, driveFiles, records } = useWs();
  let label = "source";
  let isFile = false;
  if (refId.startsWith("drive:")) {
    const f = driveFiles[refId.slice(6)];
    return (
      <a
        href={f?.url ?? "https://drive.google.com"}
        target="_blank"
        rel="noreferrer"
        title={f ? `Open “${f.name}” in Google Drive` : "Open in Google Drive"}
        className="mx-0.5 inline-flex max-w-[16rem] items-center gap-1 rounded-md border border-moss/25 bg-moss-soft px-1.5 py-0.5 align-middle font-mono text-[11px] text-moss transition hover:border-moss/50"
      >
        <DriveIcon size={11} aria-hidden />
        <span className="truncate">{f?.name ?? "Drive file"}</span>
      </a>
    );
  }
  if (refId.startsWith("mail:")) {
    const e = emails[refId.slice(5)];
    return (
      <a
        href={e?.url ?? "https://mail.google.com"}
        target="_blank"
        rel="noreferrer"
        title={e ? `Open “${e.subject}” in Gmail` : "Open in Gmail"}
        className="mx-0.5 inline-flex max-w-[16rem] items-center gap-1 rounded-md border border-rust/20 bg-rust-soft px-1.5 py-0.5 align-middle font-mono text-[11px] text-rust transition hover:border-rust/50"
      >
        <Mail size={11} aria-hidden />
        <span className="truncate">{e ? `${e.from_name}: ${e.subject}` : "email"}</span>
      </a>
    );
  }
  if (refId.startsWith("rec:")) {
    label = records[refId.slice(4)]?.number ?? "plant record";
  } else if (refId.startsWith("meet:")) {
    label = meetings[refId.slice(5)]?.title ?? "meeting";
  } else if (refId.startsWith("file:")) {
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
      {isFile ? <FileText size={11} aria-hidden /> : refId.startsWith("meet:") ? <CalendarDays size={11} aria-hidden /> : <MessageSquare size={11} aria-hidden />}
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
  if (chat.type === "dm") return <DmAvatar chat={chat} title={title} size={size} />;
  const Icon = chat.type === "group" ? Users : chat.visibility === "private" ? Lock : Hash;
  return (
    <span
      className={clsx("inline-flex shrink-0 items-center justify-center rounded-lg text-ink", avatarColor(chat.name || chat.id))}
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

/** A colleague's avatar with presence dot; clicking opens their profile card. */
export function UserAvatar({ uid, size = 36, dot = true, clickable = true, ring = "ring-surface" }: { uid: string; size?: number; dot?: boolean; clickable?: boolean; ring?: string }) {
  const { users, showProfile } = useWs();
  const u = users[uid];
  const p = presence(u);
  const inner = (
    <span className="relative inline-flex shrink-0">
      {u?.photo ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={u.photo} alt="" referrerPolicy="no-referrer" className="rounded-full object-cover" style={{ width: size, height: size }} />
      ) : (
        <Avatar name={u?.name ?? "?"} size={size} />
      )}
      {dot && (
        <span
          className={clsx("absolute -bottom-0.5 -right-0.5 rounded-full ring-2", ring, STATUS_META[p].dot)}
          style={{ width: Math.max(8, Math.round(size * 0.3)), height: Math.max(8, Math.round(size * 0.3)) }}
          aria-label={STATUS_META[p].label}
          title={STATUS_META[p].label}
        />
      )}
    </span>
  );
  if (!clickable) return inner;
  return (
    <button type="button" onClick={() => showProfile(uid)} className="shrink-0 rounded-full" aria-label={`View ${u?.name ?? "profile"}`}>
      {inner}
    </button>
  );
}

export const ROLE_LABEL: Record<string, string> = { owner: "Owner", admin: "Admin", member: "Member", guest: "Guest" };

export function RoleBadge({ role }: { role?: string }) {
  if (!role || role === "member") return null;
  return (
    <span className={clsx("rounded-full px-1.5 py-px text-[10px] font-semibold", role === "guest" ? "bg-saffron-soft text-saffron-ink" : "bg-brand-soft text-brand")}>
      {ROLE_LABEL[role]}
    </span>
  );
}

function DmAvatar({ chat, title, size }: { chat: Chat; title: string; size: number }) {
  const { uid } = useWs();
  const other = chat.members.find((m) => m !== uid);
  return other ? <UserAvatar uid={other} size={size} clickable={false} /> : <Avatar name={title} size={size} />;
}
