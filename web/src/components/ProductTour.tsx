"use client";

import { useState } from "react";
import { ArrowRight, Check, FileSearch, Radar, ShieldCheck, Sparkles, X } from "@/lib/icons";
import { api } from "@/lib/api";

const STEPS = [
  {
    id: "knowledge",
    title: "Access Knowledge & Multi-Agent Research",
    tagline: "Enterprise Intelligence",
    description: "Saathi orchestrates parallel research agents that inspect drawings, mill certificates, and audit logs. Every answer provides complete provenance with verified source citations.",
    badge: "ADK Multi-Agent",
    icon: FileSearch,
    color: "text-brand",
    bg: "bg-brand/10",
    points: [
      "Parallel research agents verify claims against actual engineering drawings",
      "Automatic detection of superseded drawing revisions (Revision Guard)",
      "Zero hallucinations: transparent tool calls and latency telemetry"
    ]
  },
  {
    id: "live",
    title: "Saathi Live Meeting Copilot",
    tagline: "Frontline Collaboration",
    description: "Ambient listening in meetings that transcribes and answers questions live on screen without human interruption. Auto-generates shift handovers and captures promises into tracked tasks.",
    badge: "Real-time Copilot",
    icon: Radar,
    color: "text-saffron-ink",
    bg: "bg-saffron/10",
    points: [
      "Streaming transcription under 1 second latency",
      "Automatic shift handovers drafted from cross-shift operational chats",
      "Promise capture converts 'I will send by Friday' into tracked tasks"
    ]
  },
  {
    id: "quality",
    title: "Deterministic Spec Check & Standards",
    tagline: "Manufacturing Precision",
    description: "Gemini reads complex chemical and mechanical material test certificates, while deterministic rule engines verify them against RDSO and plant standard limits.",
    badge: "Automated MTC",
    icon: ShieldCheck,
    color: "text-moss",
    bg: "bg-moss/10",
    points: [
      "Instant pass/fail verdicts on Mill Test Certificates",
      "One-click non-conformance report (NCR) drafting from failed properties",
      "Searchable company standards library powered by Agent Search"
    ]
  },
  {
    id: "voice",
    title: "Hands-Free Shop Floor Voice",
    tagline: "Plant Operations",
    description: "Powered by Gemini 3.8 Live. Frontline workers can record downtime, log safety observations, and run readiness checks in Hindi, Hinglish, or English without touching a screen.",
    badge: "Gemini 3.8 Live",
    icon: Sparkles,
    color: "text-brand",
    bg: "bg-brand/10",
    points: [
      "Bi-directional natural audio conversation directly on the plant floor",
      "Instant snap-to-record voice defect logging",
      "Multi-lingual support: fluent in English, Hindi, and regional terminology"
    ]
  }
];

export function ProductTour({ onClose }: { onClose: () => void }) {
  const [currentStep, setCurrentStep] = useState(0);
  const [completedSteps, setCompletedSteps] = useState<number[]>([]);

  const step = STEPS[currentStep];

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
    if (currentStep < STEPS.length - 1) {
      setCurrentStep(currentStep + 1);
    } else {
      completeAndClose();
    }
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-ink/40 backdrop-blur-xs p-4 animate-fade-in">
      <div className="w-full max-w-xl bg-surface border border-border rounded-2xl shadow-2xl overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-6 py-4 bg-canvas/40">
          <div className="flex items-center gap-2">
            <span className="flex h-6 w-6 items-center justify-center rounded-md bg-brand text-white text-xs font-bold">S</span>
            <span className="font-semibold text-sm tracking-tight text-ink">Welcome to Saathi</span>
          </div>
          <button
            onClick={completeAndClose}
            className="text-muted hover:text-ink rounded-lg p-1 transition"
            aria-label="Close tour"
          >
            <X size={16} />
          </button>
        </div>

        {/* Step Navigation Progress */}
        <div className="grid grid-cols-4 border-b border-border bg-canvas/20">
          {STEPS.map((s, idx) => {
            const isDone = completedSteps.includes(idx);
            const isCurrent = currentStep === idx;
            return (
              <button
                key={s.id}
                onClick={() => {
                  if (!completedSteps.includes(currentStep)) {
                    setCompletedSteps([...completedSteps, currentStep]);
                  }
                  setCurrentStep(idx);
                }}
                className={`py-3 px-2 text-center text-xs font-medium border-b-2 transition flex items-center justify-center gap-1.5 ${
                  isCurrent
                    ? "border-brand text-brand bg-surface font-semibold"
                    : isDone
                    ? "border-moss text-moss"
                    : "border-transparent text-muted hover:text-ink"
                }`}
              >
                <span className={`flex h-4 w-4 items-center justify-center rounded-full text-[10px] ${
                  isDone ? "bg-moss text-white" : isCurrent ? "bg-brand text-white" : "bg-border text-muted"
                }`}>
                  {isDone ? <Check size={10} strokeWidth={3} /> : idx + 1}
                </span>
                <span className="hidden sm:inline truncate">{s.tagline}</span>
              </button>
            );
          })}
        </div>

        {/* Content Body */}
        <div className="p-6 sm:p-8 flex-1">
          <div className="flex items-center gap-2 mb-3">
            <span className={`px-2 py-0.5 rounded text-[11px] font-bold uppercase tracking-wider ${step.bg} ${step.color}`}>
              {step.badge}
            </span>
            <span className="text-xs text-muted">Step {currentStep + 1} of {STEPS.length}</span>
          </div>

          <div className="flex items-start gap-4 mt-2">
            <div className={`p-3 rounded-xl shrink-0 ${step.bg} ${step.color}`}>
              <step.icon size={28} />
            </div>
            <div>
              <h2 className="text-xl font-bold tracking-tight text-ink">{step.title}</h2>
              <p className="mt-2 text-sm text-muted leading-relaxed">{step.description}</p>
            </div>
          </div>

          {/* Interactive Feature Checklist */}
          <div className="mt-6 space-y-2.5 bg-canvas/50 p-4 rounded-xl border border-border/60">
            {step.points.map((pt, i) => (
              <div key={i} className="flex items-start gap-2 text-xs text-ink/80">
                <span className="mt-0.5 flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full bg-brand/10 text-brand">
                  <Check size={9} strokeWidth={3} />
                </span>
                <span>{pt}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-border px-6 py-4 bg-canvas/30">
          <button
            onClick={completeAndClose}
            className="text-xs font-semibold text-muted hover:text-ink px-2 py-1"
          >
            Skip walkthrough
          </button>
          <button
            onClick={handleNext}
            className="inline-flex items-center gap-1.5 rounded-lg bg-brand px-4 py-2 text-xs font-semibold text-white shadow-xs hover:bg-brand-strong transition"
          >
            {currentStep === STEPS.length - 1 ? (
              <>
                Finish &amp; Start Working <Check size={14} />
              </>
            ) : (
              <>
                Next Concept <ArrowRight size={14} />
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
