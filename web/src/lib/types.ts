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
  status?: { state: StatusState; text?: string; until?: Timestamp | null; set_at?: Timestamp | null } | null;
  last_active?: Timestamp | null;
  calendar_busy?: { start: Timestamp; end: Timestamp }[];
};

/** The signed-in user's account and workspace, from GET /api/me. */
export type Account = {
  uid: string;
  name: string;
  email: string;
  org_id: string;
  org_role: OrgRole;
  org: {
    id: string;
    name: string;
    domains: string[];
    settings: { channel_creation?: "everyone" | "admins"; ai_enabled?: boolean; integrations_google?: boolean; quality_team?: string[]; qr_public?: boolean; shifts?: { name: string; start: string }[] };
  };
};

export type NotifyLevel = "all" | "mentions" | "off";
export type UserSettings = {
  notify?: Record<string, NotifyLevel>;
  defaults?: { dm?: NotifyLevel; group?: NotifyLevel; channel?: NotifyLevel };
  quiet_hours?: { enabled: boolean; start: string; end: string };
  connected?: ("calendar" | "gmail" | "drive")[];
  snoozed?: Record<string, string>; // Needs-you item key -> ISO time
  live_prompt?: boolean; // offer Saathi Live when a calendar meeting starts
  live_announce?: boolean; // play the spoken recording notice
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
  enhanced_notes?: string;
  source?: string;
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
  parent_id?: string;
  reply_count?: number;
  last_reply_ts?: Timestamp;
  reply_users?: string[];
  reactions?: Partial<Record<Reaction, string[]>>;
  research?: { run_id: string; report: ResearchReport; removed: number; goal: string; by: string };
  file?: {
    id: string;
    name: string;
    mime?: string;
    size?: number;
    status?: string;
    doc?: DocSummary;
    ocr?: { engine: string; pages: number; confidence: number | null } | null;
    spec?: SpecSummary;
  };
  decision?: string;
  handover_id?: string;
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
  kind?: "mention" | "thread_reply" | "task_assigned" | "task_update" | "reminder" | "meeting" | "record" | "handover";
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
  charts?: Chart[];
  tool_calls?: { tool: string; args: Record<string, unknown> }[];
  provenance?: { model?: string; latency_ms?: number; first_token_ms?: number | null; prefetched?: string[] };
};

/** A small analytic answer from BigQuery, drawn under the assistant's reply. */
export type Chart = {
  title: string;
  unit: string;
  metric: string;
  rows: { label: string; value: number | null; n: number }[];
  scope: string;
  source: string;
};

export type Decision = {
  id: string;
  ref: string;
  title: string;
  topic?: string | null;
  rationale?: string | null;
  alternatives: string[];
  decided_by?: string | null;
  tags: string[];
  decided_at?: string | null;
  source_ref?: string | null;
  source_type?: "chat" | "meeting";
  where: string;
  status: "active" | "superseded" | "dismissed";
  superseded_by?: { id: string; title: string } | null;
};

/** A past NCR/downtime record shown as a lesson: what happened, why, and what fixed it. */
export type Lesson = {
  id: string;
  ref: string;
  number: string;
  type: "ncr" | "downtime";
  status: string;
  title?: string | null;
  part_name?: string | null;
  drawing_no?: string | null;
  defect_type?: string | null;
  machine?: string | null;
  vendor?: string | null;
  root_cause?: string | null;
  corrective_action?: string | null;
  owner?: string | null;
  reported?: string | null;
  closed?: string | null;
  score: number;
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

export type Connection = {
  provider: "google";
  email: string;
  services: ("calendar" | "gmail" | "drive")[];
  status: "active" | "needs_reauth";
  error?: string | null;
  last_sync: string | null;
  stats: { events?: number; emails?: number; email_promises?: number; files?: number };
};

export type CalendarEvent = {
  id: string;
  title: string;
  start?: Timestamp;
  end?: Timestamp;
  location?: string;
  meet_url?: string | null;
  html_link?: string;
  attendee_emails: string[];
  attendee_uids: string[];
  private?: boolean;
};

export type EmailItem = {
  id: string;
  provider?: "gmail";
  subject: string;
  from_name: string;
  ts?: Timestamp;
  snippet: string;
  url: string;
  promise?: { committer: string; action: string; due_at?: Timestamp | null } | null;
  task_id?: string | null;
  dismissed?: boolean;
};

export type DriveFile = {
  id: string;
  provider: "drive";
  name: string;
  mime: string;
  ts?: Timestamp;
  url: string;
  icon?: string;
  owner?: string;
  modified_by?: string;
  shared?: boolean;
  indexed?: boolean;
  snippet?: string;
};

export type DrawingRev = {
  rev: string;
  status: "released" | "superseded" | "in_work";
  approved_by?: string | null;
  date?: string | null;
  file_id?: string | null;
  file_name?: string | null;
  chat_id?: string | null;
  can_open: boolean;
  overridden?: boolean;
};

export type Drawing = { id: string; drawing_no: string; title: string; current_rev: string | null; revisions: DrawingRev[]; source: string; updated_at: string | null };

export type RecordType = "ncr" | "downtime" | "safety";
export type RecordFields = {
  title?: string | null;
  description?: string | null;
  transcript?: string | null;
  part_name?: string | null;
  drawing_no?: string | null;
  revision?: string | null;
  job_no?: string | null;
  heat_no?: string | null;
  vendor?: string | null;
  machine?: string | null;
  location?: string | null;
  quantity?: string | null;
  defect_type?: string | null;
  severity?: "minor" | "major" | "critical" | null;
  downtime_reason?: string | null;
  hazard?: string | null;
  suggested_action?: string | null;
};
export type RecordLinks = {
  revision_check?: { drawing_no: string; current_rev: string | null; reported_rev: string | null; superseded: boolean };
  mtc?: { file_id: string; name: string };
};
export type PlantRecord = {
  id: string;
  type: RecordType;
  number: string;
  status: string;
  fields: RecordFields;
  owner: string;
  reporter?: string | null;
  reporter_name?: string | null;
  anonymous?: boolean;
  participants: string[];
  media: { kind: "photo" | "voice"; mime: string }[];
  chat_id?: string | null;
  capa?: { containment?: string; root_cause?: string; corrective_action?: string; verification?: string };
  history: { status: string; by?: string | null; ts?: Timestamp; note?: string }[];
  links?: RecordLinks;
  created_at?: Timestamp;
  updated_at?: Timestamp;
};

export type HandoverSection = "machines" | "quality" | "safety" | "open_items" | "changes" | "watch_out";
export type HandoverBullet = { text: string; refs: string[] };
export type Handover = {
  id: string;
  ref: string;
  chat_id: string;
  area: string;
  shift_name: string;
  shift_start: string;
  shift_end: string;
  next_shift?: string;
  lang: "en" | "hinglish";
  headline: string;
  sections: Partial<Record<HandoverSection, HandoverBullet[]>>;
  notes: string;
  status: "draft" | "signed" | "acknowledged";
  sources: Record<string, number>;
  drafted_at?: string | null;
  signed_by?: string | null;
  signed_by_name?: string | null;
  signed_at?: string | null;
  acks: { uid: string; name: string; at: string | null }[];
};
export type HandoverList = {
  current_shift: { name: string; start: string; end: string; next: string; key: string; id: string };
  enabled: boolean;
  handovers: Handover[];
};

export type KnowledgeItem = {
  id: string;
  ref: string;
  name: string;
  mime: string;
  size?: number;
  label?: string | null;
  status: "processing" | "ready" | "error";
  summary?: string | null;
  chunks?: number | null;
  error?: string | null;
  created_at?: string | null;
};
export type CardTiming = { embed_ms?: number; retrieve_ms?: number; answer_ms?: number; total_ms?: number; detect_ms?: number; heard_to_answer_ms?: number; sources_searched?: number };
export type LiveCard = { id: string; question: string; asked_by?: string | null; answer: string; refs: string[]; found: boolean; kind: "detected" | "asked"; ts?: string | null; dismissed?: boolean; timing?: CardTiming | null };
export type LiveSegment = { seq: number; text: string; ts?: string | null; timing?: { finalize_ms?: number | null; spoken_ms?: number | null; updates?: number } | null };
export type LiveStats = { lines: number; answers: number; finalize_ms?: number | null; answer_total_ms?: number | null; embed_ms?: number | null; retrieve_ms?: number | null; answer_ms?: number | null; detect_ms?: number | null; heard_to_answer_ms?: number | null };
export type LiveEvent = { id: string; title: string; start?: string | null; end?: string | null; attendees: string[]; attendee_uids: string[]; meet_url?: string | null; sources: SourceSuggestion[] };
export type LiveSession = {
  id: string;
  title: string;
  status: "live" | "ended";
  started_at: string;
  context_refs: string[];
  meeting_id?: string | null;
  notes?: string;
  event_id?: string | null;
  segments: LiveSegment[];
  cards: LiveCard[];
  stats?: LiveStats;
};
export type LiveSessionRow = { id: string; title: string; status: "live" | "ended"; started_at: string; ended_at?: string | null; meeting_id?: string | null; chunks: number };
export type SourceSuggestion = { ref: string; name: string; type?: string; snippet?: string };
export type Briefing = { connected: boolean; meetings: { id: string; title: string; start: string; attendees: string[]; has_video_link: boolean; sources: SourceSuggestion[] }[] };
export type TopicWiki = {
  label: string;
  overview: string;
  sources: { ref: string; name: string }[];
  key_facts: { text: string; refs: string[] }[];
  contradictions: { topic: string; a: { claim: string; ref: string }; b: { claim: string; ref: string } }[];
  open_questions: string[];
};

// ---------------- Saathi Research ----------------

export type ResearchStep = { question: string; tools: string[]; why: string };

export type ResearchCheck = { item: string; status: "ok" | "risk" | "gap"; detail: string; refs: string[] };

export type ResearchGap = {
  id: string;
  title: string;
  detail: string;
  owner: string;
  owner_uid: string | null;
  owner_name: string;
  due_at: string | null;
  severity: "high" | "medium" | "low";
  refs: string[];
  task_id: string | null;
  assignee_uid?: string;
};

export type ResearchReport = {
  title: string;
  readiness: "ready" | "at_risk" | "not_ready" | "not_applicable";
  verdict: string;
  checklist: ResearchCheck[];
  findings: { text: string; refs: string[] }[];
  gaps: ResearchGap[];
  unknowns: string[];
  charts?: (Chart & { ref: string })[];
};

export type ResearchStatus = "planning" | "awaiting_plan" | "queued" | "running" | "retrying" | "cancelling" | "done" | "cancelled" | "failed";

export type ResearchRun = {
  id: string;
  uid: string;
  goal: string;
  title?: string;
  template: string;
  context?: Record<string, string>;
  status: ResearchStatus;
  plan?: { title: string; steps: ResearchStep[] };
  report?: ResearchReport;
  notes?: string[];
  metrics?: { duration_ms?: number; tool_calls?: number; agents?: number; sources_cited?: number; evidence_seen?: number; claims?: number; dropped_unverified?: number };
  error?: string;
  created_at?: Timestamp;
  started_at?: Timestamp;
  completed_at?: Timestamp;
  shared_to?: string[];
};

export type ResearchEvent = { id: string; kind: "phase" | "tool" | "result" | "step_done" | "done" | "error"; text: string; step?: number | null; tool?: string; ts?: Timestamp };

// ---------------- Spec Check / Standards Library ----------------

export type SpecVerdict = "pass" | "fail" | "incomplete" | "no_limits";

export type SpecSummary = { verdict: SpecVerdict; fails: number; missing: number; grade: string; heat_no: string; grade_mismatch: boolean };

export type SpecRow = {
  property: string;
  label: string;
  unit: string;
  min: number | null;
  max: number | null;
  test_temp_c: number | null;
  value: number | null;
  status: "pass" | "fail" | "missing" | "info";
  note: string;
  source: { standard_id: string; standard?: string; clause?: string; page?: number; ref: string };
};

export type SpecCheck = {
  status: "done" | "none";
  file_id: string;
  file_name?: string;
  chat_id?: string;
  verdict: SpecVerdict;
  grade: string;
  certificate_no?: string;
  heat_no?: string;
  vendor?: string;
  po_no?: string;
  thickness_mm?: number | null;
  drawing?: { drawing_no: string; rev: string; grade: string | null; ref?: string } | null;
  grade_mismatch: boolean;
  rows: SpecRow[];
  notes?: string[];
  ts?: string;
  upload_to_verdict_ms?: number | null;
};

export type StandardDoc = { id: string; name: string; title?: string; doc_no?: string; status: "processing" | "ready" | "failed"; limits: number; indexed: boolean; uploaded_by_name?: string; ts?: string; error?: string };

export type SpecLimit = {
  id: string;
  standard_id: string;
  standard: string;
  grade: string;
  property: string;
  min: number | null;
  max: number | null;
  unit: string;
  thickness_min_mm: number | null;
  thickness_max_mm: number | null;
  test_temp_c: number | null;
  clause: string;
  page: number;
  status: "proposed" | "approved" | "rejected";
};
