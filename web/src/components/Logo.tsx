import clsx from "clsx";

/**
 * Saathi mark: a speech bubble that is also a folded engineering drawing, with the Gemini spark inside,
 * on a blueprint-navy tile. `dark` flips to a white tile for navy surfaces (e.g. the sign-in panel).
 */
export function LogoMark({ size = 32, className, dark = false }: { size?: number; className?: string; dark?: boolean }) {
  const stroke = dark ? "#174EA6" : "#FFFFFF";
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none" className={clsx("shrink-0", className)} aria-hidden>
      <rect width="64" height="64" rx="16" fill={dark ? "#FFFFFF" : "#174EA6"} />
      <path d="M38 46H25L19 52V46H15V14H37L45 22V39" stroke={stroke} strokeWidth="3.6" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M37 14V22H45" stroke={stroke} strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M29.5 20.5L32.1 27.4L39 30L32.1 32.6L29.5 39.5L26.9 32.6L20 30L26.9 27.4L29.5 20.5Z" fill="#4285F4" />
      <circle cx="45" cy="46" r="3.2" fill="#8AB4F8" />
    </svg>
  );
}

export function Logo({ dark = false, className }: { dark?: boolean; className?: string }) {
  return (
    <span className={clsx("inline-flex items-center gap-2.5", className)}>
      <LogoMark dark={dark} />
      <span className={clsx("font-display text-[24px] font-semibold leading-none tracking-tight", dark ? "text-paper" : "text-ink")}>Saathi</span>
    </span>
  );
}
