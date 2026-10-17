"use client";

import { collection, doc, limit, onSnapshot, orderBy, query, where, type Timestamp } from "firebase/firestore";
import { useEffect, useMemo, useState } from "react";
import { api } from "./api";
import { getToken, isLocal } from "./auth";
import { apiUrl, getDb } from "./firebase";
import { reviveTs } from "./localts";
import type { AssistantMsg, AssistantProject, AssistantThread, CalendarEvent, Chat, Drawing, EmailItem, FileDoc, Meeting, Message, Notice, PlantRecord, ResearchEvent, ResearchRun, Task, UserProfile, UserSettings } from "./types";

type Spec = { path: string; where?: [string, string, unknown][]; orderBy?: [string, "asc" | "desc"]; limit?: number };

/** Live rows for a query: Firestore listeners in the cloud, 1.5s polling of the local API in local mode. */
function useLive<T>(spec: Spec | null, key: string): T[] {
  const [rows, setRows] = useState<T[]>([]);
  useEffect(() => {
    if (!spec) {
      setRows([]);
      return;
    }
    if (isLocal()) {
      let stop = false;
      let last = "";
      const tick = async () => {
        try {
          const res = await fetch(`${apiUrl()}/api/local/query`, {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${await getToken()}` },
            body: JSON.stringify({ path: spec.path, where: spec.where ?? [], order_by: spec.orderBy ?? null, limit: spec.limit ?? null }),
          });
          if (!res.ok || stop) return;
          const text = await res.text();
          if (text !== last) {
            last = text;
            setRows(reviveTs(JSON.parse(text)) as T[]);
          }
        } catch {}
      };
      tick();
      const timer = setInterval(tick, 1500);
      return () => {
        stop = true;
        clearInterval(timer);
      };
    }
    const parts = spec.path.split("/");
    const col = collection(getDb(), parts[0], ...parts.slice(1));
    const q = query(
      col,
      ...(spec.where ?? []).map(([f, op, v]) => where(f, op as "==", v)),
      ...(spec.orderBy ? [orderBy(spec.orderBy[0], spec.orderBy[1])] : []),
      ...(spec.limit ? [limit(spec.limit)] : []),
    );
    return onSnapshot(
      q,
      (snap) => setRows(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as T)),
      (err) => console.error("listener error", key, err),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return rows;
}

/** Workspace directory. Members get a live listener scoped to their workspace; guests get co-members from the API.
 *  People who belong to several workspaces and have another one open aren't in the live listener (their profile's org_id is
 *  that workspace), so members also fetch them from the API, with their role here. */
export function useUsers(orgId?: string, guest?: boolean): UserProfile[] {
  const live = useLive<UserProfile>(orgId && !guest ? { path: "users", where: [["org_id", "==", orgId]] } : null, `users:${orgId}:${guest}`);
  const [fetched, setFetched] = useState<UserProfile[]>([]);
  useEffect(() => {
    if (!orgId) return;
    let stop = false;
    const load = () => api<UserProfile[]>(guest ? "/api/users" : "/api/users?others=1").then((r) => !stop && setFetched(r)).catch(() => {});
    load();
    const t = setInterval(load, 60_000);
    return () => {
      stop = true;
      clearInterval(t);
    };
  }, [orgId, guest]);
  return useMemo(() => {
    if (guest) return fetched;
    const here = new Set(live.map((u) => u.id));
    return [...live, ...fetched.filter((u) => !here.has(u.id))];
  }, [guest, live, fetched]);
}

/** Live queries return a person's chats, tasks and alerts from every workspace they belong to: keep the open one's
 *  (records from before workspaces were tagged have no org_id and always show). */
export function useInOrg<T>(rows: T[], orgId?: string): T[] {
  return useMemo(() => rows.filter((r) => {
    const o = (r as { org_id?: string }).org_id;
    return !o || !orgId || o === orgId;
  }), [rows, orgId]);
}

export function useSettings(uid?: string): UserSettings {
  const [s, setS] = useState<UserSettings>({});
  useEffect(() => {
    if (!uid) return;
    if (isLocal()) {
      let stop = false;
      const tick = async () => {
        try {
          const res = await fetch(`${apiUrl()}/api/local/settings`, { headers: { Authorization: `Bearer ${await getToken()}` } });
          if (res.ok && !stop) setS({ ...(reviveTs(await res.json()) as UserSettings), loaded: true });
        } catch {}
      };
      tick();
      const timer = setInterval(tick, 3000);
      return () => {
        stop = true;
        clearInterval(timer);
      };
    }
    return onSnapshot(
      doc(getDb(), "user_settings", uid),
      (snap) => setS({ ...((snap.data() as UserSettings) ?? {}), loaded: true }),
      (err) => console.error("listener error settings", err),
    );
  }, [uid]);
  return s;
}

export const useMeetings = (uid?: string) =>
  useLive<Meeting>(uid ? { path: "meetings", where: [["participants", "array-contains", uid]], limit: 50 } : null, `meetings:${uid}`);

export const useChats = (uid?: string) =>
  useLive<Chat>(uid ? { path: "chats", where: [["members", "array-contains", uid]], orderBy: ["last_ts", "desc"] } : null, `chats:${uid}`);

export const useMessages = (chatId?: string) =>
  useLive<Message>(chatId ? { path: `chats/${chatId}/messages`, orderBy: ["ts", "asc"], limit: 300 } : null, `messages:${chatId}`);

export const useFiles = (uid?: string) =>
  useLive<FileDoc>(uid ? { path: "files", where: [["members", "array-contains", uid]] } : null, `files:${uid}`);

export const useTasks = (uid?: string) =>
  useLive<Task>(uid ? { path: "tasks", where: [["participants", "array-contains", uid]] } : null, `tasks:${uid}`);

export const useNotices = (uid?: string) =>
  useLive<Notice>(uid ? { path: "notifications", where: [["uid", "==", uid]], orderBy: ["ts", "desc"], limit: 30 } : null, `notices:${uid}`);

const tsMs = (t?: { toMillis?: () => number } | null) => t?.toMillis?.() ?? Number.MAX_SAFE_INTEGER; // not yet stamped: newest

/** Messages of one assistant conversation. "legacy" is the one long conversation from before conversations existed. */
export function useAssistant(uid?: string, threadId?: string | null): AssistantMsg[] {
  const live = useLive<AssistantMsg>(
    uid && threadId
      ? threadId === "legacy"
        ? { path: `assistant/${uid}/messages`, orderBy: ["ts", "asc"], limit: 200 }
        : { path: `assistant/${uid}/messages`, where: [["thread_id", "==", threadId]], limit: 200 }
      : null,
    `assistant:${uid}:${threadId}`,
  );
  return useMemo(() => {
    const rows = threadId === "legacy" ? live.filter((m) => !m.thread_id) : live;
    return [...rows].sort((a, b) => tsMs(a.ts) - tsMs(b.ts)); // a single-field query comes back unordered
  }, [live, threadId]);
}

/** Does the person have messages from before conversations existed? (they show up as "Earlier conversation") */
export function useHasLegacyAssistant(uid?: string): boolean {
  const live = useLive<AssistantMsg>(uid ? { path: `assistant/${uid}/messages`, orderBy: ["ts", "asc"], limit: 200 } : null, `assistant-legacy:${uid}`);
  return useMemo(() => live.some((m) => !m.thread_id), [live]);
}

export const useAssistantThreads = (uid?: string) =>
  useLive<AssistantThread>(uid ? { path: `assistant/${uid}/threads`, limit: 300 } : null, `assistant-threads:${uid}`);

export const useAssistantProjects = (uid?: string) =>
  useLive<AssistantProject>(uid ? { path: `assistant/${uid}/projects`, limit: 60 } : null, `assistant-projects:${uid}`);


export const useEvents = (uid?: string) =>
  useLive<CalendarEvent>(uid ? { path: "events", where: [["uid", "==", uid]], limit: 200 } : null, `events:${uid}`);

export const useEmailItems = (uid?: string) =>
  useLive<EmailItem>(uid ? { path: "external_items", where: [["uid", "==", uid]], limit: 200 } : null, `emails:${uid}`);

export const useRecords = (uid?: string) =>
  useLive<PlantRecord>(uid ? { path: "records", where: [["participants", "array-contains", uid]], limit: 300 } : null, `records:${uid}`);

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
  useLive<ResearchRun>(uid ? { path: "research_runs", where: [["uid", "==", uid]], orderBy: ["created_at", "desc"], limit: 30 } : null, `research:${uid}`);

/** Live progress of one research run (the agents' tool calls and results, in order). */
export const useResearchEvents = (runId?: string) =>
  useLive<ResearchEvent>(runId ? { path: `research_runs/${runId}/events`, orderBy: ["ts", "asc"], limit: 400 } : null, `research-events:${runId}`);

/** The user's read markers: chatId → last time they opened it (users/{uid}/reads). */
export function useReads(uid?: string): Record<string, Timestamp> {
  const rows = useLive<{ id: string; at?: Timestamp }>(uid ? { path: `users/${uid}/reads` } : null, `reads:${uid}`);
  return Object.fromEntries(rows.filter((r) => r.at).map((r) => [r.id, r.at as Timestamp]));
}
