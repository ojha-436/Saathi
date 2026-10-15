"use client";

import { useState } from "react";
import {
  ArrowRight,
  Bell,
  Check,
  CheckCircle2,
  Radar,
  ShieldCheck,
  Sparkles,
  Sun,
  X,
} from "@/lib/icons";
import { api } from "@/lib/api";

type TourStep = {
  id: string;
  navLabel: string;
  title: string;
  badge: string;
  tagline: string;
  summary: string;
  icon: typeof Sun;
  color: string;
  bg: string;
  inside: { title: string; desc: string }[];
  safeguard: string;
  previewType: "myday" | "activity" | "assistant" | "live" | "quality";
};

const TOUR_STEPS: TourStep[] = [
  {
    id: "myday",
    navLabel: "My Day",
    title: "My Day · The Operational Command Center",
    badge: "Prioritized Queue",
    tagline: "Start Every Shift With Clarity",
    summary:
      "My Day eliminates fragmented email threads and scattered task lists by synthesizing what requires your immediate decision into a single ranked queue.",
    icon: Sun,
    color: "text-saffron-ink",
    bg: "bg-saffron/15",
    inside: [
      {
        title: "Needs You Queue",
        desc: "Ranks overdue items, incoming shift handovers waiting for your acknowledgment, open non-conformance records (NCRs), and promises made across chats.",
      },
      {
        title: "Shift Handover Acknowledgments",
        desc: "Review and counter-sign the outgoing supervisor's verified shift report with machine status, safety notes, and open watch-outs.",
      },
      {
        title: "Integrated Agenda & Promises",
        desc: "Synchronizes your calendar meetings and tracks promises ('I will send the UT report by 4 PM') automatically captured by Saathi.",
      },
    ],
    safeguard: "Zero dropped handovers: Outgoing and incoming supervisors have single-tap traceability.",
    previewType: "myday",
  },
  {
    id: "activity",
    navLabel: "Activity",
    title: "Activity · The Real-Time Operational Pulse",
    badge: "Audited Feed",
    tagline: "Never Miss a Critical Plant Event",
    summary:
      "Activity acts as an auditable operational stream of every channel conversation, mention, record creation, and drawing approval across the enterprise.",
    icon: Bell,
    color: "text-brand",
    bg: "bg-brand/15",
    inside: [
      {
        title: "Unified Notification Stream",
        desc: "Real-time updates filtered into All, Mentions (@you), and Assigned Work so critical production alerts never get buried.",
      },
      {
        title: "Cross-Channel Awareness",
        desc: "Monitor Bay 1 & Bay 2 machine events, welding inspections, and foundry communications from one centralized stream.",
      },
      {
        title: "Immutable Security Audit Trail",
        desc: "Every status change, revision release, and permission grant is logged with timestamps and actor metadata for quality audits.",
      },
    ],
    safeguard: "Permission-enforced: You only see activity for channels and files you have clearance to access.",
    previewType: "activity",
  },
  {
    id: "assistant",
    navLabel: "Saathi & Research",
    title: "Saathi · AI Colleague & Multi-Agent Research",
    badge: "ADK Multi-Agent",
    tagline: "Natural Language to Verified Engineering Truth",
    summary:
      "Ask questions in natural English, Hindi, or Hinglish. Saathi deploys parallel ADK research agents to inspect drawings, test reports, and promises, verifying every claim with citations.",
    icon: Sparkles,
    color: "text-brand",
    bg: "bg-brand/15",
    inside: [
      {
        title: "Conversational Retrieval",
        desc: "Ask 'Which revision of SRC-BF-2041 is latest?' or 'Side frame me porosity aa rahi hai, pehle hua hai kya?' and get immediate cited answers.",
      },
      {
        title: "Multi-Agent Research Dossiers",
        desc: "Parallel agents check drawings, vendor certificates, and NCR history to assemble inspection readiness reports in minutes, not days.",
      },
      {
        title: "Revision Guard & Answer Provenance",
        desc: "Proactively warns if a drawing is superseded. Every answer reveals exact tool execution steps, latency, and source documents.",
      },
    ],
    safeguard: "Grounding Invariant: Document text is treated strictly as data, never instructions. Zero hallucinations.",
    previewType: "assistant",
  },
  {
    id: "live",
    navLabel: "Saathi Live",
    title: "Saathi Live · Meeting & Shop Floor Copilot",
    badge: "Streaming Copilot",
    tagline: "Ambient Listening With Sub-Second Intelligence",
    summary:
      "Saathi Live listens in engineering reviews and plant meetings with sub-second streaming transcription, projecting proactive cited answers directly on screen.",
    icon: Radar,
    color: "text-saffron-ink",
    bg: "bg-saffron/15",
    inside: [
      {
        title: "Sub-Second Streaming Transcription",
        desc: "Processes spoken audio in real-time with under 700ms line-final transcription and multi-speaker attribution.",
      },
      {
        title: "Proactive Heads-Up Display (HUD)",
        desc: "As questions are spoken in the room, Saathi retrieves relevant drawing clauses, material limits, and past decisions and pops them onto the screen.",
      },
      {
        title: "Auto-Drafted Meeting Summaries",
        desc: "Generates concise action items, decisions logged, and formal shift handover documents immediately when the session ends.",
      },
    ],
    safeguard: "Privacy First: Audio streams are ephemeral, processed in-memory, and never retained on permanent disk.",
    previewType: "live",
  },
  {
    id: "quality",
    navLabel: "Quality & Voice",
    title: "Quality & Voice · Shop Floor Execution",
    badge: "Gemini 3.8 Live",
    tagline: "Spec Check Verification & Hands-Free Audio",
    summary:
      "Combines automated Mill Test Certificate (MTC) verification against engineering standards with hands-free bidirectional Gemini 3.8 Live audio for shop-floor operators.",
    icon: ShieldCheck,
    color: "text-moss",
    bg: "bg-moss/15",
    inside: [
      {
        title: "Automated Spec Check & Standards Library",
        desc: "Gemini reads chemical and mechanical values from incoming vendor MTCs, and deterministic code verifies them against RDSO and plant standard limits.",
      },
      {
        title: "One-Click Non-Conformance Drafting",
        desc: "When chemical limits or Charpy impact tests fail, 1-click generates an NCR draft with containment procedures ready for engineering review.",
      },
      {
        title: "Gemini 3.8 Live Plant Floor Voice",
        desc: "Operators can hold-to-talk or tap-to-toggle to log downtime ('CNC-3 breakdown log karo') or query machine status completely hands-free.",
      },
    ],
    safeguard: "Deterministic Rule Verification: AI extracts values; code computes pass/fail limits.",
    previewType: "quality",
  },
];

export function ProductTour({ onClose }: { onClose: () => void }) {
  const [currentStep, setCurrentStep] = useState(0);
  const [completedSteps, setCompletedSteps] = useState<number[]>([]);
  const [previewActionDone, setPreviewActionDone] = useState(false);

  const step = TOUR_STEPS[currentStep];

  async function completeAndClose() {
    try {
      await api("/api/me/settings", { method: "POST", json: { walkthrough: true } });
    } catch {}
    onClose();
  }

  function handleNext() {
    if (!completedSteps.includes(currentStep)) {
      setCompletedSteps([...completedSteps, currentStep]);
    }
    setPreviewActionDone(false);
    if (currentStep < TOUR_STEPS.length - 1) {
      setCurrentStep(currentStep + 1);
    } else {
      completeAndClose();
    }
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-ink/50 backdrop-blur-xs p-3 sm:p-5 animate-fade-in">
      <div className="flex h-full max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-border bg-surface shadow-2xl">
        {/* Top Header */}
        <div className="flex items-center justify-between border-b border-border bg-canvas/60 px-5 py-3.5 sm:px-6">
          <div className="flex items-center gap-2.5">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-brand font-bold text-xs text-white shadow-xs">
              S
            </span>
            <div>
              <h1 className="text-sm font-bold tracking-tight text-ink sm:text-[15px]">
                Saathi Enterprise Tour
              </h1>
              <p className="hidden text-xs text-muted sm:block">
                Interactive walkthrough of core operational workflows &amp; architecture
              </p>
            </div>
          </div>
          <button
            onClick={completeAndClose}
            className="rounded-lg p-1.5 text-muted transition hover:bg-hover hover:text-ink"
            aria-label="Close walkthrough"
          >
            <X size={18} />
          </button>
        </div>

        {/* Step Navigation Tabs */}
        <div className="flex overflow-x-auto border-b border-border bg-canvas/30 scrollbar-none">
          {TOUR_STEPS.map((s, idx) => {
            const isDone = completedSteps.includes(idx);
            const isCurrent = currentStep === idx;
            return (
              <button
                key={s.id}
                onClick={() => {
                  if (!completedSteps.includes(currentStep)) {
                    setCompletedSteps([...completedSteps, currentStep]);
                  }
                  setPreviewActionDone(false);
                  setCurrentStep(idx);
                }}
                className={`flex flex-1 min-w-[120px] items-center justify-center gap-2 border-b-2 px-3 py-3 text-center text-xs transition sm:py-3.5 ${
                  isCurrent
                    ? "border-brand bg-surface font-bold text-brand"
                    : isDone
                    ? "border-moss/70 text-moss"
                    : "border-transparent text-muted hover:text-ink"
                }`}
              >
                <span
                  className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold transition ${
                    isDone
                      ? "bg-moss text-white"
                      : isCurrent
                      ? "bg-brand text-white shadow-xs"
                      : "bg-border text-muted"
                  }`}
                >
                  {isDone ? <Check size={12} strokeWidth={3} /> : idx + 1}
                </span>
                <span className="truncate">{s.navLabel}</span>
              </button>
            );
          })}
        </div>

        {/* Step Content Area */}
        <div className="flex-1 overflow-y-auto p-5 sm:p-7">
          <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr] lg:items-start">
            {/* Left: Detailed Explanations */}
            <div className="space-y-4">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={`rounded-md px-2 py-0.5 text-[11px] font-bold uppercase tracking-wider ${step.bg} ${step.color}`}
                  >
                    {step.badge}
                  </span>
                  <span className="text-xs font-medium text-muted">
                    Section {currentStep + 1} of {TOUR_STEPS.length}
                  </span>
                </div>
                <h2 className="mt-2 text-xl font-bold tracking-tight text-ink sm:text-2xl">
                  {step.title}
                </h2>
                <p className="mt-1 text-xs font-semibold uppercase tracking-wide text-brand">
                  {step.tagline}
                </p>
                <p className="mt-2.5 text-sm leading-relaxed text-muted">
                  {step.summary}
                </p>
              </div>

              {/* What is inside breakdown */}
              <div className="rounded-xl border border-border/80 bg-canvas/40 p-4">
                <h3 className="text-xs font-bold uppercase tracking-wider text-ink/70">
                  What is inside this section:
                </h3>
                <div className="mt-3 space-y-3">
                  {step.inside.map((item, i) => (
                    <div key={i} className="flex items-start gap-2.5">
                      <span className="mt-1 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-brand/10 text-brand">
                        <Check size={10} strokeWidth={3} />
                      </span>
                      <div className="min-w-0 flex-1 text-xs">
                        <span className="font-bold text-ink">{item.title}: </span>
                        <span className="text-muted leading-snug">{item.desc}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Enterprise Safeguard Callout */}
              <div className="flex items-center gap-2 rounded-lg border border-moss/20 bg-moss-soft/60 px-3 py-2 text-xs text-moss">
                <ShieldCheck size={16} className="shrink-0" />
                <span className="font-medium">{step.safeguard}</span>
              </div>
            </div>

            {/* Right: In-Motion Interactive Section Mockup */}
            <div className="flex flex-col rounded-2xl border border-border bg-canvas/80 p-4 shadow-xs">
              <div className="mb-3 flex items-center justify-between border-b border-border/60 pb-2.5">
                <div className="flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-full bg-moss animate-pulse" />
                  <span className="text-[11px] font-bold uppercase tracking-wider text-muted">
                    Live Interface In Motion
                  </span>
                </div>
                <span className="text-[10px] font-mono text-muted">
                  Interactive Preview
                </span>
              </div>

              {/* Dynamic Preview Component Based on Step */}
              {step.previewType === "myday" && (
                <div className="space-y-2.5 text-xs">
                  <div className="flex items-center justify-between rounded-lg bg-surface p-3 border border-border shadow-2xs">
                    <div className="space-y-0.5">
                      <div className="flex items-center gap-1.5">
                        <span className="h-1.5 w-1.5 rounded-full bg-rust" />
                        <span className="font-semibold text-ink">Action Required</span>
                        <span className="rounded bg-rust-soft px-1.5 py-0.2 text-[10px] font-bold text-rust">
                          High
                        </span>
                      </div>
                      <p className="text-xs text-muted">
                        Review Ultrasonic Test (UT) Certificate for Side Frame Lot 2
                      </p>
                    </div>
                    <button
                      onClick={() => setPreviewActionDone(!previewActionDone)}
                      className={`h-7 px-2.5 text-[11px] font-semibold rounded-md transition ${
                        previewActionDone
                          ? "bg-moss text-white"
                          : "border border-border bg-canvas hover:border-brand"
                      }`}
                    >
                      {previewActionDone ? "Acknowledged ✓" : "Review"}
                    </button>
                  </div>

                  <div className="rounded-lg bg-surface p-3 border border-border shadow-2xs">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-ink">Shift Handover · Shift B</span>
                      <span className="text-[10px] text-muted">14:00 Today</span>
                    </div>
                    <p className="mt-1 text-xs text-muted">
                      Bay 2 welding normal. CNC-3 maintained. 14 bogie frames released.
                    </p>
                    <div className="mt-2 flex items-center gap-2 text-[11px] text-moss">
                      <CheckCircle2 size={13} />
                      <span>Ready for incoming supervisor signature</span>
                    </div>
                  </div>
                </div>
              )}

              {step.previewType === "activity" && (
                <div className="space-y-2 text-xs">
                  <div className="flex items-center gap-2 rounded-lg bg-surface p-3 border border-brand/20 shadow-2xs">
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-soft text-brand font-bold text-[11px]">
                      NV
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-ink">
                        Neha Verma <span className="font-normal text-muted">mentioned you</span>
                      </p>
                      <p className="truncate text-xs text-muted">
                        “@Prince Please check Rev C GA drawing limits before cutting”
                      </p>
                    </div>
                    <span className="text-[10px] text-muted">2m ago</span>
                  </div>

                  <div className="flex items-center gap-2 rounded-lg bg-surface p-3 border border-border shadow-2xs">
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-moss-soft text-moss font-bold text-[11px]">
                      QC
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-ink">NCR-0041 Contained</p>
                      <p className="truncate text-xs text-muted">
                        Root cause identified as wet sand on casting lot 4
                      </p>
                    </div>
                    <span className="text-[10px] text-muted">18m ago</span>
                  </div>
                </div>
              )}

              {step.previewType === "assistant" && (
                <div className="space-y-2.5 text-xs">
                  <div className="rounded-lg bg-surface p-3 border border-border shadow-2xs">
                    <p className="text-[11px] text-muted font-medium">Prompt:</p>
                    <p className="font-semibold text-ink">
                      “Which revision of SRC-BF-2041 is latest and who approved it?”
                    </p>
                  </div>

                  <div className="rounded-lg bg-surface p-3 border border-brand/30 shadow-2xs space-y-2">
                    <p className="text-xs text-ink leading-relaxed">
                      Drawing <b>SRC-BF-2041 Rev C</b> (Side Frame GA) is the current released revision. Approved by <b>Neha Verma</b> on 12 Oct 2026.
                    </p>
                    <div className="rounded-md border border-border bg-canvas/70 p-2 space-y-1">
                      <div className="flex items-center gap-2 text-[11px] font-semibold text-ink">
                        <Sparkles size={12} className="text-brand" />
                        <span>How Saathi got this:</span>
                        <span className="rounded bg-moss-soft px-1.5 text-moss text-[10px]">
                          2 sources cited
                        </span>
                        <span className="text-muted font-mono text-[10px]">⚡ 1.1s</span>
                      </div>
                      <p className="text-[10px] text-muted">
                        • Drawing Register: Rev C approved (Rev B superseded flagged)
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {step.previewType === "live" && (
                <div className="space-y-2.5 text-xs">
                  {/* Listening Equalizer Bar Animation */}
                  <div className="flex items-center justify-between rounded-lg bg-ink p-3 text-white">
                    <div className="flex items-center gap-2">
                      <span className="h-2 w-2 rounded-full bg-rust animate-ping" />
                      <span className="text-xs font-semibold">Saathi Live Active</span>
                    </div>
                    {/* 5 animated sound wave bars */}
                    <div className="flex items-end gap-1 h-4">
                      <span className="w-1 bg-saffron rounded-full animate-bounce [animation-delay:-0.3s] h-3" />
                      <span className="w-1 bg-saffron rounded-full animate-bounce [animation-delay:-0.1s] h-4" />
                      <span className="w-1 bg-saffron rounded-full animate-bounce [animation-delay:-0.4s] h-2" />
                      <span className="w-1 bg-saffron rounded-full animate-bounce [animation-delay:-0.2s] h-4" />
                      <span className="w-1 bg-saffron rounded-full animate-bounce h-3" />
                    </div>
                  </div>

                  <div className="rounded-lg bg-surface p-3 border border-saffron/40 shadow-2xs space-y-1.5">
                    <span className="text-[10px] font-mono font-bold uppercase tracking-wide text-saffron-ink">
                      Heard in meeting:
                    </span>
                    <p className="italic text-muted">
                      “What is the yield strength minimum for Grade S355?”
                    </p>
                    <div className="pt-1.5 border-t border-border">
                      <p className="font-semibold text-ink">
                        Instant HUD Answer:
                      </p>
                      <p className="text-xs text-ink/90">
                        Minimum yield strength is <b>355 MPa</b> for nominal thickness ≤ 16mm (Clause 7.3.1, EN 10025-2).
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {step.previewType === "quality" && (
                <div className="space-y-2.5 text-xs">
                  <div className="rounded-lg bg-surface p-3 border border-moss/40 shadow-2xs space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="font-mono font-bold text-ink">
                        Heat H-78120 · S355J2
                      </span>
                      <span className="rounded-full bg-moss-soft px-2 py-0.5 text-[10px] font-bold text-moss">
                        SPEC CHECK PASS
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-muted pt-1 text-[11px]">
                      <div>Carbon: <b className="text-ink">0.18%</b> (max 0.20%)</div>
                      <div>CEV: <b className="text-ink">0.41</b> (max 0.45)</div>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 rounded-lg bg-surface p-3 border border-border shadow-2xs">
                    <div className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand text-white shadow-xs">
                      <Sparkles size={18} />
                      <span className="absolute -inset-1 rounded-full border border-brand/40 animate-ping" />
                    </div>
                    <div>
                      <p className="font-semibold text-ink">Shop Floor Mic Active</p>
                      <p className="text-muted text-[11px]">
                        “Bay 2 lathe 4 downtime log karo” → Saved to Records
                      </p>
                    </div>
                  </div>
                </div>
              )}

              <p className="mt-3 text-center text-[11px] text-muted">
                Section {currentStep + 1} of {TOUR_STEPS.length} · Tap Next to continue
              </p>
            </div>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="flex items-center justify-between border-t border-border bg-canvas/40 px-5 py-3.5 sm:px-6">
          <button
            onClick={completeAndClose}
            className="text-xs font-semibold text-muted hover:text-ink transition px-2 py-1"
          >
            Skip walkthrough
          </button>

          <div className="flex items-center gap-3">
            <span className="hidden text-xs text-muted sm:inline">
              Step {currentStep + 1} of {TOUR_STEPS.length}
            </span>
            <button
              onClick={handleNext}
              className="inline-flex items-center gap-1.5 rounded-lg bg-brand px-4 py-2 text-xs font-semibold text-white shadow-xs transition hover:bg-brand-strong"
            >
              {currentStep === TOUR_STEPS.length - 1 ? (
                <>
                  Complete Tour &amp; Start <Check size={14} />
                </>
              ) : (
                <>
                  Next: {TOUR_STEPS[currentStep + 1].navLabel} <ArrowRight size={14} />
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
