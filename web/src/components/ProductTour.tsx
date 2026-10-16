"use client";

import clsx from "clsx";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { api } from "@/lib/api";
import { ArrowRight, Check, CheckCircle2, CircleDot, Compass, Gavel, Loader2, MessageSquare, Sparkles, Sun, X } from "@/lib/icons";
import { guestCan, useWs, type View } from "./ctx";

/* Guided tour. The page dims, the control being explained stays lit, and a card beside it says what it does.
   The first section is hands-on (ask Saathi a real question, then check where the answer came from); the rest
   walks the screens people use every day. Progress is kept per section so it can be paused and continued. */

const SECTIONS = [
  { id: "ask", label: "Ask Saathi", icon: Sparkles },
  { id: "day", label: "Your day", icon: Sun },
  { id: "together", label: "Work together", icon: MessageSquare },
  { id: "decide", label: "Decide with evidence", icon: Gavel },
] as const;
type SectionId = (typeof SECTIONS)[number]["id"];

type Step = {
  id: string;
  section: SectionId;
  /** data-tour value of the control that stays lit */
  target: string;
  title: string;
  /** "{q}" is replaced by the suggested question */
  body: string;
  /** Screen opened behind the card. Read-only screens only (Activity marks notifications read, so it isn't one). */
  view?: View;
  /** Not shown to guests (they have no Quality or Live) */
  staff?: boolean;
  /** Hands-on steps: "asked" waits for a question to be sent; "target" waits for the lit control to appear */
  gate?: "asked" | "target";
  waiting?: string;
};

const STEPS: Step[] = [
  {
    id: "saathi",
    section: "ask",
    target: "rail-assistant",
    title: "Saathi",
    body: "Your AI colleague. It answers from your chats, drawings and records, and only from what you're allowed to see. Click it, or Next, to open it.",
  },
  {
    id: "ask",
    section: "ask",
    target: "ask-box",
    view: { kind: "assistant" },
    gate: "asked",
    title: "Ask your first question",
    body: "Type {q} and press Enter. English, Hindi or Hinglish all work.",
  },
  {
    id: "proof",
    section: "ask",
    target: "answer-proof",
    view: { kind: "assistant" },
    gate: "target",
    waiting: "Saathi is answering…",
    title: "See where the answer came from",
    body: "Every answer cites its sources and lists the steps Saathi took. Open How Saathi got this to check them.",
  },
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
    id: "tasks",
    section: "day",
    target: "rail-tasks",
    view: { kind: "tasks" },
    title: "Tasks",
    body: "Tasks Saathi drafts from chats, meetings and email land here only after a person confirms them, each linked back to where it came from.",
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

/** Guests skip Quality and Live; guests without Saathi skip the hands-on "Ask Saathi" section. */
const stepsFor = (guest: boolean, ai = true) => STEPS.filter((s) => (!s.staff || !guest) && (ai || s.section !== "ask"));
// Demo logins are shared by everyone trying the app, so their progress stays on this device only.
const isDemoEmail = (email?: string) => !!email?.endsWith("@saathi.demo");
const markTaken = () => api("/api/me/settings", { method: "POST", json: { walkthrough: true } }).catch(() => {});
/** The question the hands-on step suggests: the demo plant's drawing question, or a catch-up anyone can ask. */
const suggestedQuestion = (demo: boolean) => (demo ? "Which revision of SRC-BF-2041 is latest and who approved it?" : "What did I miss in the last 24 hours?");

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

/** Same chips as task status: Done, In progress, To do. */
function StatusChip({ status }: { status: Status }) {
  return (
    <span
      className={clsx(
        "flex shrink-0 items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-semibold",
        status === "done" ? "bg-moss-soft text-moss" : status === "active" ? "bg-brand-soft text-brand" : "bg-canvas text-ink/70",
      )}
    >
      {status === "done" ? <CheckCircle2 size={12} aria-hidden /> : status === "active" ? <CircleDot size={12} aria-hidden /> : null}
      {status === "done" ? "Done" : status === "active" ? "In progress" : "Not started"}
    </span>
  );
}

/** My Day card: start or continue the tour, with each section's status. */
export function TourCard() {
  const { uid, account, settings, startTour, toast } = useWs();
  const p = useProgress(uid);
  const demo = isDemoEmail(account.email);
  const steps = stepsFor(account.org_role === "guest", guestCan(account, "ai"));
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
    <section className="mt-5 rounded-2xl border border-border bg-surface" aria-label="Guided tour">
      <header className="flex items-center gap-2 border-b border-border px-4 py-3">
        <Compass size={16} className="text-muted" aria-hidden />
        <h2 className="flex-1 text-sm font-bold">
          Guided tour
          {started && (
            <span className="ml-1 rounded-full bg-canvas px-1.5 text-[11px] font-semibold text-muted">
              {seenCount} of {steps.length}
            </span>
          )}
        </h2>
        <button onClick={hide} className="text-xs font-semibold text-muted hover:text-ink hover:underline">
          Hide
        </button>
      </header>
      <div className="grid gap-4 p-4 md:grid-cols-[1fr_20rem] md:items-center md:gap-8">
        <div>
          <p className="text-sm text-muted">
            Learn Saathi by using it: ask a real question, see where the answer came from, then walk through the screens you&rsquo;ll use every day. About two minutes.
          </p>
          <button onClick={startTour} className="mt-3 flex h-9 items-center gap-1.5 rounded-lg bg-brand px-3.5 text-sm font-semibold text-white hover:bg-brand-strong">
            {started ? "Continue" : "Start tour"} <ArrowRight size={14} aria-hidden />
          </button>
        </div>
        <ul className="divide-y divide-border rounded-xl border border-border">
          {SECTIONS.filter((s) => steps.some((st) => st.section === s.id)).map((s) => (
            <li key={s.id} className="flex items-center gap-2.5 px-3 py-2 text-sm">
              <s.icon size={15} className="shrink-0 text-muted" aria-hidden />
              <span className="flex-1 font-medium">{s.label}</span>
              <StatusChip status={sectionStatus(steps, p, s.id)} />
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

/* ---------- Spotlight and card ---------- */

type Box = { top: number; left: number; width: number; height: number };
type Side = "right" | "left" | "bottom" | "top" | "inside";

const CARD_W = 320;
const GAP = 14;
const EDGE = 16;
const PAD = 6; // lit area around the control
const SCRIM = "rgb(32 33 36 / 0.45)"; // the dialogs' bg-ink/45

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

/** Beside the lit area if there's room (right of the rail, under the header), else inside its bottom-right corner. */
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

/** The tour itself. Only the lit control can be used while it runs; close it to get the whole app back. */
export function ProductTour({ onClose }: { onClose: () => void }) {
  const { uid, account, view, open, toast } = useWs();
  const demo = isDemoEmail(account.email);
  const [steps] = useState(() => stepsFor(account.org_role === "guest", guestCan(account, "ai")));
  const [idx, setIdx] = useState(() => {
    const p = readProgress(uid);
    return p.done ? 0 : Math.min(Math.max(p.step, 0), steps.length - 1);
  });
  const step = steps[idx];
  const last = idx === steps.length - 1;
  const section = SECTIONS.find((s) => s.id === step.section)!;
  const cardRef = useRef<HTMLDivElement>(null);
  const nextRef = useRef<HTMLButtonElement>(null);
  const viewKind = useRef(view.kind);
  const { box, vw, vh, h, ready } = useLayout(step.target, cardRef);
  const blocked = step.gate === "asked" || (step.gate === "target" && !box);
  // Nav items work like Next when clicked, as a "click here" step
  const navStep = !step.gate && step.target.startsWith("rail-");

  useEffect(() => {
    viewKind.current = view.kind;
  }, [view.kind]);

  /** Open a step's screen and record it as seen */
  function enter(i: number, fresh = false) {
    const s = steps[i];
    if (s.view && s.view.kind !== viewKind.current) open(s.view);
    const p = readProgress(uid);
    const seen = fresh ? [] : p.seen;
    saveProgress(uid, { step: i, seen: seen.includes(s.id) ? seen : [...seen, s.id] });
  }

  function show(i: number) {
    enter(i);
    setIdx(i);
  }

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
  // Listeners below always call the current step's next()
  const nextFn = useRef(next);
  useEffect(() => {
    nextFn.current = next;
  });

  // The first card of this run; a finished tour starts over
  useEffect(() => {
    enter(idx, readProgress(uid).done === true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Focus: the field to type in on hands-on steps, otherwise the card's main button
  useEffect(() => {
    const t = setTimeout(() => {
      const field = step.gate === "asked" ? findTarget(step.target)?.querySelector<HTMLElement>("textarea, input") : null;
      (field ?? nextRef.current)?.focus({ preventScroll: true });
    }, 250);
    return () => clearTimeout(t);
  }, [step]);

  // Hands-on: move on once the question is sent
  useEffect(() => {
    if (step.gate !== "asked") return;
    const onAsked = () => nextFn.current();
    addEventListener("saathi:asked", onAsked);
    return () => removeEventListener("saathi:asked", onAsked);
  }, [step]);

  // Clicking a lit nav item counts as Next (the click still opens its screen)
  useEffect(() => {
    if (!navStep) return;
    const onClick = (e: MouseEvent) => {
      if (findTarget(step.target)?.contains(e.target as Node)) setTimeout(() => nextFn.current(), 0);
    };
    addEventListener("click", onClick);
    return () => removeEventListener("click", onClick);
  }, [step, navStep]);

  function onKey(e: React.KeyboardEvent) {
    if (e.key === "Escape") pause();
    else if (e.key === "ArrowRight" && !blocked) next();
    else if (e.key === "ArrowLeft" && idx > 0) show(idx - 1);
    else return;
    e.preventDefault();
  }

  // Lit area: the control plus a little padding, kept on screen
  const lit = box && {
    left: Math.max(2, box.left - PAD),
    top: Math.max(2, box.top - PAD),
    width: Math.min(vw - 2, box.left + box.width + PAD) - Math.max(2, box.left - PAD),
    height: Math.min(vh - 2, box.top + box.height + PAD) - Math.max(2, box.top - PAD),
  };

  // Phones and tablets: the card docks at the bottom, or at the top when the lit control is down there
  const docked = vw < 1024;
  const spot = docked || !lit ? null : place(lit, h, vw, vh);
  const dockTop = docked && !!lit && lit.top + lit.height / 2 > vh / 2;
  const cardStyle: React.CSSProperties = docked
    ? { left: EDGE, right: EDGE, ...(dockTop ? { top: 60 } : { bottom: "calc(env(safe-area-inset-bottom) + 72px)" }) }
    : spot
      ? { top: spot.top, left: spot.left, width: CARD_W }
      : { top: vh - h - 24, left: (vw - CARD_W) / 2, width: CARD_W };
  let arrow: React.CSSProperties | null = null;
  if (spot && lit && spot.side !== "inside") {
    const ay = Math.max(14, Math.min(lit.top + lit.height / 2 - spot.top - 6, h - 26));
    const ax = Math.max(14, Math.min(lit.left + lit.width / 2 - spot.left - 6, CARD_W - 26));
    arrow = { right: { left: -6, top: ay }, left: { right: -6, top: ay }, bottom: { top: -6, left: ax }, top: { bottom: -6, left: ax } }[spot.side as Exclude<Side, "inside">];
  }

  const [before, after] = step.body.split("{q}");
  const motion = "transition-all duration-300 ease-out motion-reduce:transition-none";

  return (
    <>
      {/* Scrim with a hole over the control; the four clear panes around the hole hold clicks */}
      {lit ? (
        <>
          <div aria-hidden className={clsx("pointer-events-none fixed z-[55] rounded-xl", motion)} style={{ ...lit, boxShadow: `0 0 0 2px var(--color-brand), 0 0 0 200vmax ${SCRIM}` }}>
            {navStep && <span className="pulse-ring absolute inset-0 rounded-[inherit]" />}
          </div>
          <div aria-hidden className="fixed inset-x-0 top-0 z-[55]" style={{ height: lit.top }} />
          <div aria-hidden className="fixed inset-x-0 bottom-0 z-[55]" style={{ top: lit.top + lit.height }} />
          <div aria-hidden className="fixed left-0 z-[55]" style={{ top: lit.top, height: lit.height, width: lit.left }} />
          <div aria-hidden className="fixed right-0 z-[55]" style={{ top: lit.top, height: lit.height, left: lit.left + lit.width }} />
        </>
      ) : (
        <div aria-hidden className="fade-in fixed inset-0 z-[55]" style={{ background: SCRIM }} />
      )}
      <div
        ref={cardRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="tour-title"
        aria-describedby="tour-body"
        onKeyDown={onKey}
        className={clsx(
          "fixed z-[56] rounded-xl bg-ink p-4 text-white shadow-2xl ring-1 ring-white/10",
          docked ? "mx-auto max-w-[420px]" : "transition-[top,left] duration-300 ease-out motion-reduce:transition-none",
          !ready && "invisible",
        )}
        style={cardStyle}
      >
        {arrow && <span aria-hidden className="absolute h-3 w-3 rotate-45 bg-ink" style={arrow} />}
        <button onClick={pause} className="absolute right-2 top-2 z-10 flex h-7 w-7 items-center justify-center rounded-md text-white/60 transition hover:bg-white/10 hover:text-white" aria-label="Close tour">
          <X size={15} />
        </button>
        <div key={step.id} className="fade-in">
          <p className="pr-8 text-[11px] font-semibold uppercase tracking-wide text-mint">{section.label}</p>
          <h2 id="tour-title" className="mt-1 pr-8 text-[15px] font-bold">
            {step.title}
          </h2>
          <p id="tour-body" className="mt-1.5 text-[13px] leading-relaxed text-white/75">
            {before}
            {after !== undefined && (
              <>
                <b className="font-semibold text-white">&ldquo;{suggestedQuestion(demo)}&rdquo;</b>
                {after}
              </>
            )}
          </p>
        </div>
        <div className="mt-4 flex items-center gap-1.5">
          <span className="flex-1 text-xs text-white/60" aria-live="polite">
            {step.gate === "target" && !box ? (
              <span className="flex items-center gap-1.5">
                <Loader2 size={12} className="animate-spin" aria-hidden /> {step.waiting}
              </span>
            ) : (
              `${idx + 1} of ${steps.length}`
            )}
          </span>
          {blocked ? (
            <button onClick={next} className="h-8 rounded-lg px-2.5 text-xs font-semibold text-white/70 transition hover:bg-white/10 hover:text-white">
              Skip
            </button>
          ) : (
            idx > 0 && (
              <button onClick={() => show(idx - 1)} className="h-8 rounded-lg px-2.5 text-xs font-semibold text-white/80 transition hover:bg-white/10 hover:text-white">
                Back
              </button>
            )
          )}
          <button
            ref={nextRef}
            onClick={next}
            disabled={blocked}
            className="flex h-8 items-center gap-1 rounded-lg bg-brand px-3.5 text-xs font-semibold text-white transition hover:bg-brand-strong disabled:opacity-40 disabled:hover:bg-brand"
          >
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
