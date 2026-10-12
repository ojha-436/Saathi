import type { Timestamp } from "firebase/firestore";
import type { Chat, StatusState, UserProfile } from "./types";

const TZ = "Asia/Kolkata";

export const toDate = (t?: Timestamp | null) => (t ? t.toDate() : null);

export function timeShort(t?: Timestamp | null) {
  const d = toDate(t);
  if (!d) return "";
  const now = new Date();
  const sameDay = d.toLocaleDateString("en-IN", { timeZone: TZ }) === now.toLocaleDateString("en-IN", { timeZone: TZ });
  return sameDay
    ? d.toLocaleTimeString("en-IN", { timeZone: TZ, hour: "numeric", minute: "2-digit" })
    : d.toLocaleDateString("en-IN", { timeZone: TZ, day: "numeric", month: "short" });
}

export function dayLabel(t?: Timestamp | null) {
  const d = toDate(t);
  if (!d) return "";
  return d.toLocaleDateString("en-IN", { timeZone: TZ, weekday: "long", day: "numeric", month: "long" });
}

export function clock(t?: Timestamp | null) {
  const d = toDate(t);
  return d ? d.toLocaleTimeString("en-IN", { timeZone: TZ, hour: "numeric", minute: "2-digit" }) : "";
}

export function dueLabel(t?: Timestamp | null) {
  const d = toDate(t);
  if (!d) return "No due time";
  return d.toLocaleString("en-IN", { timeZone: TZ, weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
}

export const isOverdue = (t?: Timestamp | null) => {
  const d = toDate(t);
  return !!d && d.getTime() < Date.now();
};

export function chatTitle(chat: Chat | undefined, me: string, users: Record<string, UserProfile>) {
  if (!chat) return "";
  if (chat.type !== "dm") return chat.name;
  const other = chat.members.find((m) => m !== me);
  return (other && users[other]?.name) || "Direct message";
}

export function initials(name = "") {
  return name
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

const PALETTE = ["bg-[#2457a6]", "bg-[#2f6b4f]", "bg-[#5b3fa0]", "bg-[#b3402a]", "bg-[#9a520a]", "bg-[#1f6f78]", "bg-[#3d4f8f]"];
export function avatarColor(seed = "") {
  let h = 0;
  for (const c of seed) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return PALETTE[h % PALETTE.length];
}

export const DOC_LABEL: Record<string, string> = {
  engineering_drawing: "Drawing",
  test_certificate: "Test certificate",
  inspection_report: "Inspection report",
  vendor_quote: "Vendor quote",
  purchase_order: "Purchase order",
  specification: "Specification",
  other: "Document",
};

/** Unread when someone else posted after the user last opened the chat. */
export function isUnread(chat: Chat, me: string) {
  if (!chat.last_ts || !chat.last_text) return false;
  const seen = chat.read_at?.[me];
  return !seen || chat.last_ts.toMillis() > seen.toMillis() + 500;
}

export const REACTION_EMOJI: Record<string, string> = { like: "👍", heart: "❤️", laugh: "😄", check: "✅", pray: "🙏", wow: "😮" };

/** Reactions are stored under a key: an old name (like, heart…) or "e_<hex codepoints>" for any emoji. */
export function reactionKey(emoji: string): string {
  return "e_" + Array.from(emoji).map((c) => c.codePointAt(0)!.toString(16)).join("_");
}
export function reactionEmoji(key: string): string {
  if (REACTION_EMOJI[key]) return REACTION_EMOJI[key];
  if (key.startsWith("e_")) {
    try {
      return String.fromCodePoint(...key.slice(2).split("_").map((h) => parseInt(h, 16)));
    } catch {}
  }
  return "👍";
}


/** Effective presence: an expired status reverts to available; no heartbeat for 10 min shows away. */
export function presence(u?: UserProfile): StatusState {
  if (!u) return "offline";
  const st = u.status;
  const until = st?.until?.toMillis?.();
  if (st && st.state !== "available" && (!until || until > Date.now())) return st.state;
  if (inMeeting(u)) return "busy";
  const last = u.last_active?.toMillis?.();
  if (!last) return "offline";
  return Date.now() - last > 10 * 60_000 ? "away" : "available";
}

export const STATUS_META: Record<StatusState, { label: string; dot: string }> = {
  available: { label: "Available", dot: "bg-[#2e9d5b]" },
  busy: { label: "Busy", dot: "bg-[#d64545]" },
  dnd: { label: "Do not disturb", dot: "bg-[#d64545]" },
  away: { label: "Away", dot: "bg-[#e0a526]" },
  offline: { label: "Offline", dot: "bg-[#9aa3ae]" },
};

export function statusText(u?: UserProfile) {
  const st = u?.status;
  const until = st?.until?.toMillis?.();
  if (st?.text && (!until || until > Date.now())) return st.text;
  return inMeeting(u) ? "📅 In a meeting (calendar)" : "";
}

/** From the free/busy slots Google Calendar sync puts on the profile (no titles). */
export function inMeeting(u?: UserProfile) {
  const t = Date.now();
  return !!u?.calendar_busy?.some((s) => s.start?.toMillis?.() <= t && s.end?.toMillis?.() > t);
}

export function localTime(tz?: string) {
  try {
    return new Date().toLocaleTimeString("en-IN", { timeZone: tz || "Asia/Kolkata", hour: "numeric", minute: "2-digit" });
  } catch {
    return "";
  }
}
