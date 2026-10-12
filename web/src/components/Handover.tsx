"use client";

import clsx from "clsx";
import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { AlertTriangle, ArrowLeft, Check, CheckCircle2, Clock, Gavel, Languages, ListTodo, Loader2, Plus, RefreshCw, Sparkles, Trash2, Workflow, X } from "@/lib/icons";
import type { Handover, HandoverBullet, HandoverList, HandoverSection } from "@/lib/types";
import { CiteChip, Switch } from "./bits";
import { useWs } from "./ctx";

const SECTIONS: { key: HandoverSection; label: string; icon: typeof Clock; tone: string }[] = [
  { key: "machines", label: "Machines", icon: RefreshCw, tone: "text-blueprint" },
  { key: "quality", label: "Quality", icon: Gavel, tone: "text-plum" },
  { key: "safety", label: "Safety", icon: AlertTriangle, tone: "text-rust" },
  { key: "open_items", label: "Open items for next shift", icon: ListTodo, tone: "text-brand" },
  { key: "changes", label: "What changed", icon: Workflow, tone: "text-moss" },
  { key: "watch_out", label: "Watch out", icon: Sparkles, tone: "text-saffron-ink" },
];

const hhmm = (iso?: string | null) => (iso ? new Date(iso).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" }) : "");
const dayLabel = (iso?: string | null) => (iso ? new Date(iso).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" }) : "");

function StatusPill({ h }: { h: Handover }) {
  const map = {
    draft: ["Draft", "bg-saffron-soft text-saffron-ink"],
    signed: ["Signed · waiting for acknowledgement", "bg-blueprint-soft text-blueprint"],
    acknowledged: ["Acknowledged", "bg-moss-soft text-moss"],
  } as const;
  const [label, cls] = map[h.status];
  return <span className={clsx("rounded-full px-2.5 py-0.5 text-[11px] font-semibold", cls)}>{label}</span>;
}

/** One handover: editable while it's a draft, read-only with sources once signed. */
function HandoverCard({ h, onChanged }: { h: Handover; onChanged: () => void }) {
  const { uid, toast } = useWs();
  const editable = h.status === "draft";
  const [headline, setHeadline] = useState(h.headline);
  const [sections, setSections] = useState(h.sections);
  const [notes, setNotes] = useState(h.notes);
  const [busy, setBusy] = useState<string | null>(null);
  const dirty = headline !== h.headline || notes !== h.notes || JSON.stringify(sections) !== JSON.stringify(h.sections);

  const run = async (key: string, fn: () => Promise<unknown>, done: string) => {
    setBusy(key);
    try {
      await fn();
      toast(done);
      onChanged();
    } catch (e) {
      toast((e as Error).message);
    } finally {
      setBusy(null);
    }
  };
  const save = () => api(`/api/handovers/${h.id}`, { method: "PATCH", json: { headline, notes, sections } });
  const setBullet = (sec: HandoverSection, i: number, text: string) =>
    setSections((s) => ({ ...s, [sec]: (s[sec] ?? []).map((b, j) => (j === i ? { ...b, text } : b)) }));
  const drop = (sec: HandoverSection, i: number) => setSections((s) => ({ ...s, [sec]: (s[sec] ?? []).filter((_, j) => j !== i) }));
  const add = (sec: HandoverSection) => setSections((s) => ({ ...s, [sec]: [...(s[sec] ?? []), { text: "", refs: [] } as HandoverBullet] }));
  const acked = h.acks.some((a) => a.uid === uid);

  return (
    <article className="rounded-2xl border border-border bg-surface" aria-label={`Shift ${h.shift_name} handover`}>
      <header className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-3">
        <div className="min-w-0 flex-1">
          <p className="text-xs text-muted">
            Shift {h.shift_name} · {dayLabel(h.shift_start)} {hhmm(h.shift_start)}–{hhmm(h.shift_end)}
            {h.next_shift ? ` · for shift ${h.next_shift}` : ""}
          </p>
          {editable ? (
            <input value={headline} onChange={(e) => setHeadline(e.target.value)} aria-label="Headline" className="mt-1 w-full rounded-lg border border-border px-2.5 py-1.5 text-[15px] font-bold outline-none focus:border-brand" />
          ) : (
            <h2 className="mt-0.5 text-[15px] font-bold leading-snug">{h.headline}</h2>
          )}
        </div>
        <StatusPill h={h} />
      </header>

      <div className="space-y-4 px-4 py-4">
        {SECTIONS.map(({ key, label, icon: Icon, tone }) => {
          const rows = sections[key] ?? [];
          if (!editable && rows.length === 0) return null;
          return (
            <section key={key}>
              <h3 className={clsx("mb-1.5 flex items-center gap-1.5 text-[13px] font-bold", tone)}>
                <Icon size={14} aria-hidden /> {label}
                {rows.length === 0 && <span className="font-normal text-muted">· nothing</span>}
              </h3>
              <ul className="space-y-1.5">
                {rows.map((b, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm">
                    <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-border" aria-hidden />
                    {editable ? (
                      <>
                        <textarea
                          value={b.text}
                          onChange={(e) => setBullet(key, i, e.target.value)}
                          rows={Math.min(3, Math.ceil(b.text.length / 90) || 1)}
                          aria-label={`${label} item ${i + 1}`}
                          className="min-w-0 flex-1 resize-none rounded-md border border-transparent px-1.5 py-1 leading-snug outline-none hover:border-border focus:border-brand"
                        />
                        <button onClick={() => drop(key, i)} aria-label="Remove item" className="mt-1 rounded p-1 text-muted hover:bg-hover hover:text-rust">
                          <Trash2 size={13} />
                        </button>
                      </>
                    ) : (
                      <p className="min-w-0 flex-1 leading-snug">{b.text}</p>
                    )}
                    {b.refs.length > 0 && (
                      <span className="mt-0.5 hidden shrink-0 flex-wrap justify-end gap-0.5 sm:flex">
                        {b.refs.slice(0, 2).map((r) => (
                          <CiteChip key={r} refId={r} />
                        ))}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
              {editable && (
                <button onClick={() => add(key)} className="mt-1 flex items-center gap-1 pl-3.5 text-xs font-medium text-muted hover:text-ink">
                  <Plus size={12} /> Add
                </button>
              )}
            </section>
          );
        })}

        {editable ? (
          <label className="block text-[13px] font-bold">
            Notes from the outgoing shift
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} placeholder="Anything Saathi missed" className="mt-1 w-full resize-none rounded-lg border border-border px-3 py-2 text-sm font-normal outline-none focus:border-brand" />
          </label>
        ) : (
          h.notes && (
            <p className="rounded-lg bg-canvas px-3 py-2 text-sm">
              <b>Notes:</b> {h.notes}
            </p>
          )
        )}
        <p className="text-[11px] text-muted">
          Drafted by Saathi from {h.sources.messages ?? 0} messages, {h.sources.records ?? 0} records, {h.sources.promises ?? 0} open promises
          {h.sources.lessons ? `, ${h.sources.lessons} past lessons` : ""}. Every item links to its source.
        </p>
      </div>

      <footer className="flex flex-wrap items-center gap-2 border-t border-border px-4 py-3">
        {editable ? (
          <>
            <button disabled={!dirty || !!busy} onClick={() => run("save", save, "Saved.")} className="h-9 rounded-lg border border-border px-3 text-[13px] font-semibold hover:bg-hover disabled:opacity-40">
              Save
            </button>
            <span className="flex-1" />
            <button
              disabled={!!busy}
              onClick={() =>
                run(
                  "sign",
                  async () => {
                    if (dirty) await save();
                    await api(`/api/handovers/${h.id}/sign`, { method: "POST" });
                  },
                  "Handover signed and sent to the next shift.",
                )
              }
              className="flex h-9 items-center gap-1.5 rounded-lg bg-brand px-4 text-[13px] font-semibold text-white hover:bg-brand-strong disabled:opacity-50"
            >
              {busy === "sign" ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />} Sign and hand over
            </button>
          </>
        ) : (
          <>
            <p className="min-w-0 flex-1 text-xs text-muted">
              Signed by <b className="text-ink">{h.signed_by_name}</b> at {hhmm(h.signed_at)}
              {h.acks.length > 0 && <> · acknowledged by {h.acks.map((a) => `${a.name} (${hhmm(a.at)})`).join(", ")}</>}
            </p>
            {h.signed_by !== uid && !acked && (
              <button
                disabled={!!busy}
                onClick={() => run("ack", () => api(`/api/handovers/${h.id}/ack`, { method: "POST" }), "Acknowledged. Have a good shift.")}
                className="flex h-9 items-center gap-1.5 rounded-lg bg-brand px-4 text-[13px] font-semibold text-white hover:bg-brand-strong disabled:opacity-50"
              >
                {busy === "ack" ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />} I&rsquo;ve read it
              </button>
            )}
          </>
        )}
      </footer>
    </article>
  );
}

/** Shift handovers for one bay/line chat: this shift's draft or signed handover, plus history. */
export function HandoverView({ chatId, focusId }: { chatId: string; focusId?: string }) {
  const { chats, open, toast } = useWs();
  const chat = chats[chatId];
  const [data, setData] = useState<HandoverList | null>(null);
  const [lang, setLang] = useState<"en" | "hinglish">("en");
  const [drafting, setDrafting] = useState(false);
  const [version, setVersion] = useState(0);
  const reload = useCallback(() => setVersion((v) => v + 1), []);

  useEffect(() => {
    let live = true;
    api<HandoverList>(`/api/handovers?chat_id=${encodeURIComponent(chatId)}`)
      .then((d) => live && setData(d))
      .catch((e) => live && toast((e as Error).message));
    return () => {
      live = false;
    };
  }, [chatId, version, toast]);

  async function draft() {
    setDrafting(true);
    try {
      await api("/api/handovers/draft", { json: { chat_id: chatId, lang } });
      reload();
    } catch (e) {
      toast((e as Error).message);
    } finally {
      setDrafting(false);
    }
  }

  const current = data?.handovers.find((h) => h.id === data.current_shift.id);
  const focused = focusId ? data?.handovers.find((h) => h.id === focusId) : undefined;
  const shown = focused ?? current;
  const history = (data?.handovers ?? []).filter((h) => h.id !== shown?.id);

  return (
    <section className="flex min-h-0 flex-1 flex-col" aria-label="Shift handover">
      <header className="flex h-14 shrink-0 items-center gap-3 border-b border-border px-4 lg:h-12 lg:px-6">
        <button onClick={() => open({ kind: "chat", chatId })} aria-label="Back to the chat" className="flex h-9 w-9 items-center justify-center rounded-lg text-muted hover:bg-hover">
          <ArrowLeft size={18} />
        </button>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-[15px] font-bold leading-tight">Shift handover · {chat?.name ?? "this group"}</h1>
          {data && (
            <p className="hidden truncate text-xs text-muted sm:block">
              Now: shift {data.current_shift.name}, {hhmm(data.current_shift.start)}–{hhmm(data.current_shift.end)}. Next: shift {data.current_shift.next}.
            </p>
          )}
        </div>
        {data && (
          <label className="hidden items-center gap-2 text-xs text-muted md:flex" title="Saathi drafts the handover 15 minutes before each shift ends and reminds everyone">
            Auto-draft at shift end
            <Switch
              on={data.enabled}
              label="Auto-draft at shift end"
              onChange={async (v) => {
                try {
                  await api(`/api/chats/${chatId}/handover`, { json: { enabled: v } });
                  reload();
                } catch (e) {
                  toast((e as Error).message);
                }
              }}
            />
          </label>
        )}
      </header>

      <div className="scrollbar-thin flex-1 overflow-y-auto bg-canvas/50 px-4 py-4 lg:px-8">
        <div className="mx-auto max-w-3xl space-y-4">
          {!data ? (
            <p className="flex items-center gap-2 text-sm text-muted"><Loader2 size={15} className="animate-spin" /> Loading…</p>
          ) : (
            <>
              {focused && focused.id !== data.current_shift.id && (
                <button onClick={() => open({ kind: "handover", chatId })} className="flex items-center gap-1 text-xs font-semibold text-brand">
                  <X size={12} /> Show this shift instead
                </button>
              )}
              {!shown && (
                <div className="rounded-2xl border border-dashed border-border bg-surface px-5 py-8 text-center">
                  <Sparkles size={26} className="mx-auto text-brand" aria-hidden />
                  <p className="mt-2 font-semibold">No handover for shift {data.current_shift.name} yet</p>
                  <p className="mx-auto mt-1 max-w-md text-sm text-muted">
                    Saathi reads this shift&rsquo;s messages, records and open promises, adds past lessons that matter, and drafts the handover. You check it and sign.
                  </p>
                  <div className="mt-4 flex items-center justify-center gap-2">
                    <div className="flex rounded-lg border border-border p-0.5" role="group" aria-label="Language">
                      {(["en", "hinglish"] as const).map((l) => (
                        <button key={l} onClick={() => setLang(l)} aria-pressed={lang === l} className={clsx("flex h-8 items-center gap-1 rounded-md px-2.5 text-xs font-semibold", lang === l ? "bg-brand text-white" : "text-muted")}>
                          {l === "hinglish" && <Languages size={12} />} {l === "en" ? "English" : "Hinglish"}
                        </button>
                      ))}
                    </div>
                    <button onClick={draft} disabled={drafting} className="flex h-9 items-center gap-1.5 rounded-lg bg-brand px-4 text-[13px] font-semibold text-white hover:bg-brand-strong disabled:opacity-50">
                      {drafting ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />} {drafting ? "Drafting…" : "Draft handover"}
                    </button>
                  </div>
                </div>
              )}
              {shown && <HandoverCard key={`${shown.id}-${shown.drafted_at}-${shown.status}`} h={shown} onChanged={reload} />}
              {shown?.status === "draft" && shown.id === data.current_shift.id && (
                <div className="flex items-center justify-end gap-2 text-xs">
                  <span className="text-muted">Redraft from scratch in</span>
                  {(["en", "hinglish"] as const).map((l) => (
                    <button key={l} onClick={() => { setLang(l); void api("/api/handovers/draft", { json: { chat_id: chatId, lang: l } }).then(reload).catch((e) => toast((e as Error).message)); }} className="rounded-md border border-border px-2 py-1 font-semibold hover:bg-hover">
                      {l === "en" ? "English" : "Hinglish"}
                    </button>
                  ))}
                </div>
              )}
              {history.length > 0 && (
                <section>
                  <h2 className="mb-2 text-sm font-bold">Earlier handovers</h2>
                  <ul className="overflow-hidden rounded-xl border border-border bg-surface">
                    {history.map((h) => (
                      <li key={h.id}>
                        <button onClick={() => open({ kind: "handover", chatId, id: h.id })} className="flex w-full items-center gap-3 border-b border-border px-4 py-2.5 text-left last:border-b-0 hover:bg-canvas/60">
                          <span className="w-28 shrink-0 text-xs text-muted">
                            {dayLabel(h.shift_start)} · {h.shift_name}
                          </span>
                          <span className="min-w-0 flex-1 truncate text-sm">{h.headline}</span>
                          <StatusPill h={h} />
                        </button>
                      </li>
                    ))}
                  </ul>
                </section>
              )}
            </>
          )}
        </div>
      </div>
    </section>
  );
}
