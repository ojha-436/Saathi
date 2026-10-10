import clsx from "clsx";

/** Saathi mark: two interlocking arcs (two companions) over a drawing-revision triangle. */
export function LogoMark({ size = 32, className }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" className={className} aria-hidden>
      <rect x="0.5" y="0.5" width="31" height="31" rx="8" fill="#0b1b2b" stroke="#2a4a6b" />
      <path d="M9 19.5a7 7 0 0 1 11.6-5.3" stroke="#e8891c" strokeWidth="2.6" fill="none" strokeLinecap="round" />
      <path d="M23 12.5a7 7 0 0 1-11.6 5.3" stroke="#f6f3ec" strokeWidth="2.6" fill="none" strokeLinecap="round" />
      <path d="M16 23.2l2.2 3.3h-4.4z" fill="#e8891c" />
    </svg>
  );
}

export function Logo({ dark = false, className }: { dark?: boolean; className?: string }) {
  return (
    <span className={clsx("inline-flex items-center gap-2.5", className)}>
      <LogoMark />
      <span className={clsx("font-display text-[26px] leading-none tracking-tight", dark ? "text-paper" : "text-ink")}>Saathi</span>
    </span>
  );
}
