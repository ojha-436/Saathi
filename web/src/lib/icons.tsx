import clsx from "clsx";
import { PHOSPHOR } from "./phosphor-icons";

// Phosphor Icons, "regular" weight (https://phosphoricons.com, MIT licence). Names match the icons Saathi used
// before, so call sites only change their import path. To change the weight, regenerate phosphor-icons.ts.
export type IconProps = { size?: number; strokeWidth?: number; fill?: string; className?: string; "aria-hidden"?: boolean | "true" | "false" };

function make(name: keyof typeof PHOSPHOR) {
  return function Icon({ size = 24, className, ...rest }: IconProps) {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 256 256"
        fill="currentColor"
        data-icon={name}
        className={clsx("shrink-0", className)}
        aria-hidden={rest["aria-hidden"] ?? true}
        dangerouslySetInnerHTML={{ __html: PHOSPHOR[name] }}
      />
    );
  };
}

/** Saathi AI spark: the 4-point spark from the logo plus a small companion, in currentColor. */
export function AiIcon({ size = 24, className, ...rest }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" className={clsx("shrink-0", className)} aria-hidden={rest["aria-hidden"] ?? true}>
      <path d="M10.5 2L12.8 8.2L19 10.5L12.8 12.8L10.5 19L8.2 12.8L2 10.5L8.2 8.2Z" />
      <path d="M18.5 15L19.5 17.5L22 18.5L19.5 19.5L18.5 22L17.5 19.5L15 18.5L17.5 17.5Z" />
    </svg>
  );
}
export const Sparkles = AiIcon;
export const Wand2 = AiIcon;

export const AlertTriangle = make("AlertTriangle");
export const ArrowRight = make("ArrowRight");
export const ArrowLeft = make("ArrowLeft");
export const ArrowUp = make("ArrowUp");
export const AtSign = make("AtSign");
export const BarChart3 = make("BarChart3");
export const Bell = make("Bell");
export const BellOff = make("BellOff");
export const BellRing = make("BellRing");
export const Building2 = make("Building2");
export const CalendarClock = make("CalendarClock");
export const CalendarDays = make("CalendarDays");
export const Check = make("Check");
export const CheckCircle2 = make("CheckCircle2");
export const ChevronDown = make("ChevronDown");
export const Circle = make("Circle");
export const CircleDot = make("CircleDot");
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
export const Info = make("Info");
export const Languages = make("Languages");
export const ListPlus = make("ListPlus");
export const ListTodo = make("ListTodo");
export const Loader2 = make("Loader2");
export const Lock = make("Lock");
export const LockKeyhole = make("LockKeyhole");
export const LogOut = make("LogOut");
export const Mail = make("Mail");
export const MailCheck = make("MailCheck");
export const MailPlus = make("MailPlus");
export const MapPin = make("MapPin");
export const Menu = make("Menu");
export const MessageSquare = make("MessageSquare");
export const MessageSquarePlus = make("MessageSquarePlus");
export const MessageSquareQuote = make("MessageSquareQuote");
export const MoreHorizontal = make("MoreHorizontal");
export const NotebookPen = make("NotebookPen");
export const Octagon = make("Octagon");
export const Paperclip = make("Paperclip");
export const Phone = make("Phone");
export const Plug = make("Plug");
export const Plus = make("Plus");
export const Radar = make("Radar");
export const RefreshCw = make("RefreshCw");
export const RotateCcw = make("RotateCcw");
export const ScanText = make("ScanText");
export const ScrollText = make("ScrollText");
export const Search = make("Search");
export const Send = make("Send");
export const SendHorizontal = make("SendHorizontal");
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
export const Video = make("Video");
export const Workflow = make("Workflow");
export const X = make("X");
export const TextBold = make("TextBold");
export const TextItalic = make("TextItalic");
export const TextUnderline = make("TextUnderline");
export const TextStrike = make("TextStrike");
export const ListBullets = make("ListBullets");
export const ListNumbers = make("ListNumbers");
export const LinkSimple = make("LinkSimple");
export const CodeSimple = make("CodeSimple");
export const TextAa = make("TextAa");
export const Undo = make("Undo");
export const Redo = make("Redo");
export const Indent = make("Indent");
export const Outdent = make("Outdent");
export const Highlighter = make("Highlighter");
export const FontColor = make("FontColor");
export const CodeBlock = make("CodeBlock");
export const Heading = make("Heading");
export const Reply = make("Reply");
export const MessagesSquare = make("MessagesSquare");
export const Camera = make("Camera");

/** Google Drive (line style). */
export function DriveIcon({ size = 24, className, ...rest }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinejoin="round" strokeLinecap="round" className={clsx("shrink-0", className)} aria-hidden={rest["aria-hidden"] ?? true}>
      <path d="M8.6 3.5h6.8l6.1 10.6-3.4 5.9H5.9l-3.4-5.9z" />
      <path d="M8.6 3.5l6.5 11.1M15.4 3.5L9 14.6M2.5 14.1h19" />
    </svg>
  );
}
