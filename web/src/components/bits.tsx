"use client";

import clsx from "clsx";
import { FileText, MessageSquare } from "lucide-react";
import { openFile } from "@/lib/api";
import { avatarColor, chatTitle, initials } from "@/lib/format";
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
      className={clsx("inline-flex h-10 w-10 items-center justify-center rounded-lg text-muted transition hover:bg-paper-2 hover:text-ink", className)}
    >
      {children}
    </button>
  );
}
