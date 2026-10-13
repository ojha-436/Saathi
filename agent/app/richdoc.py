"""Validation for formatted chat messages (a Tiptap/ProseMirror JSON document).

The browser sends the formatted document next to the plain `text`. Nothing is ever rendered as HTML: the web app
draws the JSON itself, and this module rebuilds the document from an allow-list, so unknown node or mark types,
odd attributes, script-like links and oversized or deeply nested documents are dropped before anything is stored.
"""

import re

MAX_DEPTH = 8
MAX_NODES = 600
MAX_TEXT = 4000

BLOCKS = {"paragraph", "heading", "bulletList", "orderedList", "listItem", "blockquote", "codeBlock"}
INLINE = {"text", "hardBreak"}
MARKS = {"bold", "italic", "underline", "strike", "code", "link", "highlight", "textStyle"}

COLOR = re.compile(r"^#[0-9a-fA-F]{3,8}$")
FONT_SIZE = re.compile(r"^(\d{1,2})px$")
LINK = re.compile(r"^(https?://|mailto:)[^\s<>\"']+$", re.I)


class DocError(ValueError):
    pass


def _mark(m: object) -> dict | None:
    if not isinstance(m, dict) or m.get("type") not in MARKS:
        return None
    t = m["type"]
    attrs = m.get("attrs") if isinstance(m.get("attrs"), dict) else {}
    if t == "link":
        href = str(attrs.get("href") or "").strip()
        return {"type": "link", "attrs": {"href": href}} if LINK.match(href) and len(href) <= 2000 else None
    if t == "highlight":
        c = attrs.get("color")
        return {"type": "highlight", "attrs": {"color": c}} if isinstance(c, str) and COLOR.match(c) else {"type": "highlight"}
    if t == "textStyle":
        out: dict = {}
        c = attrs.get("color")
        if isinstance(c, str) and COLOR.match(c):
            out["color"] = c
        fs = attrs.get("fontSize")
        if isinstance(fs, str) and (mm := FONT_SIZE.match(fs)) and 10 <= int(mm.group(1)) <= 36:
            out["fontSize"] = fs
        return {"type": "textStyle", "attrs": out} if out else None
    return {"type": t}


def _node(n: object, depth: int, budget: list[int]) -> dict | None:
    if not isinstance(n, dict) or depth > MAX_DEPTH:
        return None
    t = n.get("type")
    if t not in BLOCKS and t not in INLINE:
        return None
    budget[0] -= 1
    if budget[0] < 0:
        raise DocError("Message is too complex")
    if t == "text":
        text = n.get("text")
        if not isinstance(text, str) or not text:
            return None
        budget[1] -= len(text)
        if budget[1] < 0:
            raise DocError("Message is too long")
        marks = [m for m in (_mark(x) for x in (n.get("marks") or [])) if m]
        return {"type": "text", "text": text, **({"marks": marks} if marks else {})}
    if t == "hardBreak":
        return {"type": "hardBreak"}
    out: dict = {"type": t}
    if t == "heading":
        lvl = (n.get("attrs") or {}).get("level")
        out["attrs"] = {"level": lvl if lvl in (1, 2, 3) else 2}
    if t == "orderedList":
        start = (n.get("attrs") or {}).get("start")
        out["attrs"] = {"start": start if isinstance(start, int) and 1 <= start <= 9999 else 1}
    kids = [k for k in (_node(c, depth + 1, budget) for c in (n.get("content") or [])) if k]
    if kids:
        out["content"] = kids
    return out


def clean_doc(doc: object) -> dict | None:
    """Return a safe copy of the document, or None if it is empty or not a document."""
    if not isinstance(doc, dict) or doc.get("type") != "doc":
        return None
    budget = [MAX_NODES, MAX_TEXT * 2]
    kids = [k for k in (_node(c, 1, budget) for c in (doc.get("content") or [])) if k]
    return {"type": "doc", "content": kids} if kids else None
