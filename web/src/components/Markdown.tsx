"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { CiteChip } from "./bits";

const CITE = /\[((?:msg|file|meet|mail|drive|rec|dec|ho):[A-Za-z0-9_\-/]+)\]/g;

/** Renders assistant markdown; [msg:..]/[file:..] citations become clickable chips. */
export function Markdown({ text }: { text: string }) {
  const withLinks = text.replace(CITE, (_, ref) => `[${ref}](cite:${ref})`);
  return (
    <div className="prose-saathi">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        urlTransform={(url) => url}
        components={{
          a: ({ href, children }) =>
            href?.startsWith("cite:") ? (
              <CiteChip refId={href.slice(5)} />
            ) : (
              <a href={href} target="_blank" rel="noreferrer" className="text-blueprint underline">
                {children}
              </a>
            ),
        }}
      >
        {withLinks}
      </ReactMarkdown>
    </div>
  );
}
