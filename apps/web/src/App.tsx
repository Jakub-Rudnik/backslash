import { useEffect, useEffectEvent, useRef, useState } from "react";
import { PlayIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { CompileStatus } from "@/components/compile-status";
import { LatexEditor } from "@/components/latex-editor";
import { PdfViewer } from "@/components/pdf-viewer";
import { Button } from "@/components/ui/button";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import { useCompile } from "@/hooks/use-compile";

const INITIAL_SOURCE = String.raw`\documentclass{article}
\begin{document}
Hello, \LaTeX!
\end{document}
`;

function App() {
  const [source, setSource] = useState(INITIAL_SOURCE);
  const { run, pdfUrl, result, isPending, error } = useCompile();

  const compileNow = useEffectEvent(() => run(source));

  // compile once on load (ref guards StrictMode double effect)
  const didInit = useRef(false);
  useEffect(() => {
    if (didInit.current) return;
    didInit.current = true;
    compileNow();
  }, []);

  // Ctrl/Cmd+S and Ctrl/Cmd+Enter compile; capture phase so CodeMirror doesn't get them
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (!(e.ctrlKey || e.metaKey)) return;
      if (e.key !== "s" && e.key !== "Enter") return;
      e.preventDefault();
      e.stopPropagation();
      compileNow();
    }
    window.addEventListener("keydown", onKeyDown, { capture: true });
    return () => window.removeEventListener("keydown", onKeyDown, { capture: true });
  }, []);

  return (
    <div className="flex h-screen flex-col">
      <header className="flex h-12 shrink-0 items-center gap-3 border-b px-3 text-sm">
        <span className="font-heading font-semibold">backslash</span>
        <Button size="sm" onClick={() => run(source)} disabled={isPending}>
          <HugeiconsIcon icon={PlayIcon} data-icon="inline-start" />
          Compile
        </Button>
        <div className="min-w-0 flex-1">
          <CompileStatus isPending={isPending} result={result} error={error} />
        </div>
      </header>
      <ResizablePanelGroup orientation="horizontal" className="min-h-0 flex-1">
        <ResizablePanel>
          <LatexEditor value={source} onChange={setSource} className="h-full" />
        </ResizablePanel>
        <ResizableHandle withHandle />
        <ResizablePanel>
          <PdfViewer url={pdfUrl} className="h-full overflow-auto bg-muted p-4" />
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  );
}

export default App;
