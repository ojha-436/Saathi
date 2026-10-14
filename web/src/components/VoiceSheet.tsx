"use client";

import clsx from "clsx";
import { CheckCircle2, Loader2, Octagon, Timer, X } from "@/lib/icons";
import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import { apiUrl, getFbAuth } from "@/lib/firebase";
import { CiteChip } from "./bits";
import { useWs } from "./ctx";

type Phase = "connecting" | "idle" | "listening" | "thinking" | "speaking" | "error";
type Draft = { draft_id: string; type: string; fields: Record<string, string | null> };
type Card =
  | { kind: "draft"; draft: Draft; state: "open" | "filed" | "discarded"; number?: string }
  | { kind: "reminder"; task_id: string; title: string; due_at: string | null; state: "open" | "confirmed" };

const TOOL_TEXT: Record<string, string> = {
  revision_status: "Checking the drawing register…",
  shift_handover: "Reading the shift handover…",
  search_workspace: "Searching chats and files…",
  spec_check: "Checking the certificate…",
  similar_incidents: "Checking plant memory…",
  my_tasks: "Looking at your tasks…",
  draft_report: "Drafting the report…",
  file_report: "Filing the report…",
  draft_reminder: "Drafting the reminder…",
};
const TYPE_LABEL: Record<string, string> = { ncr: "Defect (NCR)", downtime: "Downtime", safety: "Safety near miss" };

/** Saathi Voice: hold to talk, hear the answer, see the sources. Gemini Live with Saathi's permission-scoped tools. */
export function VoiceSheet({ onClose }: { onClose: () => void }) {
  const { toast } = useWs();
  const [phase, setPhase] = useState<Phase>("connecting");
  const [error, setError] = useState("");
  const [heard, setHeard] = useState("");
  const [reply, setReply] = useState("");
  const [tool, setTool] = useState("");
  const [sources, setSources] = useState<string[]>([]);
  const [cards, setCards] = useState<Card[]>([]);
  const [level, setLevel] = useState(0);
  const ws = useRef<WebSocket | null>(null);
  const mic = useRef<{ ctx: AudioContext; stream: MediaStream; analyser: AnalyserNode } | null>(null);
  const out = useRef<{ ctx: AudioContext; next: number; sources: AudioBufferSourceNode[] } | null>(null);
  const talking = useRef(false);
  const raf = useRef(0);

  const stopPlayback = useCallback(() => {
    const o = out.current;
    if (!o) return;
    o.sources.forEach((s) => {
      try {
        s.stop();
      } catch {}
    });
    o.sources = [];
    o.next = o.ctx.currentTime;
  }, []);

  const play = useCallback((buf: ArrayBuffer) => {
    if (!out.current) {
      const ctx = new AudioContext({ sampleRate: 24000 });
      out.current = { ctx, next: ctx.currentTime, sources: [] };
    }
    const o = out.current;
    const pcm = new Int16Array(buf);
    const audio = o.ctx.createBuffer(1, pcm.length, 24000);
    const ch = audio.getChannelData(0);
    for (let i = 0; i < pcm.length; i++) ch[i] = pcm[i] / 0x8000;
    const src = o.ctx.createBufferSource();
    src.buffer = audio;
    src.connect(o.ctx.destination);
    const at = Math.max(o.ctx.currentTime + 0.02, o.next);
    src.start(at);
    o.next = at + audio.duration;
    o.sources.push(src);
    src.onended = () => {
      o.sources = o.sources.filter((s) => s !== src);
      if (!o.sources.length && !talking.current) setPhase((p) => (p === "speaking" ? "idle" : p));
    };
    setPhase((p) => (p === "listening" ? p : "speaking"));
  }, []);

  // connect once when the sheet opens
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const token = await getFbAuth().currentUser?.getIdToken();
        const sock = new WebSocket(`${apiUrl().replace(/^http/, "ws")}/api/voice/ws`);
        sock.binaryType = "arraybuffer";
        sock.onopen = () => sock.send(JSON.stringify({ token }));
        sock.onmessage = (ev) => {
          if (typeof ev.data !== "string") {
            play(ev.data as ArrayBuffer);
            return;
          }
          const m = JSON.parse(ev.data);
          if (m.type === "ready") setPhase("idle");
          else if (m.type === "user_text") setHeard(m.text);
          else if (m.type === "saathi_text") {
            setReply(m.text);
            setTool("");
          } else if (m.type === "tool") {
            setTool(TOOL_TEXT[m.name] ?? "Working…");
            setPhase("thinking");
          } else if (m.type === "sources") setSources((s) => Array.from(new Set([...s, ...m.refs])).slice(-6));
          else if (m.type === "draft") setCards((c) => [{ kind: "draft", draft: m.draft, state: "open" }, ...c]);
          else if (m.type === "filed")
            setCards((c) => c.map((x) => (x.kind === "draft" && x.draft.draft_id === m.draft_id ? { ...x, state: "filed", number: m.number } : x)));
          else if (m.type === "reminder") setCards((c) => [{ kind: "reminder", task_id: m.task_id, title: m.title, due_at: m.due_at, state: "open" }, ...c]);
          else if (m.type === "interrupted") stopPlayback();
          else if (m.type === "turn_complete") setTool("");
          else if (m.type === "error") {
            setError(m.message);
            setPhase("error");
          }
        };
        sock.onclose = () => {
          if (!cancelled) setPhase((p) => (p === "error" ? p : "error"));
          setError((e) => e || "Voice session ended. Close and open again to talk.");
        };
        ws.current = sock;
        // microphone (the click that opened the sheet counts as the user gesture)
        const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
        const ctx = new AudioContext({ sampleRate: 16000 });
        await ctx.audioWorklet.addModule("/pcm-worklet.js");
        const node = new AudioWorkletNode(ctx, "pcm-worklet");
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 256;
        const srcNode = ctx.createMediaStreamSource(stream);
        srcNode.connect(node);
        srcNode.connect(analyser);
        node.port.onmessage = (e) => {
          if (talking.current && ws.current?.readyState === WebSocket.OPEN) ws.current.send(e.data as ArrayBuffer);
        };
        mic.current = { ctx, stream, analyser };
        const buf = new Uint8Array(analyser.frequencyBinCount);
        const tick = () => {
          analyser.getByteFrequencyData(buf);
          setLevel(talking.current ? Math.min(1, buf.reduce((x, y) => x + y, 0) / buf.length / 50) : 0);
          raf.current = requestAnimationFrame(tick);
        };
        tick();
      } catch {
        setError("Saathi needs microphone access to listen. Allow it in the browser's address bar.");
        setPhase("error");
      }
    })();
    return () => {
      cancelled = true;
      cancelAnimationFrame(raf.current);
      try {
        ws.current?.send(JSON.stringify({ type: "stop" }));
      } catch {}
      ws.current?.close();
      mic.current?.stream.getTracks().forEach((t) => t.stop());
      mic.current?.ctx.close();
      out.current?.ctx.close();
    };
  }, [play, stopPlayback]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const downAt = useRef<number>(0);
  const isToggled = useRef<boolean>(false);

  function press() {
    if (phase === "connecting" || phase === "error") return;
    if (isToggled.current) {
      isToggled.current = false;
      release();
      return;
    }
    if (talking.current) return;
    stopPlayback(); // barge-in
    talking.current = true;
    downAt.current = Date.now();
    setHeard("");
    setReply("");
    setSources([]);
    setPhase("listening");
    ws.current?.send(JSON.stringify({ type: "start" }));
  }

  function handlePointerUp() {
    if (!talking.current) return;
    const dur = Date.now() - downAt.current;
    if (dur < 250) {
      // Short tap: keep listening active in toggle mode until tapped again
      isToggled.current = true;
    } else {
      // Hold-to-talk release
      isToggled.current = false;
      release();
    }
  }

  function release() {
    if (!talking.current) return;
    talking.current = false;
    isToggled.current = false;
    setPhase("thinking");
    ws.current?.send(JSON.stringify({ type: "end" }));
  }

  async function confirmReminder(id: string) {
    try {
      await api(`/api/tasks/${id}/confirm`, { method: "POST" });
      setCards((c) => c.map((x) => (x.kind === "reminder" && x.task_id === id ? { ...x, state: "confirmed" } : x)));
    } catch (e) {
      toast((e as Error).message);
    }
  }

  const status = {
    connecting: "Connecting…",
    idle: "Tap or hold to talk",
    listening: isToggled.current ? "Listening… tap to finish" : "Listening… release when done",
    thinking: tool || "Thinking…",
    speaking: "Saathi is speaking · press to interrupt",
    error: error,
  }[phase];

  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center bg-ink/60 sm:items-center sm:p-6" onMouseDown={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Talk to Saathi"
        onMouseDown={(e) => e.stopPropagation()}
        className="ws-pop flex max-h-[100dvh] w-full max-w-lg flex-col overflow-hidden rounded-t-3xl bg-ink text-white shadow-2xl sm:rounded-3xl"
      >
        <div className="flex items-center gap-2 px-5 pt-4">
          <span className="text-sm font-semibold">Saathi Voice</span>
          <span className="rounded-full bg-white/10 px-2 py-0.5 text-[10.5px] text-white/70">Hindi · English · Marathi · Tamil · Telugu</span>
          <button onClick={onClose} aria-label="Close voice" className="ml-auto flex h-9 w-9 items-center justify-center rounded-full text-white/70 hover:bg-white/10">
            <X size={18} />
          </button>
        </div>

        <div className="scrollbar-thin flex-1 overflow-y-auto px-5 pb-2 pt-3" aria-live="polite">
          {heard && <p className="text-sm text-white/60">“{heard}”</p>}
          <p className={clsx("mt-2 min-h-[3.5rem] text-xl font-medium leading-snug", !reply && "text-white/40")}>{reply || (phase === "idle" ? "Puchiye: “Bay 2 mein CNC-3 ka kya status hai?”" : "")}</p>
          {!heard && !reply && (
            <div className="mt-4 space-y-2">
              <p className="text-[11px] font-medium uppercase tracking-wider text-white/50">Shop floor prompt hints</p>
              <div className="flex flex-wrap gap-1.5">
                {[
                  "Bogie prototype inspection readiness check",
                  "Heat H-78120 limits check karo",
                  "Bay 2 welding crack NCR draft karo",
                ].map((hint) => (
                  <button
                    key={hint}
                    type="button"
                    onClick={() => {
                      press();
                      setHeard(hint);
                      if (typeof window !== "undefined" && "speechSynthesis" in window) {
                        try {
                          const u = new SpeechSynthesisUtterance(hint);
                          u.lang = hint.includes("karo") ? "hi-IN" : "en-IN";
                          window.speechSynthesis.speak(u);
                        } catch {}
                      }
                    }}
                    className="rounded-lg border border-white/15 bg-white/5 px-2.5 py-1.5 text-left text-xs text-white/80 transition hover:border-brand hover:bg-white/10 hover:text-white"
                  >
                    “{hint}”
                  </button>
                ))}
              </div>
            </div>
          )}
          {sources.length > 0 && (
            <div className="mt-3 flex flex-wrap items-center gap-1 rounded-xl bg-white p-2">
              <span className="mr-1 text-[11px] font-medium text-muted">Sources</span>
              {sources.map((r) => (
                <CiteChip key={r} refId={r} />
              ))}
            </div>
          )}
          {cards.map((c, i) =>
            c.kind === "draft" ? (
              <div key={c.draft.draft_id + i} className="mt-3 rounded-xl bg-white p-3 text-ink">
                <p className="flex items-center gap-1.5 text-xs font-semibold text-rust">
                  <Octagon size={13} aria-hidden /> {TYPE_LABEL[c.draft.type] ?? "Report"} · draft
                </p>
                <p className="mt-1 text-sm font-semibold">{c.draft.fields.title}</p>
                <p className="mt-0.5 text-xs text-muted">{[c.draft.fields.machine, c.draft.fields.part_name, c.draft.fields.severity].filter(Boolean).join(" · ")}</p>
                {c.state === "filed" ? (
                  <p className="mt-2 flex items-center gap-1.5 text-xs font-semibold text-moss">
                    <CheckCircle2 size={14} /> Filed as {c.number}. The quality team has been notified.
                  </p>
                ) : c.state === "discarded" ? (
                  <p className="mt-2 text-xs text-muted">Discarded</p>
                ) : (
                  <div className="mt-2 flex gap-2">
                    <button
                      onClick={() => ws.current?.send(JSON.stringify({ type: "file_draft", draft_id: c.draft.draft_id }))}
                      className="h-9 rounded-lg bg-brand px-4 text-xs font-semibold text-white hover:bg-brand-strong"
                    >
                      File it
                    </button>
                    <button
                      onClick={() => {
                        ws.current?.send(JSON.stringify({ type: "discard_draft", draft_id: c.draft.draft_id }));
                        setCards((all) => all.map((x) => (x === c ? { ...c, state: "discarded" } : x)));
                      }}
                      className="h-9 rounded-lg px-3 text-xs font-medium text-muted hover:bg-hover"
                    >
                      Discard
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <div key={c.task_id} className="mt-3 rounded-xl bg-white p-3 text-ink">
                <p className="flex items-center gap-1.5 text-xs font-semibold text-brand">
                  <Timer size={13} aria-hidden /> Reminder
                </p>
                <p className="mt-1 text-sm font-semibold">{c.title}</p>
                {c.due_at && <p className="text-xs text-muted">{new Date(c.due_at).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short" })}</p>}
                {c.state === "confirmed" ? (
                  <p className="mt-2 flex items-center gap-1.5 text-xs font-semibold text-moss">
                    <CheckCircle2 size={14} /> Saved
                  </p>
                ) : (
                  <button onClick={() => confirmReminder(c.task_id)} className="mt-2 h-9 rounded-lg bg-brand px-4 text-xs font-semibold text-white hover:bg-brand-strong">
                    Confirm
                  </button>
                )}
              </div>
            ),
          )}
        </div>

        <div className="flex flex-col items-center gap-3 px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-3">
          <p className={clsx("min-h-5 text-center text-sm", phase === "error" ? "text-rust-soft" : "text-white/70")} role="status">
            {phase === "connecting" || phase === "thinking" ? <Loader2 size={14} className="mr-1.5 inline animate-spin" /> : null}
            {status}
          </p>
          <button
            onPointerDown={(e) => {
              e.currentTarget.setPointerCapture(e.pointerId);
              press();
            }}
            onPointerUp={handlePointerUp}
            onPointerCancel={release}
            onKeyDown={(e) => {
              if ((e.key === " " || e.key === "Enter") && !e.repeat) {
                e.preventDefault();
                press();
              }
            }}
            onKeyUp={(e) => (e.key === " " || e.key === "Enter") && handlePointerUp()}
            disabled={phase === "connecting" || phase === "error"}
            aria-label={isToggled.current ? "Tap to stop talking" : "Tap or hold to talk"}
            className={clsx(
              "relative flex h-24 w-24 touch-none select-none items-center justify-center rounded-full transition",
              phase === "listening" ? "bg-brand text-white" : "bg-white text-ink hover:bg-white/90",
              (phase === "connecting" || phase === "error") && "opacity-40",
            )}
            style={{ boxShadow: phase === "listening" ? `0 0 0 ${8 + level * 26}px rgba(66,133,244,0.35)` : undefined }}
          >
            <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <rect x="9" y="3" width="6" height="11" rx="3" />
              <path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
            </svg>
          </button>
          <p className="max-w-sm text-center text-[11px] leading-snug text-white/45">
            Answers come only from your workspace, with sources on screen. Nothing is filed until you say yes or tap File. Voice is processed by Gemini Live in the US; audio
            isn&rsquo;t stored and your transcript is private, deleted after 30 days.
          </p>
        </div>
      </div>
    </div>
  );
}
