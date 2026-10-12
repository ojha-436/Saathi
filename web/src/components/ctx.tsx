"use client";

import { createContext, useContext } from "react";
import type { Account, CalendarEvent, Chat, Drawing, DriveFile, EmailItem, FileDoc, Meeting, PlantRecord, UserProfile, UserSettings } from "@/lib/types";

export type View =
  | { kind: "home" }
  | { kind: "assistant"; prompt?: string }
  | { kind: "insights" }
  | { kind: "tasks" }
  | { kind: "activity" }
  | { kind: "admin" }
  | { kind: "meeting"; id: string }
  | { kind: "chats" }
  | { kind: "quality"; recordId?: string }
  | { kind: "decisions"; id?: string }
  | { kind: "gmail" }
  | { kind: "calendar" }
  | { kind: "drive" }
  | { kind: "chat"; chatId: string; focusMsg?: string };

export type DialogKind = "new-chat" | "new-channel" | "browse-channels" | "palette" | "profile" | "settings" | "status" | "meeting-new" | "report";

export type TaskPrefill = { title?: string; assignee?: string; sourceRef?: string; due?: string };
export type MeetingPrefill = { title?: string; when?: Date; attendees?: string[] };

export type WorkspaceCtx = {
  uid: string;
  account: Account;
  me: UserProfile | undefined;
  users: Record<string, UserProfile>;
  chats: Record<string, Chat>;
  files: Record<string, FileDoc>;
  meetings: Record<string, Meeting>;
  events: CalendarEvent[];
  emails: Record<string, EmailItem>;
  driveFiles: Record<string, DriveFile>;
  records: Record<string, PlantRecord>;
  register: Drawing[];
  settings: UserSettings;
  view: View;
  open: (view: View) => void;
  openRef: (ref: string) => void;
  toast: (text: string) => void;
  dialog: (kind: DialogKind) => void;
  newTask: (prefill?: TaskPrefill) => void;
  newMeeting: (prefill?: MeetingPrefill) => void;
  showProfile: (uid: string) => void;
  /** Mobile only: go back from a conversation to the chat list. */
  showList: () => void;
};

export const Ctx = createContext<WorkspaceCtx | null>(null);

export function useWs() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useWs outside workspace");
  return v;
}

export const isAdmin = (a?: Account) => a?.org_role === "owner" || a?.org_role === "admin";
