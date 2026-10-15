"use client";

import clsx from "clsx";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { api } from "@/lib/api";
import { ArrowRight, Check, CircleDot, Gavel, MessageSquare, Sparkles, Sun, X } from "@/lib/icons";
import { useWs, type View } from "./ctx";

/* Guided tour: a dark card pinned to the real control it explains, with the matching screen opened behind it.
   Progress is kept per section so the tour can be paused and picked up again from the card on My Day. */

const SECTIONS = [
  { id: "day", label: "Your day", icon: Sun },
  { id: "knowledge", label: "Find knowledge", icon: Sparkles },
  { id: "together", label: "Work together", icon: MessageSquare },
  { id: "decide", label: "Decide with evidence", icon: Gavel },
] as const;
type SectionId = (typeof SECTIONS)[number]["id"];

type Step = {
  id: string;
  section: SectionId;
  /** data-tour value of the control the card points at */
  target: string;
  title: string;
  body: string;
  /** Screen opened behind the card. Read-only screens only: Activity stays closed because opening it marks notifications read. */
  view?: View;
  /** Not shown to guests (they have no Quality or Live) */
  staff?: boolean;
};

const STEPS: Step[] = [
  {
    id: "myday",
    section: "day",
    target: "rail-home",
    view: { kind: "home" },
    title: "My Day",
    body: "Your shift on one page: what's due today, what you owe, what's owed to you and today's meetings.",
  },
  {
    id: "needs-you",
    section: "day",
    target: "needs-you",
    view: { kind: "home" },
    title: "Needs you",
    body: "Saathi ranks what's waiting on you: overdue tasks, drafts to confirm, open records, shift handovers, mentions and promises from email. Act on each or snooze it in one tap.",
  },
  {
    id: "brief",
    section: "day",
    target: "brief-me",
    view: { kind: "home" },
    title: "Brief me",
    body: "One click for a summary of the last 24 hours, with sources cited, drawn only from chats and files you can open.",
  },
  {
    id: "tasks",
    section: "day",
    target: "rail-tasks",
    view: { kind: "tasks" },
    title: "Tasks",
    body: "Tasks Saathi drafts from chats, meetings and email land here only after a person confirms them, each linked back to where it came from.",
  },
  {
    id: "search",
    section: "knowledge",
    target: "search",
    title: "Search or ask",
    body: "Jump to any chat, channel or file, or type a question for Saathi. On a computer, ⌘K or Ctrl+K opens it from anywhere.",
  },
  {
    id: "saathi",
    section: "knowledge",
    target: "rail-assistant",
    view: { kind: "assistant" },
    title: "Saathi",
    body: "Your AI colleague. Ask in English, Hindi or Hinglish; answers cite their sources and use only what you can access. Research runs several agents at once to build readiness reports.",
  },
  {
    id: "chat",
    section: "together",
    target: "rail-chat",
    view: { kind: "chats" },
    title: "Chat and channels",
    body: "Direct chats and plant channels. Turn any message into a task or a decision, or hand over a shift from the channel.",
  },
  {
    id: "activity",
    section: "together",
    target: "rail-activity",
    title: "Activity",
    body: "Mentions, replies and assignments in one feed, only from the channels you belong to.",
  },
  {
    id: "live",
    section: "together",
    target: "rail-live",
    view: { kind: "live" },
    staff: true,
    title: "Saathi Live",
    body: "Bring Saathi into a review meeting. It listens, spots questions and puts cited answers on screen while people are still talking, then drafts the summary.",
  },
  {
    id: "quality",
    section: "decide",
    target: "rail-quality",
    view: { kind: "quality" },
    staff: true,
    title: "Quality",
    body: "Defect, downtime and safety records plus the drawing register. Spec Check reads a mill test certificate with Gemini, checks every value against the standard in code, and drafts an NCR when one fails.",
  },
  {
    id: "decisions",
    section: "decide",
    target: "rail-decisions",
    view: { kind: "decisions" },
    title: "Decisions",
    body: "What was decided, why, and what replaced it, captured from chats and meetings so nobody has to ask twice.",
  },
];

const stepsFor = (guest: boolean) => STEPS.filter((s) => !s.staff || !guest);
// Demo logins are shared by everyone trying the app, so their progress stays on this device only.
const isDemoEmail = (email?: string) => !!email?.endsWith("@saathi.demo");
const markTaken = () => api("/api/me/settings", { method: "POST", json: { walkthrough: true } }).catch(() => {});

/* ---------- Progress (per device; the server flag only stops the tour starting by itself again) ---------- */

type Progress = { step: number; seen: string[]; done?: boolean; hidden?: boolean };
const EMPTY: Progress = { step: 0, seen: [] };
const storeKey = (uid: string) => `saathi.tour.${uid}`;
const listeners = new Set<() => void>();
let cached: { uid: string; raw: string | null; value: Progress } | null = null;

function readProgress(uid: string): Progress {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(storeKey(uid));
  } catch {}
  if (cached?.uid === uid && cached.raw === raw) return cached.value;
  let value = EMPTY;
  try {
    if (raw) value = { ...EMPTY, ...JSON.parse(raw) };
  } catch {}
  cached = { uid, raw, value };
  return value;
}

function saveProgress(uid: string, p: Progress) {
  try {
    localStorage.setItem(storeKey(uid), JSON.stringify(p));
  } catch {}
  listeners.forEach((l) => l());
}

function subscribe(l: () => void) {
  listeners.add(l);
  const onStorage = (e: StorageEvent) => e.key?.startsWith("saathi.tour.") && l();
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(l);
    window.removeEventListener("storage", onStorage);
  };
}

const useProgress = (uid: string) => useSyncExternalStore(subscribe, () => readProgress(uid), () => EMPTY);

/** Nothing recorded on this device: never started, hidden or finished here. */
export function tourPristine(uid: string) {
  const p = readProgress(uid);
  return !p.seen.length && !p.done && !p.hidden;
}

type Status = "done" | "active" | "todo";

function sectionStatus(steps: Step[], p: Progress, id: SectionId): Status {
  const mine = steps.filter((s) => s.section === id);
  const seen = mine.filter((s) => p.seen.includes(s.id)).length;
  if (p.done || (mine.length > 0 && seen === mine.length)) return "done";
  if (seen > 0 || (p.seen.length > 0 && steps[p.step]?.section === id)) return "active";
  return "todo";
}

function StatusChip({ status }: { status: Status }) {
  if (status === "done")
    return (
      <span className="flex items-center gap-1 rounded-full bg-moss-soft px-2 py-0.5 text-[11px] font-semibold text-moss">
        <Check size={11} strokeWidth={3} aria-hidden /> Done
      </span>
    );
  if (status === "active")
    return (
      <span className="flex items-center gap-1 rounded-full bg-warn-soft px-2 py-0.5 text-[11px] font-semibold text-warn-ink">
        <CircleDot size={11} aria-hidden /> In progress
      </span>
    );
  return <span className="rounded-full border border-border px-2 py-0.5 text-[11px] font-medium text-muted">Not started</span>;
}

/** My Day card: start or continue the tour, with each section's status. */
export function TourCard() {
  const { uid, account, settings, startTour, toast } = useWs();
  const p = useProgress(uid);
  const demo = isDemoEmail(account.email);
  const steps = stepsFor(account.org_role === "guest");
  const started = p.seen.length > 0;
  // Finished or hidden here, or a fresh device for someone who already took the tour elsewhere
  if (!settings.loaded || p.done || p.hidden || (!started && settings.walkthrough && !demo)) return null;
  const seenCount = steps.filter((s) => p.seen.includes(s.id)).length;

  function hide() {
    saveProgress(uid, { ...p, hidden: true });
    if (!demo) markTaken();
    toast("Tour hidden. Start it any time from your profile menu.");
  }

  return (
    <section className="mt-5 rounded-2xl border border-border bg-surface p-4 sm:p-5" aria-label="Guided tour">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between md:gap-8">
        <div className="min-w-0 md:max-w-md">
          <p className="text-xs font-semibold text-moss">Get started</p>
          <h2 className="mt-1 text-[15px] font-bold">Guided tour</h2>
          <p className="mt-1 text-sm text-muted">
            See how Saathi helps you find knowledge, work together, decide with evidence and get the day&rsquo;s work done, right on the real screens. About two minutes.
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <button onClick={startTour} className="flex h-9 items-center gap-1.5 rounded-lg bg-brand px-3.5 text-sm font-semibold text-white hover:bg-brand-strong">
              {started ? "Continue" : "Start tour"} <ArrowRight size={14} aria-hidden />
            </button>
            {started && (
              <span className="text-xs text-muted">
                {seenCount} of {steps.length} seen
              </span>
            )}
            <button onClick={hide} className="text-xs font-medium text-muted hover:underline">
              Hide
            </button>
          </div>
        </div>
        <ul className="grid gap-1 sm:grid-cols-2 md:w-80 md:shrink-0 md:grid-cols-1">
          {SECTIONS.filter((s) => steps.some((st) => st.section === s.id)).map((s) => (
            <li key={s.id} className="flex items-center gap-2.5 rounded-lg px-1 py-1.5 text-sm">
              <s.icon size={16} className="shrink-0 text-muted" aria-hidden />
              <span className="flex-1 font-medium">{s.label}</span>
              <StatusChip status={sectionStatus(steps, p, s.id)} />
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

/* ---------- Coachmark ---------- */

type Box = { top: number; left: number; width: number; height: number };
type Side = "right" | "left" | "bottom" | "top" | "inside";

const CARD_W = 320;
const GAP = 12;
const EDGE = 16;

/** The first visible element for a tour target (the app rail exists twice: desktop column and phone bar). */
function findTarget(name: string): HTMLElement | null {
  for (const el of document.querySelectorAll<HTMLElement>(`[data-tour="${name}"]`)) {
    const r = el.getBoundingClientRect();
    if (r.width && r.height) return el;
  }
  return null;
}

const sameBox = (a: Box | null, b: Box | null) =>
  a === b || (!!a && !!b && Math.abs(a.top - b.top) < 0.5 && Math.abs(a.left - b.left) < 0.5 && Math.abs(a.width - b.width) < 0.5 && Math.abs(a.height - b.height) < 0.5);

/** Follows the target and the card size while screens load, scroll and resize. */
function useLayout(target: string, card: React.RefObject<HTMLDivElement | null>) {
  // ready: measured at least once, so the card never flashes in the wrong place
  const [layout, setLayout] = useState(() => ({ box: null as Box | null, vw: innerWidth, vh: innerHeight, h: 190, ready: false }));
  useEffect(() => {
    let scrolled = false;
    const measure = () => {
      const el = findTarget(target);
      if (el && !scrolled) {
        scrolled = true;
        el.scrollIntoView({ block: "nearest", inline: "nearest" });
      }
      const r = el?.getBoundingClientRect();
      const box = r ? { top: r.top, left: r.left, width: r.width, height: r.height } : null;
      const h = card.current?.offsetHeight ?? 190;
      setLayout((l) => (l.ready && sameBox(l.box, box) && l.vw === innerWidth && l.vh === innerHeight && l.h === h ? l : { box, vw: innerWidth, vh: innerHeight, h, ready: true }));
    };
    const first = requestAnimationFrame(measure);
    const timer = setInterval(measure, 200);
    addEventListener("resize", measure);
    return () => {
      cancelAnimationFrame(first);
      clearInterval(timer);
      removeEventListener("resize", measure);
    };
  }, [target, card]);
  return layout;
}

/** Beside the target if there's room (right of the rail, under the header), else inside its bottom-right corner. */
function place(b: Box, h: number, vw: number, vh: number): { side: Side; top: number; left: number } {
  const clampX = (x: number) => Math.max(EDGE, Math.min(x, vw - CARD_W - EDGE));
  const clampY = (y: number) => Math.max(EDGE, Math.min(y, vh - h - EDGE));
  const cx = b.left + b.width / 2;
  const cy = b.top + b.height / 2;
  const sides = {
    right: { left: b.left + b.width + GAP, top: clampY(cy - h / 2), fits: b.left + b.width + GAP + CARD_W <= vw - EDGE },
    left: { left: b.left - GAP - CARD_W, top: clampY(cy - h / 2), fits: b.left - GAP - CARD_W >= EDGE },
    bottom: { left: clampX(cx - CARD_W / 2), top: b.top + b.height + GAP, fits: b.top + b.height + GAP + h <= vh - EDGE },
    top: { left: clampX(cx - CARD_W / 2), top: b.top - GAP - h, fits: b.top - GAP - h >= EDGE },
  };
  const order: (keyof typeof sides)[] = b.left < 96 ? ["right", "bottom", "top", "left"] : ["bottom", "top", "right", "left"];
  for (const side of order) if (sides[side].fits) return { side, top: sides[side].top, left: sides[side].left };
  return { side: "inside", left: clampX(Math.min(b.left + b.width, vw) - CARD_W - EDGE), top: clampY(Math.min(b.top + b.height, vh) - h - EDGE) };
}

/** The tour itself. It doesn't block the app: people can click around and come back to the card. */
export function ProductTour({ onClose }: { onClose: () => void }) {
  const { uid, account, view, open, toast } = useWs();
  const demo = isDemoEmail(account.email);
  const [steps] = useState(() => stepsFor(account.org_role === "guest"));
  const [idx, setIdx] = useState(() => {
    const p = readProgress(uid);
    return p.done ? 0 : Math.min(Math.max(p.step, 0), steps.length - 1);
  });
  const step = steps[idx];
  const last = idx === steps.length - 1;
  const section = SECTIONS.find((s) => s.id === step.section)!;
  const cardRef = useRef<HTMLDivElement>(null);
  const nextRef = useRef<HTMLButtonElement>(null);
  const { box, vw, vh, h, ready } = useLayout(step.target, cardRef);

  /** Open a step's screen and record it as seen */
  function enter(i: number, fresh = false) {
    const s = steps[i];
    if (s.view && s.view.kind !== view.kind) open(s.view);
    const p = readProgress(uid);
    const seen = fresh ? [] : p.seen;
    saveProgress(uid, { step: i, seen: seen.includes(s.id) ? seen : [...seen, s.id] });
  }

  function show(i: number) {
    enter(i);
    setIdx(i);
  }

  // The first card of this run; a finished tour starts over
  useEffect(() => {
    enter(idx, readProgress(uid).done === true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keyboard focus follows the card (after the screen behind it has taken focus)
  useEffect(() => {
    const t = setTimeout(() => nextRef.current?.focus({ preventScroll: true }), 80);
    return () => clearTimeout(t);
  }, [idx]);

  function pause() {
    if (!demo) markTaken();
    toast("Tour paused. Pick it up from My Day.");
    onClose();
  }

  function finish() {
    saveProgress(uid, { step: 0, seen: steps.map((s) => s.id), done: true });
    if (!demo) markTaken();
    open({ kind: "home" });
    toast("That's the tour. Replay it any time from your profile menu.");
    onClose();
  }

  const next = () => (last ? finish() : show(idx + 1));

  function onKey(e: React.KeyboardEvent) {
    if (e.key === "Escape") pause();
    else if (e.key === "ArrowRight") next();
    else if (e.key === "ArrowLeft" && idx > 0) show(idx - 1);
    else return;
    e.preventDefault();
  }

  // Phones and tablets use the bottom bar, so the card docks above it; desktop pins it beside the target
  const docked = vw < 1024;
  const spot = docked || !box ? null : place(box, h, vw, vh);
  const cardStyle: React.CSSProperties = docked
    ? { left: EDGE, right: EDGE, bottom: "calc(env(safe-area-inset-bottom) + 72px)" }
    : spot
      ? { top: spot.top, left: spot.left, width: CARD_W }
      : { top: vh - h - 24, left: (vw - CARD_W) / 2, width: CARD_W };
  // The ring hugs the target but stays on screen (the phone bar's last tab sits on the edge)
  const ring = box && {
    left: Math.max(2, box.left - 4),
    top: Math.max(2, box.top - 4),
    width: Math.min(vw - 2, box.left + box.width + 4) - Math.max(2, box.left - 4),
    height: Math.min(vh - 2, box.top + box.height + 4) - Math.max(2, box.top - 4),
  };
  let arrow: React.CSSProperties | null = null;
  if (spot && box && spot.side !== "inside") {
    const ay = Math.max(14, Math.min(box.top + box.height / 2 - spot.top - 6, h - 26));
    const ax = Math.max(14, Math.min(box.left + box.width / 2 - spot.left - 6, CARD_W - 26));
    arrow = { right: { left: -6, top: ay }, left: { right: -6, top: ay }, bottom: { top: -6, left: ax }, top: { bottom: -6, left: ax } }[spot.side as Exclude<Side, "inside">];
  }

  return (
    <>
      {ring && (
        <div
          aria-hidden
          className="pointer-events-none fixed z-[55] rounded-[14px] transition-all duration-300 ease-out motion-reduce:transition-none"
          style={{ ...ring, boxShadow: "0 0 0 2px var(--color-brand), 0 0 0 7px rgb(66 133 244 / 0.22)" }}
        >
          <span className="pulse-ring absolute inset-0 rounded-[inherit]" />
        </div>
      )}
      <div
        ref={cardRef}
        role="dialog"
        aria-modal="false"
        aria-labelledby="tour-title"
        aria-describedby="tour-body"
        onKeyDown={onKey}
        className={clsx(
          "fixed z-[55] rounded-xl bg-ink p-4 text-white shadow-2xl ring-1 ring-white/10",
          docked ? "mx-auto max-w-[420px]" : "transition-[top,left] duration-300 ease-out motion-reduce:transition-none",
          !ready && "invisible",
        )}
        style={cardStyle}
      >
        {arrow && <span aria-hidden className="absolute h-3 w-3 rotate-45 bg-ink" style={arrow} />}
        <button onClick={pause} className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-md text-white/60 transition hover:bg-white/10 hover:text-white" aria-label="Close tour">
          <X size={15} />
        </button>
        <div key={step.id} className="fade-in">
          <p className="pr-8 text-[11px] font-semibold uppercase tracking-wide text-mint">{section.label}</p>
          <h2 id="tour-title" className="mt-1 pr-8 text-[15px] font-bold">
            {step.title}
          </h2>
          <p id="tour-body" className="mt-1.5 text-[13px] leading-relaxed text-white/75">
            {step.body}
          </p>
        </div>
        <div className="mt-4 flex items-center gap-1.5">
          <span className="flex-1 text-xs text-white/60" aria-live="polite">
            {idx + 1} of {steps.length}
          </span>
          {idx > 0 && (
            <button onClick={() => show(idx - 1)} className="h-8 rounded-full px-3 text-xs font-semibold text-white/80 transition hover:bg-white/10 hover:text-white">
              Back
            </button>
          )}
          <button ref={nextRef} onClick={next} className="flex h-8 items-center gap-1 rounded-full bg-white px-4 text-xs font-semibold text-ink transition hover:bg-paper-3">
            {last ? (
              <>
                Finish <Check size={13} strokeWidth={3} aria-hidden />
              </>
            ) : (
              "Next"
            )}
          </button>
        </div>
      </div>
    </>
  );
}
