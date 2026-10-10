"use client";

import { createContext, useContext } from "react";
import type { Chat, FileDoc, UserProfile } from "@/lib/types";

export type View =
  | { kind: "assistant"; prompt?: string }
  | { kind: "insights" }
  | { kind: "tasks" }
  | { kind: "activity" }
  | { kind: "chat"; chatId: string; focusMsg?: string };

export type DialogKind = "new-chat" | "new-channel" | "browse-channels" | "palette" | "profile";

export type WorkspaceCtx = {
  uid: string;
  me: UserProfile | undefined;
  users: Record<string, UserProfile>;
  chats: Record<string, Chat>;
  files: Record<string, FileDoc>;
  view: View;
  open: (view: View) => void;
  openRef: (ref: string) => void;
  toast: (text: string) => void;
  dialog: (kind: DialogKind) => void;
  /** Mobile only: go back from a conversation to the chat list. */
  showList: () => void;
};

export const Ctx = createContext<WorkspaceCtx | null>(null);

export function useWs() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useWs outside workspace");
  return v;
}
