"use client";

import clsx from "clsx";
import { signInWithPassword, signOut } from "@/lib/auth";
import { BarChart3, ChevronDown, FileSearch, LogOut, Search, Settings, ShieldCheck, Smile, Sparkles, Mail, CalendarDays, DriveIcon, Gavel, Plus, Radar, Workflow } from "@/lib/icons";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "@/lib/api";
import { rememberKnowledge } from "@/lib/knowledgeNames";
import { STATUS_META, isUnread, ownStatusText, presence, statusText } from "@/lib/format";
import { useChats, useEmailItems, useEvents, useFiles, useMeetings, useNotices, useRecords, useRegister, useReads, useSettings, useTasks, useUsers } from "@/lib/hooks";
import type { Account, DriveFile, StatusState } from "@/lib/types";
import { AdminView } from "./Admin";
import { AssistantView } from "./AssistantView";
import { ResearchView } from "./Research";
import { VoiceSheet } from "./VoiceSheet";
import { Menu, type MenuItem, UserAvatar } from "./bits";

const DEMO_PERSONAS = [
  { id: "prince", name: "Prince Kumar", role: "Design Engineer", note: "Design Engineer · Best place to start" },
  { id: "neha", name: "Neha Verma", role: "QA Manager", note: "QA Manager · Spec Check, Standards & NCRs" },
  { id: "suresh", name: "Suresh Yadav", role: "Shop Floor Supervisor", note: "Shop Floor Supervisor · Voice, Bay 2 & Handovers" },
  { id: "rahul", name: "Rahul Singh", role: "Procurement Lead", note: "Procurement Lead · Vendor Promises & Quotes" },
  { id: "kavya", name: "Kavya Iyer", role: "Project Manager", note: "Project Manager · Research & Decisions" },
  { id: "amit", name: "Amit Sharma", role: "Senior Design Engineer", note: "Senior Design Engineer · Private Rev D Draft" },
];
import { ChatHome } from "./ChatHome";
import { ChatView } from "./ChatView";
import { Ctx, isAdmin, type DialogKind, type MeetingPrefill, type TaskPrefill, type View } from "./ctx";
import { BrowseChannelsDialog, CommandPalette, CreateChannelDialog, NewChatDialog, ProfileDialog } from "./Dialogs";
import { InsightsView } from "./InsightsView";
import { LogoMark } from "./Logo";
import { CalendarView, DriveView, GmailView } from "./Integrations";
import { QualityView, ReportDialog } from "./Quality";
import { DecisionsView } from "./Knowledge";
import { HandoverView } from "./Handover";
import { LiveView } from "./Live";
import { MeetingView, NewMeetingDialog } from "./Meetings";
import { MyDayView } from "./MyDay";
import { ProfileCard, SettingsDialog, StatusDialog, StatusIcon } from "./People";
import { AppRail, ChatList, notifyLevel, railKey } from "./Sidebar";
import { ActivityView, TaskDialog, TasksView } from "./Tasks";

const QUICK_STATUS: StatusState[] = ["available", "busy", "dnd", "away", "offline"];

export function Workspace({ uid, account }: { uid: string; account: Account }) {
  const router = useRouter();
  const guest = account.org_role === "guest";
  const userList = useUsers(account.org_id, guest);
  const chatList = useChats(uid);
  const reads = useReads(uid);
  const fileList = useFiles(uid);
  const tasks = useTasks(uid);
  const notices = useNotices(uid);
  const meetingList = useMeetings(uid);
  const settings = useSettings(uid);
  const recordList = useRecords(guest ? undefined : uid);
  const records = useMemo(() => Object.fromEntries(recordList.map((r) => [r.id, r])), [recordList]);
  // Register refreshes when drawing files finish processing (their doc fields change)
  const registerVersion = fileList.filter((f) => f.doc?.drawing_no).map((f) => `${f.id}:${f.doc?.revision}`).join("|");
  const register = useRegister(!guest, registerVersion.length + registerVersion.split("|").length);
  const events = useEvents(uid);
  const emailList = useEmailItems(uid);
  const emails = useMemo(() => Object.fromEntries(emailList.filter((e) => (e as { provider?: string }).provider !== "drive").map((e) => [e.id, e])), [emailList]);
  const driveFiles = useMemo(
    () => Object.fromEntries(emailList.filter((e) => (e as { provider?: string }).provider === "drive").map((e) => [e.id, e as unknown as DriveFile])),
    [emailList],
  );
  const connected = settings.connected ?? [];
  const emailPromises = Object.values(emails).filter((e) => e.promise && !e.task_id && !e.dismissed).length;
  const [meetingPrefill, setMeetingPrefill] = useState<MeetingPrefill | null>(null);
  const [view, setView] = useState<View>({ kind: "home" });
  // Phones show one pane at a time: the chat list, or the open conversation.
  const [mobileList, setMobileList] = useState(false);
  // Deep link from a push notification: /app?open=msg:CHAT/MSG (also meet:, mail:)
  const [deepLink] = useState(() => new URLSearchParams(location.search).get("open") ?? "");
  const [oauthReturn] = useState(() => {
    const q = new URLSearchParams(location.search);
    if (q.get("connected") !== "google") return "";
    const status = q.get("status");
    return status === "ok" ? "Google connected. Syncing your calendar and email…" : status === "cancelled" ? "Google connection cancelled." : `Couldn't connect Google: ${q.get("detail") || "try again"}`;
  });
  const [dlg, setDlg] = useState<DialogKind | null>(oauthReturn ? "settings" : null);
  const [settingsTab, setSettingsTab] = useState<string | undefined>(oauthReturn ? "apps" : undefined);
  const [taskPrefill, setTaskPrefill] = useState<TaskPrefill | null>(null);
  const [profileOf, setProfileOf] = useState<string | null>(null);
  const [toasts, setToasts] = useState<{ id: number; text: string }[]>([]);
  const mainRef = useRef<HTMLElement>(null);

  const users = useMemo(() => Object.fromEntries(userList.map((u) => [u.id, u])), [userList]);
  const chats = useMemo(() => Object.fromEntries(chatList.map((c) => [c.id, c])), [chatList]);
  const files = useMemo(() => Object.fromEntries(fileList.map((f) => [f.id, f])), [fileList]);
  const meetings = useMemo(() => Object.fromEntries(meetingList.map((m) => [m.id, m])), [meetingList]);
  const me = users[uid];
  // New accounts from Google SSO have no job title yet: ask once per session.
  const [welcomeDone, setWelcomeDone] = useState(false);
  const welcome = !!me && !me.role && !welcomeDone;

  const toast = useCallback((text: string) => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t.slice(-2), { id, text }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4500);
  }, []);

  const open = useCallback((v: View) => {
    setView(v);
    setMobileList(false);
    requestAnimationFrame(() => mainRef.current?.focus({ preventScroll: true }));
  }, []);

  const openRef = useCallback(
    (ref: string) => {
      if (ref.startsWith("msg:")) {
        const [chatId, msgId] = ref.slice(4).split("/");
        open({ kind: "chat", chatId, focusMsg: msgId });
      } else if (ref.startsWith("meet:")) open({ kind: "meeting", id: ref.slice(5) });
      else if (ref.startsWith("rec:")) open({ kind: "quality", recordId: ref.slice(4) });
      else if (ref.startsWith("dec:")) open({ kind: "decisions", id: ref.slice(4) });
      else if (ref.startsWith("kn:")) open({ kind: "live" });
      else if (ref.startsWith("research:")) open({ kind: "research", id: ref.slice(9) });
      else if (ref.startsWith("std:")) open({ kind: "quality", tab: "standards" });
      else if (ref.startsWith("ev:")) open({ kind: "live", eventId: ref.slice(3) });
      else if (ref.startsWith("ho:")) {
        const id = ref.slice(3);
        open({ kind: "handover", chatId: id.split("_").slice(0, -2).join("_"), id });
      }
    },
    [open],
  );

  // Back from Google's consent screen (?connected=google&status=ok|error|cancelled): read once, clean the URL, show the result
  useEffect(() => {
    if (!oauthReturn) return;
    history.replaceState(null, "", "/app");
    const t = setTimeout(() => toast(oauthReturn), 0);
    return () => clearTimeout(t);
  }, [oauthReturn, toast]);

  useEffect(() => {
    if (!deepLink) return;
    history.replaceState(null, "", "/app");
    const t = setTimeout(() => openRef(deepLink), 0);
    return () => clearTimeout(t);
  }, [deepLink, openRef]);

  // A notification clicked while the app is already open: the service worker asks this tab to navigate.
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    const onMsg = (e: MessageEvent) => {
      if (e.data?.type !== "saathi-open") return;
      const ref = new URL(e.data.url).searchParams.get("open");
      if (ref) openRef(ref);
    };
    navigator.serviceWorker.addEventListener("message", onMsg);
    return () => navigator.serviceWorker.removeEventListener("message", onMsg);
  }, [openRef]);

  // Knowledge-hub names for [kn:...] citations in Saathi answers (the items themselves are fetched by the Live screen).
  useEffect(() => {
    api<{ id: string; name: string }[]>("/api/knowledge").then(rememberKnowledge).catch(() => {});
  }, []);

  // Presence heartbeat while the app is open and visible.
  useEffect(() => {
    const beat = () => document.visibilityState === "visible" && api("/api/me/presence", { method: "POST" }).catch(() => {});
    beat();
    const t = setInterval(beat, 60_000);
    document.addEventListener("visibilitychange", beat);
    return () => {
      clearInterval(t);
      document.removeEventListener("visibilitychange", beat);
    };
  }, []);

  // If the open chat disappears (left, removed, deleted), fall back to My Day.
  useEffect(() => {
    if (view.kind === "chat" && !chats[view.chatId]) {
      const t = setTimeout(() => setView({ kind: "chats" }), 2500);
      return () => clearTimeout(t);
    }
  }, [view, chats, chatList.length]);

  // ⌘K / Ctrl+K opens the command palette
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setDlg((d) => (d === "palette" ? null : "palette"));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Pop a toast when a new notification arrives (mentions, assignments, reminders); quiet while on Do not disturb.
  const seen = useRef<Set<string> | null>(null);
  useEffect(() => {
    if (seen.current === null) {
      seen.current = new Set(notices.map((n) => n.id));
      return;
    }
    const q = settings.quiet_hours;
    const hm = new Date().toLocaleTimeString("en-GB", { timeZone: me?.timezone || "Asia/Kolkata", hour: "2-digit", minute: "2-digit" });
    const quiet = !!q?.enabled && (q.start <= q.end ? hm >= q.start && hm < q.end : hm >= q.start || hm < q.end);
    const dnd = presence(me) === "dnd" || quiet;
    for (const n of notices) {
      if (!seen.current.has(n.id)) {
        seen.current.add(n.id);
        if (!n.read && !dnd) toast(n.title.length > 80 ? n.title : `${n.title}: ${n.body}`);
      }
    }
  }, [notices, toast, me, settings]);

  async function setStatus(state: StatusState) {
    try {
      await api("/api/me/status", { json: { state, text: ownStatusText(me) } });
    } catch (e) {
      toast((e as Error).message);
    }
  }

  const unreadAlerts = notices.filter((n) => !n.read).length;
  const openTasks = tasks.filter((t) => ["open", "in_progress", "blocked"].includes(t.status) && t.owner === uid).length;
  const unreadChats = chatList.filter((c) => !(view.kind === "chat" && view.chatId === c.id) && isUnread(c, uid, reads) && notifyLevel(c, settings) === "all").length;
  const active = railKey(view);
  const listPane = view.kind === "chat" || view.kind === "chats" || view.kind === "assistant";
  const admin = isAdmin(account);
  const myState = presence(me);

  const isDemo = account.email?.endsWith("@saathi.demo") || account.org_id === "shakti-rail";

  const demoPersonaItems: MenuItem[] = DEMO_PERSONAS.map((p) => ({
    label: `${p.name} (${p.role})`,
    hint: p.id === uid ? "Current" : p.note.split("·")[1]?.trim(),
    onSelect: async () => {
      if (p.id === uid) return;
      try {
        toast(`Switching to ${p.name}…`);
        await signInWithPassword(`${p.id}@saathi.demo`, "Saathi@2026");
        window.location.reload();
      } catch (e) {
        toast((e as Error).message);
      }
    },
  }));

  const demoGuideItems: MenuItem[] = [
    {
      label: "1. Ask Saathi + Provenance",
      icon: Sparkles,
      hint: "Revision & approval",
      onSelect: () => open({ kind: "assistant", prompt: "Which revision of SRC-BF-2041 is latest and who approved it?" }),
    },
    {
      label: "2. Saathi Research (Multi-Agent)",
      icon: FileSearch,
      hint: "Readiness & tasks",
      onSelect: () => open({ kind: "research" }),
    },
    {
      label: "3. Spec Check & Standards Library",
      icon: ShieldCheck,
      hint: "MTC limits & NCR",
      onSelect: () => open({ kind: "quality", tab: "standards" }),
    },
    {
      label: "4. Saathi Live (Meeting Copilot)",
      icon: Radar,
      hint: "Real-time HUD",
      onSelect: () => open({ kind: "live" }),
    },
    {
      label: "5. Saathi Voice (Shop Floor)",
      icon: Sparkles,
      hint: "Hands-free audio",
      onSelect: () => setDlg("voice"),
    },
  ];

  function selectRail(k: ReturnType<typeof railKey>) {
    if (k === "chat") {
      // Desktop: reopen the most recent conversation (or the chat home when there is none). Phones: show the list.
      setMobileList(true);
      if (view.kind !== "chat") setView(chatList[0] ? { kind: "chat", chatId: chatList[0].id } : { kind: "chats" });
      return;
    }
    open({ kind: k } as View);
  }

  return (
    <Ctx.Provider
      value={{
        uid, account, me, users, chats, files, meetings, events, emails, driveFiles, records, register, settings, view, open, openRef, toast, dialog: setDlg,
        newTask: (p) => setTaskPrefill(p ?? {}), newMeeting: (p) => setMeetingPrefill(p ?? {}), showProfile: setProfileOf, showList: () => setMobileList(true), reads,
      }}
    >
      <a href="#workspace-main" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100] focus:rounded-md focus:bg-ink focus:px-4 focus:py-2 focus:text-paper">
        Skip to content
      </a>
      <div className="flex h-dvh flex-col overflow-hidden bg-canvas text-ink">
        {/* Title bar: workspace, global search, status + profile */}
        <header className="flex h-12 shrink-0 items-center gap-2 border-b border-border bg-canvas px-3 text-ink sm:gap-3 lg:pl-[18px]">
          <span className="flex min-w-0 shrink-0 items-center gap-2 lg:w-[calc(68px+20rem-18px)]">
            <LogoMark size={28} />
            <span className="text-[15px] font-semibold tracking-tight">Saathi</span>
            <span className="hidden truncate text-xs text-muted sm:inline">{account.org.name}</span>
            {guest && <span className="rounded-full bg-saffron px-2 py-px text-[10px] font-bold text-ink">GUEST</span>}
          </span>
          <button
            onClick={() => setDlg("palette")}
            className="flex h-8 min-w-0 flex-1 max-w-xs items-center gap-2 rounded-lg border border-border bg-white px-2.5 text-left text-[13px] text-muted transition hover:border-brand hover:text-ink sm:max-w-md lg:max-w-xl"
            aria-label="Search or ask Saathi"
          >
            <Search size={15} aria-hidden /> <span className="hidden flex-1 truncate sm:inline">Search chats, channels and files, or ask Saathi</span>
            <kbd className="hidden rounded border border-border px-1.5 font-mono text-[10px] sm:inline">⌘K</kbd>
          </button>
          <div className="ml-auto flex shrink-0 items-center gap-1.5 sm:gap-2">
            {isDemo && (
              <>
                <Menu
                  label="Try Demo Flows"
                  align="right"
                  trigger={
                    <span className="flex h-8 items-center gap-1.5 rounded-lg border border-brand/40 bg-brand-soft px-2 text-xs font-semibold text-brand transition hover:bg-brand hover:text-white">
                      <Sparkles size={13} aria-hidden />
                      <span className="hidden md:inline">Demo guide</span>
                    </span>
                  }
                  items={demoGuideItems}
                />
                <Menu
                  label="Switch demo persona"
                  align="right"
                  trigger={
                    <span className="flex h-8 items-center gap-1.5 rounded-lg border border-border bg-white px-2 text-xs font-medium text-ink shadow-2xs transition hover:border-brand">
                      <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-moss" aria-hidden />
                      <span className="hidden font-semibold text-ink sm:inline">Demo:</span>
                      <span className="max-w-[72px] truncate sm:max-w-[130px]">
                        {me?.name ? me.name.split(" ")[0] : "Demo"}
                        <span className="hidden font-normal text-muted lg:inline"> ({me?.role?.split(",")[0] || "Team"})</span>
                      </span>
                      <ChevronDown size={12} className="shrink-0 text-muted" aria-hidden />
                    </span>
                  }
                  items={demoPersonaItems}
                />
              </>
            )}
            <Menu
              label="Your profile and status"
              className="flex items-center gap-2 rounded-full p-0.5 transition hover:bg-black/5"
              trigger={<UserAvatar uid={uid} size={30} clickable={false} ring="ring-canvas" />}
              items={[
                { label: me ? [me.name, me.role].filter(Boolean).join(" · ") : account.name, onSelect: () => setProfileOf(uid) },
                "sep",
                ...QUICK_STATUS.map((s) => ({
                  label: STATUS_META[s].label + (s === "offline" ? " (appear offline)" : ""),
                  hint: myState === s ? "✓" : undefined,
                  icon: StatusIcon[s],
                  onSelect: () => setStatus(s),
                })),
                { label: statusText(me) ? `“${statusText(me)}”` : "Set a status message…", icon: Smile, onSelect: () => setDlg("status") },
                "sep",
                { label: "Settings", icon: Settings, onSelect: () => setDlg("settings") },
                ...(admin ? [{ label: "Workspace admin", icon: ShieldCheck, onSelect: () => open({ kind: "admin" }) }] : []),
                { label: "My insights", icon: BarChart3, onSelect: () => open({ kind: "insights" }) },
                ...(!guest ? [{ label: "Quality & plant records", icon: Gavel, onSelect: () => open({ kind: "quality" }) }] : []),
                { label: "Decisions", icon: Workflow, onSelect: () => open({ kind: "decisions" }) },
                ...(!guest ? [{ label: "Saathi Live (meetings)", icon: Radar, onSelect: () => open({ kind: "live" }) }] : []),
                // Phones: connected apps live here (the bottom bar has five slots)
                ...(connected.includes("gmail") ? [{ label: "Gmail", icon: Mail, onSelect: () => open({ kind: "gmail" }) }] : []),
                ...(connected.includes("calendar") ? [{ label: "Calendar", icon: CalendarDays, onSelect: () => open({ kind: "calendar" }) }] : []),
                ...(connected.includes("drive") ? [{ label: "Google Drive", icon: DriveIcon as typeof Mail, onSelect: () => open({ kind: "drive" }) }] : []),
                "sep",
                {
                  label: "Sign out",
                  icon: LogOut,
                  onSelect: async () => {
                    await signOut();
                    router.replace("/");
                  },
                },
              ]}
            />
          </div>
        </header>

        <div className="flex min-h-0 flex-1">
          <AppRail unreadChats={unreadChats} unreadAlerts={unreadAlerts} openTasks={openTasks} active={active} onSelect={selectRail} admin={admin} connected={connected} emailPromises={emailPromises} openRecords={recordList.filter((r) => r.status !== "closed" && r.owner === uid).length} guest={guest} />

          {listPane && (
            <div className={clsx("w-full shrink-0 lg:block lg:w-80", mobileList ? "block" : "hidden")}>
              <ChatList chatList={chatList} onNavigate={() => setMobileList(false)} />
            </div>
          )}

          <main id="workspace-main" ref={mainRef} tabIndex={-1} className={clsx("min-w-0 flex-1 flex-col bg-surface outline-none lg:flex", listPane && mobileList ? "hidden" : "flex")}>
            {view.kind === "home" && <MyDayView tasks={tasks} notices={notices} />}
            {view.kind === "assistant" && <AssistantView tasks={tasks} prompt={view.prompt} onPromptUsed={() => setView({ kind: "assistant" })} />}
            {view.kind === "research" && <ResearchView key={view.id ?? "research"} focusId={view.id} />}
            {view.kind === "insights" && <InsightsView />}
            {view.kind === "tasks" && <TasksView tasks={tasks} />}
            {view.kind === "activity" && <ActivityView notices={notices} />}
            {view.kind === "admin" && admin && <AdminView />}
            {view.kind === "meeting" && <MeetingView id={view.id} tasks={tasks} />}
            {view.kind === "chat" && <ChatView key={view.chatId} chatId={view.chatId} focusMsg={view.focusMsg} />}
            {view.kind === "chats" && <ChatHome empty={chatList.length === 0} />}
            {view.kind === "decisions" && <DecisionsView focusId={view.id} />}
            {view.kind === "live" && !guest && <LiveView key={view.eventId ?? view.sessionId ?? "home"} sessionId={view.sessionId} eventId={view.eventId} />}
            {view.kind === "handover" && <HandoverView key={view.chatId} chatId={view.chatId} focusId={view.id} />}
            {view.kind === "quality" && !guest && <QualityView key={view.tab ?? "q"} recordId={view.recordId} records={recordList} register={register} initialTab={view.tab} />}
            {view.kind === "gmail" && connected.includes("gmail") && <GmailView />}
            {view.kind === "calendar" && connected.includes("calendar") && <CalendarView />}
            {view.kind === "drive" && connected.includes("drive") && <DriveView />}
          </main>
        </div>

        {!guest && view.kind !== "chat" && (
          <button
            onClick={() => setDlg("report")}
            className="fixed bottom-20 right-4 z-30 flex h-12 items-center gap-2 rounded-full bg-ink px-4 text-sm font-semibold text-white shadow-xl lg:hidden"
            aria-label="Report an issue"
          >
            <Plus size={18} /> Report
          </button>
        )}
        <AppRail mobile unreadChats={unreadChats} unreadAlerts={unreadAlerts} openTasks={openTasks} active={active} onSelect={selectRail} admin={admin} connected={connected} />

        <div className="pointer-events-none fixed bottom-20 right-4 z-[70] flex w-80 max-w-[calc(100vw-2rem)] flex-col gap-2 lg:bottom-5" role="status" aria-live="polite">
          {toasts.map((t) => (
            <div key={t.id} className="ws-pop pointer-events-auto flex items-start gap-2.5 rounded-xl bg-ink px-4 py-3 text-sm text-white shadow-xl">
              <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-saffron" aria-hidden />
              {t.text}
            </div>
          ))}
        </div>
      </div>
      {dlg === "palette" && <CommandPalette chatList={chatList} onClose={() => setDlg(null)} />}
      {dlg === "new-chat" && <NewChatDialog onClose={() => setDlg(null)} />}
      {dlg === "new-channel" && <CreateChannelDialog onClose={() => setDlg(null)} />}
      {dlg === "browse-channels" && <BrowseChannelsDialog onClose={() => setDlg(null)} />}
      {dlg === "profile" && <ProfileDialog onClose={() => setDlg(null)} />}
      {dlg === "settings" && (
        <SettingsDialog
          initialTab={settingsTab}
          onClose={() => {
            setDlg(null);
            setSettingsTab(undefined);
          }}
        />
      )}
      {dlg === "status" && <StatusDialog onClose={() => setDlg(null)} />}
      {dlg === "report" && <ReportDialog onClose={() => setDlg(null)} />}
      {dlg === "voice" && <VoiceSheet onClose={() => setDlg(null)} />}
      {(dlg === "meeting-new" || meetingPrefill) && (
        <NewMeetingDialog
          prefill={meetingPrefill ?? {}}
          onClose={() => {
            setDlg(null);
            setMeetingPrefill(null);
          }}
        />
      )}
      {taskPrefill && <TaskDialog prefill={taskPrefill} onClose={() => setTaskPrefill(null)} />}
      {profileOf && <ProfileCard uid={profileOf} onClose={() => setProfileOf(null)} />}
      {welcome && !dlg && <ProfileDialog welcome onClose={() => setWelcomeDone(true)} />}
    </Ctx.Provider>
  );
}
