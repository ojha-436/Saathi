"use client";

import { collection, doc, limit, onSnapshot, orderBy, query, where } from "firebase/firestore";
import { useEffect, useState } from "react";
import { api } from "./api";
import { getToken, isLocal } from "./auth";
import { apiUrl, getDb } from "./firebase";
import { reviveTs } from "./localts";
import type { AssistantMsg, CalendarEvent, Chat, EmailItem, FileDoc, Meeting, Message, Notice, Task, UserProfile, UserSettings } from "./types";

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

/** Workspace directory. Members get a live listener scoped to their workspace; guests get co-members from the API. */
export function useUsers(orgId?: string, guest?: boolean): UserProfile[] {
  const live = useLive<UserProfile>(orgId && !guest ? { path: "users", where: [["org_id", "==", orgId]] } : null, `users:${orgId}:${guest}`);
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
    if (isLocal()) {
      let stop = false;
      const tick = async () => {
        try {
          const res = await fetch(`${apiUrl()}/api/local/settings`, { headers: { Authorization: `Bearer ${await getToken()}` } });
          if (res.ok && !stop) setS(reviveTs(await res.json()) as UserSettings);
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
      (snap) => setS((snap.data() as UserSettings) ?? {}),
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

export const useAssistant = (uid?: string) =>
  useLive<AssistantMsg>(uid ? { path: `assistant/${uid}/messages`, orderBy: ["ts", "asc"], limit: 200 } : null, `assistant:${uid}`);

export const useEvents = (uid?: string) =>
  useLive<CalendarEvent>(uid ? { path: "events", where: [["uid", "==", uid]], limit: 200 } : null, `events:${uid}`);

export const useEmailItems = (uid?: string) =>
  useLive<EmailItem>(uid ? { path: "external_items", where: [["uid", "==", uid]], limit: 200 } : null, `emails:${uid}`);
