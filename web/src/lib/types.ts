import type { Timestamp } from "firebase/firestore";

export type UserProfile = { id: string; name: string; role: string; email: string };

export type Chat = {
  id: string;
  type: "dm" | "group";
  name: string;
  members: string[];
  last_ts?: Timestamp;
  last_text?: string;
  last_sender?: string;
  ai_excluded?: boolean;
};

export type DocSummary = {
  doc_type?: string;
  title?: string;
  summary?: string;
  drawing_no?: string | null;
  revision?: string | null;
  approved_by?: string | null;
};

export type Message = {
  id: string;
  sender: string;
  sender_name: string;
  text: string;
  ts?: Timestamp;
  file?: {
    id: string;
    name: string;
    mime?: string;
    size?: number;
    status?: string;
    doc?: DocSummary;
    ocr?: { engine: string; pages: number; confidence: number | null } | null;
  };
  decision?: string;
  promise?: {
    committer: string;
    action: string;
    due_at?: Timestamp | null;
    confidence?: number;
    tracked_by?: string[];
    dismissed_by?: string[];
  };
};

export type Task = {
  id: string;
  owner: string;
  title: string;
  due_at?: Timestamp | null;
  kind: "reminder" | "todo" | "follow_up" | "promise";
  status: "proposed" | "open" | "done" | "dismissed";
  source_ref?: string | null;
  counterparty?: string;
  created_at?: Timestamp;
};

export type Notice = {
  id: string;
  uid: string;
  title: string;
  body: string;
  ts?: Timestamp;
  read: boolean;
  source_ref?: string | null;
};

export type AssistantMsg = {
  id: string;
  role: "user" | "assistant";
  text: string;
  ts?: Timestamp;
  pending?: boolean;
  tasks?: string[];
};

export type FileDoc = {
  id: string;
  name: string;
  chat_id: string;
  uploaded_by_name?: string;
  ts?: Timestamp;
  doc?: DocSummary;
  ocr?: { engine: string; pages: number; confidence: number | null } | null;
};

export type Insights = {
  tasks: { open: number; overdue: number; done: number; promises_tracked: number; by_kind: Record<string, number> };
  assistant: { questions_7d: number; tool_use: Record<string, number>; median_latency_ms: number | null };
  chats: { chat_id: string; name: string; messages: number; files: number }[];
  decisions: { chat: string; decision: string; ts: string }[];
};
