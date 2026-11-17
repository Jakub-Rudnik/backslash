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

export type Reveal = {
  line: number;
  /** changes on every request, so the same line can be revealed twice */ key: number;
};

type LatexEditorProps = {
  ytext: Y.Text;
  /** used to pick the language */
  path: string;
  /** scroll to and select this line */
  reveal?: Reveal | null;
  readOnly?: boolean;
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

const LATEX_EXTENSIONS = /\.(tex|sty|cls|ltx|dtx|bbx|cbx)$/;

function languageFor(path: string) {
  return LATEX_EXTENSIONS.test(path) ? [latex()] : [];
}

export function LatexEditor({
  ytext,
  path,
  reveal,
  readOnly = false,
  awareness,
  className,
  dark = false,
}: LatexEditorProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const themeCompartment = useRef(new Compartment());
  const darkRef = useRef(dark);
  const languageCompartment = useRef(new Compartment());
  const pathRef = useRef(path);
  const readOnlyCompartment = useRef(new Compartment());
  const readOnlyRef = useRef(readOnly);

  useEffect(() => {
    const undoManager = new Y.UndoManager(ytext);
    const view = new EditorView({
      parent: containerRef.current!,
      state: EditorState.create({
        doc: ytext.toJSON(),
        extensions: [
          setup,
          languageCompartment.current.of(languageFor(pathRef.current)),
          readOnlyCompartment.current.of(EditorState.readOnly.of(readOnlyRef.current)),
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
    readOnlyRef.current = readOnly;
    viewRef.current?.dispatch({
      effects: readOnlyCompartment.current.reconfigure(EditorState.readOnly.of(readOnly)),
    });
  }, [readOnly]);

  // renames (by anyone) can change the extension without remounting
  useEffect(() => {
    pathRef.current = path;
    viewRef.current?.dispatch({
      effects: languageCompartment.current.reconfigure(languageFor(path)),
    });
  }, [path]);

  // runs after the view effect above, so a reveal for a newly opened file sees its view
  useEffect(() => {
    const view = viewRef.current;
    if (!view || !reveal) return;
    const line = view.state.doc.line(Math.min(Math.max(reveal.line, 1), view.state.doc.lines));
    view.dispatch({
      selection: { anchor: line.from, head: line.to },
      effects: EditorView.scrollIntoView(line.from, { y: "center" }),
    });
    view.focus();
  }, [reveal, ytext]);

  useEffect(() => {
    darkRef.current = dark;
    viewRef.current?.dispatch({
      effects: themeCompartment.current.reconfigure(themeExtensions(dark)),
    });
  }, [dark]);

  return <div ref={containerRef} className={className} />;
}
