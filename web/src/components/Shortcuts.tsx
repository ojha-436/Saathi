"use client";

import clsx from "clsx";
import { useCallback, useEffect, useRef, useState } from "react";
import { History, Loader2, Pencil, Plus, Timer, Trash2 } from "@/lib/icons";
import { api } from "@/lib/api";
import type { Shortcut, ShortcutDraft } from "@/lib/types";
import { useWs } from "./ctx";
import { LogoMark } from "./Logo";
import { SaathiTabs } from "./Research";

type ListResp = { shortcuts: Shortcut[]; total_runs: number; total_minutes_saved: number };

const EXAMPLES = [
  "Check a PO's delivery schedule, its latest certificate and open NCRs for that vendor",
  "Before an inspection, check every certificate value for a heat number against the spec",
  "Har Monday dekho kaun se vendor late hain aur unke promises kya the",
];

const EMPTY: ShortcutDraft = { name: "", command: "", instruction: "", inputs: [], minutes_saved: 10 };

/** A small lightning bolt: a saved shortcut. */
export function ShortcutIcon({ size = 14, className }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" className={clsx("shrink-0", className)} aria-hidden>
      <path d="M13 2 4.5 13.5H11L10 22l8.5-11.5H12L13 2Z" />
    </svg>
  );
}

/** The person's shortcuts in this workspace; reloads when anything dispatches "saathi:shortcuts". */
export function useShortcuts() {
  const [data, setData] = useState<ListResp | null>(null);
  const reload = useCallback(() => {
    api<ListResp>("/api/shortcuts")
      .then(setData)
      .catch(() => setData((d) => d ?? { shortcuts: [], total_runs: 0, total_minutes_saved: 0 }));
  }, []);
  useEffect(() => {
    reload();
    addEventListener("saathi:shortcuts", reload);
    return () => removeEventListener("saathi:shortcuts", reload);
  }, [reload]);
  return { list: data?.shortcuts ?? [], totals: { runs: data?.total_runs ?? 0, minutes: data?.total_minutes_saved ?? 0 }, loaded: data !== null, reload };
}

/** What the Saathi box gets when a shortcut runs: "/dispatch-check PO-7781". */
export function runText(sc: Pick<Shortcut, "command">, values: string[]): string {
  const given = values.map((v) => v.trim()).filter(Boolean);
  return `/${sc.command}` + (given.length ? " " + given.join(", ") : "");
}

function savedLabel(minutes: number) {
  if (minutes < 60) return `~${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `~${h} h${m ? ` ${m} min` : ""}`;
}

const steps = (instruction: string) => instruction.split(/\n+/).map((s) => s.trim()).filter(Boolean);

export function ShortcutsView({ draftFrom }: { draftFrom?: string }) {
  const { showList } = useWs();
  const { list, totals, loaded } = useShortcuts();
  // null: just the list; {}: a new one; {existing}: editing; {fromMessage}: "Save as shortcut" on an answer
  const [editor, setEditor] = useState<{ existing?: Shortcut; fromMessage?: string; seed?: string } | null>(draftFrom ? { fromMessage: draftFrom } : null);

  return (
    <section className="flex min-h-0 flex-1 flex-col bg-surface" aria-label="Shortcuts">
      <header className="flex h-14 shrink-0 items-center gap-3 border-b border-border bg-surface px-4 lg:h-12 lg:px-6">
        <LogoMark size={32} />
        <div className="min-w-0 flex-1">
          <h1 className="text-[15px] font-bold leading-tight">Shortcuts</h1>
          <p className="hidden truncate text-xs text-muted sm:block">Your own saved jobs · run one in Ask by typing / and its command</p>
        </div>
        <SaathiTabs active="shortcuts" />
        <button onClick={showList} className="flex h-9 items-center gap-1.5 rounded-lg px-2 text-xs font-medium text-muted hover:bg-hover hover:text-ink lg:hidden" aria-label="Conversation history">
          <History size={16} />
        </button>
      </header>

      <div className="scrollbar-thin flex-1 overflow-y-auto px-4 py-6 lg:px-6">
        <div className="mx-auto max-w-3xl">
          <div className="flex flex-wrap items-end gap-3">
            <div className="min-w-0 flex-1">
              <h2 className="font-display text-3xl leading-tight">My shortcuts</h2>
              {totals.runs > 0 && (
                <p className="mt-1 flex items-center gap-1.5 text-xs text-muted">
                  <Timer size={13} className="text-moss" /> Used {totals.runs}× · {savedLabel(totals.minutes)} saved
                </p>
              )}
            </div>
            {!editor && (
              <button onClick={() => setEditor({})} className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-brand px-3.5 text-xs font-semibold text-white transition hover:bg-brand-strong">
                <Plus size={14} /> New shortcut
              </button>
            )}
          </div>

          {editor && (
            <ShortcutEditor
              key={editor.existing?.id ?? editor.fromMessage ?? editor.seed ?? "new"}
              existing={editor.existing}
              fromMessage={editor.fromMessage}
              seed={editor.seed}
              onDone={() => setEditor(null)}
            />
          )}

          {loaded && list.length === 0 && !editor && (
            <div className="mt-6 rounded-2xl border border-border bg-gradient-to-br from-white via-surface to-canvas p-6">
              <p className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-widest text-brand">
                <ShortcutIcon size={13} /> Your own bot
              </p>
              <p className="mt-2 font-display text-2xl leading-tight">Repeat a job every week? Save it once.</p>
              <p className="mt-1 text-xs text-muted">
                Describe it in plain words, in English or Hinglish. Saathi drafts the steps and the blanks, you check them and save. Then run it from Ask with one
                /command. It searches only what you can open, cites every source, and anything it proposes is a draft for you to confirm.
              </p>
              <p className="mt-5 font-mono text-[11px] uppercase tracking-widest text-muted">Try one</p>
              <div className="mt-2 grid gap-2">
                {EXAMPLES.map((e) => (
                  <button key={e} onClick={() => setEditor({ seed: e })} className="rounded-xl border border-border bg-surface px-4 py-2.5 text-left text-sm transition hover:border-[#c5cad3] hover:shadow-sm">
                    {e}
                  </button>
                ))}
              </div>
            </div>
          )}

          {list.length > 0 && (
            <div className="mt-6 grid gap-3 sm:grid-cols-2">
              {list.map((sc) => (
                <ShortcutCard key={sc.id} sc={sc} onEdit={() => setEditor({ existing: sc })} />
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

function ShortcutCard({ sc, onEdit }: { sc: Shortcut; onEdit: () => void }) {
  const { open, toast } = useWs();
  const [values, setValues] = useState<string[] | null>(null); // the blanks, once Run is pressed
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const first = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (values) first.current?.focus();
  }, [values !== null]); // eslint-disable-line react-hooks/exhaustive-deps

  const run = (vals: string[]) => open({ kind: "assistant", prompt: runText(sc, vals) });

  async function remove() {
    setBusy(true);
    try {
      await api(`/api/shortcuts/${sc.id}`, { method: "DELETE" });
      dispatchEvent(new Event("saathi:shortcuts"));
    } catch (e) {
      toast((e as Error).message);
      setBusy(false);
      setConfirming(false);
    }
  }

  return (
    <article className="flex flex-col rounded-xl border border-border bg-surface p-4 transition hover:border-[#c5cad3] hover:shadow-sm">
      <div className="flex items-start gap-2">
        <ShortcutIcon size={15} className="mt-0.5 text-saffron-ink" />
        <h3 className="min-w-0 flex-1 text-sm font-semibold leading-snug">{sc.name}</h3>
      </div>
      <p className="mt-1 truncate font-mono text-xs text-brand">
        /{sc.command}
        {sc.inputs.length > 0 && <span className="text-muted"> · {sc.inputs.join(", ")}</span>}
      </p>
      <ol className="mt-2 space-y-0.5 text-xs text-muted">
        {steps(sc.instruction)
          .slice(0, 2)
          .map((s, i) => (
            <li key={i} className="truncate">
              {s}
            </li>
          ))}
      </ol>
      <p className="mt-2 text-[11px] text-muted">
        used {sc.runs}× · ~{sc.minutes_saved} min each
      </p>

      {values ? (
        <form
          className="mt-3 space-y-2"
          onSubmit={(e) => {
            e.preventDefault();
            run(values);
          }}
        >
          {sc.inputs.map((name, i) => (
            <input
              key={name}
              ref={i === 0 ? first : undefined}
              aria-label={name}
              placeholder={name}
              value={values[i] ?? ""}
              onChange={(e) => setValues((v) => (v ?? []).map((x, j) => (j === i ? e.target.value : x)))}
              className="h-9 w-full rounded-lg border border-border bg-surface px-3 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-brand/15"
            />
          ))}
          <div className="flex gap-2">
            <button className="h-8 rounded-lg bg-saffron px-3 text-xs font-semibold text-ink hover:brightness-105">Run</button>
            <button type="button" onClick={() => setValues(null)} className="h-8 rounded-lg px-2 text-xs font-medium text-muted hover:bg-hover hover:text-ink">
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <div className="mt-3 flex items-center gap-1">
          <button
            onClick={() => (sc.inputs.length ? setValues(sc.inputs.map(() => "")) : run([]))}
            className="h-8 rounded-lg bg-saffron px-3 text-xs font-semibold text-ink hover:brightness-105"
          >
            Run
          </button>
          {confirming ? (
            <span className="ml-auto flex items-center gap-1 text-xs">
              <span className="text-muted">Delete?</span>
              <button onClick={remove} disabled={busy} className="h-8 rounded-lg px-2 font-semibold text-rust hover:bg-rust-soft disabled:opacity-50">
                Yes
              </button>
              <button onClick={() => setConfirming(false)} className="h-8 rounded-lg px-2 font-medium text-muted hover:bg-hover">
                No
              </button>
            </span>
          ) : (
            <>
              <button onClick={onEdit} className="ml-auto flex h-8 items-center gap-1 rounded-lg px-2 text-xs font-medium text-muted hover:bg-hover hover:text-ink">
                <Pencil size={13} /> Edit
              </button>
              <button onClick={() => setConfirming(true)} className="flex h-8 items-center gap-1 rounded-lg px-2 text-xs font-medium text-muted hover:bg-hover hover:text-rust">
                <Trash2 size={13} /> Delete
              </button>
            </>
          )}
        </div>
      )}
    </article>
  );
}

/** Make or change a shortcut. A new one starts from a description (or an answer) that Saathi drafts; nothing is saved until Save. */
export function ShortcutEditor({ existing, fromMessage, seed, onDone }: { existing?: Shortcut; fromMessage?: string; seed?: string; onDone: () => void }) {
  const { toast } = useWs();
  const [description, setDescription] = useState(seed ?? "");
  const [form, setForm] = useState<ShortcutDraft | null>(existing ? { ...existing } : null);
  const [blanks, setBlanks] = useState((existing?.inputs ?? []).join(", "));
  const [drafting, setDrafting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [note, setNote] = useState("");
  const [error, setError] = useState("");

  async function draft(body: { description?: string; message_id?: string }) {
    setDrafting(true);
    setNote("");
    try {
      const r = await api<{ draft: ShortcutDraft }>("/api/shortcuts/draft", { json: body });
      setForm(r.draft);
      setBlanks(r.draft.inputs.join(", "));
    } catch (e) {
      setNote((e as Error).message);
      setForm((f) => f ?? { ...EMPTY }); // the person can still write it themselves
    } finally {
      setDrafting(false);
    }
  }

  useEffect(() => {
    if (fromMessage) draft({ message_id: fromMessage });
    else if (seed) draft({ description: seed });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function save() {
    if (!form) return;
    setSaving(true);
    setError("");
    const body = { ...form, inputs: blanks.split(",").map((s) => s.trim()).filter(Boolean) };
    try {
      await api(existing ? `/api/shortcuts/${existing.id}` : "/api/shortcuts", { method: existing ? "PATCH" : "POST", json: body });
      dispatchEvent(new Event("saathi:shortcuts"));
      toast(existing ? "Shortcut saved" : `Saved. Type /${body.command.replace(/^\//, "")} in Ask to run it.`);
      onDone();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  const field = "w-full rounded-lg border border-border bg-surface px-3 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-brand/15";
  const set = (k: keyof ShortcutDraft) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...(f ?? EMPTY), [k]: k === "minutes_saved" ? Number(e.target.value) : e.target.value }));

  return (
    <div className="rise mt-6 rounded-2xl border border-border bg-surface p-5 shadow-xs" role="region" aria-label={existing ? "Edit shortcut" : "New shortcut"}>
      <p className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-widest text-brand">
        <ShortcutIcon size={13} /> {existing ? "Edit shortcut" : fromMessage ? "Save as shortcut" : "New shortcut"}
      </p>

      {!existing && !fromMessage && (
        <div className="mt-3">
          <label htmlFor="sc-describe" className="text-xs font-medium text-muted">
            What job do you repeat?
          </label>
          <textarea
            id="sc-describe"
            rows={2}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="e.g. every Monday check which vendors are late and what they promised"
            className={clsx(field, "mt-1 resize-none py-2")}
          />
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <button
              onClick={() => draft({ description })}
              disabled={drafting || !description.trim()}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-brand px-3.5 text-xs font-semibold text-white transition hover:bg-brand-strong disabled:opacity-50"
            >
              {drafting ? <Loader2 size={14} className="animate-spin" /> : <ShortcutIcon size={13} />} Draft with Saathi
            </button>
            {!form && (
              <button onClick={() => setForm({ ...EMPTY })} className="h-9 rounded-lg px-2 text-xs font-medium text-muted hover:bg-hover hover:text-ink">
                or write it yourself
              </button>
            )}
          </div>
        </div>
      )}

      {fromMessage && drafting && (
        <p className="mt-3 flex items-center gap-2 text-sm text-muted" role="status">
          <Loader2 size={14} className="animate-spin" /> Saathi is turning that question into a shortcut…
        </p>
      )}
      {note && <p className="mt-3 rounded-lg bg-warn-soft px-3 py-2 text-xs text-warn-ink">{note}</p>}

      {form && (
        <div className="mt-4 grid gap-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-xs font-medium text-muted">
              Name
              <input value={form.name} onChange={set("name")} className={clsx(field, "mt-1 h-9")} />
            </label>
            <label className="text-xs font-medium text-muted">
              Command
              <span className="mt-1 flex items-center rounded-lg border border-border focus-within:border-brand focus-within:ring-2 focus-within:ring-brand/15">
                <span className="pl-3 font-mono text-sm text-muted">/</span>
                <input value={form.command} onChange={set("command")} className="h-9 min-w-0 flex-1 bg-transparent px-1 font-mono text-sm outline-none" />
              </span>
            </label>
          </div>
          <label className="text-xs font-medium text-muted">
            Steps Saathi follows
            <textarea value={form.instruction} onChange={set("instruction")} rows={5} className={clsx(field, "mt-1 py-2 leading-relaxed")} />
          </label>
          <div className="grid gap-3 sm:grid-cols-[1fr_10rem]">
            <label className="text-xs font-medium text-muted">
              Blanks you fill each time (comma-separated)
              <input value={blanks} onChange={(e) => setBlanks(e.target.value)} placeholder="PO number" className={clsx(field, "mt-1 h-9")} />
            </label>
            <label className="text-xs font-medium text-muted">
              Minutes saved per run
              <input type="number" min={1} max={240} value={form.minutes_saved} onChange={set("minutes_saved")} className={clsx(field, "mt-1 h-9")} />
            </label>
          </div>
          {error && <p className="text-xs font-medium text-rust">{error}</p>}
          <div className="flex items-center gap-2">
            <button onClick={save} disabled={saving} className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-saffron px-4 text-xs font-semibold text-ink hover:brightness-105 disabled:opacity-50">
              {saving && <Loader2 size={14} className="animate-spin" />} Save
            </button>
            <button onClick={onDone} className="h-9 rounded-lg px-3 text-xs font-medium text-muted hover:bg-hover hover:text-ink">
              Cancel
            </button>
            <p className="ml-auto hidden text-[11px] text-muted sm:block">Runs with your access only · anything it proposes is a draft</p>
          </div>
        </div>
      )}

      {!form && !existing && (fromMessage ? !drafting : true) && (
        <div className="mt-3">
          <button onClick={onDone} className="h-8 rounded-lg px-2 text-xs font-medium text-muted hover:bg-hover hover:text-ink">
            Cancel
          </button>
        </div>
      )}
    </div>
  );
}
