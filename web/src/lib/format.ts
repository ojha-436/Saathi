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

// Pastel backgrounds with dark text (light, airy redesign); still one colour per person so people stay recognisable
const PALETTE = ["bg-[#cfd8ff]", "bg-[#d6f0c2]", "bg-[#ffd9c7]", "bg-[#f3d1f4]", "bg-[#fff1b8]", "bg-[#c7ecef]", "bg-[#e3dcff]"];
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


/** Effective presence: an expired status reverts to available; no heartbeat for 10 min shows away. */
export function presence(u?: UserProfile): StatusState {
  if (!u) return "offline";
  const st = u.status;
  const until = st?.until?.toMillis?.();
  const manual = !!st && (!until || until > Date.now());
  if (manual && st.state !== "available") return st.state;
  const slot = meetingNow(u);
  // Calendar only applies if you haven't chosen a status since the meeting started (Available included)
  if (slot && !(manual && (st.set_at?.toMillis?.() ?? 0) >= slot.start.toMillis())) return "busy";
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
  return presence(u) === "busy" && meetingNow(u) && st?.state !== "busy" ? "📅 In a meeting (calendar)" : "";
}

/** The status message the user typed (never the automatic calendar text). */
export function ownStatusText(u?: UserProfile) {
  const st = u?.status;
  const until = st?.until?.toMillis?.();
  return st?.text && (!until || until > Date.now()) && !st.text.includes("(calendar)") ? st.text : "";
}

/** From the free/busy slots Google Calendar sync puts on the profile (no titles). */
export function inMeeting(u?: UserProfile) {
  return !!meetingNow(u);
}

const MAX_MEETING_MS = 12 * 60 * 60 * 1000;
function meetingNow(u?: UserProfile) {
  const t = Date.now();
  return u?.calendar_busy?.find((s) => {
    const a = s.start?.toMillis?.(), b = s.end?.toMillis?.();
    return a <= t && b > t && b - a <= MAX_MEETING_MS;
  });
}

export function localTime(tz?: string) {
  try {
    return new Date().toLocaleTimeString("en-IN", { timeZone: tz || "Asia/Kolkata", hour: "numeric", minute: "2-digit" });
  } catch {
    return "";
  }
}
