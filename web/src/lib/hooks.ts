"use client";

import { collection, limit, onSnapshot, orderBy, query, where, type Query } from "firebase/firestore";
import { useEffect, useState } from "react";
import { getDb } from "./firebase";
import type { AssistantMsg, Chat, FileDoc, Message, Notice, Task, UserProfile } from "./types";

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

export const useUsers = (uid?: string) =>
  useLive<UserProfile>(() => (uid ? collection(getDb(), "users") : null), `users:${uid}`);

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
  useLive<Task>(() => (uid ? query(collection(getDb(), "tasks"), where("owner", "==", uid)) : null), `tasks:${uid}`);

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
