"use client";

import clsx from "clsx";
import { useMemo, useState } from "react";
import { api } from "@/lib/api";
import { dueLabel, timeShort, toDate } from "@/lib/format";
import { CalendarDays, Check, DriveIcon, FileText, Handshake, Mail, NotebookPen, RefreshCw, Search, Sparkles, Video, X } from "@/lib/icons";
import type { CalendarEvent, DriveFile, EmailItem } from "@/lib/types";
import { useWs } from "./ctx";

function Header({ icon: Icon, title, sub, children }: { icon: typeof Mail; title: string; sub: string; children?: React.ReactNode }) {
  return (
    <header className="flex h-14 shrink-0 items-center gap-3 border-b border-border px-4 lg:h-12 lg:px-6">
      <Icon size={18} className="text-muted" aria-hidden />
      <div className="min-w-0 flex-1">
        <h1 className="text-[15px] font-bold leading-tight">{title}</h1>
        <p className="hidden truncate text-xs text-muted sm:block">{sub}</p>
      </div>
      {children}
    </header>
  );
}

function SyncButton() {
  const { toast } = useWs();
  const [busy, setBusy] = useState(false);
  return (
    <button
      onClick={async () => {
        setBusy(true);
        try {
          await api("/api/connectors/google/sync", { method: "POST" });
          toast("Syncing with Google… new items appear in a minute.");
        } catch (e) {
          toast((e as Error).message);
        } finally {
          setTimeout(() => setBusy(false), 4000);
        }
      }}
      className="flex h-9 items-center gap-1.5 rounded-lg border border-border px-3 text-[13px] font-semibold hover:bg-hover"
      disabled={busy}
    >
      <RefreshCw size={14} className={busy ? "animate-spin" : ""} /> Sync
    </button>
  );
}

function SearchBox({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <div className="relative w-full max-w-sm">
      <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" aria-hidden />
      <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} aria-label={placeholder} className="h-9 w-full rounded-lg border border-border bg-surface pl-8 pr-3 text-sm outline-none focus:border-brand" />
    </div>
  );
}

function Empty({ icon: Icon, title, text }: { icon: typeof Mail; title: string; text: string }) {
  return (
    <div className="mt-16 text-center">
      <Icon size={28} className="mx-auto text-muted" aria-hidden />
      <p className="mt-2 font-semibold">{title}</p>
      <p className="mt-1 text-sm text-muted">{text}</p>
    </div>
  );
}

/* ---------------- Gmail ---------------- */

export function GmailView() {
  const { emails, open, toast } = useWs();
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<"all" | "promises">("all");
  const [busy, setBusy] = useState<string | null>(null);
  const list = useMemo(() => {
    const t = q.trim().toLowerCase();
    return Object.values(emails)
      .filter((e) => filter === "all" || (e.promise && !e.dismissed))
      .filter((e) => !t || `${e.subject} ${e.from_name} ${e.snippet}`.toLowerCase().includes(t))
      .sort((a, b) => (b.ts?.toMillis() ?? 0) - (a.ts?.toMillis() ?? 0));
  }, [emails, q, filter]);
  const promiseCount = Object.values(emails).filter((e) => e.promise && !e.task_id && !e.dismissed).length;

  async function act(e: EmailItem, action: "track" | "dismiss") {
    setBusy(e.id);
    try {
      await api(`/api/connectors/items/${encodeURIComponent(e.id)}/${action}`, { method: "POST" });
      if (action === "track") toast("Tracking it as a task.");
    } catch (err) {
      toast((err as Error).message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="flex min-h-0 flex-1 flex-col" aria-label="Gmail">
      <Header icon={Mail} title="Gmail" sub="Your last 14 days of Inbox and Sent mail, read-only. Only you can see this.">
        <SyncButton />
      </Header>
      <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-2 lg:px-6">
        <SearchBox value={q} onChange={setQ} placeholder="Search your email" />
        {(["all", "promises"] as const).map((f) => (
          <button key={f} onClick={() => setFilter(f)} aria-pressed={filter === f} className={clsx("h-8 rounded-full border px-3 text-xs font-medium", filter === f ? "border-brand bg-brand-soft text-brand" : "border-border text-muted hover:text-ink")}>
            {f === "all" ? "All mail" : `Promises${promiseCount ? ` · ${promiseCount}` : ""}`}
          </button>
        ))}
      </div>
      <div className="scrollbar-thin flex-1 overflow-y-auto bg-canvas/50 px-4 py-4 lg:px-8">
        <div className="mx-auto max-w-4xl">
          {list.length === 0 ? (
            <Empty icon={Mail} title={filter === "promises" ? "No promises found in your email" : "No email synced yet"} text={filter === "promises" ? "When someone commits to something by email, it shows up here." : "Click Sync, or wait for the next automatic sync (every 10 minutes)."} />
          ) : (
            <ul className="overflow-hidden rounded-xl border border-border bg-surface">
              {list.map((e) => (
                <li key={e.id} className="group border-b border-border px-4 py-3 last:border-b-0 hover:bg-canvas/60">
                  <div className="flex items-baseline gap-3">
                    <span className="w-40 shrink-0 truncate text-sm font-semibold">{e.from_name}</span>
                    <a href={e.url} target="_blank" rel="noreferrer" className="min-w-0 flex-1 truncate text-sm hover:underline">
                      <span className="font-medium">{e.subject}</span> <span className="text-muted">— {e.snippet}</span>
                    </a>
                    <span className="shrink-0 text-xs text-muted">{timeShort(e.ts)}</span>
                  </div>
                  {e.promise && !e.dismissed && (
                    <div className="mt-2 flex flex-wrap items-center gap-2 rounded-lg border border-plum/20 bg-plum-soft px-3 py-1.5 text-xs text-plum">
                      <Handshake size={14} aria-hidden />
                      <span className="min-w-0 flex-1">
                        <b>Promise</b> · {e.promise.committer} — {e.promise.action}
                        {e.promise.due_at && <span className="font-mono"> · due {dueLabel(e.promise.due_at)}</span>}
                      </span>
                      {e.task_id ? (
                        <span className="flex items-center gap-1 font-semibold text-moss">
                          <Check size={13} /> Tracking
                        </span>
                      ) : (
                        <>
                          <button onClick={() => act(e, "track")} disabled={busy === e.id} className="h-7 rounded-md bg-plum px-2.5 font-semibold text-white hover:brightness-110">
                            Track
                          </button>
                          <button onClick={() => act(e, "dismiss")} disabled={busy === e.id} className="flex h-7 w-7 items-center justify-center rounded-md hover:bg-white/60" aria-label="Dismiss">
                            <X size={13} />
                          </button>
                        </>
                      )}
                    </div>
                  )}
                  <div className="mt-1.5 hidden gap-3 text-xs group-hover:flex group-focus-within:flex">
                    <button onClick={() => open({ kind: "assistant", prompt: `Summarise the email "${e.subject}" from ${e.from_name} and tell me if I need to do anything.` })} className="flex items-center gap-1 font-semibold text-brand hover:underline">
                      <Sparkles size={12} /> Ask Saathi
                    </button>
                    <a href={e.url} target="_blank" rel="noreferrer" className="font-semibold text-muted hover:underline">
                      Open in Gmail
                    </a>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}

/* ---------------- Calendar ---------------- */

export function CalendarView() {
  const { uid, users, me, events, open, newMeeting } = useWs();
  const [now] = useState(() => Date.now());
  const days = useMemo(() => {
    const upcoming = events
      .filter((e) => e.end && e.end.toMillis() > now - 12 * 3600_000)
      .sort((a, b) => (a.start?.toMillis() ?? 0) - (b.start?.toMillis() ?? 0));
    const by = new Map<string, CalendarEvent[]>();
    for (const e of upcoming) {
      const d = toDate(e.start)!;
      const key = d.toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata", weekday: "long", day: "numeric", month: "long" });
      by.set(key, [...(by.get(key) ?? []), e]);
    }
    return [...by.entries()];
  }, [events, now]);
  const clock = (t?: { toDate(): Date }) => t?.toDate().toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata", hour: "numeric", minute: "2-digit" });
  const who = (e: CalendarEvent) =>
    [...e.attendee_uids.filter((a) => a !== uid).map((a) => users[a]?.name).filter(Boolean), ...e.attendee_emails.filter((m) => m !== me?.email && !e.attendee_uids.some((u) => users[u]?.email === m))].slice(0, 6) as string[];

  return (
    <section className="flex min-h-0 flex-1 flex-col" aria-label="Calendar">
      <Header icon={CalendarDays} title="Calendar" sub="Your Google Calendar for the next two weeks, read-only. Colleagues only see when you're busy, never titles.">
        <SyncButton />
      </Header>
      <div className="scrollbar-thin flex-1 overflow-y-auto bg-canvas/50 px-4 py-5 lg:px-8">
        <div className="mx-auto max-w-4xl space-y-5">
          {days.length === 0 && <Empty icon={CalendarDays} title="Nothing scheduled" text="No events in the next two weeks." />}
          {days.map(([day, list]) => (
            <section key={day} aria-label={day}>
              <h2 className="mb-1.5 px-1 text-xs font-semibold uppercase tracking-wide text-muted">{day}</h2>
              <ul className="overflow-hidden rounded-xl border border-border bg-surface">
                {list.map((e) => {
                  const done = !!e.end && e.end.toMillis() < now;
                  const live = !!e.start && !!e.end && e.start.toMillis() <= now && e.end.toMillis() > now;
                  const people = who(e);
                  return (
                    <li key={e.id} className={clsx("flex gap-4 border-b border-border px-4 py-3 last:border-b-0", done && "opacity-60")}>
                      <div className="w-20 shrink-0 text-xs">
                        <div className="font-semibold">{clock(e.start)}</div>
                        <div className="text-muted">{clock(e.end)}</div>
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 text-sm font-semibold">
                          {live && <span className="rounded bg-rust px-1.5 text-[10px] font-bold text-white">NOW</span>}
                          <span className="truncate">{e.title}</span>
                        </div>
                        {(people.length > 0 || e.location) && (
                          <div className="truncate text-xs text-muted">
                            {people.length > 0 && `with ${people.join(", ")}`}
                            {e.location && ` · ${e.location}`}
                          </div>
                        )}
                        {!e.private && (
                          <div className="mt-2 flex flex-wrap gap-1.5">
                            {!done && (
                              <button
                                onClick={() => open({ kind: "assistant", prompt: `Prep me for my meeting "${e.title}" on ${day} at ${clock(e.start)}${people.length ? ` with ${people.join(", ")}` : ""}.` })}
                                className="flex h-7 items-center gap-1 rounded-md bg-ink px-2 text-[11px] font-semibold text-white"
                              >
                                <Sparkles size={12} className="text-saffron" /> Prep me
                              </button>
                            )}
                            {e.meet_url && !done && (
                              <a href={e.meet_url} target="_blank" rel="noreferrer" className="flex h-7 items-center gap-1 rounded-md border border-border px-2 text-[11px] font-semibold hover:bg-hover">
                                <Video size={12} /> Join
                              </a>
                            )}
                            <button onClick={() => newMeeting({ title: e.title, when: e.start?.toDate(), attendees: e.attendee_uids })} className="flex h-7 items-center gap-1 rounded-md border border-border px-2 text-[11px] font-semibold hover:bg-hover">
                              <NotebookPen size={12} /> {done ? "Add notes" : "Notes"}
                            </button>
                            {e.html_link && (
                              <a href={e.html_link} target="_blank" rel="noreferrer" className="flex h-7 items-center rounded-md px-2 text-[11px] font-semibold text-muted hover:underline">
                                Open in Google Calendar
                              </a>
                            )}
                          </div>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ---------------- Drive ---------------- */

const KIND: Record<string, string> = {
  "application/vnd.google-apps.document": "Doc",
  "application/vnd.google-apps.spreadsheet": "Sheet",
  "application/vnd.google-apps.presentation": "Slides",
  "application/pdf": "PDF",
  "text/plain": "Text",
  "text/csv": "CSV",
};

export function DriveView() {
  const { driveFiles, open } = useWs();
  const [q, setQ] = useState("");
  const list = useMemo(() => {
    const t = q.trim().toLowerCase();
    return Object.values(driveFiles)
      .filter((f) => !t || `${f.name} ${f.owner} ${f.snippet ?? ""}`.toLowerCase().includes(t))
      .sort((a, b) => (b.ts?.toMillis() ?? 0) - (a.ts?.toMillis() ?? 0));
  }, [driveFiles, q]);

  return (
    <section className="flex min-h-0 flex-1 flex-col" aria-label="Google Drive">
      <Header icon={DriveIcon as typeof Mail} title="Google Drive" sub="Files you own or that were shared with you, changed in the last 60 days. Read-only, only you can see this.">
        <SyncButton />
      </Header>
      <div className="border-b border-border px-4 py-2 lg:px-6">
        <SearchBox value={q} onChange={setQ} placeholder="Search Drive files" />
      </div>
      <div className="scrollbar-thin flex-1 overflow-y-auto bg-canvas/50 px-4 py-4 lg:px-8">
        <div className="mx-auto max-w-4xl">
          {list.length === 0 ? (
            <Empty icon={DriveIcon as typeof Mail} title={q ? `No files match “${q}”` : "No files synced yet"} text={q ? "Try another name." : "Click Sync, or wait for the next automatic sync (every 10 minutes)."} />
          ) : (
            <ul className="overflow-hidden rounded-xl border border-border bg-surface">
              {list.map((f: DriveFile) => (
                <li key={f.id} className="group flex items-start gap-3 border-b border-border px-4 py-3 last:border-b-0 hover:bg-canvas/60">
                  {f.icon ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={f.icon} alt="" width={18} height={18} className="mt-0.5" referrerPolicy="no-referrer" />
                  ) : (
                    <FileText size={18} className="mt-0.5 text-muted" aria-hidden />
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline gap-2">
                      <a href={f.url} target="_blank" rel="noreferrer" className="truncate text-sm font-semibold hover:underline">
                        {f.name}
                      </a>
                      <span className="shrink-0 rounded bg-canvas px-1.5 text-[10px] font-semibold text-muted">{KIND[f.mime] ?? "File"}</span>
                      {f.indexed && (
                        <span className="shrink-0 rounded bg-saffron-soft px-1.5 text-[10px] font-semibold text-saffron-ink" title="Saathi has read this file and can answer questions about it">
                          Saathi can read
                        </span>
                      )}
                    </div>
                    <div className="truncate text-xs text-muted">
                      {f.owner && `Owner ${f.owner} · `}edited {timeShort(f.ts)}
                      {f.modified_by && ` by ${f.modified_by}`}
                    </div>
                    {f.snippet && <p className="mt-1 line-clamp-2 text-xs text-ink/70">{f.snippet}</p>}
                    <div className="mt-1.5 hidden gap-3 text-xs group-hover:flex group-focus-within:flex">
                      {f.indexed && (
                        <button onClick={() => open({ kind: "assistant", prompt: `Summarise the Drive file "${f.name}" and list any action items or decisions in it.` })} className="flex items-center gap-1 font-semibold text-brand hover:underline">
                          <Sparkles size={12} /> Ask Saathi
                        </button>
                      )}
                      <a href={f.url} target="_blank" rel="noreferrer" className="font-semibold text-muted hover:underline">
                        Open in Drive
                      </a>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}
