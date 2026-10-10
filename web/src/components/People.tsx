"use client";

import clsx from "clsx";
import { signOut } from "firebase/auth";
import { Bell, Building2, Clock, Loader2, Mail, MapPin, MessageSquare, Phone, ShieldCheck, Smile, UserRound, X } from "lucide-react";
import { useState } from "react";
import { api } from "@/lib/api";
import { getFbAuth } from "@/lib/firebase";
import { STATUS_META, localTime, presence, statusText } from "@/lib/format";
import type { NotifyLevel, StatusState } from "@/lib/types";
import { RoleBadge, Switch, UserAvatar } from "./bits";
import { useWs } from "./ctx";
import { Modal, ModalHeader } from "./Dialogs";

/** Coloured dots usable wherever a menu expects an icon component. */
function dot(s: StatusState) {
  const Dot = () => <span className={clsx("mx-[3px] inline-block h-2.5 w-2.5 shrink-0 rounded-full", STATUS_META[s].dot)} aria-hidden />;
  Dot.displayName = `StatusDot_${s}`;
  return Dot as unknown as typeof Smile;
}
export const StatusIcon: Record<StatusState, typeof Smile> = {
  available: dot("available"),
  busy: dot("busy"),
  dnd: dot("dnd"),
  away: dot("away"),
  offline: dot("offline"),
};

const CLEAR = [
  { label: "Don't clear", minutes: null },
  { label: "30 minutes", minutes: 30 },
  { label: "1 hour", minutes: 60 },
  { label: "4 hours", minutes: 240 },
  { label: "Today", minutes: -1 },
  { label: "This week", minutes: 60 * 24 * 7 },
] as const;
const PRESETS = [
  { emoji: "📅", text: "In a meeting" },
  { emoji: "🏭", text: "On the shop floor" },
  { emoji: "🚆", text: "Commuting" },
  { emoji: "🔍", text: "Inspection / RDSO visit" },
  { emoji: "🤒", text: "Out sick" },
  { emoji: "🌴", text: "On leave" },
];

export function StatusDialog({ onClose }: { onClose: () => void }) {
  const { me, toast } = useWs();
  const [state, setState] = useState<StatusState>(me?.status?.state && me.status.state !== "offline" ? me.status.state : "available");
  const [text, setText] = useState(statusText(me));
  const [clear, setClear] = useState<number | null>(-1);
  const [busy, setBusy] = useState(false);

  async function save(clearAll = false) {
    setBusy(true);
    try {
      await api("/api/me/status", { json: clearAll ? { state: "available", text: "" } : { state, text, clear_after_minutes: clear } });
      toast(clearAll ? "Status cleared." : "Status updated.");
      onClose();
    } catch (e) {
      toast((e as Error).message);
      setBusy(false);
    }
  }

  return (
    <Modal title="Set status" onClose={onClose}>
      <ModalHeader title="Set your status" sub="Colleagues see this next to your name." onClose={onClose} />
      <div className="space-y-4 overflow-y-auto p-5">
        <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Availability">
          {(["available", "busy", "dnd", "away"] as const).map((s) => (
            <button key={s} role="radio" aria-checked={state === s} onClick={() => setState(s)} className={clsx("flex h-10 items-center gap-2 rounded-lg border px-3 text-sm", state === s ? "border-brand bg-brand-soft/60 font-semibold" : "border-border hover:bg-hover")}>
              <span className={clsx("h-2.5 w-2.5 rounded-full", STATUS_META[s].dot)} /> {STATUS_META[s].label}
            </button>
          ))}
        </div>
        <div>
          <label htmlFor="st-text" className="text-sm font-medium">
            Status message
          </label>
          <input id="st-text" value={text} onChange={(e) => setText(e.target.value)} maxLength={100} placeholder="What are you up to?" className="mt-1 h-10 w-full rounded-lg border border-border px-3 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-brand/15" />
          <div className="mt-2 flex flex-wrap gap-1.5">
            {PRESETS.map((p) => (
              <button key={p.text} onClick={() => setText(`${p.emoji} ${p.text}`)} className="rounded-full border border-border px-2.5 py-1 text-xs hover:bg-hover">
                {p.emoji} {p.text}
              </button>
            ))}
          </div>
        </div>
        <div>
          <label htmlFor="st-clear" className="text-sm font-medium">
            Clear after
          </label>
          <select id="st-clear" value={clear ?? ""} onChange={(e) => setClear(e.target.value === "" ? null : Number(e.target.value))} className="mt-1 h-10 w-full rounded-lg border border-border bg-surface px-3 text-sm">
            {CLEAR.map((c) => (
              <option key={c.label} value={c.minutes ?? ""}>
                {c.label}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="flex gap-2 border-t border-border bg-canvas/60 px-5 py-3">
        <button onClick={() => save(true)} disabled={busy} className="mr-auto h-9 rounded-lg px-3 text-sm font-medium text-muted hover:bg-hover">
          Clear status
        </button>
        <button onClick={onClose} className="h-9 rounded-lg px-4 text-sm font-medium text-muted hover:bg-hover">
          Cancel
        </button>
        <button onClick={() => save()} disabled={busy} className="flex h-9 items-center gap-2 rounded-lg bg-brand px-4 text-sm font-semibold text-white hover:bg-brand-strong disabled:opacity-50">
          {busy && <Loader2 size={14} className="animate-spin" />} Save
        </button>
      </div>
    </Modal>
  );
}

/** Colleague profile card (Teams-style contact card). */
export function ProfileCard({ uid, onClose }: { uid: string; onClose: () => void }) {
  const { users, uid: me, open, toast, dialog, newTask } = useWs();
  const u = users[uid];
  const p = presence(u);
  if (!u) return null;
  async function message() {
    try {
      const r = await api<{ id: string }>("/api/chats", { json: { member_ids: [uid], name: null } });
      open({ kind: "chat", chatId: r.id });
      onClose();
    } catch (e) {
      toast((e as Error).message);
    }
  }
  const rows = [
    [Mail, u.email],
    [Building2, u.department],
    [Phone, u.phone],
    [MapPin, u.location],
    [Clock, u.timezone || u.location ? `${localTime(u.timezone)} local time` : ""],
  ].filter(([, v]) => v) as [typeof Mail, string][];
  return (
    <Modal title={`${u.name} profile`} onClose={onClose}>
      <div className="relative bg-gradient-to-br from-brand to-[#163a72] px-5 pb-4 pt-6 text-white">
        <button onClick={onClose} className="absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-lg text-white/70 hover:bg-white/10" aria-label="Close">
          <X size={16} />
        </button>
        <div className="flex items-center gap-4">
          <UserAvatar uid={uid} size={64} clickable={false} ring="ring-[#1f4e94]" />
          <div className="min-w-0">
            <div className="flex items-center gap-2 truncate text-lg font-bold">
              {u.name} <RoleBadge role={u.org_role} />
            </div>
            <div className="truncate text-sm text-white/80">{u.role || "No job title yet"}</div>
            <div className="mt-1 flex items-center gap-1.5 text-xs text-white/80">
              <span className={clsx("h-2 w-2 rounded-full", STATUS_META[p].dot)} /> {STATUS_META[p].label}
              {statusText(u) && <span className="truncate">· {statusText(u)}</span>}
            </div>
          </div>
        </div>
      </div>
      <div className="space-y-2.5 p-5 text-sm">
        {rows.map(([I, v]) => (
          <div key={v} className="flex items-center gap-3">
            <I size={15} className="shrink-0 text-muted" aria-hidden /> <span className="truncate">{v}</span>
          </div>
        ))}
        {u.deactivated && <p className="rounded-lg bg-rust-soft px-3 py-2 text-xs text-rust">This account is deactivated.</p>}
      </div>
      <div className="flex gap-2 border-t border-border px-5 py-3">
        {uid === me ? (
          <button
            onClick={() => {
              onClose();
              dialog("settings");
            }}
            className="flex h-9 items-center gap-2 rounded-lg bg-brand px-4 text-sm font-semibold text-white hover:bg-brand-strong"
          >
            <UserRound size={15} /> Edit profile
          </button>
        ) : (
          <>
            <button onClick={message} disabled={u.deactivated} className="flex h-9 items-center gap-2 rounded-lg bg-brand px-4 text-sm font-semibold text-white hover:bg-brand-strong disabled:opacity-50">
              <MessageSquare size={15} /> Message
            </button>
            <button
              onClick={() => {
                onClose();
                newTask({ assignee: uid });
              }}
              disabled={u.deactivated}
              className="h-9 rounded-lg border border-border px-4 text-sm font-semibold hover:bg-hover disabled:opacity-50"
            >
              Assign a task
            </button>
          </>
        )}
      </div>
    </Modal>
  );
}

type Tab = "profile" | "notifications" | "security";

export function SettingsDialog({ onClose }: { onClose: () => void }) {
  const [tab, setTab] = useState<Tab>("profile");
  const tabs: [Tab, string, typeof Bell][] = [
    ["profile", "Profile", UserRound],
    ["notifications", "Notifications", Bell],
    ["security", "Security", ShieldCheck],
  ];
  return (
    <Modal title="Settings" onClose={onClose} wide>
      <ModalHeader title="Settings" onClose={onClose} />
      <div className="flex min-h-0 flex-1 flex-col sm:flex-row">
        <nav className="flex gap-1 border-b border-border p-2 sm:w-44 sm:flex-col sm:border-b-0 sm:border-r" aria-label="Settings sections">
          {tabs.map(([k, label, I]) => (
            <button key={k} onClick={() => setTab(k)} aria-current={tab === k ? "page" : undefined} className={clsx("flex h-9 items-center gap-2 rounded-lg px-3 text-left text-sm", tab === k ? "bg-brand-soft font-semibold text-brand" : "text-muted hover:bg-hover hover:text-ink")}>
              <I size={15} aria-hidden /> {label}
            </button>
          ))}
        </nav>
        <div className="min-h-[360px] flex-1 overflow-y-auto p-5">
          {tab === "profile" && <ProfileSettings onDone={onClose} />}
          {tab === "notifications" && <NotificationSettings />}
          {tab === "security" && <SecuritySettings />}
        </div>
      </div>
    </Modal>
  );
}

const field = "mt-1 h-10 w-full rounded-lg border border-border bg-surface px-3 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-brand/15";

function ProfileSettings({ onDone }: { onDone: () => void }) {
  const { me, toast } = useWs();
  const [f, setF] = useState({
    name: me?.name ?? "",
    role: me?.role ?? "",
    department: me?.department ?? "",
    phone: me?.phone ?? "",
    location: me?.location ?? "",
    timezone: me?.timezone || "Asia/Kolkata",
  });
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF((v) => ({ ...v, [k]: e.target.value }));
  async function save() {
    setBusy(true);
    try {
      await api("/api/me/profile", { json: f });
      toast("Profile saved.");
      onDone();
    } catch (e) {
      toast((e as Error).message);
      setBusy(false);
    }
  }
  const zones = ["Asia/Kolkata", "Asia/Dubai", "Asia/Singapore", "Europe/London", "Europe/Berlin", "America/New_York", "America/Los_Angeles", "Australia/Sydney"];
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
      className="space-y-4"
    >
      <div className="flex items-center gap-3">
        {me && <UserAvatar uid={me.id} size={52} clickable={false} />}
        <div className="text-sm">
          <div className="font-semibold">{f.name || "Your name"}</div>
          <div className="text-muted">{me?.email}</div>
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-sm font-medium">
          Full name
          <input value={f.name} onChange={set("name")} maxLength={80} className={field} />
        </label>
        <label className="text-sm font-medium">
          Job title
          <input value={f.role} onChange={set("role")} maxLength={80} placeholder="QA Engineer" className={field} />
        </label>
        <label className="text-sm font-medium">
          Department
          <input value={f.department} onChange={set("department")} maxLength={80} placeholder="Quality" className={field} />
        </label>
        <label className="text-sm font-medium">
          Phone
          <input value={f.phone} onChange={set("phone")} maxLength={20} inputMode="tel" placeholder="+91 98xxxxxx" className={field} />
        </label>
        <label className="text-sm font-medium">
          Location
          <input value={f.location} onChange={set("location")} maxLength={80} placeholder="Plant 2, Nashik" className={field} />
        </label>
        <label className="text-sm font-medium">
          Time zone
          <select value={f.timezone} onChange={set("timezone")} className={field}>
            {zones.map((z) => (
              <option key={z}>{z}</option>
            ))}
          </select>
        </label>
      </div>
      <button disabled={busy || f.name.trim().length < 2} className="flex h-9 items-center gap-2 rounded-lg bg-brand px-4 text-sm font-semibold text-white hover:bg-brand-strong disabled:opacity-50">
        {busy && <Loader2 size={14} className="animate-spin" />} Save profile
      </button>
    </form>
  );
}

function NotificationSettings() {
  const { settings, toast } = useWs();
  const d = settings.defaults ?? {};
  const q = settings.quiet_hours ?? { enabled: false, start: "20:00", end: "08:00" };
  async function save(json: object) {
    try {
      await api("/api/me/settings", { json });
    } catch (e) {
      toast((e as Error).message);
    }
  }
  const levels: [NotifyLevel, string][] = [
    ["all", "All new messages"],
    ["mentions", "Mentions only"],
    ["off", "Nothing"],
  ];
  return (
    <div className="space-y-6">
      <section>
        <h3 className="font-semibold">Default for new conversations</h3>
        <p className="text-sm text-muted">You can override any chat from its ⋯ menu. @mentions, task assignments and reminders always reach you.</p>
        <div className="mt-3 space-y-2">
          {(["dm", "group", "channel"] as const).map((k) => (
            <div key={k} className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2">
              <span className="text-sm">{k === "dm" ? "Direct messages" : k === "group" ? "Group chats" : "Channels"}</span>
              <select value={d[k] ?? "all"} onChange={(e) => save({ defaults: { ...d, [k]: e.target.value } })} className="h-9 rounded-lg border border-border bg-surface px-2 text-sm" aria-label={`Default for ${k}`}>
                {levels.map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </select>
            </div>
          ))}
        </div>
      </section>
      <section>
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-semibold">Quiet hours</h3>
            <p className="text-sm text-muted">No pop-up alerts during these hours. Everything still lands in Activity.</p>
          </div>
          <Switch on={q.enabled} onChange={(v) => save({ quiet_hours: { ...q, enabled: v } })} label="Quiet hours" />
        </div>
        {q.enabled && (
          <div className="mt-3 flex items-center gap-2 text-sm">
            From
            <input type="time" value={q.start} onChange={(e) => save({ quiet_hours: { ...q, start: e.target.value } })} className="h-9 rounded-lg border border-border px-2" aria-label="Quiet hours start" />
            to
            <input type="time" value={q.end} onChange={(e) => save({ quiet_hours: { ...q, end: e.target.value } })} className="h-9 rounded-lg border border-border px-2" aria-label="Quiet hours end" />
          </div>
        )}
      </section>
      <p className="rounded-lg bg-canvas px-3 py-2 text-xs text-muted">Setting your status to Do not disturb also pauses pop-up alerts.</p>
    </div>
  );
}

function SecuritySettings() {
  const { account, toast } = useWs();
  const [busy, setBusy] = useState(false);
  return (
    <div className="space-y-5 text-sm">
      <section className="rounded-xl border border-border p-4">
        <h3 className="font-semibold">Workspace</h3>
        <p className="mt-1 text-muted">
          {account.org.name} · your role: <b className="text-ink">{account.org_role}</b>
        </p>
        <p className="mt-1 text-muted">Only people in this workspace can see you, and only chats and channels you belong to are visible to you and to Saathi.</p>
      </section>
      <section className="rounded-xl border border-border p-4">
        <h3 className="font-semibold">Sign out everywhere</h3>
        <p className="mt-1 text-muted">Lost a laptop or phone? End every session on every device, including this one.</p>
        <button
          disabled={busy}
          onClick={async () => {
            if (!confirm("Sign out of Saathi on every device?")) return;
            setBusy(true);
            try {
              await api("/api/me/sessions/revoke", { method: "POST" });
              await signOut(getFbAuth());
            } catch (e) {
              toast((e as Error).message);
              setBusy(false);
            }
          }}
          className="mt-3 flex h-9 items-center gap-2 rounded-lg border border-rust/40 px-4 font-semibold text-rust hover:bg-rust-soft disabled:opacity-50"
        >
          {busy && <Loader2 size={14} className="animate-spin" />} Sign out of all sessions
        </button>
      </section>
    </div>
  );
}
