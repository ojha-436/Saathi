import type { Timestamp } from "firebase/firestore";
import type { Chat, UserProfile } from "./types";

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
  if (chat.type === "group") return chat.name;
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
