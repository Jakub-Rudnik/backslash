import { useEffect, useRef } from "react";
import {
  autocompletion,
  closeBrackets,
  closeBracketsKeymap,
  completionKeymap,
} from "@codemirror/autocomplete";
import { defaultKeymap } from "@codemirror/commands";
import {
  bracketMatching,
  defaultHighlightStyle,
  foldGutter,
  foldKeymap,
  indentOnInput,
  syntaxHighlighting,
} from "@codemirror/language";
import { lintKeymap } from "@codemirror/lint";
import { highlightSelectionMatches, searchKeymap } from "@codemirror/search";
import { Compartment, EditorState } from "@codemirror/state";
import { oneDarkHighlightStyle } from "@codemirror/theme-one-dark";
import {
  crosshairCursor,
  drawSelection,
  dropCursor,
  EditorView,
  highlightActiveLine,
  highlightActiveLineGutter,
  highlightSpecialChars,
  keymap,
  lineNumbers,
  rectangularSelection,
} from "@codemirror/view";
import { latex } from "codemirror-lang-latex";
import { yCollab, yUndoManagerKeymap } from "y-codemirror.next";
import * as Y from "yjs";
import type { HocuspocusProvider } from "@hocuspocus/provider";

type LatexEditorProps = {
  ytext: Y.Text;
  awareness: HocuspocusProvider["awareness"];
  className?: string;
  dark?: boolean;
};

const fullHeight = EditorView.theme({
  "&": { height: "100%", width: "100%" },
  ".cm-scroller": { overflow: "auto" },
});

// colors come from the app's CSS variables, so the editor follows light/dark
const appTheme = EditorView.theme({
  "&": { backgroundColor: "var(--background)", color: "var(--foreground)" },
  ".cm-content": { caretColor: "var(--foreground)" },
  ".cm-cursor, .cm-dropCursor": { borderLeftColor: "var(--foreground)" },
  ".cm-gutters": {
    backgroundColor: "var(--background)",
    color: "var(--muted-foreground)",
    borderRight: "1px solid var(--border)",
  },
  ".cm-activeLine, .cm-activeLineGutter": {
    backgroundColor: "color-mix(in oklch, var(--muted) 60%, transparent)",
  },
  "&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection":
    { backgroundColor: "color-mix(in oklch, var(--ring) 35%, transparent)" },
  ".cm-panels": { backgroundColor: "var(--muted)", color: "var(--foreground)" },
  ".cm-tooltip": {
    backgroundColor: "var(--popover)",
    color: "var(--popover-foreground)",
    border: "1px solid var(--border)",
  },
});

function themeExtensions(dark: boolean) {
  return dark
    ? [EditorView.theme({}, { dark: true }), syntaxHighlighting(oneDarkHighlightStyle)]
    : [];
}

// codemirror's basicSetup minus history(): undo/redo is handled by Y.UndoManager
// (only undoes your own changes, not collaborators')
const setup = [
  lineNumbers(),
  highlightActiveLineGutter(),
  highlightSpecialChars(),
  foldGutter(),
  drawSelection(),
  dropCursor(),
  EditorState.allowMultipleSelections.of(true),
  indentOnInput(),
  syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
  bracketMatching(),
  closeBrackets(),
  autocompletion(),
  rectangularSelection(),
  crosshairCursor(),
  highlightActiveLine(),
  highlightSelectionMatches(),
  keymap.of([
    ...yUndoManagerKeymap,
    ...closeBracketsKeymap,
    ...defaultKeymap,
    ...searchKeymap,
    ...foldKeymap,
    ...completionKeymap,
    ...lintKeymap,
  ]),
];

export function LatexEditor({ ytext, awareness, className, dark = false }: LatexEditorProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const themeCompartment = useRef(new Compartment());
  const darkRef = useRef(dark);

  useEffect(() => {
    const undoManager = new Y.UndoManager(ytext);
    const view = new EditorView({
      parent: containerRef.current!,
      state: EditorState.create({
        doc: ytext.toJSON(),
        extensions: [
          setup,
          latex(),
          fullHeight,
          appTheme,
          themeCompartment.current.of(themeExtensions(darkRef.current)),
          yCollab(ytext, awareness, { undoManager }),
        ],
      }),
    });
    viewRef.current = view;
    return () => {
      view.destroy();
      undoManager.destroy();
      viewRef.current = null;
    };
  }, [ytext, awareness]);

  useEffect(() => {
    darkRef.current = dark;
    viewRef.current?.dispatch({
      effects: themeCompartment.current.reconfigure(themeExtensions(dark)),
    });
  }, [dark]);

  return <div ref={containerRef} className={className} />;
}
