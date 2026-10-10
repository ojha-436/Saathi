"use client";

import clsx from "clsx";
import { ArrowLeft, CheckCircle2, FileUp, Gavel, Loader2, Send, Sparkles, UserCheck, Users } from "@/lib/icons";
import { useRef, useState } from "react";
import { api } from "@/lib/api";
import { chatTitle, dueLabel, toDate } from "@/lib/format";
import type { Task } from "@/lib/types";
import { UserAvatar } from "./bits";
import { useWs, type MeetingPrefill } from "./ctx";
import { Modal, ModalHeader, PeoplePicker } from "./Dialogs";
import { Markdown } from "./Markdown";

export function NewMeetingDialog({ onClose, prefill = {} }: { onClose: () => void; prefill?: MeetingPrefill }) {
  const { uid, chats, users, open, toast } = useWs();
  const [title, setTitle] = useState(prefill.title ?? "");
  const [when, setWhen] = useState(() => {
    const d = prefill.when ? new Date(prefill.when) : new Date(Date.now() - 60 * 60 * 1000);
    if (!prefill.when) d.setMinutes(0, 0, 0);
    return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  });
  const [attendees, setAttendees] = useState<string[]>((prefill.attendees ?? []).filter((a) => a !== uid));
  const [notes, setNotes] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [chatId, setChatId] = useState("");
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const linkable = Object.values(chats).filter((c) => c.type !== "dm");

  async function submit() {
    if (title.trim().length < 2) return toast("Give the meeting a title.");
    if (!notes.trim() && !file) return toast("Paste the notes or upload a transcript.");
    const form = new FormData();
    form.append("title", title);
    form.append("held_at", new Date(when).toISOString());
    form.append("attendee_ids", attendees.join(","));
    form.append("notes", notes);
    form.append("chat_id", chatId);
    if (file) form.append("file", file);
    setBusy(true);
    try {
      const r = await api<{ id: string }>("/api/meetings", { form });
      toast("Summary ready. Assign the action items.");
      onClose();
      open({ kind: "meeting", id: r.id });
    } catch (e) {
      toast((e as Error).message);
      setBusy(false);
    }
  }

  return (
    <Modal title="Add meeting notes" onClose={onClose} wide>
      <ModalHeader title="Summarise a meeting" sub="Paste notes or upload a transcript (.vtt, .txt, .pdf) from Meet, Teams or Zoom. Saathi extracts decisions and action items with owners." onClose={onClose} />
      <div className="grid gap-4 overflow-y-auto p-5 md:grid-cols-2">
        <div className="space-y-3">
          <label className="block text-sm font-medium">
            Meeting title
            <input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} placeholder="RDSO inspection prep" className="mt-1 h-10 w-full rounded-lg border border-border px-3 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-brand/15" />
          </label>
          <label className="block text-sm font-medium">
            When
            <input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} className="mt-1 h-10 w-full rounded-lg border border-border px-3 text-sm" />
          </label>
          <label className="block text-sm font-medium">
            Linked chat or channel <span className="font-normal text-muted">(optional, to post the summary)</span>
            <select value={chatId} onChange={(e) => setChatId(e.target.value)} className="mt-1 h-10 w-full rounded-lg border border-border bg-surface px-2 text-sm">
              <option value="">None</option>
              {linkable.map((c) => (
                <option key={c.id} value={c.id}>
                  {chatTitle(c, uid, users)}
                </option>
              ))}
            </select>
          </label>
          <div>
            <p className="text-sm font-medium">Attendees</p>
            <div className="mt-1 rounded-lg border border-border p-2">
              <PeoplePicker picked={attendees} setPicked={setAttendees} />
            </div>
          </div>
        </div>
        <div className="flex flex-col">
          <label htmlFor="m-notes" className="text-sm font-medium">
            Notes or transcript
          </label>
          <textarea
            id="m-notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder={"Kavya: RDSO visit confirmed for 20 Oct.\nPrince: I'll send the drawing pack by Friday.\nAmit: weld register kal update kar dunga…"}
            className="mt-1 min-h-56 w-full flex-1 resize-none rounded-lg border border-border px-3 py-2 font-mono text-[13px] outline-none focus:border-brand focus:ring-2 focus:ring-brand/15"
          />
          <input ref={fileRef} type="file" accept=".vtt,.txt,.md,.pdf" className="hidden" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          <button onClick={() => fileRef.current?.click()} className="mt-2 flex h-10 items-center justify-center gap-2 rounded-lg border border-dashed border-[#c5cad3] text-sm text-muted hover:bg-hover hover:text-ink">
            <FileUp size={16} /> {file ? file.name : "Upload transcript"}
          </button>
        </div>
      </div>
      <div className="flex justify-end gap-2 border-t border-border bg-canvas/60 px-5 py-3">
        <button onClick={onClose} className="h-9 rounded-lg px-4 text-sm font-medium text-muted hover:bg-hover">
          Cancel
        </button>
        <button onClick={submit} disabled={busy} className="flex h-9 items-center gap-2 rounded-lg bg-brand px-4 text-sm font-semibold text-white hover:bg-brand-strong disabled:opacity-50">
          {busy ? <Loader2 size={15} className="animate-spin" /> : <Sparkles size={15} />} {busy ? "Summarising…" : "Summarise"}
        </button>
      </div>
    </Modal>
  );
}

export function MeetingView({ id, tasks }: { id: string; tasks: Task[] }) {
  const { uid, meetings, users, chats, open, toast } = useWs();
  const m = meetings[id];
  const [busy, setBusy] = useState<string | null>(null);
  if (!m)
    return (
      <div className="flex flex-1 items-center justify-center text-sm text-muted" role="status">
        <Loader2 size={16} className="mr-2 animate-spin" /> Loading meeting…
      </div>
    );
  const taskById = Object.fromEntries(tasks.map((t) => [t.id, t]));
  const people = m.participants.filter((p) => users[p]);

  async function assign(i: number, assignee?: string) {
    setBusy(`a${i}`);
    try {
      await api(`/api/meetings/${id}/actions/${i}/task`, { json: { assignee: assignee ?? null } });
      toast("Task created and assignee notified.");
    } catch (e) {
      toast((e as Error).message);
    } finally {
      setBusy(null);
    }
  }
  async function post() {
    setBusy("post");
    try {
      await api(`/api/meetings/${id}/post`, { method: "POST" });
      toast("Summary posted.");
      if (m.chat_id) open({ kind: "chat", chatId: m.chat_id });
    } catch (e) {
      toast((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="flex min-h-0 flex-1 flex-col" aria-label={`Meeting: ${m.title}`}>
      <header className="flex h-14 shrink-0 items-center gap-3 border-b border-border px-4 lg:h-12 lg:px-6">
        <button onClick={() => open({ kind: "home" })} className="flex h-9 w-9 items-center justify-center rounded-lg text-muted hover:bg-hover" aria-label="Back to My Day">
          <ArrowLeft size={18} />
        </button>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-[15px] font-bold">{m.title}</h1>
          <p className="truncate text-xs text-muted">
            {toDate(m.held_at)?.toLocaleString("en-IN", { timeZone: "Asia/Kolkata", weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })} · summarised by {m.created_by_name}
          </p>
        </div>
        {m.chat_id && chats[m.chat_id] && (
          <button onClick={post} disabled={busy === "post" || m.posted} className="flex h-9 items-center gap-1.5 rounded-lg border border-border px-3 text-[13px] font-semibold hover:bg-hover disabled:opacity-60">
            {busy === "post" ? <Loader2 size={14} className="animate-spin" /> : m.posted ? <CheckCircle2 size={14} className="text-moss" /> : <Send size={14} />}
            {m.posted ? "Posted" : `Post to ${chatTitle(chats[m.chat_id], uid, users)}`}
          </button>
        )}
      </header>
      <div className="scrollbar-thin flex-1 overflow-y-auto bg-canvas/50 px-4 py-6 lg:px-8">
        <div className="mx-auto grid max-w-5xl gap-4 lg:grid-cols-[1.3fr_1fr]">
          <div className="space-y-4">
            <section className="rounded-2xl border border-border bg-surface p-5">
              <h2 className="flex items-center gap-2 text-sm font-bold">
                <Sparkles size={15} className="text-saffron-ink" /> Summary
              </h2>
              <div className="mt-2 text-sm">
                <Markdown text={m.summary} />
              </div>
            </section>
            <section className="rounded-2xl border border-border bg-surface p-5">
              <h2 className="flex items-center gap-2 text-sm font-bold">
                <Gavel size={15} className="text-moss" /> Decisions
              </h2>
              {m.decisions.length ? (
                <ul className="mt-2 space-y-1.5 text-sm">
                  {m.decisions.map((d) => (
                    <li key={d} className="rounded-lg bg-moss-soft px-3 py-2 text-moss">
                      {d}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-2 text-sm text-muted">No final decisions recorded.</p>
              )}
            </section>
          </div>
          <div className="space-y-4">
            <section className="rounded-2xl border border-border bg-surface">
              <h2 className="flex items-center gap-2 border-b border-border px-5 py-3 text-sm font-bold">
                <UserCheck size={15} className="text-brand" /> Action items
              </h2>
              {m.action_items.length === 0 && <p className="px-5 py-4 text-sm text-muted">No action items found.</p>}
              <ul>
                {m.action_items.map((a, i) => {
                  const t = a.task_id ? taskById[a.task_id] : undefined;
                  const assignee = (t?.assignee ?? a.owner_uid) || "";
                  return (
                    <li key={i} className="border-b border-border px-5 py-3 last:border-b-0">
                      <p className="text-sm font-medium">{a.task}</p>
                      <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs text-muted">
                        {assignee && users[assignee] ? (
                          <span className="flex items-center gap-1">
                            <UserAvatar uid={assignee} size={18} dot={false} clickable={false} /> {users[assignee].name}
                          </span>
                        ) : (
                          <span>Owner: {a.owner || "unknown"}</span>
                        )}
                        {a.due_at && <span className="font-mono">· {dueLabel(a.due_at)}</span>}
                      </div>
                      <div className="mt-2">
                        {a.task_id ? (
                          <span className={clsx("inline-flex items-center gap-1 text-xs font-semibold", t?.status === "done" ? "text-moss" : "text-brand")}>
                            <CheckCircle2 size={13} /> {t?.status === "done" ? "Done" : "Tracked as a task"}
                          </span>
                        ) : (
                          <div className="flex flex-wrap gap-1.5">
                            <button onClick={() => assign(i)} disabled={busy === `a${i}`} className="flex h-8 items-center gap-1 rounded-lg bg-brand px-3 text-xs font-semibold text-white hover:bg-brand-strong disabled:opacity-50">
                              {busy === `a${i}` && <Loader2 size={12} className="animate-spin" />}
                              {a.owner_uid && a.owner_uid !== uid ? `Assign to ${users[a.owner_uid]?.name.split(" ")[0] ?? a.owner}` : "Add to my tasks"}
                            </button>
                            <select
                              aria-label="Assign to someone else"
                              value=""
                              onChange={(e) => e.target.value && assign(i, e.target.value)}
                              className="h-8 rounded-lg border border-border bg-surface px-1.5 text-xs text-muted"
                            >
                              <option value="">Someone else…</option>
                              {Object.values(users)
                                .filter((u) => !u.deactivated)
                                .map((u) => (
                                  <option key={u.id} value={u.id}>
                                    {u.name}
                                  </option>
                                ))}
                            </select>
                          </div>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </section>
            <section className="rounded-2xl border border-border bg-surface p-5">
              <h2 className="flex items-center gap-2 text-sm font-bold">
                <Users size={15} className="text-muted" /> Attendees · {people.length}
              </h2>
              <ul className="mt-2 space-y-1.5">
                {people.map((p) => (
                  <li key={p} className="flex items-center gap-2 text-sm">
                    <UserAvatar uid={p} size={26} /> {users[p].name} <span className="text-xs text-muted">{users[p].role}</span>
                  </li>
                ))}
              </ul>
            </section>
          </div>
        </div>
      </div>
    </section>
  );
}
