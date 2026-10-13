import { Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import { checkGrammar } from "opengrammer";

/**
 * Rule-based grammar check (OpenGrammer's `checkGrammar`, English only, runs in the browser: no AI, no network).
 * We drive it ourselves instead of using the library's Tiptap helper because that helper stops for good after one
 * exception, and the library throws while a sentence ends in "a"/"an" (which happens on the way to typing "a apple").
 * Each paragraph is checked on its own, so character offsets map 1:1 to editor positions.
 */
const key = new PluginKey<DecorationSet>("grammar");
const DELAY = 700;

/** Part and revision codes ("Rev A", "SRC-AB-1107") are not mistakes. */
const ignore = (word: string) => /^[A-Z]$/.test(word.trim()) || /\d/.test(word);

export const Grammar = Extension.create({
  name: "grammar",
  addProseMirrorPlugins() {
    return [
      new Plugin<DecorationSet>({
        key,
        state: {
          init: () => DecorationSet.empty,
          apply(tr, set) {
            const fresh = tr.getMeta(key) as DecorationSet | undefined;
            return fresh ?? set.map(tr.mapping, tr.doc);
          },
        },
        props: {
          decorations: (state) => key.getState(state),
        },
        view(view) {
          let timer: ReturnType<typeof setTimeout> | undefined;
          const run = () => {
            const marks: Decoration[] = [];
            view.state.doc.descendants((node, pos) => {
              if (!node.isTextblock || node.type.name === "codeBlock") return;
              const text = node.textBetween(0, node.content.size, undefined, "\n");
              if (!text.trim()) return;
              let errors: ReturnType<typeof checkGrammar> = [];
              try {
                errors = checkGrammar(text);
              } catch {
                // The a/an rule throws when "a" or "A" is the last word. Drop trailing words until it stops throwing
                // (those words are the unfinished or code-like part anyway) and check what is left.
                let t = text;
                for (let i = 0; i < 3 && t; i++) {
                  t = t.replace(/\s*\S+$/, "");
                  try {
                    errors = checkGrammar(t);
                    break;
                  } catch {
                    errors = [];
                  }
                }
              }
              for (const e of errors) {
                if (ignore(e.text)) continue;
                const from = pos + 1 + e.startIndex;
                const to = pos + 1 + e.endIndex;
                if (to <= from || to > pos + 1 + node.content.size) continue;
                marks.push(
                  Decoration.inline(from, to, {
                    class: "grammar-error",
                    "data-suggestions": JSON.stringify(e.suggestions ?? []),
                    "data-message": e.message,
                    title: "Click to see a suggestion",
                  }),
                );
              }
            });
            view.dispatch(view.state.tr.setMeta(key, DecorationSet.create(view.state.doc, marks)));
          };
          return {
            update(v, prev) {
              if (v.state.doc.eq(prev.doc)) return;
              clearTimeout(timer);
              timer = setTimeout(run, DELAY);
            },
            destroy() {
              clearTimeout(timer);
            },
          };
        },
      }),
    ];
  },
});
