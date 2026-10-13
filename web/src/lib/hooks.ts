"use client";

import { collection, doc, limit, onSnapshot, orderBy, query, where, type Query } from "firebase/firestore";
import { useEffect, useState } from "react";
import { api } from "./api";
import { getDb } from "./firebase";
import type { AssistantMsg, CalendarEvent, Chat, Drawing, EmailItem, FileDoc, Meeting, Message, Notice, PlantRecord, ResearchEvent, ResearchRun, Task, UserProfile, UserSettings } from "./types";

function useLive<T>(make: () => Query | null, key: string): T[] {
  const [rows, setRows] = useState<T[]>([]);
  useEffect(() => {
    const q = make();
    if (!q) {
      setRows([]);
      return;
    }
    return onSnapshot(
      q,
      (snap) => setRows(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as T)),
      (err) => console.error("listener error", key, err),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return rows;
}

/** Workspace directory. Members get a live listener scoped to their workspace; guests get co-members from the API. */
export function useUsers(orgId?: string, guest?: boolean): UserProfile[] {
  const live = useLive<UserProfile>(
    () => (orgId && !guest ? query(collection(getDb(), "users"), where("org_id", "==", orgId)) : null),
    `users:${orgId}:${guest}`,
  );
  const [fetched, setFetched] = useState<UserProfile[]>([]);
  useEffect(() => {
    if (!orgId || !guest) return;
    let stop = false;
    const load = () => api<UserProfile[]>("/api/users").then((r) => !stop && setFetched(r)).catch(() => {});
    load();
    const t = setInterval(load, 60_000);
    return () => {
      stop = true;
      clearInterval(t);
    };
  }, [orgId, guest]);
  return guest ? fetched : live;
}

export function useSettings(uid?: string): UserSettings {
  const [s, setS] = useState<UserSettings>({});
  useEffect(() => {
    if (!uid) return;
    return onSnapshot(
      doc(getDb(), "user_settings", uid),
      (snap) => setS((snap.data() as UserSettings) ?? {}),
      (err) => console.error("listener error settings", err),
    );
  }, [uid]);
  return s;
}

export const useMeetings = (uid?: string) =>
  useLive<Meeting>(() => (uid ? query(collection(getDb(), "meetings"), where("participants", "array-contains", uid), limit(50)) : null), `meetings:${uid}`);

export const useChats = (uid?: string) =>
  useLive<Chat>(
    () => (uid ? query(collection(getDb(), "chats"), where("members", "array-contains", uid), orderBy("last_ts", "desc")) : null),
    `chats:${uid}`,
  );

export const useMessages = (chatId?: string) =>
  useLive<Message>(
    () => (chatId ? query(collection(getDb(), "chats", chatId, "messages"), orderBy("ts", "asc"), limit(300)) : null),
    `messages:${chatId}`,
  );

export const useFiles = (uid?: string) =>
  useLive<FileDoc>(() => (uid ? query(collection(getDb(), "files"), where("members", "array-contains", uid)) : null), `files:${uid}`);

export const useTasks = (uid?: string) =>
  useLive<Task>(() => (uid ? query(collection(getDb(), "tasks"), where("participants", "array-contains", uid)) : null), `tasks:${uid}`);

export const useNotices = (uid?: string) =>
  useLive<Notice>(
    () => (uid ? query(collection(getDb(), "notifications"), where("uid", "==", uid), orderBy("ts", "desc"), limit(30)) : null),
    `notices:${uid}`,
  );

export const useAssistant = (uid?: string) =>
  useLive<AssistantMsg>(
    () => (uid ? query(collection(getDb(), "assistant", uid, "messages"), orderBy("ts", "asc"), limit(200)) : null),
    `assistant:${uid}`,
  );

export const useEvents = (uid?: string) =>
  useLive<CalendarEvent>(() => (uid ? query(collection(getDb(), "events"), where("uid", "==", uid), limit(200)) : null), `events:${uid}`);

export const useEmailItems = (uid?: string) =>
  useLive<EmailItem>(() => (uid ? query(collection(getDb(), "external_items"), where("uid", "==", uid), limit(200)) : null), `emails:${uid}`);

export const useRecords = (uid?: string) =>
  useLive<PlantRecord>(() => (uid ? query(collection(getDb(), "records"), where("participants", "array-contains", uid), limit(300)) : null), `records:${uid}`);

/** Drawing register (API-filtered: drafts only for people who can open them). Refreshes when files change. */
export function useRegister(enabled: boolean, version: number): Drawing[] {
  const [rows, setRows] = useState<Drawing[]>([]);
  useEffect(() => {
    if (!enabled) return;
    let stop = false;
    api<Drawing[]>("/api/drawings")
      .then((r) => !stop && setRows(r))
      .catch(() => {});
    return () => {
      stop = true;
    };
  }, [enabled, version]);
  return rows;
}

export const useResearchRuns = (uid?: string) =>
  useLive<ResearchRun>(
    () => (uid ? query(collection(getDb(), "research_runs"), where("uid", "==", uid), orderBy("created_at", "desc"), limit(30)) : null),
    `research:${uid}`,
  );

/** Live progress of one research run (the agents' tool calls and results, in order). */
export const useResearchEvents = (runId?: string) =>
  useLive<ResearchEvent>(
    () => (runId ? query(collection(getDb(), "research_runs", runId, "events"), orderBy("ts", "asc"), limit(400)) : null),
    `research-events:${runId}`,
  );
