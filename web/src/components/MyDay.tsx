"use client";

import { ArrowRight, AtSign, BellRing, CalendarDays, CheckCircle2, FileSearch, FileText, Hand, ListTodo, Mail, NotebookPen, Plus, Radar, ShieldCheck, Sparkles, Sun, Users, Video, X, Gavel } from "@/lib/icons";
import { api } from "@/lib/api";
import { useEffect, useState } from "react";
import { enablePush, pushState, type PushState } from "@/lib/push";
import { dueLabel, toDate } from "@/lib/format";
import type { Notice, Task } from "@/lib/types";
import { useWs } from "./ctx";
import { NeedsYou } from "./NeedsYou";
import { TourCard } from "./ProductTour";
import { TaskRow } from "./Tasks";

const LIVE = ["open", "in_progress", "blocked"];

function Card({ icon: Icon, title, count, action, children }: { icon: typeof Sun; title: string; count?: number; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="flex min-h-0 flex-col rounded-2xl border border-border bg-surface" aria-label={title}>
      <header className="flex items-center gap-2 border-b border-border px-4 py-3">
        <Icon size={16} className="text-muted" aria-hidden />
        <h2 className="flex-1 text-sm font-bold">
          {title} {count ? <span className="ml-1 rounded-full bg-canvas px-1.5 text-[11px] font-semibold text-muted">{count}</span> : null}
        </h2>
        {action}
      </header>
      <div className="min-h-0 flex-1">{children}</div>
    </section>
  );
}

function Empty({ text }: { text: string }) {
  return <p className="px-4 py-6 text-center text-sm text-muted">{text}</p>;
}

/** Start-of-day home: what I owe, what's owed to me, meetings, mentions, and a one-click brief. */
export function MyDayView({ tasks, notices }: { tasks: Task[]; notices: Notice[] }) {
  const { uid, me, account, meetings, events, emails, records, register, users, open, openRef, dialog, newTask, newMeeting, toast } = useWs();
  const guest = account.org_role === "guest";
  const openPlantRecords = Object.values(records).filter((r) => r.status !== "closed");
  const openNcrs = openPlantRecords.filter((r) => r.type === "ncr").length;
  const openDowntime = openPlantRecords.filter((r) => r.type === "downtime").length;
  // Clock captured once per mount (render must stay pure)
  const [{ now, endOfToday }] = useState(() => {
    const d = new Date();
    const n = d.getTime();
    d.setHours(23, 59, 59, 999);
    return { now: n, endOfToday: d.getTime() };
  });

  const mine = tasks.filter((t) => (t.assignee ?? t.owner) === uid && LIVE.includes(t.status));
  const dueToday = mine.filter((t) => t.due_at && t.due_at.toMillis() <= endOfToday).sort((a, b) => a.due_at!.toMillis() - b.due_at!.toMillis());
  const nextUp = mine.filter((t) => !dueToday.includes(t)).sort((a, b) => (a.due_at?.toMillis() ?? Infinity) - (b.due_at?.toMillis() ?? Infinity)).slice(0, 3);
  const owed = tasks
    .filter((t) => (t.creator === uid || t.watchers?.includes(uid)) && (t.assignee ?? t.owner) !== uid && LIVE.includes(t.status))
    .sort((a, b) => (a.due_at?.toMillis() ?? Infinity) - (b.due_at?.toMillis() ?? Infinity));
  const mentions = notices.filter((n) => n.kind === "mention").slice(0, 5);
  const recentMeetings = Object.values(meetings)
    .sort((a, b) => (b.held_at?.toMillis() ?? 0) - (a.held_at?.toMillis() ?? 0))
    .slice(0, 4);

  const startOfToday = endOfToday - 24 * 60 * 60 * 1000 + 1;
  const today = events
    .filter((e) => e.start && e.start.toMillis() >= startOfToday && e.start.toMillis() <= endOfToday)
    .sort((a, b) => a.start!.toMillis() - b.start!.toMillis());
  const emailPromises = Object.values(emails)
    .filter((e) => e.promise && !e.task_id && !e.dismissed)
    .sort((a, b) => (b.ts?.toMillis() ?? 0) - (a.ts?.toMillis() ?? 0));
  const clock = (t?: { toDate(): Date }) => t?.toDate().toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata", hour: "numeric", minute: "2-digit" });
  const names = (e: (typeof events)[number]) => [...e.attendee_uids.filter((a) => a !== uid).map((a) => users[a]?.name).filter(Boolean), ...e.attendee_emails.filter((m) => !e.attendee_uids.some((u) => users[u]?.email === m) && m !== me?.email)].slice(0, 5);

  async function emailAct(id: string, action: "track" | "dismiss") {
    try {
      await api(`/api/connectors/items/${encodeURIComponent(id)}/${action}`, { method: "POST" });
      if (action === "track") toast("Tracking it as a task.");
    } catch (e) {
      toast((e as Error).message);
    }
  }

  const [push, setPush] = useState<PushState | null>(null);
  useEffect(() => {
    let dismissed = false;
    try {
      dismissed = localStorage.getItem("saathi.pushPrompt") === "dismissed";
    } catch {}
    if (!dismissed) pushState().then(setPush);
  }, []);
  const hidePush = () => {
    setPush(null);
    try {
      localStorage.setItem("saathi.pushPrompt", "dismissed");
    } catch {}
  };

  const first = me?.name.split(" ")[0] ?? "";
  const hour = +new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata", hour: "numeric", hour12: false });
  const greet = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  const overdue = mine.filter((t) => t.due_at && t.due_at.toMillis() < now).length;

  return (
    <section className="scrollbar-thin flex min-h-0 flex-1 flex-col overflow-y-auto bg-canvas/70" aria-label="My Day">
      <div className="mx-auto w-full max-w-6xl px-4 py-6 lg:px-8">
        {/* Redesigned Dark Blueprint Plant Command Banner */}
        <div className="blueprint-grid overflow-hidden rounded-3xl border border-slate-800 p-6 text-white shadow-lg sm:p-7">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-400/30 bg-emerald-400/15 px-2.5 py-0.5 font-mono text-[10.5px] font-semibold text-emerald-300">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                  {account.org.name.toUpperCase()}
                </span>
                <span className="font-mono text-xs text-slate-300">
                  {new Date().toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata", weekday: "short", day: "numeric", month: "short" })}
                </span>
                {me?.role && <span className="rounded-md bg-white/10 px-2 py-0.5 font-mono text-[11px] text-mint">{me.role}</span>}
              </div>
              <h1 className="mt-2.5 font-display text-3xl font-bold tracking-tight text-white sm:text-4xl">
                {greet}, {first}.
              </h1>
              <p className="mt-1 text-sm text-slate-300">
                {dueToday.length ? `${dueToday.length} due today` : "Nothing due today"}
                {overdue ? ` · ${overdue} overdue` : ""} · {owed.length} owed to you · {mentions.filter((m) => !m.read).length} unread mentions
              </p>
            </div>

            {!guest && (
              <div className="grid grid-cols-3 gap-2 sm:gap-3">
                <button
                  onClick={() => open({ kind: "quality" })}
                  className="rounded-2xl border border-white/15 bg-white/10 px-3.5 py-2.5 text-left backdrop-blur transition hover:border-mint/50 hover:bg-white/15"
                >
                  <p className="font-mono text-[10px] font-semibold uppercase tracking-wider text-slate-300">Open NCRs</p>
                  <p className="mt-0.5 font-display text-2xl font-bold text-white">{openNcrs}</p>
                </button>
                <button
                  onClick={() => open({ kind: "quality" })}
                  className="rounded-2xl border border-white/15 bg-white/10 px-3.5 py-2.5 text-left backdrop-blur transition hover:border-mint/50 hover:bg-white/15"
                >
                  <p className="font-mono text-[10px] font-semibold uppercase tracking-wider text-slate-300">Machines Down</p>
                  <p className="mt-0.5 font-display text-2xl font-bold text-amber-300">{openDowntime}</p>
                </button>
                <button
                  onClick={() => open({ kind: "quality", tab: "drawings" })}
                  className="rounded-2xl border border-white/15 bg-white/10 px-3.5 py-2.5 text-left backdrop-blur transition hover:border-mint/50 hover:bg-white/15"
                >
                  <p className="font-mono text-[10px] font-semibold uppercase tracking-wider text-slate-300">Drawings</p>
                  <p className="mt-0.5 font-display text-2xl font-bold text-emerald-300">{register.length}</p>
                </button>
              </div>
            )}
          </div>

          <div className="mt-5 flex flex-wrap gap-2 border-t border-white/15 pt-4">
            <button
              onClick={() => open({ kind: "assistant", prompt: "What did I miss in the last 24 hours?" })}
              data-tour="brief-me"
              className="flex h-9.5 items-center gap-2 rounded-xl bg-brand px-4 text-xs font-semibold text-white shadow-sm transition hover:bg-brand-strong sm:text-sm"
            >
              <Radar size={15} className="text-white" /> Brief me
            </button>
            {!guest && (
              <button
                onClick={() => open({ kind: "research" })}
                className="flex h-9.5 items-center gap-2 rounded-xl border border-mint/40 bg-white/10 px-3.5 text-xs font-semibold text-white transition hover:bg-white/20 sm:text-sm"
              >
                <FileSearch size={15} className="text-mint" /> Saathi Research
              </button>
            )}
            {account.org.settings.voice_us && !guest && (
              <button
                onClick={() => dialog("voice")}
                className="flex h-9.5 items-center gap-2 rounded-xl border border-white/20 bg-white/10 px-3.5 text-xs font-semibold text-white transition hover:bg-white/20 sm:text-sm"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden>
                  <rect x="9" y="3" width="6" height="11" rx="3" />
                  <path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
                </svg>
                Talk to Saathi
              </button>
            )}
            {!guest && (
              <button
                onClick={() => dialog("report")}
                className="flex h-9.5 items-center gap-2 rounded-xl border border-amber-400/40 bg-amber-400/15 px-3.5 text-xs font-semibold text-amber-200 transition hover:bg-amber-400/25 sm:text-sm"
              >
                <Gavel size={15} /> Report issue
              </button>
            )}
            <button
              onClick={() => newTask()}
              className="flex h-9.5 items-center gap-1.5 rounded-xl border border-white/15 bg-white/5 px-3 text-xs font-semibold text-slate-200 transition hover:bg-white/15 sm:text-sm"
            >
              <Plus size={15} /> Task
            </button>
            <button
              onClick={() => dialog("meeting-new")}
              className="flex h-9.5 items-center gap-1.5 rounded-xl border border-white/15 bg-white/5 px-3 text-xs font-semibold text-slate-200 transition hover:bg-white/15 sm:text-sm"
            >
              <Users size={15} /> Meeting notes
            </button>
          </div>
        </div>

        {push === "install" && (
          <div className="mt-5 flex flex-wrap items-center gap-3 rounded-xl border border-brand/30 bg-brand-soft/60 px-4 py-3 text-sm">
            <BellRing size={18} className="text-brand" aria-hidden />
            <span className="min-w-0 flex-1">
              <b>Get notifications on your iPhone:</b> tap <b>Share</b> → <b>Add to Home Screen</b>, then open Saathi from your Home Screen.
            </span>
            <button onClick={hidePush} className="text-xs font-medium text-muted hover:underline">
              Got it
            </button>
          </div>
        )}
        {push === "off" && (
          <div className="mt-5 flex flex-wrap items-center gap-3 rounded-xl border border-brand/30 bg-brand-soft/60 px-4 py-3 text-sm">
            <BellRing size={18} className="text-brand" aria-hidden />
            <span className="min-w-0 flex-1">
              <b>Don&rsquo;t miss mentions and replies.</b> Turn on push notifications for this device.
            </span>
            <button
              onClick={async () => {
                const s = await enablePush().catch(() => "off" as const);
                toast(s === "on" ? "Push notifications are on." : s === "denied" ? "Blocked by the browser. Allow notifications in site settings." : "Notifications not enabled.");
                hidePush();
              }}
              className="h-8 rounded-lg bg-brand px-3 text-xs font-semibold text-white hover:bg-brand-strong"
            >
              Turn on
            </button>
            <button onClick={hidePush} className="text-xs font-medium text-muted hover:underline">
              Not now
            </button>
          </div>
        )}

        <TourCard />

        <div className="mt-6">
          <NeedsYou tasks={tasks} notices={notices} />
        </div>

        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <Card icon={ListTodo} title="Coming up next" count={nextUp.length || dueToday.length} action={<GoLink onClick={() => open({ kind: "tasks" })} />}>
            {nextUp.length > 0 ? (
              nextUp.map((t) => <TaskRow key={t.id} t={t} compact />)
            ) : dueToday.length > 0 ? (
              dueToday.slice(0, 4).map((t) => <TaskRow key={t.id} t={t} compact />)
            ) : (
              <Empty text="No upcoming tasks scheduled after today. 🎉" />
            )}
          </Card>

          <Card icon={Hand} title="Owed to you" count={owed.length} action={<GoLink onClick={() => open({ kind: "tasks" })} />}>
            {owed.length ? owed.slice(0, 6).map((t) => <TaskRow key={t.id} t={t} perspective="delegated" compact />) : <Empty text="Nobody owes you anything right now. Assign work from any message or meeting." />}
          </Card>

          {!guest && (
            <Card icon={ShieldCheck} title="Plant & quality pulse" action={<GoLink onClick={() => open({ kind: "quality" })} />}>
              <div className="space-y-3 p-4">
                <div className="grid grid-cols-3 gap-2.5 text-center">
                  <button
                    onClick={() => open({ kind: "quality" })}
                    className="rounded-xl border border-border bg-canvas/60 px-2.5 py-2.5 transition hover:border-brand hover:bg-canvas"
                  >
                    <p className="font-display text-2xl leading-none text-ink">{openNcrs}</p>
                    <p className="mt-1 text-[11px] font-medium text-muted">Open NCRs</p>
                  </button>
                  <button
                    onClick={() => open({ kind: "quality" })}
                    className="rounded-xl border border-border bg-canvas/60 px-2.5 py-2.5 transition hover:border-brand hover:bg-canvas"
                  >
                    <p className="font-display text-2xl leading-none text-ink">{openDowntime}</p>
                    <p className="mt-1 text-[11px] font-medium text-muted">Machines down</p>
                  </button>
                  <button
                    onClick={() => open({ kind: "quality", tab: "drawings" })}
                    className="rounded-xl border border-border bg-canvas/60 px-2.5 py-2.5 transition hover:border-brand hover:bg-canvas"
                  >
                    <p className="font-display text-2xl leading-none text-ink">{register.length}</p>
                    <p className="mt-1 text-[11px] font-medium text-muted">Controlled dwgs</p>
                  </button>
                </div>
                <div className="flex flex-wrap items-center gap-2 pt-1">
                  <button
                    onClick={() => open({ kind: "research" })}
                    className="inline-flex h-8 flex-1 items-center justify-center gap-1.5 rounded-lg bg-brand px-3 text-xs font-semibold text-white transition hover:bg-brand-strong"
                  >
                    <FileSearch size={13} /> Run inspection readiness check
                  </button>
                  <button
                    onClick={() => open({ kind: "quality", tab: "standards" })}
                    className="inline-flex h-8 items-center justify-center gap-1.5 rounded-lg border border-border bg-surface px-3 text-xs font-semibold text-ink transition hover:bg-hover"
                  >
                    <ShieldCheck size={13} className="text-brand" /> Spec Check
                  </button>
                </div>
              </div>
            </Card>
          )}

          {events.length > 0 && (
            <Card icon={CalendarDays} title="Today's calendar" count={today.length}>
              {today.length ? (
                <ul>
                  {today.map((e) => {
                    const done = e.end && e.end.toMillis() < now;
                    const live = e.start && e.end && e.start.toMillis() <= now && e.end.toMillis() > now;
                    const who = names(e);
                    return (
                      <li key={e.id} className={`flex gap-3 border-b border-border px-4 py-2.5 last:border-b-0 ${done ? "opacity-60" : ""}`}>
                        <div className="w-16 shrink-0 text-xs">
                          <div className="font-semibold">{clock(e.start)}</div>
                          <div className="text-muted">{clock(e.end)}</div>
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 text-sm font-semibold">
                            {live && <span className="rounded bg-rust px-1.5 text-[10px] font-bold text-white">NOW</span>}
                            <span className="truncate">{e.title}</span>
                          </div>
                          {who.length > 0 && <div className="truncate text-xs text-muted">with {who.join(", ")}</div>}
                          {!e.private && (
                            <div className="mt-1.5 flex flex-wrap gap-1.5">
                              {!done && (
                                <button
                                  onClick={() => open({ kind: "assistant", prompt: `Prep me for my meeting "${e.title}" at ${clock(e.start)} today${who.length ? ` with ${who.join(", ")}` : ""}.` })}
                                  className="flex h-7 items-center gap-1 rounded-md bg-brand px-2 text-[11px] font-semibold text-white hover:bg-brand-strong"
                                >
                                  <Sparkles size={12} className="text-white" /> Prep me
                                </button>
                              )}
                              {e.meet_url && !done && (
                                <a href={e.meet_url} target="_blank" rel="noreferrer" className="flex h-7 items-center gap-1 rounded-md border border-border px-2 text-[11px] font-semibold hover:bg-hover">
                                  <Video size={12} /> Join
                                </a>
                              )}
                              <button
                                onClick={() => newMeeting({ title: e.title, when: e.start?.toDate(), attendees: e.attendee_uids })}
                                className="flex h-7 items-center gap-1 rounded-md border border-border px-2 text-[11px] font-semibold hover:bg-hover"
                              >
                                <NotebookPen size={12} /> {done ? "Add notes" : "Notes"}
                              </button>
                            </div>
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <Empty text="No meetings today." />
              )}
            </Card>
          )}

          {emailPromises.length > 0 && (
            <Card icon={Mail} title="Promises in your email" count={emailPromises.length}>
              <ul>
                {emailPromises.slice(0, 5).map((e) => (
                  <li key={e.id} className="border-b border-border px-4 py-2.5 last:border-b-0">
                    <div className="text-sm">
                      <b>{e.promise!.committer}</b> — {e.promise!.action}
                    </div>
                    <div className="mt-0.5 truncate text-xs text-muted">
                      {e.promise!.due_at && <span className="font-mono">due {dueLabel(e.promise!.due_at)} · </span>}
                      <a href={e.url} target="_blank" rel="noreferrer" className="hover:underline">
                        {e.from_name}: {e.subject}
                      </a>
                    </div>
                    <div className="mt-1.5 flex gap-1.5">
                      <button onClick={() => emailAct(e.id, "track")} className="h-7 rounded-md bg-plum px-2.5 text-[11px] font-semibold text-white hover:brightness-110">
                        Track
                      </button>
                      <button onClick={() => emailAct(e.id, "dismiss")} className="flex h-7 w-7 items-center justify-center rounded-md text-muted hover:bg-hover" aria-label="Dismiss">
                        <X size={13} />
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            </Card>
          )}

          <Card icon={CalendarDays} title="Meeting notes" count={recentMeetings.length} action={<button onClick={() => dialog("meeting-new")} className="text-xs font-semibold text-brand hover:underline">+ Add notes</button>}>
            {recentMeetings.length ? (
              <ul>
                {recentMeetings.map((m) => {
                  const open_ = m.action_items.filter((a) => !a.task_id).length;
                  return (
                    <li key={m.id}>
                      <button onClick={() => open({ kind: "meeting", id: m.id })} className="flex w-full items-center gap-3 border-b border-border px-4 py-2.5 text-left last:border-b-0 hover:bg-canvas/60">
                        <span className="flex h-9 w-9 shrink-0 flex-col items-center justify-center rounded-lg bg-brand-soft text-brand" aria-hidden>
                          <span className="text-[9px] font-bold uppercase leading-none">{toDate(m.held_at)?.toLocaleDateString("en-IN", { month: "short" })}</span>
                          <span className="text-sm font-bold leading-none">{toDate(m.held_at)?.getDate()}</span>
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-semibold">{m.title}</span>
                          <span className="block truncate text-xs text-muted">
                            {m.participants.length} people · {m.decisions.length} decisions · {open_ ? `${open_} action items to assign` : "all action items tracked"}
                          </span>
                        </span>
                        <ArrowRight size={15} className="text-muted" aria-hidden />
                      </button>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <div className="px-4 py-6 text-center text-sm text-muted">
                <FileText size={22} className="mx-auto mb-2" aria-hidden />
                Paste notes or upload a transcript from Meet, Teams or Zoom. Saathi pulls out decisions and action items with owners.
                {!events.length && (
                  <button onClick={() => dialog("settings")} className="mt-2 text-xs font-semibold text-brand hover:underline">
                    Connect Google Calendar in Settings → Connected apps
                  </button>
                )}
              </div>
            )}
          </Card>

          <Card icon={AtSign} title="Mentions" count={mentions.filter((m) => !m.read).length} action={<GoLink onClick={() => open({ kind: "activity" })} />}>
            {mentions.length ? (
              <ul>
                {mentions.map((n) => (
                  <li key={n.id}>
                    <button onClick={() => n.source_ref && openRef(n.source_ref)} className="flex w-full flex-col border-b border-border px-4 py-2.5 text-left last:border-b-0 hover:bg-canvas/60">
                      <span className="flex items-center gap-1.5 text-xs font-semibold">
                        {!n.read && <span className="h-1.5 w-1.5 rounded-full bg-brand" aria-label="Unread" />} {n.title}
                      </span>
                      <span className="line-clamp-1 text-sm text-ink/80">{n.body}</span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <Empty text="No mentions yet." />
            )}
          </Card>
        </div>

        {!mine.length && !owed.length && !recentMeetings.length && (
          <p className="mt-6 flex items-center justify-center gap-2 text-sm text-muted">
            <CheckCircle2 size={16} className="text-moss" /> Tip: in any chat, hover a message → ⋯ → Create task, or type @ to mention a colleague.
          </p>
        )}
      </div>
    </section>
  );
}

function GoLink({ onClick }: { onClick: () => void }) {
  return (
    <button onClick={onClick} className="flex items-center gap-1 text-xs font-semibold text-brand hover:underline">
      View all <ArrowRight size={12} />
    </button>
  );
}
