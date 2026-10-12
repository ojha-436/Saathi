"use client";

import dynamic from "next/dynamic";
import type { EmojiClickData, EmojiStyle, Theme } from "emoji-picker-react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

// The picker (and its emoji data) is large, so it loads only when someone opens it.
const Picker = dynamic(() => import("emoji-picker-react"), {
  ssr: false,
  loading: () => <div className="flex h-[340px] w-[300px] items-center justify-center text-sm text-muted">Loading emoji…</div>,
});

const W = 300;
const H = 340;
const MIN_H = 220;

/**
 * Full emoji picker (emoji-picker-react: all categories, search, skin tones, recently used) in a popover.
 * Uses the device's own emoji font ("native"), so it needs no image downloads and works offline.
 * Rendered in a portal and positioned from the trigger button, so scrolling lists never clip it.
 */
export function EmojiPopover({
  anchor,
  onPick,
  onClose,
  closeOnPick = true,
}: {
  anchor: HTMLElement | null;
  onPick: (emoji: string) => void;
  onClose: () => void;
  closeOnPick?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number; h: number; w: number } | null>(null);

  useLayoutEffect(() => {
    if (!anchor) return;
    const r = anchor.getBoundingClientRect();
    const w = Math.min(W, window.innerWidth - 16);
    const below = window.innerHeight - r.bottom - 16;
    const above = r.top - 16;
    // open on the side with more room and shrink the picker to fit it
    const goBelow = below >= H || below >= above;
    const h = Math.max(MIN_H, Math.min(H, goBelow ? below : above));
    const top = goBelow ? r.bottom + 8 : Math.max(8, r.top - h - 8);
    const left = Math.min(Math.max(8, r.left), Math.max(8, window.innerWidth - w - 8));
    setPos({ top, left, h, w });
  }, [anchor]);

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (!ref.current?.contains(t) && !anchor?.contains(t)) onClose();
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    window.addEventListener("resize", onClose);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", onClose);
    };
  }, [anchor, onClose]);

  if (!pos) return null;
  return createPortal(
    <div
      ref={ref}
      role="dialog"
      aria-label="Emoji picker"
      className="ws-pop fixed z-[90] overflow-hidden rounded-2xl border border-border bg-surface shadow-2xl"
      style={{ top: pos.top, left: pos.left }}
    >
      <Picker
        onEmojiClick={(d: EmojiClickData) => {
          onPick(d.emoji);
          if (closeOnPick) onClose();
        }}
        emojiStyle={"native" as unknown as EmojiStyle}
        theme={"light" as unknown as Theme}
        width={pos.w}
        height={pos.h}
        lazyLoadEmojis
        autoFocusSearch
        previewConfig={{ showPreview: false }}
        searchPlaceholder="Search emoji"
        style={
          {
            "--epr-highlight-color": "#4285f4",
            "--epr-picker-border-radius": "16px",
            "--epr-picker-border-color": "transparent",
            "--epr-bg-color": "#ffffff",
            "--epr-hover-bg-color": "#e8f0fe",
            "--epr-focus-bg-color": "#d2e3fc",
            "--epr-search-input-bg-color": "#f1f3f4",
            "--epr-search-border-color": "#dadce0",
            "--epr-category-label-bg-color": "#ffffff",
            "--epr-text-color": "#202124",
            "--epr-emoji-size": "20px",
            "--epr-emoji-padding": "4px",
            "--epr-category-navigation-button-size": "24px",
            "--epr-search-input-height": "34px",
            "--epr-header-padding": "8px 10px",
            "--epr-category-label-height": "28px",
          } as React.CSSProperties
        }
      />
    </div>,
    document.body,
  );
}
