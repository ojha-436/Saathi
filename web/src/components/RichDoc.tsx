import type { ReactNode } from "react";
import type { DocMark, DocNode } from "@/lib/richtext";

/**
 * Draws a stored message document. It builds React elements itself (no HTML string is ever injected) and checks
 * every attribute it uses: links must be http(s)/mailto, colours must be hex, font sizes a small range.
 */

const HEX = /^#[0-9a-fA-F]{3,8}$/;
const LINK = /^(https?:\/\/|mailto:)[^\s<>"']+$/i;

type Plain = (s: string) => ReactNode;

function leaf(n: DocNode, key: string, plain: Plain): ReactNode {
  let out: ReactNode = plain(n.text ?? "");
  const style: React.CSSProperties = {};
  for (const m of n.marks ?? ([] as DocMark[])) {
    const a = m.attrs ?? {};
    switch (m.type) {
      case "bold":
        out = <strong className="font-semibold">{out}</strong>;
        break;
      case "italic":
        out = <em>{out}</em>;
        break;
      case "underline":
        out = <u>{out}</u>;
        break;
      case "strike":
        out = <s>{out}</s>;
        break;
      case "code":
        out = <code className="rounded bg-paper-2 px-1 py-px font-mono text-[0.9em]">{out}</code>;
        break;
      case "link":
        if (typeof a.href === "string" && LINK.test(a.href))
          out = (
            <a href={a.href} target="_blank" rel="noreferrer noopener" className="text-brand underline underline-offset-2">
              {out}
            </a>
          );
        break;
      case "highlight":
        out = <mark className="rounded px-0.5" style={{ backgroundColor: typeof a.color === "string" && HEX.test(a.color) ? a.color : "#fff3a3", color: "inherit" }}>{out}</mark>;
        break;
      case "textStyle":
        if (typeof a.color === "string" && HEX.test(a.color)) style.color = a.color;
        if (typeof a.fontSize === "string") {
          const px = /^(\d{1,2})px$/.exec(a.fontSize);
          if (px && +px[1] >= 10 && +px[1] <= 36) style.fontSize = a.fontSize;
        }
        break;
    }
  }
  return Object.keys(style).length ? <span key={key} style={style}>{out}</span> : <span key={key}>{out}</span>;
}

function render(nodes: DocNode[] | undefined, plain: Plain, path: string): ReactNode[] {
  return (nodes ?? []).map((n, i) => {
    const key = `${path}.${i}`;
    switch (n.type) {
      case "text":
        return leaf(n, key, plain);
      case "hardBreak":
        return <br key={key} />;
      case "paragraph":
        return (
          <p key={key} className="min-h-[1.4em] whitespace-pre-wrap">
            {render(n.content, plain, key)}
          </p>
        );
      case "heading": {
        const lvl = n.attrs?.level === 1 ? 1 : n.attrs?.level === 3 ? 3 : 2;
        const cls = lvl === 1 ? "text-xl" : lvl === 2 ? "text-lg" : "text-base";
        return (
          <p key={key} role="heading" aria-level={lvl} className={`${cls} mt-1 font-semibold leading-snug`}>
            {render(n.content, plain, key)}
          </p>
        );
      }
      case "bulletList":
        return (
          <ul key={key} className="my-0.5 list-disc space-y-0.5 pl-5">
            {render(n.content, plain, key)}
          </ul>
        );
      case "orderedList":
        return (
          <ol key={key} start={typeof n.attrs?.start === "number" ? (n.attrs.start as number) : 1} className="my-0.5 list-decimal space-y-0.5 pl-5">
            {render(n.content, plain, key)}
          </ol>
        );
      case "listItem":
        return <li key={key}>{render(n.content, plain, key)}</li>;
      case "blockquote":
        return (
          <blockquote key={key} className="my-1 border-l-[3px] border-brand/40 pl-3 text-muted">
            {render(n.content, plain, key)}
          </blockquote>
        );
      case "codeBlock":
        return (
          <pre key={key} className="my-1 overflow-x-auto rounded-lg bg-paper-2 px-3 py-2 font-mono text-[13px] leading-snug">
            {(n.content ?? []).map((c) => c.text ?? "").join("")}
          </pre>
        );
      default:
        return null;
    }
  });
}

export function RichDoc({ doc, plain = (s) => s }: { doc: DocNode; plain?: Plain }) {
  return <div className="break-words text-[14.5px] leading-relaxed text-ink">{render(doc.content, plain, "d")}</div>;
}
