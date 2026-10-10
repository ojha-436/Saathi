"use client";

import clsx from "clsx";
import { signOut } from "firebase/auth";
import { LogOut, Search, UserRound } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getFbAuth } from "@/lib/firebase";
import { isUnread } from "@/lib/format";
import { useChats, useFiles, useNotices, useTasks, useUsers } from "@/lib/hooks";
import { AssistantView } from "./AssistantView";
import { Avatar, Menu } from "./bits";
import { ChatView } from "./ChatView";
import { Ctx, type DialogKind, type View } from "./ctx";
import { BrowseChannelsDialog, CommandPalette, CreateChannelDialog, NewChatDialog, ProfileDialog } from "./Dialogs";
import { InsightsView } from "./InsightsView";
import { LogoMark } from "./Logo";
import { AppRail, ChatList, railKey } from "./Sidebar";
import { ActivityView, TasksView } from "./Tasks";

export function Workspace({ uid }: { uid: string }) {
  const router = useRouter();
  const userList = useUsers(uid);
  const chatList = useChats(uid);
  const fileList = useFiles(uid);
  const tasks = useTasks(uid);
  const notices = useNotices(uid);
  const [view, setView] = useState<View>({ kind: "assistant" });
  // Phones show one pane at a time: the chat list, or the open conversation.
  const [mobileList, setMobileList] = useState(false);
  const [dlg, setDlg] = useState<DialogKind | null>(null);
  const [toasts, setToasts] = useState<{ id: number; text: string }[]>([]);
  const mainRef = useRef<HTMLElement>(null);

  const users = useMemo(() => Object.fromEntries(userList.map((u) => [u.id, u])), [userList]);
  const chats = useMemo(() => Object.fromEntries(chatList.map((c) => [c.id, c])), [chatList]);
  const files = useMemo(() => Object.fromEntries(fileList.map((f) => [f.id, f])), [fileList]);
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
      }
    },
    [open],
  );

  // If the open chat disappears (left, removed, deleted), fall back to the assistant.
  useEffect(() => {
    if (view.kind === "chat" && chatList.length && !chats[view.chatId]) {
      const t = setTimeout(() => setView({ kind: "assistant" }), 1500);
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

  // Pop a toast when a new reminder/follow-up notification arrives
  const seen = useRef<Set<string> | null>(null);
  useEffect(() => {
    if (seen.current === null) {
      seen.current = new Set(notices.map((n) => n.id));
      return;
    }
    for (const n of notices) {
      if (!seen.current.has(n.id)) {
        seen.current.add(n.id);
        if (!n.read) toast(`${n.title}: ${n.body}`);
      }
    }
  }, [notices, toast]);

  const unreadAlerts = notices.filter((n) => !n.read).length;
  const openTasks = tasks.filter((t) => t.status === "open").length;
  const unreadChats = chatList.filter((c) => !(view.kind === "chat" && view.chatId === c.id) && isUnread(c, uid)).length;
  const active = railKey(view);
  const listPane = view.kind === "chat" || view.kind === "assistant";

  function selectRail(k: ReturnType<typeof railKey>) {
    if (k === "chat") {
      // Desktop: reopen the most recent conversation. Phones: show the list.
      setMobileList(true);
      if (view.kind !== "chat" && chatList[0]) setView({ kind: "chat", chatId: chatList[0].id });
      return;
    }
    open({ kind: k } as View);
  }

  return (
    <Ctx.Provider value={{ uid, me, users, chats, files, view, open, openRef, toast, dialog: setDlg, showList: () => setMobileList(true) }}>
      <a href="#workspace-main" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100] focus:rounded-md focus:bg-ink focus:px-4 focus:py-2 focus:text-paper">
        Skip to content
      </a>
      <div className="flex h-dvh flex-col overflow-hidden bg-canvas text-ink">
        {/* Title bar: brand, global search, profile */}
        <header className="flex h-12 shrink-0 items-center gap-3 bg-rail px-3 text-white lg:pl-[18px]">
          <span className="flex min-w-0 items-center gap-2.5 lg:w-[calc(68px+20rem-18px)]">
            <LogoMark size={28} />
            <span className="text-[15px] font-semibold tracking-tight">Saathi</span>
            <span className="hidden truncate text-xs text-white/50 sm:inline">Shakti Rail Components</span>
          </span>
          <button
            onClick={() => setDlg("palette")}
            className="ml-auto flex h-8 min-w-0 items-center gap-2 rounded-lg border border-white/10 bg-white/8 px-3 text-left text-[13px] text-white/60 transition hover:border-white/25 hover:bg-white/12 hover:text-white sm:ml-0 sm:w-full sm:max-w-xl"
            aria-label="Search or ask Saathi"
          >
            <Search size={15} aria-hidden /> <span className="hidden flex-1 truncate sm:inline">Search chats, channels and files, or ask Saathi</span>
            <kbd className="hidden rounded border border-white/15 px-1.5 font-mono text-[10px] sm:inline">⌘K</kbd>
          </button>
          <div className="sm:ml-auto">
            <Menu
              label="Your profile"
              className="flex items-center gap-2 rounded-full p-0.5 transition hover:bg-white/10"
              trigger={<Avatar name={me?.name ?? "?"} size={30} />}
              items={[
                { label: me ? [me.name, me.role].filter(Boolean).join(" · ") : "Signed in", onSelect: () => {} },
                "sep",
                { label: "Edit profile", icon: UserRound, onSelect: () => setDlg("profile") },
                {
                  label: "Sign out",
                  icon: LogOut,
                  onSelect: async () => {
                    await signOut(getFbAuth());
                    router.replace("/");
                  },
                },
              ]}
            />
          </div>
        </header>

        <div className="flex min-h-0 flex-1">
          <AppRail unreadChats={unreadChats} unreadAlerts={unreadAlerts} openTasks={openTasks} active={active} onSelect={selectRail} />

          {listPane && (
            <div className={clsx("w-full shrink-0 lg:block lg:w-80", mobileList ? "block" : "hidden")}>
              <ChatList chatList={chatList} onNavigate={() => setMobileList(false)} />
            </div>
          )}

          <main id="workspace-main" ref={mainRef} tabIndex={-1} className={clsx("min-w-0 flex-1 flex-col bg-surface outline-none lg:flex", listPane && mobileList ? "hidden" : "flex")}>
            {view.kind === "assistant" && <AssistantView tasks={tasks} prompt={view.prompt} onPromptUsed={() => setView({ kind: "assistant" })} />}
            {view.kind === "insights" && <InsightsView />}
            {view.kind === "tasks" && <TasksView tasks={tasks} />}
            {view.kind === "activity" && <ActivityView notices={notices} />}
            {view.kind === "chat" && <ChatView key={view.chatId} chatId={view.chatId} focusMsg={view.focusMsg} />}
          </main>
        </div>

        <AppRail mobile unreadChats={unreadChats} unreadAlerts={unreadAlerts} openTasks={openTasks} active={active} onSelect={selectRail} />

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
      {welcome && !dlg && <ProfileDialog welcome onClose={() => setWelcomeDone(true)} />}
    </Ctx.Provider>
  );
}
