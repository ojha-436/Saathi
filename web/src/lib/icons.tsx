import clsx from "clsx";
import { STREAMLINE } from "./streamline-icons";

// Streamline "Freehand Line - Free" icons (https://www.streamlinehq.com/icons/freehand-free, CC BY 4.0).
// Names match the lucide-react icons Saathi used before, so call sites only changed their import path.
export type IconProps = { size?: number; strokeWidth?: number; fill?: string; className?: string; "aria-hidden"?: boolean | "true" | "false" };

function make(name: keyof typeof STREAMLINE, opts: { flip?: boolean; extra?: string } = {}) {
  return function Icon({ size = 24, className, ...rest }: IconProps) {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        data-icon={name}
        className={clsx("shrink-0", className)}
        style={opts.flip ? { transform: "scaleX(-1)" } : undefined}
        aria-hidden={rest["aria-hidden"] ?? true}
        dangerouslySetInnerHTML={{ __html: STREAMLINE[name] + (opts.extra ?? "") }}
      />
    );
  };
}

/** Saathi AI mascot: body follows currentColor, visor is white, eyes are black. */
export function AiIcon({ size = 24, className, ...rest }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="20 20 250 250" className={clsx("shrink-0", className)} aria-hidden={rest["aria-hidden"] ?? true}>
      <g fill="currentColor">
        <circle cx="48" cy="115" r="16" />
        <circle cx="252" cy="115" r="16" />
        <path d="M150 32C220 32 256 68 256 115C256 162 216 204 150 204L130 204L130 252C114 220 86 182 66 162C44 140 44 130 44 115C44 68 80 32 150 32Z" />
      </g>
      <rect x="65" y="66" width="160" height="100" rx="50" fill="#fff" />
      <circle cx="107" cy="116" r="15" fill="#000" />
      <circle cx="183" cy="116" r="15" fill="#000" />
    </svg>
  );
}
export const Sparkles = AiIcon;
export const Wand2 = AiIcon;

export const AlertTriangle = make("AlertTriangle");
export const ArrowRight = make("ArrowRight");
export const ArrowUp = make("ArrowUp");
export const AtSign = make("AtSign");
export const BarChart3 = make("BarChart3");
export const Bell = make("Bell");
export const Building2 = make("Building2");
export const CalendarClock = make("CalendarClock");
export const CalendarDays = make("CalendarDays");
export const Check = make("Check");
export const CheckCircle2 = make("CheckCircle2");
export const Clock = make("Clock");
export const Compass = make("Compass");
export const Copy = make("Copy");
export const CornerDownLeft = make("CornerDownLeft");
export const Eye = make("Eye");
export const EyeOff = make("EyeOff");
export const FileSearch = make("FileSearch");
export const FileText = make("FileText");
export const FileUp = make("FileUp");
export const Gavel = make("Gavel");
export const Globe = make("Globe");
export const Hand = make("Hand");
export const Handshake = make("Handshake");
export const Hash = make("Hash");
export const History = make("History");
export const ListTodo = make("ListTodo");
export const Loader2 = make("Loader2");
export const Lock = make("Lock");
export const LockKeyhole = make("LockKeyhole");
export const LogOut = make("LogOut");
export const Mail = make("Mail");
export const MailCheck = make("MailCheck");
export const MailPlus = make("MailPlus");
export const MapPin = make("MapPin");
export const MessageSquare = make("MessageSquare");
export const MessageSquarePlus = make("MessageSquarePlus");
export const Octagon = make("Octagon");
export const Phone = make("Phone");
export const Plus = make("Plus");
export const Radar = make("Radar");
export const RefreshCw = make("RefreshCw");
export const RotateCcw = make("RotateCcw");
export const Search = make("Search");
export const Send = make("Send");
export const Settings = make("Settings");
export const Settings2 = make("Settings2");
export const ShieldCheck = make("ShieldCheck");
export const Smile = make("Smile");
export const Star = make("Star");
export const Sun = make("Sun");
export const Timer = make("Timer");
export const Trash2 = make("Trash2");
export const UserCheck = make("UserCheck");
export const UserPlus = make("UserPlus");
export const UserRound = make("UserRound");
export const UserX = make("UserX");
export const Users = make("Users");
export const Workflow = make("Workflow");
export const X = make("X");
export const ScanText = make("ScanText");
export const ScrollText = make("ScrollText");
export const Menu = make("Menu");
export const Paperclip = make("Paperclip");
export const Languages = make("Languages");
export const MessageSquareQuote = make("MessageSquareQuote");
export const BellRing = make("BellRing");
export const Info = make("Info");
export const ListPlus = make("ListPlus");
export const MoreHorizontal = make("MoreHorizontal");
export const SendHorizontal = make("SendHorizontal");

// Not in the free set: drawn to match (bold, round-capped).
export const ArrowLeft = make("ArrowRight", { flip: true });
export const BellOff = make("Bell", { extra: '<path d="M3 3l18 18" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" fill="none"/>' });
export function ChevronDown({ size = 24, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={clsx("shrink-0", className)} aria-hidden fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 9c3 3.2 5 5 7 6.4 2-1.4 4-3.200 7-6.400" />
    </svg>
  );
}
/** Empty ring (the free set has no plain circle). */
export function Circle({ size = 24, className }: IconProps) {
  return <span className={clsx("inline-block shrink-0 rounded-full border-2 border-current", className)} style={{ width: size * 0.8, height: size * 0.8 }} aria-hidden />;
}
export function CircleDot({ size = 24, className }: IconProps) {
  return (
    <span className={clsx("inline-flex shrink-0 items-center justify-center rounded-full border-2 border-current", className)} style={{ width: size * 0.8, height: size * 0.8 }} aria-hidden>
      <span className="h-1/3 w-1/3 rounded-full bg-current" />
    </span>
  );
}

// Added when merging with threads, push and the Google connector: closest glyphs in the free Freehand set.
export const Reply = make("CornerDownLeft");
export const MessagesSquare = make("MessageSquareQuote");
export const Plug = make("Workflow");
export const Video = make("Phone");
export const NotebookPen = make("ScrollText");
