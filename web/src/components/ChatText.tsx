import type { ReactNode } from "react";

/**
 * Renders a chat message with light formatting. Messages stay plain text (so search, the AI and notifications
 * keep working); the composer toolbar only inserts these markers:
 *   **bold**  *italic*  __underline__  ~~strike~~  `code`  [text](https://link)
 *   "- " bullets, "1. " numbers, "> " quotes, ``` code blocks
 * Nothing is rendered as HTML, so a message can't inject markup.
 */

type Plain = (s: string) => ReactNode;

const INLINE: { re: RegExp; wrap: (inner: ReactNode, m: RegExpExecArray, key: string) => ReactNode; raw?: boolean }[] = [
  { re: /`([^`\n]+)`/, raw: true, wrap: (c, _m, k) => <code key={k} className="rounded bg-paper-2 px-1 py-px font-mono text-[0.9em]">{c}</code> },
  {
    re: /\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)/,
    wrap: (c, m, k) => (
      <a key={k} href={m[2]} target="_blank" rel="noreferrer noopener" className="text-brand underline underline-offset-2">
        {c}
      </a>
    ),
  },
  { re: /\*\*(?=\S)([^\n]+?)(?<=\S)\*\*/, wrap: (c, _m, k) => <strong key={k} className="font-semibold">{c}</strong> },
  { re: /__(?=\S)([^\n]+?)(?<=\S)__/, wrap: (c, _m, k) => <u key={k}>{c}</u> },
  { re: /~~(?=\S)([^\n]+?)(?<=\S)~~/, wrap: (c, _m, k) => <s key={k}>{c}</s> },
  { re: /(?<![*\w])\*(?=\S)([^*\n]+?)(?<=\S)\*(?![*\w])/, wrap: (c, _m, k) => <em key={k}>{c}</em> },
  { re: /(?<![_\w])_(?=\S)([^_\n]+?)(?<=\S)_(?![_\w])/, wrap: (c, _m, k) => <em key={k}>{c}</em> },
];

function inline(text: string, plain: Plain, key = "i"): ReactNode[] {
  let best: { idx: number; len: number; rule: (typeof INLINE)[number]; m: RegExpExecArray } | null = null;
  for (const rule of INLINE) {
    const m = rule.re.exec(text);
    if (m && (!best || m.index < best.idx)) best = { idx: m.index, len: m[0].length, rule, m };
  }
  if (!best) return [<span key={key}>{plain(text)}</span>];
  const out: ReactNode[] = [];
  if (best.idx > 0) out.push(<span key={`${key}a`}>{plain(text.slice(0, best.idx))}</span>);
  const inner = best.rule.raw ? best.m[1] : inline(best.m[1], plain, `${key}n`);
  out.push(best.rule.wrap(inner, best.m, `${key}b`));
  const rest = text.slice(best.idx + best.len);
  if (rest) out.push(...inline(rest, plain, `${key}c`));
  return out;
}

export function ChatText({ text, plain = (s) => s }: { text: string; plain?: Plain }) {
  const lines = text.split("\n");
  const blocks: ReactNode[] = [];
  let i = 0;
  let n = 0;
  const key = () => `b${n++}`;

  while (i < lines.length) {
    const line = lines[i];

    if (line.startsWith("```")) {
      const body: string[] = [];
      i++;
      while (i < lines.length && !lines[i].startsWith("```")) body.push(lines[i++]);
      i++; // closing fence (or end of text)
      blocks.push(
        <pre key={key()} className="my-1 overflow-x-auto rounded-lg bg-paper-2 px-3 py-2 font-mono text-[13px] leading-snug">
          {body.join("\n")}
        </pre>,
      );
    } else if (/^[-*•] /.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^[-*•] /.test(lines[i])) items.push(lines[i++].slice(2));
      blocks.push(
        <ul key={key()} className="my-0.5 list-disc space-y-0.5 pl-5">
          {items.map((t, j) => <li key={j}>{inline(t, plain, `u${j}`)}</li>)}
        </ul>,
      );
    } else if (/^\d+[.)] /.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\d+[.)] /.test(lines[i])) items.push(lines[i++].replace(/^\d+[.)] /, ""));
      blocks.push(
        <ol key={key()} className="my-0.5 list-decimal space-y-0.5 pl-5">
          {items.map((t, j) => <li key={j}>{inline(t, plain, `o${j}`)}</li>)}
        </ol>,
      );
    } else if (line.startsWith("> ")) {
      const q: string[] = [];
      while (i < lines.length && lines[i].startsWith("> ")) q.push(lines[i++].slice(2));
      blocks.push(
        <blockquote key={key()} className="my-1 whitespace-pre-wrap border-l-[3px] border-brand/40 pl-3 text-muted">
          {inline(q.join("\n"), plain, "q")}
        </blockquote>,
      );
    } else {
      const p: string[] = [];
      while (
        i < lines.length &&
        !lines[i].startsWith("```") &&
        !/^[-*•] /.test(lines[i]) &&
        !/^\d+[.)] /.test(lines[i]) &&
        !lines[i].startsWith("> ")
      )
        p.push(lines[i++]);
      blocks.push(
        <p key={key()} className="whitespace-pre-wrap">
          {inline(p.join("\n"), plain, "p")}
        </p>,
      );
    }
  }
  return <div className="break-words text-[14.5px] leading-relaxed text-ink">{blocks}</div>;
}
