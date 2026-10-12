"use client";

import clsx from "clsx";
import { useEffect, useMemo, useRef, useState } from "react";
import { api, openFile } from "@/lib/api";
import { getFbAuth, apiUrl } from "@/lib/firebase";
import { timeShort } from "@/lib/format";
import { AlertTriangle, ArrowLeft, Check, CheckCircle2, FileText, Gavel, Loader2, Lock, Plus, ScanText, ShieldCheck, Sparkles, X } from "@/lib/icons";
import type { Drawing, Lesson, PlantRecord, RecordFields, RecordLinks, RecordType } from "@/lib/types";
import { audioExt, transcribe, useRecorder } from "@/lib/voice";
import { UserAvatar } from "./bits";
import { useWs } from "./ctx";
import { Modal, ModalHeader } from "./Dialogs";
import { LessonsPanel, SimilarIncidents } from "./Knowledge";

export const TYPE_LABEL: Record<RecordType, string> = { ncr: "Defect (NCR)", downtime: "Machine downtime", safety: "Safety near-miss" };
const FLOW: Record<RecordType, string[]> = {
  ncr: ["open", "contained", "root_cause", "corrective_action", "verified", "closed"],
  downtime: ["open", "closed"],
  safety: ["open", "action", "closed"],
};
const STATUS_LABEL: Record<string, string> = {
  open: "Open", contained: "Contained", root_cause: "Root cause", corrective_action: "Corrective action", verified: "Verified", closed: "Closed", action: "Action",
};
const SEV_CLS: Record<string, string> = { minor: "bg-canvas text-ink/70", major: "bg-saffron-soft text-saffron-ink", critical: "bg-rust-soft text-rust" };

/* ---------------- Mic (dictation) ---------------- */

export function MicButton({ onText, className }: { onText: (t: string) => void; className?: string }) {
  const { toast } = useWs();
  const { recording, seconds, start, stop } = useRecorder(120);
  const [busy, setBusy] = useState(false);
  async function toggle() {
    if (busy) return;
    if (!recording) {
      try {
        await start();
      } catch {
        toast("Microphone not available. Allow microphone access for this site.");
      }
      return;
    }
    const blob = await stop();
    if (!blob) return;
    setBusy(true);
    try {
      const t = await transcribe(blob);
      if (t) onText(t);
    } catch (e) {
      toast((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <button
      type="button"
      onClick={toggle}
      aria-pressed={recording}
      aria-label={recording ? "Stop and transcribe" : "Dictate (Hindi, Hinglish or English)"}
      title={recording ? "Stop and transcribe" : "Dictate (Hindi, Hinglish or English)"}
      className={clsx("flex h-8 items-center justify-center gap-1 rounded-md px-1.5 transition", recording ? "bg-rust text-white" : "text-muted hover:bg-hover hover:text-ink", className)}
    >
      {busy ? <Loader2 size={16} className="animate-spin" /> : <MicGlyph />}
      {recording && <span className="font-mono text-[11px]">{seconds}s</span>}
    </button>
  );
}

function MicGlyph({ size = 17 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" aria-hidden>
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21M8.5 21h7" />
    </svg>
  );
}

/* ---------------- Report dialog (snap-to-record) ---------------- */

type Draft = { draft_id: string; type: RecordType; fields: RecordFields; links: RecordLinks; lessons?: Lesson[] };

export function ReportDialog({ onClose, initialType = "ncr", chatId }: { onClose: () => void; initialType?: RecordType; chatId?: string }) {
  const { uid, users, account, toast, open } = useWs();
  const [type, setType] = useState<RecordType>(initialType);
  const [text, setText] = useState("");
  const [photos, setPhotos] = useState<File[]>([]);
  const [voice, setVoice] = useState<Blob | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [fields, setFields] = useState<RecordFields>({});
  const [anonymous, setAnonymous] = useState(false);
  const [owner, setOwner] = useState("");
  const [busy, setBusy] = useState<"draft" | "file" | null>(null);
  const cam = useRef<HTMLInputElement>(null);
  const rec = useRecorder(120);
  const previews = useMemo(() => photos.map((p) => URL.createObjectURL(p)), [photos]);
  useEffect(() => () => previews.forEach((u) => URL.revokeObjectURL(u)), [previews]);
  const team = account.org.settings.quality_team ?? [];
  const people = Object.values(users).filter((u) => !u.deactivated && u.org_role !== "guest");

  async function makeDraft() {
    setBusy("draft");
    try {
      const form = new FormData();
      form.append("type", type);
      form.append("text", text);
      photos.slice(0, 3).forEach((p) => form.append("photos", p, p.name || "photo.jpg"));
      if (voice) form.append("audio", voice, `voice.${audioExt(voice.type)}`);
      const token = await getFbAuth().currentUser?.getIdToken();
      const res = await fetch(`${apiUrl()}/api/records/draft`, { method: "POST", headers: { Authorization: `Bearer ${token}` }, body: form });
      const body = await res.json();
      if (!res.ok) throw new Error(body.detail ?? "Couldn't draft that");
      setDraft(body);
      setFields(body.fields);
    } catch (e) {
      toast((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function file() {
    if (!draft) return;
    setBusy("file");
    try {
      const r = await api<{ id: string; number: string }>("/api/records", {
        json: { draft_id: draft.draft_id, type, fields, owner: owner || null, chat_id: chatId ?? null, anonymous },
      });
      toast(`${r.number} filed. ${anonymous ? "Your name was not recorded." : "The quality team has been notified."}`);
      onClose();
      if (!anonymous) open({ kind: "quality", recordId: r.id });
    } catch (e) {
      toast((e as Error).message);
      setBusy(null);
    }
  }

  const set = (k: keyof RecordFields) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setFields((f) => ({ ...f, [k]: e.target.value || null }));
  const rc = draft?.links.revision_check;
  const fieldList: [keyof RecordFields, string][] =
    type === "ncr"
      ? [["part_name", "Part"], ["drawing_no", "Drawing no."], ["revision", "Revision"], ["job_no", "Job no."], ["heat_no", "Heat no."], ["vendor", "Vendor"], ["quantity", "Quantity"], ["defect_type", "Defect type"], ["location", "Location"]]
      : type === "downtime"
        ? [["machine", "Machine"], ["downtime_reason", "Reason"], ["location", "Line / bay"], ["job_no", "Job no."]]
        : [["location", "Location"], ["hazard", "Hazard"], ["machine", "Machine / area"]];

  return (
    <Modal title="Report an issue" onClose={onClose} wide>
      <ModalHeader title={draft ? `Check and file: ${TYPE_LABEL[type]}` : "Report an issue"} sub={draft ? "Saathi drafted this. Fix anything wrong, then file it." : "Snap a photo, say what happened (Hindi or English), or type a few words."} onClose={onClose} />
      {!draft ? (
        <div className="space-y-4 overflow-y-auto p-5">
          <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Type">
            {(["ncr", "downtime", "safety"] as const).map((t) => (
              <button key={t} role="radio" aria-checked={type === t} onClick={() => setType(t)} className={clsx("h-11 rounded-lg border text-sm", type === t ? "border-brand bg-brand-soft font-semibold text-brand" : "border-border hover:bg-hover")}>
                {TYPE_LABEL[t]}
              </button>
            ))}
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl border border-dashed border-[#c5cad3] p-3">
              <input ref={cam} type="file" accept="image/*" capture="environment" multiple className="hidden" onChange={(e) => setPhotos((p) => [...p, ...Array.from(e.target.files ?? [])].slice(0, 3))} />
              <button onClick={() => cam.current?.click()} className="flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-ink text-sm font-semibold text-white">
                <ScanText size={16} /> {photos.length ? "Add another photo" : "Take or choose photo"}
              </button>
              {photos.length > 0 && (
                <div className="mt-2 flex gap-2">
                  {previews.map((u, i) => (
                    <div key={u} className="relative">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={u} alt={`Photo ${i + 1}`} className="h-16 w-16 rounded-lg object-cover" />
                      <button onClick={() => setPhotos((p) => p.filter((_, j) => j !== i))} className="absolute -right-1.5 -top-1.5 rounded-full bg-ink p-0.5 text-white" aria-label="Remove photo">
                        <X size={11} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="rounded-xl border border-dashed border-[#c5cad3] p-3">
              <button
                onClick={async () => {
                  if (rec.recording) setVoice(await rec.stop());
                  else {
                    try {
                      setVoice(null);
                      await rec.start();
                    } catch {
                      toast("Microphone not available. Allow microphone access for this site.");
                    }
                  }
                }}
                className={clsx("flex h-11 w-full items-center justify-center gap-2 rounded-lg text-sm font-semibold", rec.recording ? "bg-rust text-white" : "border border-border hover:bg-hover")}
              >
                <MicGlyph /> {rec.recording ? `Stop (${rec.seconds}s)` : voice ? "Re-record voice note" : "Record voice note"}
              </button>
              {voice && !rec.recording && (
                <p className="mt-2 flex items-center gap-1.5 text-xs text-moss">
                  <Check size={13} /> Voice note ready ({Math.max(1, Math.round(voice.size / 16000))}s approx.)
                </p>
              )}
            </div>
          </div>
          <label className="block text-sm font-medium">
            Or type
            <textarea value={text} onChange={(e) => setText(e.target.value)} rows={3} maxLength={2000} placeholder={type === "downtime" ? "CNC-3 spindle alarm, 2 ghante se band" : type === "safety" ? "Oil spill near press 2 walkway" : "Porosity on bolster pocket weld, job 4521, 3 pcs"} className="mt-1 w-full resize-none rounded-lg border border-border px-3 py-2 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-brand/15" />
          </label>
        </div>
      ) : (
        <div className="space-y-4 overflow-y-auto p-5">
          {rc?.superseded && (
            <p role="alert" className="flex items-start gap-2 rounded-lg border border-rust/30 bg-rust-soft px-3 py-2 text-sm text-rust">
              <AlertTriangle size={16} className="mt-0.5 shrink-0" /> Rev {rc.reported_rev} of {rc.drawing_no} is superseded. Current revision is <b>Rev {rc.current_rev}</b>. This may be a wrong-revision defect.
            </p>
          )}
          {draft.links.mtc && (
            <button onClick={() => openFile(draft.links.mtc!.file_id)} className="flex items-center gap-2 rounded-lg border border-moss/30 bg-moss-soft px-3 py-2 text-left text-sm text-moss hover:border-moss/60">
              <FileText size={15} /> Test certificate for heat {fields.heat_no}: <b className="truncate">{draft.links.mtc.name}</b>
            </button>
          )}
          {draft.lessons && <LessonsPanel lessons={draft.lessons} compact />}
          <label className="block text-sm font-medium">
            Title
            <input value={fields.title ?? ""} onChange={set("title")} className="mt-1 h-10 w-full rounded-lg border border-border px-3 text-sm outline-none focus:border-brand" />
          </label>
          <label className="block text-sm font-medium">
            What happened
            <textarea value={fields.description ?? ""} onChange={set("description")} rows={3} className="mt-1 w-full resize-none rounded-lg border border-border px-3 py-2 text-sm outline-none focus:border-brand" />
          </label>
          {fields.transcript && <p className="rounded-lg bg-canvas px-3 py-2 text-xs text-muted">🎙️ “{fields.transcript}”</p>}
          <div className="grid gap-3 sm:grid-cols-2">
            {fieldList.map(([k, label]) => (
              <label key={k} className="block text-sm font-medium">
                {label}
                <input value={(fields[k] as string) ?? ""} onChange={set(k)} placeholder="Not stated" className={clsx("mt-1 h-10 w-full rounded-lg border px-3 text-sm outline-none focus:border-brand", fields[k] ? "border-border" : "border-dashed border-saffron/60 bg-saffron-soft/20")} />
              </label>
            ))}
            {type !== "downtime" && (
              <label className="block text-sm font-medium">
                Severity
                <select value={fields.severity ?? ""} onChange={set("severity")} className="mt-1 h-10 w-full rounded-lg border border-border bg-surface px-2 text-sm">
                  <option value="">Not set</option>
                  <option value="minor">Minor</option>
                  <option value="major">Major</option>
                  <option value="critical">Critical</option>
                </select>
              </label>
            )}
            <label className="block text-sm font-medium">
              Owner
              <select value={owner} onChange={(e) => setOwner(e.target.value)} className="mt-1 h-10 w-full rounded-lg border border-border bg-surface px-2 text-sm">
                <option value="">{team.length ? "Quality team (default)" : "Workspace admins (default)"}</option>
                {people.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.id === uid ? `Me (${u.name})` : u.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <label className="block text-sm font-medium">
            Immediate action
            <input value={fields.suggested_action ?? ""} onChange={set("suggested_action")} placeholder="e.g. Quarantine the 3 pieces" className="mt-1 h-10 w-full rounded-lg border border-border px-3 text-sm outline-none focus:border-brand" />
          </label>
          {type === "safety" && (
            <label className="flex items-start gap-2 rounded-lg border border-border px-3 py-2 text-sm">
              <input type="checkbox" checked={anonymous} onChange={(e) => setAnonymous(e.target.checked)} className="mt-0.5" />
              <span>
                <b>Report anonymously.</b> Your name is not stored with this report, not even for admins. You won&rsquo;t be able to follow it afterwards.
              </span>
            </label>
          )}
        </div>
      )}
      <div className="flex justify-end gap-2 border-t border-border bg-canvas/60 px-5 py-3">
        {draft ? (
          <>
            <button onClick={() => setDraft(null)} className="mr-auto h-9 rounded-lg px-3 text-sm font-medium text-muted hover:bg-hover">
              Back
            </button>
            <button onClick={file} disabled={busy !== null || !fields.title} className="flex h-9 items-center gap-2 rounded-lg bg-brand px-4 text-sm font-semibold text-white hover:bg-brand-strong disabled:opacity-50">
              {busy === "file" && <Loader2 size={14} className="animate-spin" />} File {type === "ncr" ? "NCR" : "report"}
            </button>
          </>
        ) : (
          <>
            <button onClick={onClose} className="h-9 rounded-lg px-4 text-sm font-medium text-muted hover:bg-hover">
              Cancel
            </button>
            <button onClick={makeDraft} disabled={busy !== null || rec.recording || (!photos.length && !voice && !text.trim())} className="flex h-9 items-center gap-2 rounded-lg bg-brand px-4 text-sm font-semibold text-white hover:bg-brand-strong disabled:opacity-50">
              {busy === "draft" ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />} {busy === "draft" ? "Drafting…" : "Draft with Saathi"}
            </button>
          </>
        )}
      </div>
    </Modal>
  );
}

/* ---------------- Quality view ---------------- */

export function QualityView({ recordId, records, register }: { recordId?: string; records: PlantRecord[]; register: Drawing[] }) {
  const { open } = useWs();
  const [tab, setTab] = useState<"records" | "drawings">("records");
  const [filter, setFilter] = useState<"open" | "closed" | "all">("open");
  const [type, setType] = useState<RecordType | "all">("all");
  const [report, setReport] = useState(false);
  const selected = recordId ? records.find((r) => r.id === recordId) : undefined;

  if (recordId && selected) return <RecordDetail r={selected} onBack={() => open({ kind: "quality" })} />;

  const list = records
    .filter((r) => (filter === "all" ? true : filter === "open" ? r.status !== "closed" : r.status === "closed"))
    .filter((r) => type === "all" || r.type === type)
    .sort((a, b) => (b.created_at?.toMillis() ?? 0) - (a.created_at?.toMillis() ?? 0));

  return (
    <section className="flex min-h-0 flex-1 flex-col" aria-label="Quality">
      <header className="flex h-14 shrink-0 items-center gap-3 border-b border-border px-4 lg:h-12 lg:px-6">
        <ShieldCheck size={18} className="text-muted" aria-hidden />
        <div className="min-w-0 flex-1">
          <h1 className="text-[15px] font-bold leading-tight">Quality &amp; plant records</h1>
          <p className="hidden truncate text-xs text-muted sm:block">Defects, downtime and safety reports, plus the controlled drawing register.</p>
        </div>
        <button onClick={() => setReport(true)} className="flex h-9 items-center gap-1.5 rounded-lg bg-brand px-3 text-[13px] font-semibold text-white hover:bg-brand-strong">
          <Plus size={15} /> Report issue
        </button>
      </header>
      <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 lg:px-6">
        {(["records", "drawings"] as const).map((t) => (
          <button key={t} role="tab" aria-selected={tab === t} onClick={() => setTab(t)} className={clsx("relative h-11 px-2.5 text-sm font-medium", tab === t ? "text-ink" : "text-muted hover:text-ink")}>
            {t === "records" ? `Records · ${records.filter((r) => r.status !== "closed").length} open` : `Drawing register · ${register.length}`}
            {tab === t && <span className="absolute inset-x-2 bottom-0 h-[3px] rounded-t bg-brand" aria-hidden />}
          </button>
        ))}
      </div>
      {tab === "records" ? (
        <div className="scrollbar-thin flex-1 overflow-y-auto bg-canvas/50 px-4 py-4 lg:px-8">
          <div className="mx-auto max-w-4xl">
            <div className="mb-3 flex flex-wrap gap-1.5">
              {(["open", "closed", "all"] as const).map((f) => (
                <button key={f} onClick={() => setFilter(f)} aria-pressed={filter === f} className={clsx("h-7 rounded-full border px-2.5 text-xs font-medium capitalize", filter === f ? "border-brand bg-brand-soft text-brand" : "border-border text-muted")}>
                  {f}
                </button>
              ))}
              <span className="mx-1 w-px bg-border" />
              {(["all", "ncr", "downtime", "safety"] as const).map((t) => (
                <button key={t} onClick={() => setType(t)} aria-pressed={type === t} className={clsx("h-7 rounded-full border px-2.5 text-xs font-medium", type === t ? "border-brand bg-brand-soft text-brand" : "border-border text-muted")}>
                  {t === "all" ? "All types" : TYPE_LABEL[t]}
                </button>
              ))}
            </div>
            {list.length === 0 ? (
              <div className="mt-14 text-center">
                <Gavel size={28} className="mx-auto text-muted" aria-hidden />
                <p className="mt-2 font-semibold">No {filter === "all" ? "" : filter} records</p>
                <p className="mt-1 text-sm text-muted">Report a defect, breakdown or near-miss in seconds: photo, voice or a few words.</p>
              </div>
            ) : (
              <ul className="overflow-hidden rounded-xl border border-border bg-surface">
                {list.map((r) => (
                  <li key={r.id}>
                    <button onClick={() => open({ kind: "quality", recordId: r.id })} className="flex w-full items-start gap-3 border-b border-border px-4 py-3 text-left last:border-b-0 hover:bg-canvas/60">
                      <span className="mt-0.5 w-24 shrink-0 font-mono text-xs font-semibold">{r.number}</span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold">{r.fields.title}</span>
                        <span className="block truncate text-xs text-muted">
                          {TYPE_LABEL[r.type]} · {r.anonymous ? "Anonymous" : r.reporter_name} · {timeShort(r.created_at)}
                          {r.links?.revision_check?.superseded && " · ⚠ superseded revision"}
                        </span>
                      </span>
                      {r.fields.severity && <span className={clsx("rounded px-1.5 py-0.5 text-[11px] font-semibold capitalize", SEV_CLS[r.fields.severity])}>{r.fields.severity}</span>}
                      <span className={clsx("rounded-full px-2 py-0.5 text-[11px] font-semibold", r.status === "closed" ? "bg-moss-soft text-moss" : "bg-brand-soft text-brand")}>{STATUS_LABEL[r.status] ?? r.status}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      ) : (
        <DrawingRegister register={register} />
      )}
      {report && <ReportDialog onClose={() => setReport(false)} />}
    </section>
  );
}

function RecordDetail({ r, onBack }: { r: PlantRecord; onBack: () => void }) {
  const { uid, users, account, toast } = useWs();
  const [capa, setCapa] = useState(r.capa ?? {});
  const [busy, setBusy] = useState(false);
  const [media, setMedia] = useState<string[]>([]);
  const flow = FLOW[r.type];
  const idx = flow.indexOf(r.status);
  const canManage = uid === r.owner || (account.org.settings.quality_team ?? []).includes(uid) || account.org_role === "owner" || account.org_role === "admin";

  useEffect(() => {
    let urls: string[] = [];
    (async () => {
      const token = await getFbAuth().currentUser?.getIdToken();
      urls = await Promise.all(
        r.media.map(async (_, i) => {
          const res = await fetch(`${apiUrl()}/api/records/${r.id}/media/${i}`, { headers: { Authorization: `Bearer ${token}` } });
          return res.ok ? URL.createObjectURL(await res.blob()) : "";
        }),
      );
      setMedia(urls);
    })();
    return () => urls.forEach((u) => u && URL.revokeObjectURL(u));
  }, [r.id, r.media]);

  async function patch(json: object, msg?: string) {
    setBusy(true);
    try {
      await api(`/api/records/${r.id}`, { method: "PATCH", json });
      if (msg) toast(msg);
    } catch (e) {
      toast((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const f = r.fields;
  const rev = f.revision?.replace(/^rev(ision)?\.?\s*/i, "");
  const rows = [["Part", f.part_name], ["Drawing", f.drawing_no && `${f.drawing_no}${rev ? ` Rev ${rev}` : ""}`], ["Job", f.job_no], ["Heat", f.heat_no], ["Vendor", f.vendor], ["Machine", f.machine], ["Location", f.location], ["Quantity", f.quantity], ["Defect", f.defect_type], ["Reason", f.downtime_reason], ["Hazard", f.hazard]].filter(([, v]) => v) as [string, string][];

  return (
    <section className="flex min-h-0 flex-1 flex-col" aria-label={r.number}>
      <header className="flex h-14 shrink-0 items-center gap-3 border-b border-border px-4 lg:h-12 lg:px-6">
        <button onClick={onBack} className="flex h-9 w-9 items-center justify-center rounded-lg text-muted hover:bg-hover" aria-label="Back to records">
          <ArrowLeft size={18} />
        </button>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-[15px] font-bold">
            {r.number} · {f.title}
          </h1>
          <p className="truncate text-xs text-muted">
            {TYPE_LABEL[r.type]} · reported by {r.anonymous ? "Anonymous" : r.reporter_name} {timeShort(r.created_at)}
          </p>
        </div>
        {f.severity && <span className={clsx("rounded px-2 py-0.5 text-xs font-semibold capitalize", SEV_CLS[f.severity])}>{f.severity}</span>}
      </header>
      <div className="scrollbar-thin flex-1 overflow-y-auto bg-canvas/50 px-4 py-5 lg:px-8">
        <div className="mx-auto grid max-w-5xl gap-4 lg:grid-cols-[1.4fr_1fr]">
          <div className="space-y-4">
            <ol className="flex flex-wrap gap-1.5 rounded-xl border border-border bg-surface p-3" aria-label="Status">
              {flow.map((s, i) => (
                <li key={s}>
                  <button
                    disabled={!canManage || busy || s === r.status}
                    onClick={() => patch({ status: s, ...(s === "closed" ? capa : {}) }, `${r.number} → ${STATUS_LABEL[s]}`)}
                    className={clsx("flex h-8 items-center gap-1 rounded-full px-3 text-xs font-semibold", i < idx ? "bg-moss-soft text-moss" : i === idx ? "bg-brand text-white" : "bg-canvas text-muted hover:bg-hover disabled:hover:bg-canvas")}
                  >
                    {i < idx && <Check size={12} />} {STATUS_LABEL[s]}
                  </button>
                </li>
              ))}
            </ol>
            {r.links?.revision_check?.superseded && (
              <p className="flex items-start gap-2 rounded-xl border border-rust/30 bg-rust-soft px-4 py-3 text-sm text-rust">
                <AlertTriangle size={16} className="mt-0.5 shrink-0" /> Made to Rev {r.links.revision_check.reported_rev}, which is superseded. Current revision is Rev {r.links.revision_check.current_rev}.
              </p>
            )}
            <section className="rounded-xl border border-border bg-surface p-4">
              <p className="text-sm leading-relaxed">{f.description}</p>
              {f.transcript && <p className="mt-2 rounded-lg bg-canvas px-3 py-2 text-xs text-muted">🎙️ “{f.transcript}”</p>}
              {rows.length > 0 && (
                <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm">
                  {rows.map(([k, v]) => (
                    <div key={k} className="flex gap-2">
                      <dt className="w-20 shrink-0 text-muted">{k}</dt>
                      <dd className="min-w-0 truncate font-medium">{v}</dd>
                    </div>
                  ))}
                </dl>
              )}
              {r.links?.mtc && (
                <button onClick={() => openFile(r.links!.mtc!.file_id)} className="mt-3 flex items-center gap-1.5 text-xs font-semibold text-moss hover:underline">
                  <FileText size={13} /> Test certificate: {r.links.mtc.name}
                </button>
              )}
              {media.some(Boolean) && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {r.media.map((m, i) =>
                    !media[i] ? null : m.kind === "photo" ? (
                      <a key={i} href={media[i]} target="_blank" rel="noreferrer">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={media[i]} alt={`Evidence ${i + 1}`} className="h-28 w-28 rounded-lg object-cover" />
                      </a>
                    ) : (
                      <audio key={i} controls src={media[i]} className="h-10" />
                    ),
                  )}
                </div>
              )}
            </section>
            {r.type !== "safety" && (
              <SimilarIncidents recordId={r.id} text={[f.title, f.description].filter(Boolean).join(". ")} fields={f} />
            )}
            {r.type === "ncr" && (
              <section className="space-y-3 rounded-xl border border-border bg-surface p-4">
                <h2 className="text-sm font-bold">Containment &amp; corrective action</h2>
                {(["containment", "root_cause", "corrective_action", "verification"] as const).map((k) => (
                  <label key={k} className="block text-sm font-medium">
                    {STATUS_LABEL[k] ?? k.replace("_", " ").replace(/^\w/, (c) => c.toUpperCase())}
                    <textarea value={capa[k] ?? ""} onChange={(e) => setCapa((c) => ({ ...c, [k]: e.target.value }))} disabled={!canManage} rows={2} className="mt-1 w-full resize-none rounded-lg border border-border px-3 py-2 text-sm outline-none focus:border-brand disabled:bg-canvas" />
                  </label>
                ))}
                {canManage && (
                  <button onClick={() => patch(capa, "Saved.")} disabled={busy} className="flex h-9 items-center gap-2 rounded-lg bg-brand px-4 text-sm font-semibold text-white hover:bg-brand-strong disabled:opacity-50">
                    {busy && <Loader2 size={14} className="animate-spin" />} Save
                  </button>
                )}
              </section>
            )}
          </div>
          <div className="space-y-4">
            <section className="rounded-xl border border-border bg-surface p-4 text-sm">
              <h2 className="mb-2 font-bold">Owner</h2>
              <div className="flex items-center gap-2">
                <UserAvatar uid={r.owner} size={28} /> {users[r.owner]?.name ?? "—"}
              </div>
              {canManage && (
                <select value="" onChange={(e) => e.target.value && patch({ owner: e.target.value }, "Reassigned.")} className="mt-2 h-9 w-full rounded-lg border border-border bg-surface px-2 text-sm text-muted" aria-label="Reassign">
                  <option value="">Reassign to…</option>
                  {Object.values(users)
                    .filter((u) => !u.deactivated && u.org_role !== "guest")
                    .map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.name}
                      </option>
                    ))}
                </select>
              )}
            </section>
            <section className="rounded-xl border border-border bg-surface p-4 text-sm">
              <h2 className="mb-2 font-bold">History</h2>
              <ol className="space-y-2">
                {[...r.history].reverse().map((h, i) => (
                  <li key={i} className="flex gap-2">
                    <CheckCircle2 size={14} className="mt-0.5 shrink-0 text-moss" aria-hidden />
                    <span>
                      <b>{STATUS_LABEL[h.status] ?? h.status}</b> {h.by ? `· ${users[h.by]?.name ?? "someone"}` : r.anonymous ? "· anonymous" : ""} <span className="text-muted">{timeShort(h.ts)}</span>
                      {h.note && <span className="block text-xs text-muted">{h.note}</span>}
                    </span>
                  </li>
                ))}
              </ol>
            </section>
          </div>
        </div>
      </div>
    </section>
  );
}

function DrawingRegister({ register }: { register: Drawing[] }) {
  const { toast } = useWs();
  const [busy, setBusy] = useState<string | null>(null);
  async function printCopy(d: Drawing) {
    setBusy(d.id);
    try {
      const token = await getFbAuth().currentUser?.getIdToken();
      const res = await fetch(`${apiUrl()}/api/drawings/${d.id}/stamp`, { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify({ rev: d.current_rev }) });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).detail ?? "Couldn't create the controlled copy");
      const url = URL.createObjectURL(await res.blob());
      const a = document.createElement("a");
      a.href = url;
      a.download = `${d.drawing_no}_Rev${d.current_rev}_CONTROLLED.pdf`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
      toast("Controlled copy downloaded. Its QR code tells anyone who scans it whether it's still current.");
    } catch (e) {
      toast((e as Error).message);
    } finally {
      setBusy(null);
    }
  }
  return (
    <div className="scrollbar-thin flex-1 overflow-y-auto bg-canvas/50 px-4 py-4 lg:px-8">
      <div className="mx-auto max-w-4xl space-y-3">
        <p className="text-sm text-muted">Built from the drawings shared in Saathi. Released revisions are visible to everyone in the workspace; drafts only to people who can open them.</p>
        {register.length === 0 && <p className="py-10 text-center text-sm text-muted">No drawings yet. Share a drawing PDF in any chat and Saathi adds it here.</p>}
        {register.map((d) => {
          const current = d.revisions.find((r) => r.rev === d.current_rev);
          return (
            <section key={d.id} className="rounded-xl border border-border bg-surface p-4">
              <div className="flex flex-wrap items-start gap-3">
                <div className="min-w-0 flex-1">
                  <h2 className="font-mono text-sm font-bold">{d.drawing_no}</h2>
                  <p className="truncate text-sm text-muted">{d.title}</p>
                </div>
                {d.current_rev ? (
                  <span className="rounded-full bg-moss-soft px-2.5 py-0.5 text-xs font-semibold text-moss">Current: Rev {d.current_rev}</span>
                ) : (
                  <span className="rounded-full bg-saffron-soft px-2.5 py-0.5 text-xs font-semibold text-saffron-ink">No released revision</span>
                )}
                {current?.can_open && (
                  <button onClick={() => printCopy(d)} disabled={busy === d.id} className="flex h-8 items-center gap-1.5 rounded-lg bg-ink px-3 text-xs font-semibold text-white disabled:opacity-50">
                    {busy === d.id ? <Loader2 size={13} className="animate-spin" /> : <ScanText size={13} />} Print controlled copy
                  </button>
                )}
              </div>
              <ul className="mt-3 divide-y divide-border text-sm">
                {d.revisions.map((r) => (
                  <li key={r.rev} className="flex items-center gap-3 py-2">
                    <span className="w-14 font-mono font-semibold">Rev {r.rev}</span>
                    <span className={clsx("rounded px-1.5 py-0.5 text-[11px] font-semibold", r.status === "released" ? "bg-moss-soft text-moss" : r.status === "superseded" ? "bg-canvas text-muted line-through" : "bg-saffron-soft text-saffron-ink")}>
                      {r.status === "in_work" ? "Draft, not released" : r.status}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-xs text-muted">
                      {r.approved_by && `Approved by ${r.approved_by}`}
                      {r.date && ` · ${r.date}`}
                    </span>
                    {r.file_id ? (
                      <button onClick={() => openFile(r.file_id!)} className="text-xs font-semibold text-brand hover:underline">
                        Open
                      </button>
                    ) : (
                      <span className="flex items-center gap-1 text-[11px] text-muted" title="The file was shared in a chat you're not in">
                        <Lock size={11} /> {r.can_open ? "" : "No access"}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
      </div>
    </div>
  );
}
