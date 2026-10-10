"use client";

import clsx from "clsx";
import { signOut } from "firebase/auth";
import { AlertTriangle, Bell, Building2, CalendarDays, CheckCircle2, Clock, Loader2, Mail, MapPin, MessageSquare, Phone, Plug, RefreshCw, ShieldCheck, Smile, UserRound, X } from "@/lib/icons";
import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { getFbAuth } from "@/lib/firebase";
import { disablePush, enablePush, pushState, type PushState } from "@/lib/push";
import { STATUS_META, localTime, ownStatusText, presence, statusText } from "@/lib/format";
import type { Connection, NotifyLevel, StatusState } from "@/lib/types";
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
  const [text, setText] = useState(ownStatusText(me));
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

type Tab = "profile" | "notifications" | "apps" | "security";

export function SettingsDialog({ onClose, initialTab }: { onClose: () => void; initialTab?: string }) {
  const [tab, setTab] = useState<Tab>((initialTab as Tab) ?? "profile");
  const tabs: [Tab, string, typeof Bell][] = [
    ["profile", "Profile", UserRound],
    ["notifications", "Notifications", Bell],
    ["apps", "Connected apps", Plug],
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
          {tab === "apps" && <ConnectedApps />}
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

function PushSettings() {
  const { toast } = useWs();
  const [state, setState] = useState<PushState | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    pushState().then(setState);
  }, []);
  async function toggle(on: boolean) {
    setBusy(true);
    try {
      const s = on ? await enablePush() : await disablePush();
      setState(s);
      if (on && s === "denied") toast("Notifications are blocked for this site. Allow them in your browser's site settings.");
      if (on && s === "on") toast("Push notifications are on for this browser.");
    } catch (e) {
      toast(`Couldn't turn on notifications: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="rounded-xl border border-border p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="font-semibold">Push notifications on this device</h3>
          <p className="text-sm text-muted">Mentions, thread replies, new messages (per chat setting), tasks and reminders, even when Saathi is closed.</p>
        </div>
        {state === null || busy ? <Loader2 size={18} className="animate-spin text-muted" /> : state === "unsupported" || state === "install" ? null : <Switch on={state === "on"} onChange={toggle} label="Push notifications" />}
      </div>
      {state === "install" && (
        <p className="mt-2 rounded-lg bg-brand-soft/60 px-3 py-2 text-xs">
          <b>On iPhone and iPad:</b> tap <b>Share</b> → <b>Add to Home Screen</b>, open Saathi from your Home Screen, then turn this on. Apple only allows
          notifications for apps added to the Home Screen (iOS 16.4 or later).
        </p>
      )}
      {state === "unsupported" && <p className="mt-2 text-xs text-muted">This browser doesn&rsquo;t support web push notifications.</p>}
      {state === "denied" && <p className="mt-2 text-xs text-rust">Blocked in this browser. Click the lock icon in the address bar → Notifications → Allow, then turn this on.</p>}
      {state === "on" && (
        <button
          onClick={() => api("/api/me/push/test", { method: "POST" }).then(() => toast("Test sent. Switch to another tab or app to see it."), (e) => toast((e as Error).message))}
          className="mt-2 text-xs font-semibold text-brand hover:underline"
        >
          Send a test notification
        </button>
      )}
    </section>
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
      <PushSettings />
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
        <h3 className="font-semibold">Your data</h3>
        <p className="mt-1 text-muted">
          What Saathi collects, who can see it, where it&rsquo;s stored and how to request a copy or deletion.{" "}
          <a href="/privacy" target="_blank" rel="noreferrer" className="font-semibold text-brand hover:underline">
            Read the Privacy Policy
          </a>
        </p>
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

function GoogleMark() {
  return (
    <svg width="22" height="22" viewBox="0 0 48 48" aria-hidden>
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.1 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.1 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
    </svg>
  );
}

/** Settings → Connected apps: Google (Calendar + Gmail, read-only). Microsoft 365 and Zoom are listed as coming next. */
function ConnectedApps() {
  const { account, toast } = useWs();
  const [data, setData] = useState<{ connections: Connection[]; available: { google: boolean } } | null>(null);
  const [want, setWant] = useState({ calendar: true, gmail: true });
  const [busy, setBusy] = useState<string | null>(null);
  const load = useCallback(() => {
    api<{ connections: Connection[]; available: { google: boolean } }>("/api/connectors")
      .then(setData)
      .catch((e) => toast((e as Error).message));
  }, [toast]);
  useEffect(load, [load]);
  useEffect(() => {
    const t = setInterval(load, 8000); // pick up the first sync's results
    return () => clearInterval(t);
  }, [load]);

  const g = data?.connections.find((c) => c.provider === "google");
  const guest = account.org_role === "guest";

  async function connect() {
    setBusy("connect");
    try {
      const r = await api<{ url: string }>("/api/connectors/google/start", { json: { services: Object.entries(want).filter(([, v]) => v).map(([k]) => k) } });
      location.href = r.url;
    } catch (e) {
      toast((e as Error).message);
      setBusy(null);
    }
  }
  async function run(path: string, msg: string, confirmText?: string) {
    if (confirmText && !confirm(confirmText)) return;
    setBusy(path);
    try {
      await api(`/api/connectors/google/${path}`, { method: "POST" });
      toast(msg);
      load();
    } catch (e) {
      toast((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  if (!data)
    return (
      <p className="flex items-center gap-2 text-sm text-muted">
        <Loader2 size={14} className="animate-spin" /> Loading…
      </p>
    );
  return (
    <div className="space-y-4 text-sm">
      <p className="text-muted">Saathi reads (never writes) the apps you connect, so it can brief you before meetings and catch promises made over email. Only you can see what it reads.</p>
      <section className="rounded-xl border border-border p-4">
        <div className="flex items-start gap-3">
          <GoogleMark />
          <div className="min-w-0 flex-1">
            <div className="font-semibold">Google Workspace</div>
            <div className="text-xs text-muted">Calendar and Gmail · read-only</div>
          </div>
          {g && (
            <span className={clsx("flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold", g.status === "active" && !g.error ? "bg-moss-soft text-moss" : "bg-rust-soft text-rust")}>
              {g.status === "active" && !g.error ? <CheckCircle2 size={12} /> : <AlertTriangle size={12} />} {g.status === "active" && !g.error ? "Connected" : "Needs attention"}
            </span>
          )}
        </div>

        {g ? (
          <div className="mt-3 space-y-2">
            <p>
              Signed in as <b>{g.email}</b>
            </p>
            <ul className="space-y-1 text-muted">
              {g.services.includes("calendar") && (
                <li className="flex items-center gap-2">
                  <CalendarDays size={14} /> Calendar: your events from 2 days ago to 2 weeks ahead{g.stats.events != null && ` · ${g.stats.events} synced`}
                </li>
              )}
              {g.services.includes("gmail") && (
                <li className="flex items-center gap-2">
                  <Mail size={14} /> Gmail: last 14 days of Inbox and Sent (no promotions or social)
                  {g.stats.emails != null && ` · ${g.stats.emails} new, ${g.stats.email_promises ?? 0} promises found`}
                </li>
              )}
            </ul>
            <p className="text-xs text-muted">{g.last_sync ? `Last synced ${new Date(g.last_sync).toLocaleString("en-IN", { hour: "numeric", minute: "2-digit", day: "numeric", month: "short" })} · syncs every 10 minutes` : "First sync in progress…"}</p>
            {g.error && <p className="rounded-lg bg-rust-soft px-3 py-2 text-xs text-rust">{g.error}</p>}
            <div className="flex flex-wrap gap-2 pt-1">
              {g.status === "needs_reauth" ? (
                <button onClick={connect} disabled={!!busy} className="h-9 rounded-lg bg-brand px-4 font-semibold text-white hover:bg-brand-strong">
                  Reconnect Google
                </button>
              ) : (
                <button onClick={() => run("sync", "Syncing now…")} disabled={!!busy} className="flex h-9 items-center gap-1.5 rounded-lg border border-border px-3 font-semibold hover:bg-hover disabled:opacity-50">
                  <RefreshCw size={14} className={busy === "sync" ? "animate-spin" : ""} /> Sync now
                </button>
              )}
              <button
                onClick={() => run("disconnect", "Google disconnected. Synced data deleted.", "Disconnect Google? Saathi stops reading your calendar and email and deletes everything it synced.")}
                disabled={!!busy}
                className="h-9 rounded-lg px-3 font-semibold text-rust hover:bg-rust-soft disabled:opacity-50"
              >
                Disconnect
              </button>
            </div>
          </div>
        ) : !data.available.google ? (
          <p className="mt-3 rounded-lg bg-canvas px-3 py-2 text-xs text-muted">
            {guest ? "Guests can't connect apps." : "Google connections are turned off for this workspace. Ask your admin."}
          </p>
        ) : (
          <div className="mt-3 space-y-2">
            <label className="flex items-start gap-2">
              <input type="checkbox" checked={want.calendar} onChange={(e) => setWant((w) => ({ ...w, calendar: e.target.checked }))} className="mt-0.5" />
              <span>
                <b>Calendar</b>: today&rsquo;s meetings on My Day, one-click meeting prep, and &ldquo;In a meeting&rdquo; status for colleagues (times only, never titles).
              </span>
            </label>
            <label className="flex items-start gap-2">
              <input type="checkbox" checked={want.gmail} onChange={(e) => setWant((w) => ({ ...w, gmail: e.target.checked }))} className="mt-0.5" />
              <span>
                <b>Gmail</b>: spots commitments in your email (&ldquo;we will dispatch on 15th&rdquo;) and lets you track them as tasks; ask Saathi about your email.
              </span>
            </label>
            <button onClick={connect} disabled={!!busy || (!want.calendar && !want.gmail)} className="mt-1 flex h-10 items-center gap-2 rounded-lg border border-[#c5cad3] bg-white px-4 font-semibold hover:bg-canvas disabled:opacity-50">
              {busy === "connect" ? <Loader2 size={16} className="animate-spin" /> : <GoogleMark />} Connect Google
            </button>
            <p className="text-xs text-muted">Google may warn that the app is unverified while Saathi is in testing. Tokens are encrypted with Cloud KMS; disconnecting deletes everything synced.</p>
          </div>
        )}
      </section>
      {[
        ["Microsoft 365", "Outlook, Teams meetings and OneDrive"],
        ["Zoom", "Meeting transcripts"],
      ].map(([name, sub]) => (
        <section key={name} className="flex items-center gap-3 rounded-xl border border-dashed border-border p-4 opacity-70">
          <Plug size={20} className="text-muted" aria-hidden />
          <div className="flex-1">
            <div className="font-semibold">{name}</div>
            <div className="text-xs text-muted">{sub}</div>
          </div>
          <span className="rounded-full bg-canvas px-2 py-0.5 text-[11px] font-semibold text-muted">Coming next</span>
        </section>
      ))}
    </div>
  );
}
