/** Formatted messages are stored as a Tiptap/ProseMirror JSON document (`doc`) next to a plain-text copy (`text`). */

export type DocMark = { type: string; attrs?: Record<string, unknown> };
export type DocNode = { type: string; text?: string; attrs?: Record<string, unknown>; marks?: DocMark[]; content?: DocNode[] };

/** Plain-text copy of a document: what search, the AI, notifications and the chat list use. */
export function docToText(node: DocNode): string {
  const kids = node.content ?? [];
  switch (node.type) {
    case "text":
      return node.text ?? "";
    case "hardBreak":
      return "\n";
    case "doc":
      return kids.map(docToText).join("\n").replace(/\n{3,}/g, "\n\n");
    case "bulletList":
      return kids.map((li) => "- " + docToText(li).replace(/\n/g, "\n  ")).join("\n");
    case "orderedList": {
      const start = typeof node.attrs?.start === "number" ? (node.attrs.start as number) : 1;
      return kids.map((li, i) => `${start + i}. ` + docToText(li).replace(/\n/g, "\n   ")).join("\n");
    }
    case "blockquote":
      return kids.map((k) => docToText(k).replace(/^/gm, "> ")).join("\n");
    case "codeBlock":
      return "```\n" + kids.map(docToText).join("") + "\n```";
    default:
      return kids.map(docToText).join(node.type === "listItem" ? "\n" : "");
  }
}

/** True when the document has no visible content (only empty paragraphs). */
export function isEmptyDoc(doc: DocNode): boolean {
  return docToText(doc).trim() === "";
}

/** Only send/store the document when it carries formatting; a plain one-paragraph message stays just text. */
export function needsDoc(doc: DocNode): boolean {
  const walk = (n: DocNode): boolean =>
    (n.marks?.length ?? 0) > 0 || !["doc", "paragraph", "text", "hardBreak"].includes(n.type) || (n.content ?? []).some(walk);
  return walk(doc);
}
