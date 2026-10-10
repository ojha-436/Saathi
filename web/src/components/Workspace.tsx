"use client";

import clsx from "clsx";
import { Bell, ListTodo, Menu, Search, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useChats, useFiles, useNotices, useTasks, useUsers } from "@/lib/hooks";
import { AssistantView } from "./AssistantView";
import { ChatView } from "./ChatView";
import { Ctx, type View } from "./ctx";
import { CommandPalette, NewChatDialog } from "./Dialogs";
import { InsightsView } from "./InsightsView";
import { LogoMark } from "./Logo";
import { Sidebar } from "./Sidebar";
import { RightPanel } from "./Tasks";

export function Workspace({ uid }: { uid: string }) {
  const userList = useUsers(uid);
  const chatList = useChats(uid);
  const fileList = useFiles(uid);
  const tasks = useTasks(uid);
  const notices = useNotices(uid);
  const [view, setView] = useState<View>({ kind: "assistant" });
  const [navOpen, setNavOpen] = useState(false);
  const [panelOpen, setPanelOpen] = useState(false);
  const [palette, setPalette] = useState(false);
  const [newChat, setNewChat] = useState(false);
  const [toasts, setToasts] = useState<{ id: number; text: string }[]>([]);
  const mainRef = useRef<HTMLElement>(null);

  const users = useMemo(() => Object.fromEntries(userList.map((u) => [u.id, u])), [userList]);
  const chats = useMemo(() => Object.fromEntries(chatList.map((c) => [c.id, c])), [chatList]);
  const files = useMemo(() => Object.fromEntries(fileList.map((f) => [f.id, f])), [fileList]);

  const toast = useCallback((text: string) => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t.slice(-2), { id, text }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4500);
  }, []);

  const open = useCallback((v: View) => {
    setView(v);
    setPanelOpen(false);
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

  // ⌘K / Ctrl+K opens the command palette
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPalette((p) => !p);
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

  const unread = notices.filter((n) => !n.read).length;
  const openTasks = tasks.filter((t) => t.status === "open").length;
  const sidebar = (onNavigate?: () => void) => (
    <Sidebar chatList={chatList} onNavigate={onNavigate} onNewChat={() => setNewChat(true)} onPalette={() => setPalette(true)} />
  );

  return (
    <Ctx.Provider value={{ uid, me: users[uid], users, chats, files, view, open, openRef, toast }}>
      <a href="#workspace-main" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100] focus:rounded-md focus:bg-ink focus:px-4 focus:py-2 focus:text-paper">
        Skip to content
      </a>
      <div className="flex h-dvh overflow-hidden">
        <div className="hidden w-72 shrink-0 lg:block">{sidebar()}</div>
        {navOpen && (
          <div className="fixed inset-0 z-40 flex lg:hidden">
            <div className="rise w-72 max-w-[85%]" style={{ animationDuration: "200ms" }}>
              {sidebar(() => setNavOpen(false))}
            </div>
            <button className="flex-1 bg-ink/50" onClick={() => setNavOpen(false)} aria-label="Close menu" />
          </div>
        )}

        <main id="workspace-main" ref={mainRef} tabIndex={-1} className="flex min-w-0 flex-1 flex-col outline-none">
          <div className="flex items-center gap-1 border-b border-line bg-paper px-2 py-1.5 lg:hidden">
            <button onClick={() => setNavOpen(true)} className="flex h-11 w-11 items-center justify-center rounded-lg text-ink hover:bg-paper-2" aria-label="Open menu">
              <Menu size={20} />
            </button>
            <span className="flex flex-1 items-center gap-2">
              <LogoMark size={24} /> <span className="font-display text-xl">Saathi</span>
            </span>
            <button onClick={() => setPalette(true)} className="flex h-11 w-11 items-center justify-center rounded-lg text-ink hover:bg-paper-2" aria-label="Search or ask">
              <Search size={19} />
            </button>
            <button onClick={() => setPanelOpen(true)} className="relative flex h-11 w-11 items-center justify-center rounded-lg text-ink hover:bg-paper-2" aria-label={`Tasks and alerts${unread ? `, ${unread} unread` : ""}`}>
              {unread ? <Bell size={19} /> : <ListTodo size={19} />}
              {(unread || openTasks) > 0 && (
                <span className={clsx("absolute right-1.5 top-1.5 min-w-4 rounded-full px-1 text-center font-mono text-[9px] font-bold text-white", unread ? "bg-rust" : "bg-ink")}>{unread || openTasks}</span>
              )}
            </button>
          </div>
          {view.kind === "assistant" && <AssistantView tasks={tasks} prompt={view.prompt} onPromptUsed={() => setView({ kind: "assistant" })} />}
          {view.kind === "insights" && <InsightsView />}
          {view.kind === "chat" && <ChatView key={view.chatId} chatId={view.chatId} focusMsg={view.focusMsg} />}
        </main>

        <div className="hidden w-[22rem] shrink-0 xl:block">
          <RightPanel tasks={tasks} notices={notices} />
        </div>
        {panelOpen && (
          <div className="fixed inset-0 z-40 flex xl:hidden">
            <button className="flex-1 bg-ink/50" onClick={() => setPanelOpen(false)} aria-label="Close tasks" />
            <div className="relative w-[22rem] max-w-[90%]">
              <button onClick={() => setPanelOpen(false)} className="absolute right-2 top-2 z-10 flex h-9 w-9 items-center justify-center rounded-lg bg-paper text-muted" aria-label="Close">
                <X size={16} />
              </button>
              <RightPanel tasks={tasks} notices={notices} />
            </div>
          </div>
        )}
        <button
          onClick={() => setPanelOpen(true)}
          className="fixed bottom-24 right-4 z-30 hidden h-11 items-center gap-1.5 rounded-full bg-ink px-4 text-xs font-semibold text-paper shadow-lg lg:flex xl:hidden"
        >
          <ListTodo size={14} /> Tasks {openTasks > 0 && `(${openTasks})`} {unread > 0 && <span className="rounded-full bg-rust px-1.5">{unread}</span>}
        </button>

        <div className="pointer-events-none fixed right-4 top-4 z-[70] flex w-80 max-w-[calc(100vw-2rem)] flex-col gap-2" role="status" aria-live="polite">
          {toasts.map((t) => (
            <div key={t.id} className="rise pointer-events-auto flex items-start gap-2 rounded-xl border border-ink-3 bg-ink px-4 py-3 text-sm text-paper shadow-xl" style={{ animationDuration: "220ms" }}>
              <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-saffron" aria-hidden />
              {t.text}
            </div>
          ))}
        </div>
      </div>
      {palette && <CommandPalette chatList={chatList} onClose={() => setPalette(false)} />}
      {newChat && <NewChatDialog onClose={() => setNewChat(false)} />}
    </Ctx.Provider>
  );
}
