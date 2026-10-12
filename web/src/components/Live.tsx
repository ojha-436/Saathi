"use client";

import clsx from "clsx";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { api } from "@/lib/api";
import { getFbAuth, apiUrl } from "@/lib/firebase";
import {
  AlertTriangle, ArrowLeft, CalendarDays, Check, CheckCircle2, DriveIcon, FileText, FileUp, Loader2, Mail, Plus, Radar, ScrollText, Search, Send,
  Sparkles, Trash2, Video, X,
} from "@/lib/icons";
import type { Briefing, KnowledgeItem, LiveCard, LiveSegment, LiveSession, LiveSessionRow, SourceSuggestion, TopicWiki } from "@/lib/types";
import { rememberKnowledge } from "@/lib/knowledgeNames";
import { audioExt } from "@/lib/voice";
import { CiteChip } from "./bits";
import { useWs } from "./ctx";
import { Modal, ModalHeader } from "./Dialogs";
import { Markdown } from "./Markdown";

const CHUNK_MS = 12_000;
const when = (iso?: string | null) => (iso ? new Date(iso).toLocaleString("en-IN", { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }) : "");

type Source = { ref: string; name: string; kind: "knowledge" | "drive" | "file" | "meeting" | "other"; sub?: string };

function kindOf(ref: string): Source["kind"] {
  return ref.startsWith("kn:") ? "knowledge" : ref.startsWith("drive:") ? "drive" : ref.startsWith("file:") ? "file" : ref.startsWith("meet:") ? "meeting" : "other";
}
const KIND_ICON = { knowledge: ScrollText, drive: DriveIcon as typeof FileText, file: FileText, meeting: CalendarDays, other: Mail };

/** All sources a person can pick as meeting context: their knowledge hub, Drive files and workspace files. */
function useSources(knowledge: KnowledgeItem[]) {
  const { files, driveFiles, meetings } = useWs();
  return useMemo<Source[]>(() => {
    const out: Source[] = knowledge.filter((k) => k.status === "ready").map((k) => ({ ref: k.ref, name: k.name, kind: "knowledge", sub: k.label ? `#${k.label}` : "My knowledge" }));
    for (const d of Object.values(driveFiles)) out.push({ ref: `drive:${d.id}`, name: d.name, kind: "drive", sub: "Google Drive" });
    for (const f of Object.values(files)) out.push({ ref: `file:${f.id}`, name: f.name, kind: "file", sub: f.doc?.title ?? "Shared file" });
    for (const m of Object.values(meetings)) out.push({ ref: `meet:${m.id}`, name: m.title, kind: "meeting", sub: "Meeting summary" });
    return out;
  }, [knowledge, files, driveFiles, meetings]);
}

function SourcePicker({ sources, picked, onChange, suggested }: { sources: Source[]; picked: string[]; onChange: (refs: string[]) => void; suggested: SourceSuggestion[] }) {
  const [q, setQ] = useState("");
  const toggle = (ref: string) => onChange(picked.includes(ref) ? picked.filter((r) => r !== ref) : [...picked, ref]);
  const byRef = Object.fromEntries(sources.map((s) => [s.ref, s]));
  const extra = suggested.filter((s) => !byRef[s.ref]).map((s) => ({ ref: s.ref, name: s.name, kind: kindOf(s.ref), sub: "Suggested" }) as Source);
  const all = [...extra, ...sources];
  const list = all.filter((s) => !q || `${s.name} ${s.sub}`.toLowerCase().includes(q.toLowerCase()));
  const sugg = new Set(suggested.map((s) => s.ref));
  list.sort((a, b) => Number(picked.includes(b.ref)) - Number(picked.includes(a.ref)) || Number(sugg.has(b.ref)) - Number(sugg.has(a.ref)));
  return (
    <div>
      <label className="flex h-9 items-center gap-2 rounded-lg border border-border bg-surface px-3">
        <Search size={14} className="text-muted" aria-hidden />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find files, Drive docs, your uploads, past meetings…" aria-label="Find sources" className="min-w-0 flex-1 bg-transparent text-sm outline-none" />
      </label>
      <ul className="mt-2 grid max-h-72 gap-2 overflow-y-auto sm:grid-cols-2">
        {list.slice(0, 40).map((s) => {
          const Icon = KIND_ICON[s.kind];
          const on = picked.includes(s.ref);
          return (
            <li key={s.ref}>
              <button
                type="button"
                onClick={() => toggle(s.ref)}
                aria-pressed={on}
                className={clsx("flex w-full items-start gap-2.5 rounded-xl border p-2.5 text-left transition", on ? "border-brand bg-brand-soft/50" : "border-border bg-surface hover:border-ink/30")}
              >
                <Icon size={18} className="mt-0.5 shrink-0 text-muted" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] font-semibold">{s.name}</span>
                  <span className="block truncate text-[11px] text-muted">
                    {sugg.has(s.ref) && <span className="font-semibold text-saffron-ink">Suggested · </span>}
                    {s.sub}
                  </span>
                </span>
                <span className={clsx("mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border", on ? "border-brand bg-brand text-white" : "border-border")} aria-hidden>
                  {on && <Check size={11} />}
                </span>
              </button>
            </li>
          );
        })}
        {list.length === 0 && <li className="col-span-2 py-4 text-center text-xs text-muted">Nothing matches. Add files to your knowledge hub below.</li>}
      </ul>
      <p className="mt-1.5 text-[11px] text-muted">{picked.length} included in meeting context · Saathi also searches everything else you can access.</p>
    </div>
  );
}

// ---------------- knowledge hub ----------------

function WikiDialog({ label, onClose }: { label: string; onClose: () => void }) {
  const { toast } = useWs();
  const [w, setW] = useState<TopicWiki | null>(null);
  useEffect(() => {
    api<TopicWiki>("/api/knowledge/wiki", { json: { label } })
      .then(setW)
      .catch((e) => {
        toast((e as Error).message);
        onClose();
      });
  }, [label, toast, onClose]);
  return (
    <Modal title={`Topic: ${label}`} onClose={onClose} wide>
      <ModalHeader title={`#${label}`} sub="Wiki-style overview of everything under this label, with conflicts flagged." onClose={onClose} />
      <div className="max-h-[70vh] space-y-4 overflow-y-auto p-5 text-sm">
        {!w ? (
          <p className="flex items-center gap-2 text-muted"><Loader2 size={15} className="animate-spin" /> Reading {label}…</p>
        ) : (
          <>
            <p className="leading-relaxed">{w.overview}</p>
            {w.contradictions.length > 0 && (
              <section className="rounded-xl border border-rust/30 bg-rust-soft/60 p-3">
                <h3 className="mb-2 flex items-center gap-1.5 font-bold text-rust"><AlertTriangle size={15} /> Sources disagree</h3>
                <ul className="space-y-2.5">
                  {w.contradictions.map((c, i) => (
                    <li key={i}>
                      <p className="font-semibold">{c.topic}</p>
                      <p className="mt-0.5">“{c.a.claim}” <CiteChip refId={c.a.ref} /></p>
                      <p className="mt-0.5">vs “{c.b.claim}” <CiteChip refId={c.b.ref} /></p>
                    </li>
                  ))}
                </ul>
              </section>
            )}
            <section>
              <h3 className="mb-1.5 font-bold">Key facts</h3>
              <ul className="list-disc space-y-1 pl-5">
                {w.key_facts.map((f, i) => (
                  <li key={i}>
                    {f.text} {f.refs.map((r) => <CiteChip key={r} refId={r} />)}
                  </li>
                ))}
              </ul>
            </section>
            {w.open_questions.length > 0 && (
              <section>
                <h3 className="mb-1.5 font-bold">Still unclear</h3>
                <ul className="list-disc space-y-1 pl-5 text-muted">
                  {w.open_questions.map((q, i) => <li key={i}>{q}</li>)}
                </ul>
              </section>
            )}
            <p className="text-xs text-muted">Built from {w.sources.map((s) => s.name).join(", ")}.</p>
          </>
        )}
      </div>
    </Modal>
  );
}

function KnowledgeHub({ items, reload }: { items: KnowledgeItem[]; reload: () => void }) {
  const { toast } = useWs();
  const [label, setLabel] = useState("");
  const [busy, setBusy] = useState(false);
  const [wiki, setWiki] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const labels = [...new Set(items.filter((i) => i.label && i.status === "ready").map((i) => i.label!))];

  async function upload(list: FileList | null) {
    if (!list?.length) return;
    setBusy(true);
    try {
      for (const f of Array.from(list).slice(0, 10)) {
        const form = new FormData();
        form.append("file", f);
        form.append("label", label);
        await api("/api/knowledge", { form });
      }
      toast("Added. Saathi is reading it now.");
      reload();
    } catch (e) {
      toast((e as Error).message);
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  }

  return (
    <section className="rounded-2xl border border-border bg-surface p-4" aria-label="Knowledge hub">
      <div className="flex flex-wrap items-start gap-2">
        <div className="min-w-0 flex-1">
          <h2 className="flex items-center gap-1.5 text-sm font-bold"><ScrollText size={15} /> My knowledge hub</h2>
          <p className="text-xs text-muted">PDFs, notes, images and recordings for meetings and for Saathi&rsquo;s answers. Private to you. Drive files appear automatically when Drive is connected.</p>
        </div>
        <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Label, e.g. Bogie budget" aria-label="Label for new files" className="h-9 w-44 rounded-lg border border-border px-3 text-sm outline-none focus:border-brand" />
        <input ref={input} type="file" multiple hidden accept=".pdf,.txt,.md,.csv,.png,.jpg,.jpeg,.webp,.mp3,.m4a,.wav,.webm,.ogg,.aac" onChange={(e) => upload(e.target.files)} />
        <button onClick={() => input.current?.click()} disabled={busy} className="flex h-9 items-center gap-1.5 rounded-lg bg-brand px-3 text-[13px] font-semibold text-white hover:bg-brand-strong disabled:opacity-50">
          {busy ? <Loader2 size={14} className="animate-spin" /> : <FileUp size={14} />} Add files
        </button>
      </div>
      {labels.length > 0 && (
        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          <span className="text-xs text-muted">Topic wiki:</span>
          {labels.map((l) => (
            <button key={l} onClick={() => setWiki(l)} className="flex h-7 items-center gap-1 rounded-full border border-border px-2.5 text-xs font-semibold hover:border-brand hover:bg-brand-soft">
              <Sparkles size={12} /> #{l}
            </button>
          ))}
        </div>
      )}
      <ul className="mt-3 divide-y divide-border rounded-xl border border-border">
        {items.length === 0 && <li className="px-4 py-6 text-center text-sm text-muted">Nothing yet. Add a project plan, a spec or last week&rsquo;s call recording.</li>}
        {items.map((k) => (
          <li key={k.id} className="flex items-center gap-3 px-3 py-2">
            <ScrollText size={16} className="shrink-0 text-muted" />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[13px] font-semibold">{k.name}</span>
              <span className="block truncate text-[11px] text-muted">
                {k.status === "processing" ? "Reading…" : k.status === "error" ? `Couldn't read it: ${k.error ?? ""}` : k.summary}
              </span>
            </span>
            {k.label && <span className="hidden rounded-md bg-canvas px-1.5 py-0.5 text-[11px] text-muted sm:inline">#{k.label}</span>}
            {k.status === "processing" && <Loader2 size={14} className="animate-spin text-muted" />}
            <button
              onClick={async () => {
                if (!confirm(`Remove ${k.name} from your knowledge hub?`)) return;
                await api(`/api/knowledge/${k.id}`, { method: "DELETE" }).catch((e) => toast((e as Error).message));
                reload();
              }}
              aria-label={`Remove ${k.name}`}
              className="rounded p-1 text-muted hover:bg-hover hover:text-rust"
            >
              <Trash2 size={14} />
            </button>
          </li>
        ))}
      </ul>
      {wiki && <WikiDialog label={wiki} onClose={() => setWiki(null)} />}
    </section>
  );
}

// ---------------- recording ----------------

type RecState = "idle" | "starting" | "recording" | "paused";

/** Microphone (+ optionally the meeting tab's audio) mixed into one stream and cut into standalone chunks. */
function useLiveRecorder(onChunk: (blob: Blob) => void, onError: (msg: string) => void) {
  const [state, setState] = useState<RecState>("idle");
  const [tab, setTab] = useState(false);
  const [level, setLevel] = useState(0);
  const ctx = useRef<AudioContext | null>(null);
  const dest = useRef<MediaStreamAudioDestinationNode | null>(null);
  const streams = useRef<MediaStream[]>([]);
  const rec = useRef<MediaRecorder | null>(null);
  const running = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const raf = useRef<number | null>(null);
  const cb = useRef(onChunk);
  useEffect(() => {
    cb.current = onChunk;
  }, [onChunk]);

  // Each chunk is its own recorder run, so every upload is a complete, playable file.
  const cycle = useRef<() => void>(() => {});
  useEffect(() => {
    cycle.current = () => {
      if (!dest.current || !running.current) return;
      const mime = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"].find((m) => MediaRecorder.isTypeSupported(m));
      const r = new MediaRecorder(dest.current.stream, mime ? { mimeType: mime } : undefined);
      const parts: Blob[] = [];
      r.ondataavailable = (e) => e.data.size && parts.push(e.data);
      r.onstop = () => {
        if (parts.length) cb.current(new Blob(parts, { type: r.mimeType || "audio/webm" }));
        if (running.current) cycle.current();
      };
      rec.current = r;
      r.start();
      timer.current = setTimeout(() => r.state === "recording" && r.stop(), CHUNK_MS);
    };
  }, []);

  const attach = useCallback((s: MediaStream) => {
    if (!ctx.current || !dest.current) return;
    ctx.current.createMediaStreamSource(s).connect(dest.current);
    streams.current.push(s);
  }, []);

  async function start() {
    setState("starting");
    try {
      const mic = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
      ctx.current = new AudioContext();
      dest.current = ctx.current.createMediaStreamDestination();
      const analyser = ctx.current.createAnalyser();
      analyser.fftSize = 256;
      ctx.current.createMediaStreamSource(mic).connect(analyser);
      attach(mic);
      const buf = new Uint8Array(analyser.frequencyBinCount);
      const tick = () => {
        analyser.getByteFrequencyData(buf);
        setLevel(Math.min(1, buf.reduce((a, b) => a + b, 0) / buf.length / 60));
        raf.current = requestAnimationFrame(tick);
      };
      tick();
      running.current = true;
      cycle.current();
      setState("recording");
    } catch {
      setState("idle");
      onError("Saathi needs microphone access to listen. Allow it in the browser's address bar.");
    }
  }

  async function addTab() {
    try {
      const s = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
      if (!s.getAudioTracks().length) {
        s.getTracks().forEach((t) => t.stop());
        onError("No tab audio. Share the meeting tab and tick “Also share tab audio”.");
        return;
      }
      attach(s);
      setTab(true);
      s.getAudioTracks()[0].addEventListener("ended", () => setTab(false));
    } catch {
      /* the person cancelled the picker */
    }
  }

  function pause() {
    running.current = false;
    if (timer.current) clearTimeout(timer.current);
    if (rec.current?.state === "recording") rec.current.stop();
    setState("paused");
  }

  function resume() {
    running.current = true;
    cycle.current();
    setState("recording");
  }

  const stop = useCallback(() => {
    running.current = false;
    if (timer.current) clearTimeout(timer.current);
    if (rec.current?.state === "recording") rec.current.stop();
    if (raf.current) cancelAnimationFrame(raf.current);
    streams.current.forEach((s) => s.getTracks().forEach((t) => t.stop()));
    streams.current = [];
    void ctx.current?.close();
    ctx.current = null;
    dest.current = null;
    setTab(false);
    setLevel(0);
    setState("idle");
  }, []);

  useEffect(() => stop, [stop]);
  return { state, tab, level, start, addTab, pause, resume, stop };
}

// ---------------- HUD ----------------

function Hud({ cards, onDismiss, onAsk, size, setSize, dark }: { cards: LiveCard[]; onDismiss: (id: string) => void; onAsk: (q: string) => Promise<void>; size: number; setSize: (n: number) => void; dark?: boolean }) {
  const [q, setQ] = useState("");
  const [asking, setAsking] = useState(false);
  const shown = cards.filter((c) => !c.dismissed).slice().reverse();
  return (
    <div className={clsx("flex h-full min-h-0 flex-col", dark ? "bg-[#202124] text-white" : "")}>
      <div className="flex items-center gap-2 px-4 pb-2 pt-3">
        <Radar size={18} className={dark ? "text-saffron" : "text-brand"} />
        <span className="flex-1 text-sm font-bold">Saathi Live</span>
        <button onClick={() => setSize(Math.max(12, size - 1))} className="rounded px-1.5 text-xs font-bold opacity-70 hover:opacity-100" aria-label="Smaller text">A−</button>
        <button onClick={() => setSize(Math.min(22, size + 1))} className="rounded px-1.5 text-xs font-bold opacity-70 hover:opacity-100" aria-label="Bigger text">A+</button>
      </div>
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 pb-3" style={{ fontSize: size }} aria-live="polite">
        {shown.length === 0 && <p className={clsx("pt-6 text-center text-sm", dark ? "text-white/60" : "text-muted")}>When someone asks a question, the answer from your sources appears here.</p>}
        {shown.map((c) => (
          <article key={c.id} className={clsx("ws-pop rounded-xl p-3", dark ? "bg-white/10" : "border border-border bg-surface")}>
            <div className="flex items-start gap-2">
              <h3 className="min-w-0 flex-1 font-bold leading-snug">{c.question}</h3>
              <button onClick={() => onDismiss(c.id)} aria-label="Dismiss" className="opacity-60 hover:opacity-100"><X size={14} /></button>
            </div>
            {c.asked_by && <p className={clsx("text-[11px]", dark ? "text-white/50" : "text-muted")}>asked by {c.asked_by}</p>}
            <div className={clsx("mt-1.5 leading-relaxed", !c.found && "italic opacity-70", dark && "[&_a]:text-white")}>
              <Markdown text={c.answer} />
            </div>
            {c.refs.length > 0 && <div className="mt-1.5 flex flex-wrap gap-1">{c.refs.map((r) => <CiteChip key={r} refId={r} />)}</div>}
          </article>
        ))}
      </div>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          if (!q.trim()) return;
          setAsking(true);
          await onAsk(q.trim());
          setQ("");
          setAsking(false);
        }}
        className="flex gap-2 px-4 pb-4"
      >
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Ask Saathi a question…" aria-label="Ask during the meeting" className={clsx("h-10 min-w-0 flex-1 rounded-xl px-3 text-sm outline-none", dark ? "bg-white/10 text-white placeholder:text-white/50" : "border border-border bg-surface focus:border-brand")} />
        <button disabled={asking || !q.trim()} aria-label="Ask" className="flex h-10 w-10 items-center justify-center rounded-xl bg-saffron text-ink disabled:opacity-40">
          {asking ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}
        </button>
      </form>
    </div>
  );
}

/** Opens the HUD in an always-on-top Picture-in-Picture window (Chrome/Edge), so it floats over Meet, Teams or Zoom. */
function usePip() {
  const [win, setWin] = useState<Window | null>(null);
  const open = useCallback(async () => {
    const dpip = (window as unknown as { documentPictureInPicture?: { requestWindow: (o: { width: number; height: number }) => Promise<Window> } }).documentPictureInPicture;
    if (!dpip) return false;
    const w = await dpip.requestWindow({ width: 400, height: 620 });
    for (const sheet of Array.from(document.styleSheets)) {
      try {
        const style = w.document.createElement("style");
        style.textContent = Array.from(sheet.cssRules).map((r) => r.cssText).join("\n");
        w.document.head.appendChild(style);
      } catch {
        if (sheet.href) {
          const link = w.document.createElement("link");
          link.rel = "stylesheet";
          link.href = sheet.href;
          w.document.head.appendChild(link);
        }
      }
    }
    w.document.documentElement.className = document.documentElement.className;
    w.document.body.className = `${document.body.className} h-screen overflow-hidden`;
    w.document.title = "Saathi Live";
    w.addEventListener("pagehide", () => setWin(null));
    setWin(w);
    return true;
  }, []);
  const close = useCallback(() => win?.close(), [win]);
  return { win, open, close };
}

// ---------------- live session ----------------

function SessionView({ id, onExit }: { id: string; onExit: () => void }) {
  const { toast, open, users, uid } = useWs();
  const [s, setS] = useState<LiveSession | null>(null);
  const [segments, setSegments] = useState<LiveSegment[]>([]);
  const [cards, setCards] = useState<LiveCard[]>([]);
  const [notes, setNotes] = useState("");
  const [pending, setPending] = useState(0);
  const [size, setSize] = useState(15);
  const [ending, setEnding] = useState(false);
  const [attendees, setAttendees] = useState<string[]>([]);
  const [seconds, setSeconds] = useState(0);
  const seq = useRef(0);
  const queue = useRef<Promise<void>>(Promise.resolve());
  const transcriptEnd = useRef<HTMLDivElement>(null);
  const pip = usePip();

  useEffect(() => {
    api<LiveSession>(`/api/live/sessions/${id}`)
      .then((d) => {
        setS(d);
        setSegments(d.segments);
        setCards(d.cards);
        setNotes(d.notes ?? "");
        seq.current = (d.segments.at(-1)?.seq ?? -1) + 1;
      })
      .catch((e) => toast((e as Error).message));
  }, [id, toast]);

  const send = useCallback(
    (blob: Blob) => {
      const n = seq.current++;
      setPending((p) => p + 1);
      queue.current = queue.current.then(async () => {
        try {
          const token = await getFbAuth().currentUser?.getIdToken();
          const form = new FormData();
          form.append("seq", String(n));
          form.append("audio", blob, `chunk.${audioExt(blob.type)}`);
          const res = await fetch(`${apiUrl()}/api/live/sessions/${id}/audio`, { method: "POST", headers: { Authorization: `Bearer ${token}` }, body: form });
          if (res.ok) {
            const d = (await res.json()) as { segment: LiveSegment | null; cards: LiveCard[] };
            if (d.segment) setSegments((x) => [...x, d.segment!]);
            if (d.cards.length) setCards((x) => [...x, ...d.cards]);
          } else if (res.status === 429) toast("Slow down: too many chunks per minute.");
        } catch {
          /* network blip: this chunk is lost, the next one continues */
        } finally {
          setPending((p) => p - 1);
        }
      });
    },
    [id, toast],
  );
  const rec = useLiveRecorder(send, toast);

  useEffect(() => {
    if (rec.state !== "recording") return;
    const t = setInterval(() => setSeconds((x) => x + 1), 1000);
    return () => clearInterval(t);
  }, [rec.state]);
  useEffect(() => {
    transcriptEnd.current?.scrollIntoView({ block: "end" }); // braces: newer Chrome returns a Promise here, which React would treat as a cleanup
  }, [segments.length]);

  const ask = useCallback(
    async (q: string) => {
      try {
        const c = await api<LiveCard>(`/api/live/sessions/${id}/ask`, { json: { question: q } });
        setCards((x) => [...x, c]);
      } catch (e) {
        toast((e as Error).message);
      }
    },
    [id, toast],
  );
  const dismiss = useCallback(
    (cid: string) => {
      setCards((x) => x.map((c) => (c.id === cid ? { ...c, dismissed: true } : c)));
      void api(`/api/live/sessions/${id}/cards/${cid}/dismiss`, { method: "POST" }).catch(() => {});
    },
    [id],
  );

  async function finish(save: boolean) {
    rec.stop();
    pip.close();
    setEnding(true);
    try {
      await new Promise((r) => setTimeout(r, 400)); // let the last chunk queue up after the recorder stops
      await queue.current;
      const r = await api<{ meeting_id: string | null }>(`/api/live/sessions/${id}/end`, { json: { notes, attendee_ids: attendees, save } });
      if (r.meeting_id) {
        toast("Meeting notes ready.");
        open({ kind: "meeting", id: r.meeting_id });
      } else onExit();
    } catch (e) {
      toast((e as Error).message);
      setEnding(false);
    }
  }

  if (!s) return <p className="flex items-center gap-2 p-6 text-sm text-muted"><Loader2 size={15} className="animate-spin" /> Loading…</p>;
  const live = s.status === "live";
  const mm = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
  const hud = <Hud cards={cards} onDismiss={dismiss} onAsk={ask} size={size} setSize={setSize} dark={!!pip.win} />;

  return (
    <section className="flex min-h-0 flex-1 flex-col" aria-label="Live meeting">
      <header className="flex min-h-14 shrink-0 flex-wrap items-center gap-2 border-b border-border px-4 py-2 lg:px-6">
        <button onClick={onExit} aria-label="Back" className="flex h-9 w-9 items-center justify-center rounded-lg text-muted hover:bg-hover"><ArrowLeft size={18} /></button>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-[15px] font-bold leading-tight">{s.title}</h1>
          <p className="flex items-center gap-1.5 text-xs text-muted">
            {rec.state === "recording" ? (
              <>
                <span className="relative flex h-2 w-2"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-rust opacity-60" /><span className="relative inline-flex h-2 w-2 rounded-full bg-rust" /></span>
                Listening · {mm}
                <span className="ml-1 inline-block h-1.5 w-16 overflow-hidden rounded bg-canvas"><span className="block h-full bg-moss transition-[width]" style={{ width: `${rec.level * 100}%` }} /></span>
                {rec.tab ? " · mic + meeting tab" : " · mic only"}
              </>
            ) : live ? (
              rec.state === "paused" ? "Paused" : "Ready"
            ) : (
              `Ended · ${when(s.started_at)}`
            )}
            {pending > 0 && <span> · transcribing…</span>}
          </p>
        </div>
        {live && rec.state === "idle" && (
          <button onClick={rec.start} className="flex h-9 items-center gap-1.5 rounded-lg bg-rust px-3 text-[13px] font-semibold text-white">
            <Radar size={15} /> Start listening
          </button>
        )}
        {live && rec.state !== "idle" && (
          <>
            {!rec.tab && rec.state === "recording" && (
              <button onClick={rec.addTab} className="flex h-9 items-center gap-1.5 rounded-lg border border-border px-3 text-[13px] font-semibold hover:bg-hover" title="Share the Meet / Teams / Zoom tab with its audio so Saathi hears everyone">
                <Video size={15} /> Add meeting tab audio
              </button>
            )}
            <button onClick={rec.state === "paused" ? rec.resume : rec.pause} className="h-9 rounded-lg border border-border px-3 text-[13px] font-semibold hover:bg-hover">
              {rec.state === "paused" ? "Resume" : "Pause"}
            </button>
          </>
        )}
        {live && (
          <button
            onClick={async () => {
              if (!(await pip.open())) toast("Pop-out works in Chrome and Edge. Keep this tab beside your meeting instead.");
            }}
            className="hidden h-9 items-center gap-1.5 rounded-lg border border-border px-3 text-[13px] font-semibold hover:bg-hover md:flex"
            title="Float the answers over your meeting window"
          >
            <Sparkles size={15} /> Pop out
          </button>
        )}
        {live && (
          <button onClick={() => setEnding(true)} className="h-9 rounded-lg bg-brand px-3 text-[13px] font-semibold text-white hover:bg-brand-strong">
            End meeting
          </button>
        )}
        {!live && s.meeting_id && (
          <button onClick={() => open({ kind: "meeting", id: s.meeting_id! })} className="h-9 rounded-lg bg-brand px-3 text-[13px] font-semibold text-white">Open meeting notes</button>
        )}
      </header>
      {live && (
        <p className="border-b border-border bg-saffron-soft/60 px-4 py-1.5 text-[12px] text-saffron-ink lg:px-6">
          Let everyone know Saathi is transcribing. Audio isn&rsquo;t stored; the transcript stays private to you until you share the notes.
        </p>
      )}
      <div className="grid min-h-0 flex-1 lg:grid-cols-[1fr_400px]">
        <div className="flex min-h-0 flex-col border-border lg:border-r">
          <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto px-4 py-4 lg:px-6">
            <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">Transcript</h2>
            {segments.length === 0 ? (
              <p className="text-sm text-muted">{live ? "Start listening. Text appears every ~12 seconds." : "No transcript."}</p>
            ) : (
              <div className="space-y-2 text-[14.5px] leading-relaxed">
                {segments.map((g) => (
                  <p key={g.seq} className="whitespace-pre-wrap">{g.text}</p>
                ))}
              </div>
            )}
            <div ref={transcriptEnd} />
          </div>
          <label className="block border-t border-border px-4 py-3 lg:px-6">
            <span className="text-xs font-semibold uppercase tracking-wide text-muted">Your notes</span>
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} disabled={!live} rows={4} placeholder="Shorthand is fine. Saathi fills in the details from the transcript when you end the meeting." className="mt-1 w-full resize-none rounded-lg border border-border px-3 py-2 text-sm outline-none focus:border-brand disabled:bg-canvas" />
          </label>
        </div>
        <div className="flex min-h-0 flex-col bg-canvas/50">
          {pip.win ? (
            <div className="m-4 rounded-xl border border-dashed border-border p-4 text-center text-sm text-muted">
              Answers are in the floating window. <button onClick={pip.close} className="font-semibold text-brand">Bring them back</button>
            </div>
          ) : (
            hud
          )}
        </div>
      </div>
      {pip.win && createPortal(hud, pip.win.document.body)}
      {ending && (
        <Modal title="End meeting" onClose={() => setEnding(false)}>
          <ModalHeader title="End and write up the meeting" sub="Saathi turns the transcript and your notes into a summary, decisions, action items and enhanced notes." onClose={() => setEnding(false)} />
          <div className="space-y-3 p-5">
            <div>
              <p className="text-sm font-medium">Share the notes with</p>
              <div className="mt-1.5 flex max-h-40 flex-wrap gap-1.5 overflow-y-auto">
                {Object.values(users).filter((u) => u.id !== uid && !u.deactivated && u.org_role !== "guest").map((u) => {
                  const on = attendees.includes(u.id);
                  return (
                    <button key={u.id} type="button" onClick={() => setAttendees((a) => (on ? a.filter((x) => x !== u.id) : [...a, u.id]))} aria-pressed={on} className={clsx("h-7 rounded-full border px-2.5 text-xs font-medium", on ? "border-brand bg-brand-soft text-brand" : "border-border text-muted")}>
                      {u.name}
                    </button>
                  );
                })}
              </div>
              <p className="mt-1 text-[11px] text-muted">Only the summary, decisions, actions and enhanced notes are shared. The raw transcript stays with you.</p>
            </div>
            <div className="flex flex-wrap justify-end gap-2 pt-2">
              <button onClick={() => finish(false)} className="h-9 rounded-lg border border-border px-3 text-[13px] font-semibold hover:bg-hover">End without notes</button>
              <button onClick={() => finish(true)} className="flex h-9 items-center gap-1.5 rounded-lg bg-brand px-4 text-[13px] font-semibold text-white hover:bg-brand-strong">
                <CheckCircle2 size={15} /> End and write notes
              </button>
            </div>
          </div>
        </Modal>
      )}
    </section>
  );
}

// ---------------- home ----------------

export function LiveView({ sessionId }: { sessionId?: string }) {
  const { open, toast } = useWs();
  const [knowledge, setKnowledge] = useState<KnowledgeItem[]>([]);
  const [sessions, setSessions] = useState<LiveSessionRow[]>([]);
  const [brief, setBrief] = useState<Briefing | null>(null);
  const [title, setTitle] = useState("");
  const [picked, setPicked] = useState<string[]>([]);
  const [suggested, setSuggested] = useState<SourceSuggestion[]>([]);
  const [eventId, setEventId] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [version, setVersion] = useState(0);
  const reload = useCallback(() => setVersion((v) => v + 1), []);
  const sources = useSources(knowledge);

  useEffect(() => {
    if (sessionId) return;
    api<KnowledgeItem[]>("/api/knowledge")
      .then((k) => {
        rememberKnowledge(k);
        setKnowledge(k);
      })
      .catch(() => {});
    api<LiveSessionRow[]>("/api/live/sessions").then(setSessions).catch(() => {});
  }, [sessionId, version]);
  useEffect(() => {
    if (!sessionId) api<Briefing>("/api/live/briefing").then(setBrief).catch(() => setBrief({ connected: false, meetings: [] }));
  }, [sessionId]);
  // keep polling while uploads are being read
  useEffect(() => {
    if (!knowledge.some((k) => k.status === "processing")) return;
    const t = setTimeout(reload, 3000);
    return () => clearTimeout(t);
  }, [knowledge, reload]);
  useEffect(() => {
    if (title.trim().length < 4) return;
    const t = setTimeout(() => api<SourceSuggestion[]>(`/api/live/suggest?q=${encodeURIComponent(title)}`).then(setSuggested).catch(() => {}), 500);
    return () => clearTimeout(t);
  }, [title]);

  if (sessionId) return <SessionView key={sessionId} id={sessionId} onExit={() => open({ kind: "live" })} />;

  async function start() {
    setStarting(true);
    try {
      const r = await api<{ id: string }>("/api/live/sessions", { json: { title: title.trim() || "Meeting", context_refs: picked, event_id: eventId } });
      open({ kind: "live", sessionId: r.id });
    } catch (e) {
      toast((e as Error).message);
      setStarting(false);
    }
  }

  return (
    <section className="flex min-h-0 flex-1 flex-col" aria-label="Saathi Live">
      <header className="flex h-14 shrink-0 items-center gap-3 border-b border-border px-4 lg:h-12 lg:px-6">
        <Radar size={18} className="text-muted" aria-hidden />
        <div className="min-w-0 flex-1">
          <h1 className="text-[15px] font-bold leading-tight">Saathi Live</h1>
          <p className="hidden truncate text-xs text-muted sm:block">Your in-meeting copilot: it listens, spots questions and answers them from your sources as they&rsquo;re asked.</p>
        </div>
      </header>
      <div className="scrollbar-thin flex-1 overflow-y-auto bg-canvas/50 px-4 py-4 lg:px-8">
        <div className="mx-auto max-w-4xl space-y-4">
          {brief?.connected && brief.meetings.length > 0 && (
            <section className="rounded-2xl border border-border bg-surface p-4" aria-label="Today's briefing">
              <h2 className="mb-2 flex items-center gap-1.5 text-sm font-bold"><CalendarDays size={15} /> Coming up</h2>
              <ul className="space-y-2">
                {brief.meetings.map((m) => (
                  <li key={m.id} className="rounded-xl border border-border p-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-semibold">{m.title}</span>
                        <span className="block text-xs text-muted">{when(m.start)}{m.attendees.length ? ` · ${m.attendees.join(", ")}` : ""}</span>
                      </span>
                      <button
                        onClick={() => {
                          setTitle(m.title);
                          setEventId(m.id);
                          setPicked(m.sources.map((x) => x.ref));
                          setSuggested(m.sources);
                          document.getElementById("live-title")?.focus();
                        }}
                        className="h-8 rounded-lg border border-border px-2.5 text-xs font-semibold hover:bg-hover"
                      >
                        Prepare
                      </button>
                    </div>
                    {m.sources.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1">{m.sources.map((x) => <CiteChip key={x.ref} refId={x.ref} />)}</div>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section className="rounded-2xl border border-brand/25 bg-surface p-4" aria-label="Start">
            <h2 className="mb-2 flex items-center gap-1.5 text-sm font-bold"><Sparkles size={15} className="text-brand" /> Start a live meeting</h2>
            <input id="live-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Meeting title, e.g. Bogie prototype weekly" aria-label="Meeting title" className="h-10 w-full rounded-lg border border-border px-3 text-sm outline-none focus:border-brand" />
            <p className="mb-1.5 mt-3 text-[13px] font-semibold">Include in meeting context</p>
            <SourcePicker sources={sources} picked={picked} onChange={setPicked} suggested={suggested} />
            <div className="mt-3 flex items-center justify-end">
              <button onClick={start} disabled={starting} className="flex h-10 items-center gap-1.5 rounded-lg bg-brand px-4 text-sm font-semibold text-white hover:bg-brand-strong disabled:opacity-50">
                {starting ? <Loader2 size={15} className="animate-spin" /> : <Radar size={15} />} Start live assistant
              </button>
            </div>
          </section>

          <KnowledgeHub items={knowledge} reload={reload} />

          {sessions.length > 0 && (
            <section>
              <h2 className="mb-2 text-sm font-bold">Past live meetings</h2>
              <ul className="overflow-hidden rounded-xl border border-border bg-surface">
                {sessions.map((x) => (
                  <li key={x.id}>
                    <button onClick={() => open({ kind: "live", sessionId: x.id })} className="flex w-full items-center gap-3 border-b border-border px-4 py-2.5 text-left last:border-b-0 hover:bg-canvas/60">
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold">{x.title}</span>
                        <span className="block text-xs text-muted">{when(x.started_at)}</span>
                      </span>
                      <span className={clsx("rounded-full px-2 py-0.5 text-[11px] font-semibold", x.status === "live" ? "bg-rust-soft text-rust" : "bg-canvas text-muted")}>{x.status === "live" ? "Live" : x.meeting_id ? "Notes ready" : "Ended"}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}
          <p className="flex items-center justify-center gap-1.5 pb-4 text-center text-xs text-muted">
            <Plus size={12} /> Tip: in Chrome, “Pop out” floats the answers over Meet, Teams or Zoom.
          </p>
        </div>
      </div>
    </section>
  );
}
