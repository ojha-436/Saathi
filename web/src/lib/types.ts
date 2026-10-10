import type { Timestamp } from "firebase/firestore";

export type OrgRole = "owner" | "admin" | "member" | "guest";
export type StatusState = "available" | "busy" | "dnd" | "away" | "offline";

export type UserProfile = {
  id: string;
  name: string;
  role: string; // job title
  email: string;
  photo?: string;
  department?: string;
  phone?: string;
  location?: string;
  timezone?: string;
  org_id?: string;
  org_role?: OrgRole;
  deactivated?: boolean;
  status?: { state: StatusState; text?: string; until?: Timestamp | null } | null;
  last_active?: Timestamp | null;
};

/** The signed-in user's account and workspace, from GET /api/me. */
export type Account = {
  uid: string;
  name: string;
  email: string;
  org_id: string;
  org_role: OrgRole;
  org: { id: string; name: string; domains: string[]; settings: { channel_creation?: "everyone" | "admins"; ai_enabled?: boolean } };
};

export type NotifyLevel = "all" | "mentions" | "off";
export type UserSettings = {
  notify?: Record<string, NotifyLevel>;
  defaults?: { dm?: NotifyLevel; group?: NotifyLevel; channel?: NotifyLevel };
  quiet_hours?: { enabled: boolean; start: string; end: string };
};

export type Meeting = {
  id: string;
  title: string;
  held_at?: Timestamp;
  participants: string[];
  created_by: string;
  created_by_name: string;
  chat_id?: string | null;
  summary: string;
  decisions: string[];
  action_items: { owner: string; owner_uid?: string | null; task: string; due_at?: Timestamp | null; task_id?: string | null }[];
  posted?: boolean;
};

export type Chat = {
  id: string;
  type: "dm" | "group" | "channel";
  name: string;
  members: string[];
  description?: string;
  visibility?: "public" | "private";
  owners?: string[];
  created_by?: string;
  last_ts?: Timestamp;
  last_text?: string;
  last_sender?: string;
  ai_excluded?: boolean;
  read_at?: Record<string, Timestamp>;
  favorite_of?: string[];
};

export type ChannelSummary = { id: string; name: string; description: string; member_count: number; joined: boolean; last_ts: string | null };

export type Reaction = "like" | "heart" | "laugh" | "check" | "pray" | "wow";

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
  system?: boolean;
  mentions?: string[];
  reactions?: Partial<Record<Reaction, string[]>>;
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
  assignee?: string;
  creator?: string;
  creator_name?: string;
  watchers?: string[];
  participants?: string[];
  chat_id?: string | null;
  title: string;
  due_at?: Timestamp | null;
  kind: "reminder" | "todo" | "follow_up" | "promise";
  status: "proposed" | "open" | "in_progress" | "blocked" | "done" | "dismissed";
  source_ref?: string | null;
  counterparty?: string;
  created_at?: Timestamp;
};

export type Notice = {
  id: string;
  uid: string;
  kind?: "mention" | "task_assigned" | "task_update" | "reminder" | "meeting";
  actor_name?: string | null;
  chat_id?: string | null;
  task_id?: string | null;
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
