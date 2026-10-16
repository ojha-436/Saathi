"use client";

import clsx from "clsx";
import { BarChart3, Building2, Check, Copy, Globe, Hash, History, Loader2, Lock, MailPlus, RefreshCw, Settings2, ShieldCheck, Trash2, UserX, Users, X } from "@/lib/icons";
import { Fragment, useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import type { GuestAccess, OrgRole } from "@/lib/types";
import { Avatar, ROLE_LABEL, Switch } from "./bits";
import { useWs } from "./ctx";

type Member = {
  id: string; name: string; email: string; title: string; org_role: OrgRole; deactivated: boolean; provider: string; last_active: string | null; created_at: string | null;
  /** guests: access ran out (an admin extends it) */
  expired?: boolean;
  guest?: GuestAccess | null;
  until?: string | null;
  ended_at?: string | null;
  /** other workspaces this person also belongs to (e.g. their own company's) */
  other_workspaces?: number;
};
type Invite = {
  id: string; email: string; org_role: OrgRole; status: "pending" | "expired" | "accepted"; invited_by: string; channels: string[]; created_at: string | null;
  expires_at: string | null; accepted_at: string | null; delivery: Delivery; guest?: GuestAccess; access_days?: number | null; access_until?: string | null;
};
type ChannelRow = { id: string; name: string; visibility: string; members: number; owners: string[]; created_by: string; last_activity: string | null; ai_excluded: boolean };
type AuditRow = { ts: string | null; actor: string; action: string; target: string; meta: Record<string, unknown> };
type Tab = "impact" | "members" | "invites" | "channels" | "workspace" | "audit";

const ago = (iso: string | null) => {
  if (!iso) return "—";
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 90) return "just now";
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
};

const ACTION_LABEL: Record<string, string> = {
  "user.joined": "joined the workspace",
  "user.left": "moved out of the workspace",
  "member.invited": "invited",
  "member.reinvited": "updated the invite for",
  "member.invite_resent": "emailed the invite again to",
  "member.invite_link": "made a new invite link for",
  "member.invite_revoked": "withdrew the invite for",
  "member.role_changed": "changed role of",
  "member.deactivated": "deactivated",
  "member.reactivated": "reactivated",
  "member.guest_access": "changed guest access for",
  "member.access_expired": "guest access ended for",
  "user.switched_workspace": "switched workspace",
  "channel.created": "created channel",
  "channel.deleted": "deleted channel",
  "channel.deleted_by_admin": "deleted channel (admin)",
  "workspace.updated": "updated workspace settings",
  "user.sessions_revoked": "signed out of all sessions",
  "assistant.query": "asked Saathi a question",
};

export function AdminView() {
  const { account } = useWs();
  const [tab, setTab] = useState<Tab>("impact");
  const tabs: [Tab, string, typeof Users][] = [
    ["impact", "Impact", BarChart3],
    ["members", "Members", Users],
    ["invites", "Invites", MailPlus],
    ["channels", "Channels", Hash],
    ["workspace", "Workspace", Settings2],
    ["audit", "Audit log", History],
  ];
  return (
    <section className="flex min-h-0 flex-1 flex-col" aria-label="Workspace admin">
      <header className="flex h-14 shrink-0 items-center gap-3 border-b border-border px-4 lg:h-12 lg:px-6">
        <ShieldCheck size={18} className="text-brand" aria-hidden />
        <div className="min-w-0 flex-1">
          <h1 className="text-[15px] font-bold leading-tight">Workspace admin · {account.org.name}</h1>
          <p className="hidden truncate text-xs text-muted sm:block">Admins manage people and channels. Message content stays private to members.</p>
        </div>
      </header>
      <div className="overflow-x-auto border-b border-border px-4 lg:px-6">
        <div role="tablist" className="flex gap-1">
          {tabs.map(([k, label, I]) => (
            <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)} className={clsx("relative flex h-11 shrink-0 items-center gap-1.5 px-2.5 text-sm font-medium", tab === k ? "text-ink" : "text-muted hover:text-ink")}>
              <I size={15} aria-hidden /> {label}
              {tab === k && <span className="absolute inset-x-2 bottom-0 h-[3px] rounded-t bg-brand" aria-hidden />}
            </button>
          ))}
        </div>
      </div>
      <div className="scrollbar-thin flex-1 overflow-y-auto bg-canvas/50 px-4 py-5 lg:px-8">
        <div className="mx-auto max-w-5xl">
          {tab === "impact" && <ImpactTab />}
          {tab === "members" && <MembersTab />}
          {tab === "invites" && <InvitesTab />}
          {tab === "channels" && <ChannelsTab />}
          {tab === "workspace" && <WorkspaceTab />}
          {tab === "audit" && <AuditTab />}
        </div>
      </div>
    </section>
  );
}

function useLoad<T>(path: string) {
  const { toast } = useWs();
  const [data, setData] = useState<T | null>(null);
  const load = useCallback(() => {
    api<T>(path)
      .then(setData)
      .catch((e) => toast((e as Error).message));
  }, [path, toast]);
  useEffect(load, [load]);
  return [data, load] as const;
}

function Loading() {
  return (
    <p className="flex items-center justify-center gap-2 py-16 text-sm text-muted">
      <Loader2 size={15} className="animate-spin" /> Loading…
    </p>
  );
}

function MembersTab() {
  const { uid, account, toast } = useWs();
  const [rows, reload] = useLoad<Member[]>("/api/admin/members");
  const [q, setQ] = useState("");
  const owner = account.org_role === "owner";

  async function role(m: Member, r: OrgRole) {
    if (r === m.org_role) return;
    if (!confirm(`Make ${m.name} ${ROLE_LABEL[r].toLowerCase()}? They'll be asked to sign in again.`)) return reload();
    try {
      await api(`/api/admin/members/${m.id}/role`, { json: { org_role: r } });
      toast(`${m.name} is now ${ROLE_LABEL[r].toLowerCase()}.`);
    } catch (e) {
      toast((e as Error).message);
    }
    reload();
  }
  const [editing, setEditing] = useState<string | null>(null);
  async function active(m: Member, on: boolean) {
    const elsewhere = (m.other_workspaces ?? 0) > 0;
    const ask = elsewhere
      ? `Remove ${m.name} from ${account.org.name}? They leave its channels and chats here, and keep their other Saathi workspace. Their messages stay.`
      : `Deactivate ${m.name}? They're signed out everywhere and can't sign back in. Their messages stay.`;
    if (!on && !confirm(ask)) return;
    try {
      await api(`/api/admin/members/${m.id}/active`, { json: { active: on } });
      toast(on ? `${m.name} reactivated.` : `${m.name} deactivated.`);
    } catch (e) {
      toast((e as Error).message);
    }
    reload();
  }

  if (!rows) return <Loading />;
  const t = q.trim().toLowerCase();
  const list = rows.filter((m) => !t || m.name?.toLowerCase().includes(t) || m.email?.toLowerCase().includes(t) || m.title?.toLowerCase().includes(t));
  const counts = rows.reduce<Record<string, number>>((a, m) => ((a[m.deactivated ? "deactivated" : m.org_role] = (a[m.deactivated ? "deactivated" : m.org_role] ?? 0) + 1), a), {});
  return (
    <>
      <div className="flex flex-wrap items-center gap-3">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search people" aria-label="Search people" className="h-9 w-64 rounded-lg border border-border bg-surface px-3 text-sm outline-none focus:border-brand" />
        <p className="text-sm text-muted">
          {rows.length} people · {(["owner", "admin", "member", "guest", "deactivated"] as const)
            .filter((k) => counts[k])
            .map((k) => `${counts[k]} ${k === "deactivated" ? "deactivated" : ROLE_LABEL[k].toLowerCase()}${counts[k] > 1 && k !== "deactivated" ? "s" : ""}`)
            .join(" · ")}
        </p>
      </div>
      <div className="mt-3 overflow-x-auto rounded-xl border border-border bg-surface">
        <table className="w-full min-w-[760px] text-sm">
          <thead className="border-b border-border text-left text-xs text-muted">
            <tr>
              <th className="px-4 py-2.5 font-semibold">Person</th>
              <th className="px-3 py-2.5 font-semibold">Role</th>
              <th className="px-3 py-2.5 font-semibold">Access</th>
              <th className="px-3 py-2.5 font-semibold">Last active</th>
              <th className="px-3 py-2.5 font-semibold">Sign-in</th>
              <th className="px-3 py-2.5 font-semibold">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {list.map((m) => {
              const locked = m.id === uid || (m.org_role === "owner" && !owner);
              return (
                <Fragment key={m.id}>
                <tr className={clsx("border-b border-border last:border-b-0", (m.deactivated || m.expired) && "opacity-60")}>
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-2.5">
                      <Avatar name={m.name ?? "?"} size={30} />
                      <div className="min-w-0">
                        <div className="truncate font-medium">
                          {m.name} {m.id === uid && <span className="text-xs text-muted">(you)</span>}
                        </div>
                        <div className="truncate text-xs text-muted">
                          {m.email}
                          {m.title && ` · ${m.title}`}
                        </div>
                        {(m.other_workspaces ?? 0) > 0 && (
                          <div className="mt-0.5 flex items-center gap-1 text-[11px] text-muted" title="They also use Saathi in their own organisation's workspace and switch between them">
                            <Building2 size={11} aria-hidden /> Also in {m.other_workspaces} other workspace{m.other_workspaces === 1 ? "" : "s"}
                          </div>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-2.5">
                    <select
                      value={m.org_role}
                      disabled={locked || m.deactivated}
                      onChange={(e) => role(m, e.target.value as OrgRole)}
                      aria-label={`Role for ${m.name}`}
                      className="h-8 rounded-lg border border-border bg-surface px-2 text-sm disabled:bg-canvas"
                    >
                      {(owner ? (["owner", "admin", "member", "guest"] as const) : (["admin", "member", "guest"] as const)).map((r) => (
                        <option key={r} value={r}>
                          {ROLE_LABEL[r]}
                        </option>
                      ))}
                      {!owner && m.org_role === "owner" && <option value="owner">Owner</option>}
                    </select>
                  </td>
                  <td className="px-3 py-2.5">
                    {m.org_role === "guest" && !m.deactivated ? (
                      <button onClick={() => setEditing(editing === m.id ? null : m.id)} className="text-left text-xs hover:underline" aria-expanded={editing === m.id}>
                        <span className={clsx("block font-medium", m.expired ? "text-rust" : "text-ink")}>
                          {m.expired ? `Ended ${shortDate(m.ended_at ?? m.until)}` : m.until ? `Until ${shortDate(m.until)}` : "No end date"}
                        </span>
                        <span className="block text-muted">
                          {[m.guest?.dm ? "Direct messages" : "Channels only", m.guest?.ai ? "Saathi" : "No Saathi"].join(" · ")}
                        </span>
                      </button>
                    ) : (
                      <span className="text-xs text-muted">{m.deactivated ? "—" : "Full"}</span>
                    )}
                  </td>
                  <td className="px-3 py-2.5 text-muted">{m.deactivated ? "Deactivated" : ago(m.last_active)}</td>
                  <td className="px-3 py-2.5 text-muted">{m.provider === "google.com" ? "Google" : m.provider === "password" ? "Email" : "Directory"}</td>
                  <td className="px-3 py-2.5 text-right">
                    {!locked && m.expired && !m.deactivated && (
                      <button onClick={() => setEditing(m.id)} className="mr-1 h-8 rounded-lg border border-border px-3 text-xs font-semibold hover:bg-hover">
                        Extend
                      </button>
                    )}
                    {!locked &&
                      (m.deactivated ? (
                        <button onClick={() => active(m, true)} className="h-8 rounded-lg border border-border px-3 text-xs font-semibold hover:bg-hover">
                          Reactivate
                        </button>
                      ) : (
                        <button onClick={() => active(m, false)} className="flex h-8 items-center gap-1 rounded-lg px-2.5 text-xs font-semibold text-rust hover:bg-rust-soft">
                          <UserX size={13} /> {(m.other_workspaces ?? 0) > 0 ? "Remove" : "Deactivate"}
                        </button>
                      ))}
                  </td>
                </tr>
                {editing === m.id && m.org_role === "guest" && !m.deactivated && (
                  <tr className="border-b border-border bg-canvas/60">
                    <td colSpan={6} className="px-4 py-3">
                      <GuestEditor
                        m={m}
                        onDone={() => {
                          setEditing(null);
                          reload();
                        }}
                      />
                    </td>
                  </tr>
                )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-xs text-muted">
        Owners manage owners and admins. Guests only see the channels they&rsquo;re invited to; click a guest&rsquo;s access to change what else they may do and until when.
        Someone who also uses Saathi elsewhere is only removed from this workspace. Every change is recorded in the audit log.
      </p>
    </>
  );
}

const shortDate = (iso?: string | null) => (iso ? new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "—");
const isoDay = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/** How long a guest's access lasts: N days (from joining, or from now when editing), until a date, or no end date. */
type Duration = { kind: "days"; days: number } | { kind: "date"; date: string } | { kind: "none" };

function DurationPicker({ value, onChange, keep }: { value: Duration | null; onChange: (d: Duration | null) => void; keep?: string }) {
  const chip = (on: boolean) => clsx("h-8 rounded-lg border px-2.5 text-xs", on ? "border-brand bg-brand-soft font-semibold text-brand" : "border-border bg-surface hover:bg-hover");
  const [minDay] = useState(() => isoDay(new Date(Date.now() + 86_400_000)));
  return (
    <div>
      <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Access ends">
        {keep && (
          <button type="button" role="radio" aria-checked={value === null} onClick={() => onChange(null)} className={chip(value === null)}>
            {keep}
          </button>
        )}
        {[7, 30, 90].map((d) => (
          <button key={d} type="button" role="radio" aria-checked={value?.kind === "days" && value.days === d} onClick={() => onChange({ kind: "days", days: d })} className={chip(value?.kind === "days" && value.days === d)}>
            {d} days
          </button>
        ))}
        <button type="button" role="radio" aria-checked={value?.kind === "date"} onClick={() => onChange({ kind: "date", date: value?.kind === "date" ? value.date : "" })} className={chip(value?.kind === "date")}>
          Pick a date
        </button>
        <button type="button" role="radio" aria-checked={value?.kind === "none"} onClick={() => onChange({ kind: "none" })} className={chip(value?.kind === "none")}>
          No end date
        </button>
      </div>
      {value?.kind === "date" && (
        <input
          type="date"
          min={minDay}
          value={value.date}
          onChange={(e) => onChange({ kind: "date", date: e.target.value })}
          aria-label="Access ends on"
          className="mt-2 h-9 rounded-lg border border-border bg-surface px-2 text-sm outline-none focus:border-brand"
        />
      )}
    </div>
  );
}

/** What each role can do, in plain words, with the guest's two switches. */
function RoleAccess({ role, dm, ai, setDm, setAi, editing }: { role: OrgRole; dm: boolean; ai: boolean; setDm: (v: boolean) => void; setAi: (v: boolean) => void; editing?: boolean }) {
  const yes = (t: string) => (
    <li className="flex gap-2">
      <Check size={14} className="mt-0.5 shrink-0 text-moss" aria-hidden /> <span>{t}</span>
    </li>
  );
  if (role !== "guest")
    return (
      <ul className="space-y-1 rounded-lg bg-canvas px-3 py-2.5 text-xs text-ink/80" aria-label="What they can do">
        {yes("See everyone in the workspace, join public channels and chat with anyone")}
        {yes("Create channels (unless you limit that to admins) and use Saathi and every feature: Research, Quality, Live, Decisions")}
        {role === "admin" && yes("Manage people, invites, channels and workspace settings in this admin console")}
      </ul>
    );
  return (
    <div className="space-y-2 rounded-lg bg-canvas px-3 py-2.5 text-xs text-ink/80" aria-label="What a guest can do">
      <ul className="space-y-1">
        {yes(editing ? "Read and post in their channels, including everything already posted there" : "Read and post in the channels you pick below, including everything already posted there")}
        {yes("See only the people in those channels")}
      </ul>
      <label className="flex items-center gap-3 rounded-lg bg-surface px-2.5 py-2">
        <span className="min-w-0 flex-1">
          <span className="block font-semibold text-ink">Message people directly</span>
          <span className="block text-muted">Direct and group chats with people from their channels</span>
        </span>
        <Switch on={dm} onChange={setDm} label="Guest can message people directly" />
      </label>
      <label className="flex items-center gap-3 rounded-lg bg-surface px-2.5 py-2">
        <span className="min-w-0 flex-1">
          <span className="block font-semibold text-ink">Use Saathi (AI)</span>
          <span className="block text-muted">Ask questions and summarise chats; answers come only from their channels</span>
        </span>
        <Switch on={ai} onChange={setAi} label="Guest can use Saathi" />
      </label>
      <p className="flex gap-2 text-muted">
        <X size={14} className="mt-0.5 shrink-0 text-rust" aria-hidden />
        <span>
          Never: create or browse channels, add people, see your company directory, or use Research, Live meetings, Quality &amp; plant records, the drawing register, decisions or
          connected Google apps.
        </span>
      </p>
    </div>
  );
}

/** Change a guest's extras and end date; a new date for access that ran out gives it back (same channels as before). */
function GuestEditor({ m, onDone }: { m: Member; onDone: () => void }) {
  const { toast } = useWs();
  const [dm, setDm] = useState(m.guest?.dm ?? true);
  const [ai, setAi] = useState(m.guest?.ai ?? true);
  const [dur, setDur] = useState<Duration | null>(m.expired ? { kind: "days", days: 30 } : null);
  const [busy, setBusy] = useState(false);
  async function save(endNow = false) {
    if (endNow && !confirm(`End ${m.name}'s access now? They leave this workspace's channels; you can extend it again later.`)) return;
    setBusy(true);
    try {
      const body = endNow
        ? { until: null, days: null, end_now: true }
        : { dm, ai, ...(dur?.kind === "days" ? { days: dur.days } : dur?.kind === "date" ? { until: dur.date } : dur?.kind === "none" ? { no_limit: true } : {}) };
      const r = await api<{ restored: boolean }>(`/api/admin/members/${m.id}/guest`, { json: body });
      toast(endNow ? `${m.name}'s access ended.` : r.restored ? `${m.name} has access again.` : "Guest access saved.");
      onDone();
    } catch (e) {
      toast((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="grid gap-3 md:grid-cols-[1fr_1fr]">
      <div className="space-y-2">
        <p className="text-xs font-semibold">What {m.name.split(" ")[0]} can do besides their channels</p>
        <RoleAccess role="guest" dm={dm} ai={ai} setDm={setDm} setAi={setAi} editing />
      </div>
      <div className="space-y-2">
        <p className="text-xs font-semibold">{m.expired ? "Give access again for" : "Access ends"}</p>
        <DurationPicker value={dur} onChange={setDur} keep={m.expired ? undefined : m.until ? `Keep ${shortDate(m.until)}` : "Keep no end date"} />
        <p className="text-xs text-muted">Days count from today. They see the date in their workspace switcher.</p>
        <div className="flex flex-wrap gap-2 pt-1">
          <button onClick={() => save()} disabled={busy || (dur?.kind === "date" && !dur.date)} className="flex h-9 items-center gap-2 rounded-lg bg-brand px-4 text-sm font-semibold text-white hover:bg-brand-strong disabled:opacity-40">
            {busy && <Loader2 size={14} className="animate-spin" />} {m.expired ? "Give access again" : "Save"}
          </button>
          {!m.expired && (
            <button onClick={() => save(true)} disabled={busy} className="h-9 rounded-lg px-3 text-sm font-semibold text-rust hover:bg-rust-soft disabled:opacity-40">
              End access now
            </button>
          )}
          <button onClick={onDone} className="h-9 rounded-lg px-3 text-sm text-muted hover:bg-hover">
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

type Delivery = { status: "sent" | "failed" | "off"; at: string | null; error?: string } | null;
type IssuedLink = { email: string; url: string; delivery: Delivery; note?: string };

/** Common slips in consumer domains: an invite to gmial.com never arrives and no bounce comes back to Saathi. */
const DOMAIN_TYPOS: Record<string, string> = {
  "gmial.com": "gmail.com", "gamil.com": "gmail.com", "gmai.com": "gmail.com", "gmail.co": "gmail.com", "gmail.con": "gmail.com", "gnail.com": "gmail.com",
  "yaho.com": "yahoo.com", "yahoo.co": "yahoo.com", "yahoo.con": "yahoo.com", "hotmial.com": "hotmail.com", "hotmail.co": "hotmail.com",
  "outlok.com": "outlook.com", "outlook.co": "outlook.com", "rediffmail.co": "rediffmail.com", "rediff.com": "rediffmail.com",
};

function deliveryText(d: Delivery) {
  if (!d) return "Link only";
  if (d.status === "sent") return `Emailed ${ago(d.at)}`;
  if (d.status === "failed") return "Email failed";
  return "Link only";
}

function InvitesTab() {
  const { chats, toast } = useWs();
  const [data, reload] = useLoad<{ mail: boolean; mail_from?: string; invites: Invite[] }>("/api/admin/invites");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<OrgRole>("member");
  const [channels, setChannels] = useState<string[]>([]);
  const [gdm, setGdm] = useState(true);
  const [gai, setGai] = useState(true);
  const [dur, setDur] = useState<Duration | null>({ kind: "days", days: 30 });
  const [busy, setBusy] = useState<string | null>(null);
  const [issued, setIssued] = useState<IssuedLink | null>(null);
  const mail = data?.mail ?? false;
  const rows = data?.invites;
  // Guests never see #General (company-wide), so it isn't offered for them
  const myChannels = Object.values(chats).filter((c) => c.type === "channel" && !(role === "guest" && c.default));
  const typo = (() => {
    const d = email.trim().toLowerCase().split("@")[1];
    return d && DOMAIN_TYPOS[d] ? email.trim().replace(/@.*/, `@${DOMAIN_TYPOS[d]}`) : "";
  })();
  const picked = myChannels.filter((c) => channels.includes(c.id));
  const crowded = role === "guest" && picked.some((c) => c.visibility !== "private" || c.members.length > 12);

  async function send(sendEmail: boolean) {
    setBusy(sendEmail ? "send" : "link");
    try {
      const r = await api<{ path: string; again: boolean; note: string; delivery: Delivery }>("/api/admin/invites", {
        json: {
          email, org_role: role, channel_ids: channels.filter((id) => myChannels.some((c) => c.id === id)), send_email: sendEmail,
          ...(role === "guest" ? { guest_dm: gdm, guest_ai: gai, access_days: dur?.kind === "days" ? dur.days : null, access_until: dur?.kind === "date" ? dur.date : null } : {}),
        },
      });
      setIssued({ email: email.trim().toLowerCase(), url: location.origin + r.path, delivery: r.delivery, note: r.note });
      toast(r.delivery?.status === "sent" ? `Invite emailed to ${email.trim()}.` : r.again ? "Invite updated." : "Invite created. Share the link below.");
      setEmail("");
      setChannels([]);
      reload();
    } catch (e) {
      toast((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function newLink(i: Invite, sendEmail: boolean) {
    setBusy(`${sendEmail ? "resend" : "copy"}:${i.id}`);
    try {
      const r = await api<{ path: string; delivery: Delivery }>(`/api/admin/invites/${encodeURIComponent(i.id)}/link`, { json: { send_email: sendEmail } });
      const url = location.origin + r.path;
      setIssued({ email: i.email, url, delivery: r.delivery });
      if (sendEmail) toast(r.delivery?.status === "sent" ? `Invite emailed again to ${i.email}.` : r.delivery?.error || "Email is off. Share the link below.");
      else await navigator.clipboard?.writeText(url).then(() => toast("Invite link copied."), () => toast("Link ready below."));
      reload();
    } catch (e) {
      toast((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  const ready = email.includes("@") && !(role === "guest" && (!channels.length || (dur?.kind === "date" && !dur.date)));
  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_1.2fr]">
      <section className="min-w-0 space-y-4">
        <div className="rounded-xl border border-border bg-surface p-4">
          <h2 className="font-semibold">Invite someone</h2>
          <p className="mt-0.5 text-sm text-muted">
            {mail ? `Saathi emails them a personal link${data?.mail_from ? ` from ${data.mail_from}` : ""}.` : "You get a personal link to send them (email is off on this server)."} Only this email address can use it.
          </p>
          <div className="mt-3 space-y-3">
            <div>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@company.com" aria-label="Email" className="h-10 w-full rounded-lg border border-border px-3 text-sm outline-none focus:border-brand" />
              {typo && (
                <button onClick={() => setEmail(typo)} className="mt-1 text-xs text-saffron-ink hover:underline">
                  Did you mean <b>{typo}</b>?
                </button>
              )}
            </div>
            <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Role">
              {(["member", "guest", "admin"] as const).map((r) => (
                <button key={r} role="radio" aria-checked={role === r} onClick={() => setRole(r)} className={clsx("h-9 rounded-lg border text-sm", role === r ? "border-brand bg-brand-soft font-semibold text-brand" : "border-border hover:bg-hover")}>
                  {ROLE_LABEL[r]}
                </button>
              ))}
            </div>
            <RoleAccess role={role} dm={gdm} ai={gai} setDm={setGdm} setAi={setGai} />
            {role === "guest" && (
              <div>
                <p className="text-sm font-medium">Access ends</p>
                <DurationPicker value={dur} onChange={setDur} />
                <p className="mt-1 text-xs text-muted">
                  {dur?.kind === "days" ? `${dur.days} days from when they join. ` : ""}You can extend it, shorten it or end it any time under Members.
                  {" "}If they already use Saathi at their own company, they keep that workspace and switch between the two.
                </p>
              </div>
            )}
            {(role === "guest" || myChannels.length > 0) && (
              <div>
                <p className="text-sm font-medium">Add to channels {role !== "guest" && <span className="font-normal text-muted">(optional)</span>}</p>
                <div className="mt-1 max-h-40 space-y-1 overflow-y-auto">
                  {myChannels.length === 0 && <p className="text-xs text-muted">You aren&rsquo;t in any channels a guest can join yet. Create a private channel for this vendor first.</p>}
                  {myChannels.map((c) => (
                    <label key={c.id} className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1 text-sm hover:bg-hover">
                      <input type="checkbox" checked={channels.includes(c.id)} onChange={(e) => setChannels((s) => (e.target.checked ? [...s, c.id] : s.filter((x) => x !== c.id)))} />
                      {c.visibility === "private" ? <Lock size={13} className="text-muted" /> : <Hash size={13} className="text-muted" />} <span className="min-w-0 flex-1 truncate">{c.name}</span>
                      <span className="text-xs text-muted">{c.members.length}</span>
                    </label>
                  ))}
                </div>
                {crowded && (
                  <p className="mt-2 rounded-lg bg-saffron-soft px-2.5 py-2 text-xs text-saffron-ink">
                    A guest will read this channel&rsquo;s whole history. For a vendor, a private channel with just the people who work with them is safer.
                  </p>
                )}
              </div>
            )}
            <div className="flex gap-2">
              <button onClick={() => send(true)} disabled={!!busy || !ready} className="flex h-9 flex-1 items-center justify-center gap-2 rounded-lg bg-brand text-sm font-semibold text-white hover:bg-brand-strong disabled:opacity-40">
                {busy === "send" && <Loader2 size={14} className="animate-spin" />} {mail ? "Send invite" : "Create invite link"}
              </button>
              {mail && (
                <button onClick={() => send(false)} disabled={!!busy || !ready} title="Create the invite without emailing it, and copy the link yourself" className="flex h-9 items-center gap-1.5 rounded-lg border border-border px-3 text-sm font-semibold hover:bg-hover disabled:opacity-40">
                  {busy === "link" ? <Loader2 size={14} className="animate-spin" /> : <Copy size={13} />} Link only
                </button>
              )}
            </div>
          </div>
        </div>

        {issued && <IssuedCard link={issued} onClose={() => setIssued(null)} />}
      </section>

      <section className="min-w-0 self-start rounded-xl border border-border bg-surface">
        <h2 className="border-b border-border px-4 py-3 font-semibold">Invites</h2>
        {!rows ? (
          <Loading />
        ) : rows.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-muted">No invites yet.</p>
        ) : (
          <ul>
            {rows.map((i) => (
              <li key={i.id} className="border-b border-border px-4 py-2.5 text-sm last:border-b-0">
                <div className="flex items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium">{i.email}</div>
                    <div className="truncate text-xs text-muted">
                      {ROLE_LABEL[i.org_role]} · by {i.invited_by}
                      {i.channels.length > 0 && ` · ${i.channels.join(", ")}`}
                      {i.org_role === "guest" &&
                        ` · ${i.access_until ? `until ${shortDate(i.access_until)}` : i.access_days ? `${i.access_days} days` : "no end date"}` +
                          (i.guest && !i.guest.dm ? " · channels only" : "") +
                          (i.guest && !i.guest.ai ? " · no Saathi" : "")}
                    </div>
                  </div>
                  <span className={clsx("shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold", i.status === "accepted" ? "bg-moss-soft text-moss" : i.status === "expired" ? "bg-rust-soft text-rust" : "bg-saffron-soft text-saffron-ink")}>
                    {i.status === "accepted" ? "joined" : i.status}
                  </span>
                  {i.status !== "accepted" && (
                    <button
                      onClick={async () => {
                        await api(`/api/admin/invites/${encodeURIComponent(i.id)}`, { method: "DELETE" }).catch((e) => toast((e as Error).message));
                        reload();
                      }}
                      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted hover:bg-rust-soft hover:text-rust"
                      aria-label={`Withdraw invite for ${i.email}`}
                      title="Withdraw invite (links stop working)"
                    >
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
                {i.status !== "accepted" && (
                  <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                    <span className={clsx(i.delivery?.status === "failed" ? "text-rust" : "text-muted")} title={i.delivery?.error}>
                      {deliveryText(i.delivery)}
                      {i.delivery?.status === "failed" && i.delivery.error ? `: ${i.delivery.error}` : ""}
                    </span>
                    <span className="text-muted">{i.status === "expired" ? `expired ${ago(i.expires_at)}` : i.expires_at ? `until ${new Date(i.expires_at).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}` : ""}</span>
                    <span className="flex-1" />
                    {mail && (
                      <button onClick={() => newLink(i, true)} disabled={!!busy} className="flex items-center gap-1 font-semibold text-brand hover:underline disabled:opacity-50">
                        {busy === `resend:${i.id}` ? <Loader2 size={12} className="animate-spin" /> : <MailPlus size={12} />} {i.status === "expired" ? "Renew & email" : "Email again"}
                      </button>
                    )}
                    <button onClick={() => newLink(i, false)} disabled={!!busy} className="flex items-center gap-1 font-semibold text-brand hover:underline disabled:opacity-50" title="A fresh link; links already sent keep working">
                      {busy === `copy:${i.id}` ? <Loader2 size={12} className="animate-spin" /> : <Copy size={12} />} {i.status === "expired" ? "Renew & copy link" : "Copy link"}
                    </button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

/** The link just issued: copy it, or hand it over on WhatsApp (how many vendors actually get messages). */
function IssuedCard({ link, onClose }: { link: IssuedLink; onClose: () => void }) {
  const { toast } = useWs();
  const d = link.delivery;
  const wa = `https://wa.me/?text=${encodeURIComponent(`You're invited to our Saathi workspace. Open this link and sign in with ${link.email}:\n${link.url}`)}`;
  return (
    <div className="rounded-xl border border-border bg-surface p-4" role="status">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">
            {d?.status === "sent" ? `Emailed to ${link.email}` : d?.status === "failed" ? `Couldn't email ${link.email}` : `Invite link for ${link.email}`}
          </p>
          <p className="mt-0.5 text-xs text-muted">
            {d?.status === "sent"
              ? "If it doesn't arrive in a few minutes, ask them to check spam, or send them this link."
              : d?.status === "failed"
                ? `${d.error ?? "The email didn't go out."} Send them this link instead.`
                : "Send them this link. It only works for this email address."}
          </p>
          {link.note && <p className="mt-1.5 text-xs text-saffron-ink">{link.note}</p>}
        </div>
        <button onClick={onClose} className="text-xs text-muted hover:text-ink" aria-label="Dismiss">
          ✕
        </button>
      </div>
      <div className="mt-3 flex items-center gap-2 rounded-lg bg-canvas px-3 py-2 text-xs">
        <span className="min-w-0 flex-1 truncate font-mono text-muted">{link.url}</span>
        <button onClick={() => navigator.clipboard?.writeText(link.url).then(() => toast("Link copied."))} className="flex items-center gap-1 font-semibold text-brand">
          <Copy size={12} /> Copy
        </button>
        <a href={wa} target="_blank" rel="noopener noreferrer" className="font-semibold text-moss hover:underline">
          WhatsApp
        </a>
      </div>
    </div>
  );
}

function ChannelsTab() {
  const { toast } = useWs();
  const [data, reload] = useLoad<{ channels: ChannelRow[]; group_chats: number; direct_messages: number }>("/api/admin/channels");
  if (!data) return <Loading />;
  return (
    <>
      <p className="text-sm text-muted">
        {data.channels.length} channels · {data.group_chats} group chats · {data.direct_messages} direct messages. Admins see channel names and membership only, never messages.
      </p>
      <div className="mt-3 overflow-x-auto rounded-xl border border-border bg-surface">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="border-b border-border text-left text-xs text-muted">
            <tr>
              <th className="px-4 py-2.5 font-semibold">Channel</th>
              <th className="px-3 py-2.5 font-semibold">Members</th>
              <th className="px-3 py-2.5 font-semibold">Owners</th>
              <th className="px-3 py-2.5 font-semibold">Last activity</th>
              <th className="px-3 py-2.5">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {data.channels.map((c) => (
              <tr key={c.id} className="border-b border-border last:border-b-0">
                <td className="px-4 py-2.5">
                  <div className="flex items-center gap-2 font-medium">
                    {c.visibility === "private" ? <Lock size={14} className="text-muted" aria-label="Private" /> : <Globe size={14} className="text-muted" aria-label="Public" />}
                    {c.name}
                    {c.ai_excluded && <span className="rounded bg-rust-soft px-1.5 text-[10px] text-rust">AI off</span>}
                  </div>
                  <div className="text-xs text-muted">created by {c.created_by || "—"}</div>
                </td>
                <td className="px-3 py-2.5">{c.members}</td>
                <td className="px-3 py-2.5 text-muted">{c.owners.join(", ") || "—"}</td>
                <td className="px-3 py-2.5 text-muted">{ago(c.last_activity)}</td>
                <td className="px-3 py-2.5 text-right">
                  <button
                    onClick={async () => {
                      if (!confirm(`Delete ${c.name} for everyone? Messages, files and its search index are removed. This can't be undone.`)) return;
                      await api(`/api/admin/channels/${c.id}`, { method: "DELETE" })
                        .then(() => toast("Channel deleted."))
                        .catch((e) => toast((e as Error).message));
                      reload();
                    }}
                    className="flex h-8 items-center gap-1 rounded-lg px-2.5 text-xs font-semibold text-rust hover:bg-rust-soft"
                  >
                    <Trash2 size={13} /> Delete
                  </button>
                </td>
              </tr>
            ))}
            {data.channels.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-muted">
                  No channels yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}

function WorkspaceTab() {
  const { account, toast } = useWs();
  const [name, setName] = useState(account.org.name);
  const [domains, setDomains] = useState(account.org.domains.join(", "));
  const [creation, setCreation] = useState(account.org.settings.channel_creation ?? "everyone");
  const [ai, setAi] = useState(account.org.settings.ai_enabled ?? true);
  const [google, setGoogle] = useState(account.org.settings.integrations_google ?? true);
  const [voiceUs, setVoiceUs] = useState(account.org.settings.voice_us ?? false);
  const [qrPublic, setQrPublic] = useState(account.org.settings.qr_public ?? true);
  const [shifts, setShifts] = useState((account.org.settings.shifts ?? [{ name: "A", start: "06:00" }, { name: "B", start: "14:00" }, { name: "C", start: "22:00" }]).map((r) => `${r.name} ${r.start}`).join(", "));
  const [quality, setQuality] = useState<string[]>(account.org.settings.quality_team ?? []);
  const { users } = useWs();
  const [busy, setBusy] = useState(false);
  async function save() {
    setBusy(true);
    try {
      await api("/api/admin/org", {
        method: "PATCH",
        json: { name, domains: domains.split(/[,\s]+/).filter(Boolean), channel_creation: creation, ai_enabled: ai, integrations_google: google, voice_us: voiceUs, qr_public: qrPublic, quality_team: quality, shifts },
      });
      toast("Workspace settings saved. Reload to see them everywhere.");
    } catch (e) {
      toast((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="max-w-2xl space-y-4">
      <section className="rounded-xl border border-border bg-surface p-4">
        <label className="block text-sm font-semibold">
          Workspace name
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={60} className="mt-1 h-10 w-full rounded-lg border border-border px-3 text-sm font-normal outline-none focus:border-brand" />
        </label>
      </section>
      <section className="rounded-xl border border-border bg-surface p-4">
        <label className="block text-sm font-semibold">
          Company email domains
          <input value={domains} onChange={(e) => setDomains(e.target.value)} placeholder="shaktirail.in" className="mt-1 h-10 w-full rounded-lg border border-border px-3 text-sm font-normal outline-none focus:border-brand" />
        </label>
        <p className="mt-1.5 text-xs text-muted">
          People who sign in with a <b>verified</b> email on these domains join automatically as members. Public providers like gmail.com can&rsquo;t be claimed. To add a domain, sign in with an email on it.
        </p>
      </section>
      <section className="space-y-3 rounded-xl border border-border bg-surface p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-sm font-semibold">Who can create channels</div>
            <div className="text-xs text-muted">Guests can never create channels.</div>
          </div>
          <select value={creation} onChange={(e) => setCreation(e.target.value as "everyone" | "admins")} className="h-9 rounded-lg border border-border bg-surface px-2 text-sm">
            <option value="everyone">All members</option>
            <option value="admins">Admins only</option>
          </select>
        </div>
        <div className="flex items-center justify-between gap-3 border-t border-border pt-3">
          <div>
            <div className="text-sm font-semibold">Saathi AI assistant</div>
            <div className="text-xs text-muted">When off, no one in the workspace can ask Saathi questions.</div>
          </div>
          <Switch on={ai} onChange={setAi} label="AI assistant enabled" />
        </div>
        <div className="flex items-center justify-between gap-3 border-t border-border pt-3">
          <div>
            <div className="text-sm font-semibold">Google Calendar &amp; Gmail connections</div>
            <div className="text-xs text-muted">Members can connect their own Google account (read-only). Turning this off disconnects everyone and deletes synced data.</div>
          </div>
          <Switch on={google} onChange={setGoogle} label="Allow Google connections" />
        </div>
        <div className="flex items-center justify-between gap-3 border-t border-border pt-3">
          <div>
            <div className="text-sm font-semibold">Saathi Voice (hands-free, Hindi-first)</div>
            <div className="text-xs text-muted">Uses Gemini Live, which processes voice in the US (us-central1). Audio is never stored; transcripts are private to each person and deleted after 30 days. Everything else stays in Mumbai.</div>
          </div>
          <Switch on={voiceUs} onChange={setVoiceUs} label="Allow Saathi Voice" />
        </div>
        <div className="flex items-center justify-between gap-3 border-t border-border pt-3">
          <div>
            <div className="text-sm font-semibold">QR drawing check without sign-in</div>
            <div className="text-xs text-muted">Scanning a controlled copy shows only drawing number, revision and current/obsolete. Turn off to require signing in.</div>
          </div>
          <Switch on={qrPublic} onChange={setQrPublic} label="Public QR verdict" />
        </div>
        <label className="block border-t border-border pt-3">
          <span className="text-sm font-semibold">Shift start times</span>
          <span className="block text-xs text-muted">Used for shift handovers: Saathi drafts each bay&rsquo;s handover 15 minutes before a shift ends. Format: A 06:00, B 14:00, C 22:00</span>
          <input value={shifts} onChange={(e) => setShifts(e.target.value)} className="mt-1.5 h-9 w-full max-w-sm rounded-lg border border-border px-3 font-mono text-sm outline-none focus:border-brand" />
        </label>
      </section>
      <section className="rounded-xl border border-border bg-surface p-4">
        <div className="text-sm font-semibold">Quality team</div>
        <div className="text-xs text-muted">Owns and sees every defect, downtime and safety report. If empty, workspace admins do.</div>
        <div className="mt-2 flex max-h-48 flex-wrap gap-1.5 overflow-y-auto">
          {Object.values(users)
            .filter((u) => !u.deactivated && u.org_role !== "guest")
            .map((u) => {
              const on = quality.includes(u.id);
              return (
                <button key={u.id} type="button" aria-pressed={on} onClick={() => setQuality((q) => (on ? q.filter((x) => x !== u.id) : [...q, u.id]))} className={clsx("h-8 rounded-full border px-3 text-xs", on ? "border-brand bg-brand-soft font-semibold text-brand" : "border-border text-muted hover:text-ink")}>
                  {on && "✓ "}
                  {u.name}
                </button>
              );
            })}
        </div>
      </section>
      <button onClick={save} disabled={busy} className="flex h-9 items-center gap-2 rounded-lg bg-brand px-4 text-sm font-semibold text-white hover:bg-brand-strong disabled:opacity-50">
        {busy && <Loader2 size={14} className="animate-spin" />} Save settings
      </button>
    </div>
  );
}

function AuditTab() {
  const [rows, reload] = useLoad<AuditRow[]>("/api/admin/audit");
  const [kind, setKind] = useState<"security" | "all">("security");
  if (!rows) return <Loading />;
  const list = rows.filter((r) => kind === "all" || r.action !== "assistant.query");
  return (
    <>
      <div className="flex items-center gap-2">
        {(["security", "all"] as const).map((k) => (
          <button key={k} onClick={() => setKind(k)} aria-pressed={kind === k} className={clsx("h-7 rounded-full border px-2.5 text-xs font-medium", kind === k ? "border-brand bg-brand-soft text-brand" : "border-border text-muted")}>
            {k === "security" ? "Security & admin" : "Include assistant usage"}
          </button>
        ))}
        <button onClick={reload} className="ml-auto flex h-8 items-center gap-1 rounded-lg px-2 text-xs text-muted hover:bg-hover" aria-label="Refresh">
          <RefreshCw size={13} /> Refresh
        </button>
      </div>
      <ul className="mt-3 rounded-xl border border-border bg-surface">
        {list.length === 0 && <li className="px-4 py-8 text-center text-sm text-muted">No events yet.</li>}
        {list.map((r, i) => (
          <li key={i} className="flex items-start gap-3 border-b border-border px-4 py-2.5 text-sm last:border-b-0">
            <span className="w-28 shrink-0 text-xs text-muted">{r.ts ? new Date(r.ts).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }) : ""}</span>
            <span className="min-w-0 flex-1">
              <b>{r.actor}</b> {ACTION_LABEL[r.action] ?? r.action}{" "}
              {String(r.meta.name ?? (r.action.startsWith("member.invite") ? r.target : "")) && <b>{String(r.meta.name ?? r.target)}</b>}
              {r.action === "member.role_changed" && (
                <span className="text-muted">
                  {" "}
                  ({String(r.meta.old)} → {String(r.meta.new)})
                </span>
              )}
              {r.action === "assistant.query" && <span className="text-muted"> ({(r.meta.tools as string[] | undefined)?.join(", ") || "no tools"})</span>}
            </span>
          </li>
        ))}
      </ul>
      <p className="mt-2 text-xs text-muted">Assistant entries show that a question was asked and which tools ran, never the question itself.</p>
    </>
  );
}

type Impact = {
  window_days: number;
  capture: { records_filed: number; median_capture_seconds: number | null; by_type: Record<string, number>; ncr_median_days_to_close: number | null; ncrs_closed_total: number; includes_imported_history: number };
  knowledge: { questions: number; answered_with_citations: number; citation_rate: number | null; median_latency_s: number | null; lessons_lookups: number; decision_lookups: number; data_questions: number };
  decisions: { captured_total: number; captured_in_window: number; with_rationale: number; superseded: number };
  work: { promises_tracked: number; tasks_done: number };
  live?: { sessions: number; answers: number; line_final_s: number | null; answer_s: number | null; heard_to_answer_s: number | null };
  drawing_control: { qr_scans: number; blocked_scans: number; superseded_revisions_guarded: number; drawings_in_register: number };
  time_saved: { hours: number; assumptions_min: Record<string, number>; counts: Record<string, number> };
};

function Stat({ label, value, sub }: { label: string; value: string | number | null; sub?: string }) {
  return (
    <div className="rounded-xl border border-border bg-surface p-3">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">{label}</p>
      <p className="mt-1 text-2xl font-bold tabular-nums">{value ?? "–"}</p>
      {sub && <p className="mt-0.5 text-xs text-muted">{sub}</p>}
    </div>
  );
}

/** Measured outcomes for the workspace. Only the time-saved figure is an estimate, and its assumptions are shown. */
function ImpactTab() {
  const [days, setDays] = useState(30);
  const [d, reload] = useLoad<Impact>(`/api/admin/impact?days=${days}`);
  if (!d) return <Loading />;
  const a = d.time_saved.assumptions_min;
  const mins = (s: number | null) => (s === null ? null : s < 90 ? `${s} s` : `${Math.round(s / 60)} min`);
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        {[7, 30, 90].map((n) => (
          <button key={n} onClick={() => setDays(n)} aria-pressed={days === n} className={clsx("h-7 rounded-full border px-2.5 text-xs font-medium", days === n ? "border-brand bg-brand-soft text-brand" : "border-border text-muted")}>
            Last {n} days
          </button>
        ))}
        <button onClick={reload} className="ml-auto flex h-8 items-center gap-1 rounded-lg px-2 text-xs text-muted hover:bg-hover" aria-label="Refresh">
          <RefreshCw size={13} /> Refresh
        </button>
      </div>

      <section className="rounded-2xl border border-brand/20 bg-brand-soft/40 p-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted">Estimated time saved · last {d.window_days} days</p>
        <p className="mt-1 text-4xl font-bold tabular-nums">{d.time_saved.hours} h</p>
        <p className="mt-2 text-xs text-muted">
          Estimate from counted activity: {d.time_saved.counts.cited_answers} cited answers × {a.search_min} min searching, {d.time_saved.counts.catch_ups} catch-ups × {a.catchup_min} min, {d.time_saved.counts.briefs} decision briefs × {a.brief_min} min, and {d.time_saved.counts.records} records filed against a {a.paper_record_min}-minute paper form. These per-item minutes are assumptions; everything else on this page is measured.
        </p>
      </section>

      <div>
        <h2 className="mb-2 text-sm font-bold">Knowledge access</h2>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat label="Questions to Saathi" value={d.knowledge.questions} />
          <Stat label="Answered with sources" value={d.knowledge.citation_rate === null ? null : `${Math.round(d.knowledge.citation_rate * 100)}%`} sub={`${d.knowledge.answered_with_citations} answers cited chats, files or records`} />
          <Stat label="Median answer time" value={d.knowledge.median_latency_s === null ? null : `${d.knowledge.median_latency_s} s`} />
          <Stat label="Plant memory lookups" value={d.knowledge.lessons_lookups} sub={`${d.knowledge.data_questions} data questions · ${d.knowledge.decision_lookups} decision lookups`} />
        </div>
      </div>

      {d.live && d.live.sessions > 0 && (
        <div>
          <h2 className="mb-2 text-sm font-bold">Saathi Live (meetings)</h2>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Stat label="Live meetings" value={d.live.sessions} sub={`${d.live.answers} answers surfaced`} />
            <Stat label="Transcript" value="Live" sub={`words appear while people speak · lines final in ${d.live.line_final_s ?? "–"} s`} />
            <Stat label="Question to answer" value={d.live.heard_to_answer_s === null ? null : `${d.live.heard_to_answer_s} s`} sub="median, from the question being said" />
            <Stat label="Search + write" value={d.live.answer_s === null ? null : `${d.live.answer_s} s`} sub="median: find in your sources, then answer" />
          </div>
        </div>
      )}

      <div>
        <h2 className="mb-2 text-sm font-bold">Decisions</h2>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat label="Decisions on record" value={d.decisions.captured_total} sub={`${d.decisions.captured_in_window} in this period`} />
          <Stat label="With the reason recorded" value={d.decisions.with_rationale} />
          <Stat label="Superseded and linked" value={d.decisions.superseded} />
          <Stat label="Promises tracked" value={d.work.promises_tracked} sub={`${d.work.tasks_done} tasks completed`} />
        </div>
      </div>

      <div>
        <h2 className="mb-2 text-sm font-bold">Shop floor</h2>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat label="Records filed in Saathi" value={d.capture.records_filed} sub={`${d.capture.by_type.ncr ?? 0} NCR · ${d.capture.by_type.downtime ?? 0} downtime · ${d.capture.by_type.safety ?? 0} safety`} />
          <Stat label="Median time to file" value={mins(d.capture.median_capture_seconds)} sub={`photo/voice to filed record, vs ~${a.paper_record_min} min on paper`} />
          <Stat
            label="NCR median days to close"
            value={d.capture.ncr_median_days_to_close}
            sub={`${d.capture.ncrs_closed_total} closed${d.capture.includes_imported_history ? `, ${d.capture.includes_imported_history} imported history` : ""}`}
          />
          <Stat label="Wrong-revision scans blocked" value={d.drawing_control.blocked_scans} sub={`${d.drawing_control.qr_scans} QR scans · ${d.drawing_control.superseded_revisions_guarded} superseded revisions guarded`} />
        </div>
      </div>
    </div>
  );
}
