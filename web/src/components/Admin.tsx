"use client";

import clsx from "clsx";
import { Copy, Globe, Hash, History, Loader2, Lock, MailPlus, RefreshCw, Settings2, ShieldCheck, Trash2, UserX, Users } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import type { OrgRole } from "@/lib/types";
import { Avatar, ROLE_LABEL, Switch } from "./bits";
import { useWs } from "./ctx";

type Member = { id: string; name: string; email: string; title: string; org_role: OrgRole; deactivated: boolean; provider: string; last_active: string | null; created_at: string | null };
type Invite = { email: string; org_role: OrgRole; status: string; invited_by: string; channels: string[]; created_at: string | null };
type ChannelRow = { id: string; name: string; visibility: string; members: number; owners: string[]; created_by: string; last_activity: string | null; ai_excluded: boolean };
type AuditRow = { ts: string | null; actor: string; action: string; target: string; meta: Record<string, unknown> };
type Tab = "members" | "invites" | "channels" | "workspace" | "audit";

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
  "member.invited": "invited",
  "member.invite_revoked": "revoked invite for",
  "member.role_changed": "changed role of",
  "member.deactivated": "deactivated",
  "member.reactivated": "reactivated",
  "channel.created": "created channel",
  "channel.deleted": "deleted channel",
  "channel.deleted_by_admin": "deleted channel (admin)",
  "workspace.updated": "updated workspace settings",
  "user.sessions_revoked": "signed out of all sessions",
  "assistant.query": "asked Saathi a question",
};

export function AdminView() {
  const { account } = useWs();
  const [tab, setTab] = useState<Tab>("members");
  const tabs: [Tab, string, typeof Users][] = [
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
  async function active(m: Member, on: boolean) {
    if (!on && !confirm(`Deactivate ${m.name}? They're signed out everywhere and can't sign back in. Their messages stay.`)) return;
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
        <table className="w-full min-w-[640px] text-sm">
          <thead className="border-b border-border text-left text-xs text-muted">
            <tr>
              <th className="px-4 py-2.5 font-semibold">Person</th>
              <th className="px-3 py-2.5 font-semibold">Role</th>
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
                <tr key={m.id} className={clsx("border-b border-border last:border-b-0", m.deactivated && "opacity-55")}>
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
                  <td className="px-3 py-2.5 text-muted">{m.deactivated ? "Deactivated" : ago(m.last_active)}</td>
                  <td className="px-3 py-2.5 text-muted">{m.provider === "google.com" ? "Google" : m.provider === "password" ? "Email" : "Directory"}</td>
                  <td className="px-3 py-2.5 text-right">
                    {!locked &&
                      (m.deactivated ? (
                        <button onClick={() => active(m, true)} className="h-8 rounded-lg border border-border px-3 text-xs font-semibold hover:bg-hover">
                          Reactivate
                        </button>
                      ) : (
                        <button onClick={() => active(m, false)} className="flex h-8 items-center gap-1 rounded-lg px-2.5 text-xs font-semibold text-rust hover:bg-rust-soft">
                          <UserX size={13} /> Deactivate
                        </button>
                      ))}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-xs text-muted">
        Owners manage owners and admins. Guests only see the channels they&rsquo;re invited to. Role changes and deactivations sign the person out and are recorded in the audit log.
      </p>
    </>
  );
}

function InvitesTab() {
  const { chats, toast } = useWs();
  const [rows, reload] = useLoad<Invite[]>("/api/admin/invites");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<OrgRole>("member");
  const [channels, setChannels] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const myChannels = Object.values(chats).filter((c) => c.type === "channel");
  const url = typeof window !== "undefined" ? `${location.origin}/signup` : "/signup";

  async function send() {
    setBusy(true);
    try {
      await api("/api/admin/invites", { json: { email, org_role: role, channel_ids: channels } });
      toast(`Invite created for ${email}.`);
      setEmail("");
      setChannels([]);
      reload();
    } catch (e) {
      toast((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_1.2fr]">
      <section className="rounded-xl border border-border bg-surface p-4">
        <h2 className="font-semibold">Invite someone</h2>
        <p className="mt-0.5 text-sm text-muted">They join this workspace when they sign up or sign in with this email (verified).</p>
        <div className="mt-3 space-y-3">
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@company.com" aria-label="Email" className="h-10 w-full rounded-lg border border-border px-3 text-sm outline-none focus:border-brand" />
          <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Role">
            {(["member", "guest", "admin"] as const).map((r) => (
              <button key={r} role="radio" aria-checked={role === r} onClick={() => setRole(r)} className={clsx("h-9 rounded-lg border text-sm", role === r ? "border-brand bg-brand-soft font-semibold text-brand" : "border-border hover:bg-hover")}>
                {ROLE_LABEL[r]}
              </button>
            ))}
          </div>
          <p className="text-xs text-muted">
            {role === "guest" ? "Guests (vendors, contractors) see only the channels below. Pick at least one." : role === "admin" ? "Admins can manage people, invites and channels." : "Members can find public channels and chat with anyone in the workspace."}
          </p>
          {(role === "guest" || myChannels.length > 0) && (
            <div>
              <p className="text-sm font-medium">Add to channels {role !== "guest" && <span className="font-normal text-muted">(optional)</span>}</p>
              <div className="mt-1 max-h-40 space-y-1 overflow-y-auto">
                {myChannels.length === 0 && <p className="text-xs text-muted">You aren&rsquo;t in any channels yet.</p>}
                {myChannels.map((c) => (
                  <label key={c.id} className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1 text-sm hover:bg-hover">
                    <input type="checkbox" checked={channels.includes(c.id)} onChange={(e) => setChannels((s) => (e.target.checked ? [...s, c.id] : s.filter((x) => x !== c.id)))} />
                    {c.visibility === "private" ? <Lock size={13} className="text-muted" /> : <Hash size={13} className="text-muted" />} {c.name}
                  </label>
                ))}
              </div>
            </div>
          )}
          <button onClick={send} disabled={busy || !email.includes("@") || (role === "guest" && !channels.length)} className="flex h-9 w-full items-center justify-center gap-2 rounded-lg bg-brand text-sm font-semibold text-white hover:bg-brand-strong disabled:opacity-40">
            {busy && <Loader2 size={14} className="animate-spin" />} Create invite
          </button>
          <div className="flex items-center gap-2 rounded-lg bg-canvas px-3 py-2 text-xs text-muted">
            <span className="min-w-0 flex-1 truncate">Share: {url}</span>
            <button onClick={() => navigator.clipboard?.writeText(url).then(() => toast("Link copied."))} className="flex items-center gap-1 font-semibold text-brand">
              <Copy size={12} /> Copy
            </button>
          </div>
        </div>
      </section>
      <section className="rounded-xl border border-border bg-surface">
        <h2 className="border-b border-border px-4 py-3 font-semibold">Invites</h2>
        {!rows ? (
          <Loading />
        ) : rows.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-muted">No invites yet.</p>
        ) : (
          <ul>
            {rows.map((i) => (
              <li key={i.email} className="flex items-center gap-3 border-b border-border px-4 py-2.5 text-sm last:border-b-0">
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium">{i.email}</div>
                  <div className="truncate text-xs text-muted">
                    {ROLE_LABEL[i.org_role]} · by {i.invited_by}
                    {i.channels.length > 0 && ` · ${i.channels.join(", ")}`}
                  </div>
                </div>
                <span className={clsx("rounded-full px-2 py-0.5 text-[11px] font-semibold", i.status === "pending" ? "bg-saffron-soft text-saffron-ink" : "bg-moss-soft text-moss")}>{i.status}</span>
                {i.status === "pending" && (
                  <button
                    onClick={async () => {
                      await api(`/api/admin/invites/${encodeURIComponent(i.email)}`, { method: "DELETE" }).catch((e) => toast((e as Error).message));
                      reload();
                    }}
                    className="flex h-8 w-8 items-center justify-center rounded-md text-muted hover:bg-rust-soft hover:text-rust"
                    aria-label={`Revoke invite for ${i.email}`}
                  >
                    <Trash2 size={14} />
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
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
  const [busy, setBusy] = useState(false);
  async function save() {
    setBusy(true);
    try {
      await api("/api/admin/org", {
        method: "PATCH",
        json: { name, domains: domains.split(/[,\s]+/).filter(Boolean), channel_creation: creation, ai_enabled: ai },
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
