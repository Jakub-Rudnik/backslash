import { useEffect, useRef } from "react";
import { syntaxHighlighting } from "@codemirror/language";
import { Compartment, EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { basicSetup } from "codemirror";
import { latex } from "codemirror-lang-latex";
import { oneDarkHighlightStyle } from "@codemirror/theme-one-dark";

type LatexEditorProps = {
  value: string;
  onChange?: (value: string) => void;
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

export function LatexEditor({ value, onChange, className, dark = false }: LatexEditorProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const themeCompartment = useRef(new Compartment());
  const onChangeRef = useRef(onChange);

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    const view = new EditorView({
      parent: containerRef.current!,
      state: EditorState.create({
        doc: value,
        extensions: [
          basicSetup,
          latex(),
          fullHeight,
          appTheme,
          themeCompartment.current.of(themeExtensions(dark)),
          EditorView.updateListener.of((update) => {
            if (update.docChanged) onChangeRef.current?.(update.state.doc.toString());
          }),
        ],
      }),
    });
    viewRef.current = view;
    return () => {
      view.destroy();
      viewRef.current = null;
    };
  }, []);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const current = view.state.doc.toString();
    if (value !== current) {
      view.dispatch({ changes: { from: 0, to: current.length, insert: value } });
    }
  }, [value]);

  useEffect(() => {
    viewRef.current?.dispatch({
      effects: themeCompartment.current.reconfigure(themeExtensions(dark)),
    });
  }, [dark]);

  return <div ref={containerRef} className={className} />;
}
