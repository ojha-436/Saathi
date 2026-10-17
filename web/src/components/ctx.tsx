"use client";

import { createContext, useContext } from "react";
import type { Account, CalendarEvent, Chat, Drawing, DriveFile, EmailItem, FileDoc, Meeting, PlantRecord, UserProfile, UserSettings } from "@/lib/types";

export type View =
  | { kind: "home" }
  | { kind: "assistant"; prompt?: string; session?: string } // session: a conversation id, or "new…" to start one
  | { kind: "research"; id?: string }
  | { kind: "insights" }
  | { kind: "tasks" }
  | { kind: "activity" }
  | { kind: "admin" }
  | { kind: "meeting"; id: string }
  | { kind: "chats" }
  | { kind: "quality"; recordId?: string; tab?: "records" | "drawings" | "standards" }
  | { kind: "decisions"; id?: string }
  | { kind: "handover"; chatId: string; id?: string }
  | { kind: "live"; sessionId?: string; eventId?: string }
  | { kind: "gmail" }
  | { kind: "calendar" }
  | { kind: "drive" }
  | { kind: "chat"; chatId: string; focusMsg?: string };

export type DialogKind = "new-chat" | "new-channel" | "browse-channels" | "palette" | "profile" | "settings" | "status" | "meeting-new" | "report" | "voice" | "demo-guide";

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
  /** Start the guided tour, or continue it where it was paused */
  startTour: () => void;
  /** Mobile only: go back from a conversation to the chat list. */
  showList: () => void;
  /** chatId → when the user last opened it */
  reads: Record<string, import("firebase/firestore").Timestamp>;
};

export const Ctx = createContext<WorkspaceCtx | null>(null);

export function useWs() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useWs outside workspace");
  return v;
}

export const isAdmin = (a?: Account) => a?.org_role === "owner" || a?.org_role === "admin";
/** Members can do everything; a guest can message people directly ("dm") or use Saathi ("ai") only if their admin allowed it. */
export const guestCan = (a: Account | undefined, what: "dm" | "ai") => a?.org_role !== "guest" || a?.guest?.[what] !== false;
