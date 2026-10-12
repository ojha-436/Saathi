import clsx from "clsx";

/** Saathi mark: the AI mascot on a lime tile. */
export function LogoMark({ size = 32, className }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" className={className} aria-hidden>
      <rect width="32" height="32" rx="10" fill="#68e246" />
      <g transform="translate(4 3.5) scale(0.08)">
        <circle cx="48" cy="115" r="16" />
        <circle cx="252" cy="115" r="16" />
        <path d="M150 32C220 32 256 68 256 115C256 162 216 204 150 204L130 204L130 252C114 220 86 182 66 162C44 140 44 130 44 115C44 68 80 32 150 32Z" />
        <rect x="65" y="66" width="160" height="100" rx="50" fill="#fff" />
        <circle cx="107" cy="116" r="15" />
        <circle cx="183" cy="116" r="15" />
      </g>
    </svg>
  );
}

export function Logo({ dark = false, className }: { dark?: boolean; className?: string }) {
  return (
    <span className={clsx("inline-flex items-center gap-2.5", className)}>
      <LogoMark />
      <span className={clsx("font-display text-[24px] font-semibold leading-none tracking-tight", dark ? "text-paper" : "text-ink")}>Saathi</span>
    </span>
  );
}
