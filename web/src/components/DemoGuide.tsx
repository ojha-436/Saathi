"use client";

import { ArrowRight, BarChart3, CalendarDays, DriveIcon, FileSearch, Gavel, Mail, Radar, Settings, ShieldCheck, Sparkles, Workflow } from "@/lib/icons";
import { Modal, ModalHeader } from "./Dialogs";
import { isAdmin, useWs, type View } from "./ctx";

type Flow = { title: string; icon: typeof Mail; what: string; tryText?: string; cta: string; action: () => void };

/** Something to ask about each demo colleague's own Drive files (sample data from seed.google_demo) */
const DRIVE_TRY: Record<string, string> = {
  prince: "What changed in SRC-BF-2041 Rev C?",
  amit: "What did the FEA show for the lightening holes?",
  neha: "Which side frame NCRs are still open?",
  rahul: "What is the delivery schedule for PO-7781?",
  suresh: "How often has CNC-3 overheated?",
  kavya: "What's still pending for the RDSO inspection?",
};

/** Demo logins: every flow worth showing, what it does in a sentence, something to try, and a button that opens it. */
export function DemoGuide({ onClose, onVoice, onApps, onSwitch }: { onClose: () => void; onVoice: () => void; onApps: () => void; onSwitch: (persona: string) => void }) {
  const { account, settings, open } = useWs();
  const persona = account.email.split("@")[0];
  const connected = settings.connected ?? [];
  const go = (v: View) => {
    onClose();
    open(v);
  };
  const google = (kind: "gmail" | "calendar" | "drive") => (connected.includes(kind) ? () => go({ kind }) : onApps);
  const driveQ = DRIVE_TRY[persona] ?? DRIVE_TRY.prince;

  const groups: [string, Flow[]][] = [
    [
      "Ask & find",
      [
        {
          title: "Ask Saathi, with sources",
          icon: Sparkles,
          what: "Answers from the chats, drawings and records you can open. Every answer cites its sources and shows the steps Saathi took.",
          tryText: "Which revision of SRC-BF-2041 is latest and who approved it? Then open “How Saathi got this”.",
          cta: "Ask",
          action: () => go({ kind: "assistant", prompt: "Which revision of SRC-BF-2041 is latest and who approved it?" }),
        },
        {
          title: "Saathi Research",
          icon: FileSearch,
          what: "Several agents check drawings, certificates, NCRs and promises at once and write a cited readiness report; gaps become tasks.",
          tryText: "Pick “Inspection readiness” for drawing SRC-BF-2041.",
          cta: "Open Research",
          action: () => go({ kind: "research" }),
        },
      ],
    ],
    [
      "Quality & shop floor",
      [
        {
          title: "Spec Check & Standards",
          icon: ShieldCheck,
          what: "Mill test certificates checked against the standards library, value by value, with the clause cited. A failed value can raise an NCR.",
          tryText: "Open heat H-77812 and check each certificate value against the S355J2 limits.",
          cta: "Open Standards",
          action: () => go({ kind: "quality", tab: "standards" }),
        },
        ...(account.org.settings.voice_us
          ? [
              {
                title: "Saathi Voice",
                icon: Radar,
                what: "Hands-free on the shop floor, in Hindi or English: ask about a drawing or report an issue by speaking.",
                tryText: "“CNC-3 ka spindle alarm phir aaya hai”",
                cta: "Start Voice",
                action: () => {
                  onClose();
                  onVoice();
                },
              },
            ]
          : []),
        {
          title: "Quality & plant records",
          icon: Gavel,
          what: "NCRs and downtime with owners, containment and root cause; Saathi finds similar past problems and how they were fixed.",
          cta: "Open Quality",
          action: () => go({ kind: "quality" }),
        },
      ],
    ],
    [
      "Meetings",
      [
        {
          title: "Calendar & Google Meet",
          icon: CalendarDays,
          what: "Your meetings from Google Calendar, with Join for the Google Meet call, Prep me (a brief from your email, Drive and chats) and notes that turn into tasks.",
          tryText: "Click Prep me on the Om Castings quality review.",
          cta: "Open Calendar",
          action: google("calendar"),
        },
        {
          title: "Saathi Live",
          icon: Radar,
          what: "A live transcript of the meeting with instant, cited answers to questions people ask, and action items at the end.",
          cta: "Open Live",
          action: () => go({ kind: "live" }),
        },
      ],
    ],
    [
      "Decide & measure",
      [
        {
          title: "Decisions",
          icon: Workflow,
          what: "Every decision captured from chats: who decided, why, the evidence, and what it replaced, so nobody re-argues it later.",
          tryText: "Open the decision to stay with Om Castings and check its conditions.",
          cta: "Open Decisions",
          action: () => go({ kind: "decisions" }),
        },
        {
          title: "Insights",
          icon: BarChart3,
          what: "Your week in numbers: tasks done and overdue, promises tracked, questions asked to Saathi, and the chats you spent time in.",
          cta: "Open Insights",
          action: () => go({ kind: "insights" }),
        },
      ],
    ],
    [
      "Google apps",
      [
        {
          title: "Gmail: promises from email",
          icon: Mail,
          what: "Saathi spots commitments in email, like a vendor promising a dispatch date, and turns them into tasks with a due date. Emails are searchable by you only.",
          tryText: "Click Track on a vendor's promise.",
          cta: "Open Gmail",
          action: google("gmail"),
        },
        {
          title: "Google Drive",
          icon: DriveIcon as typeof Mail,
          what: "Your recent Docs and Sheets. Saathi reads them and answers with the file as its source.",
          tryText: `Ask Saathi: ${driveQ}`,
          cta: "Open Drive",
          action: google("drive"),
        },
        {
          title: "How syncing works",
          icon: Settings,
          what: "Settings → Connected apps: Calendar, Gmail and Drive are read, never written; synced every 10 minutes; only you see them; disconnecting deletes the copy. Demo logins show sample data.",
          cta: "Open Connected apps",
          action: () => {
            onClose();
            onApps();
          },
        },
      ],
    ],
    [
      "Admin",
      [
        isAdmin(account)
          ? {
              title: "Admin console",
              icon: ShieldCheck,
              what: "Members and roles; guests with their own access and end date; invites by email or WhatsApp; channel governance; the audit log. Admins never see messages.",
              tryText: "Invites → Guest: see what a vendor can and can't do.",
              cta: "Open Admin",
              action: () => go({ kind: "admin" }),
            }
          : {
              title: "Admin console",
              icon: ShieldCheck,
              what: "Members, guests with an end date, invites and the audit log. Only admins see it; Prince is the demo admin.",
              cta: "Switch to Prince",
              action: () => onSwitch("prince"),
            },
      ],
    ],
  ];

  return (
    <Modal title="Demo guide" onClose={onClose} wide>
      <ModalHeader title="Demo guide" sub={`${account.org.name} is a fictional rail-component plant. Pick anything to try it.`} onClose={onClose} />
      <div className="scrollbar-thin overflow-y-auto px-5 py-4">
        {groups.map(([group, flows]) => (
          <section key={group} className="mb-4 last:mb-0">
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">{group}</h3>
            <ul className="space-y-2">
              {flows.map((f) => (
                <li key={f.title} className="flex items-start gap-3 rounded-xl border border-border px-3.5 py-3">
                  <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand-soft text-brand" aria-hidden>
                    <f.icon size={16} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold">{f.title}</p>
                    <p className="mt-0.5 text-xs leading-relaxed text-muted">{f.what}</p>
                    {f.tryText && <p className="mt-1 text-xs text-ink/80">Try: {f.tryText}</p>}
                  </div>
                  <button onClick={f.action} className="flex h-8 shrink-0 items-center gap-1 rounded-lg border border-border px-2.5 text-xs font-semibold hover:bg-hover">
                    {f.cta} <ArrowRight size={12} aria-hidden />
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </Modal>
  );
}
