import { useEffect, useEffectEvent, useState } from "react";
import { PlayIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { CollabStatus } from "@/components/collab-status";
import { CompileStatus } from "@/components/compile-status";
import { LatexEditor } from "@/components/latex-editor";
import { PdfViewer } from "@/components/pdf-viewer";
import { ShareButton } from "@/components/share-button";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import { useCollab } from "@/hooks/use-collab";
import { useCompile } from "@/hooks/use-compile";
import { useSharedBuild } from "@/hooks/use-shared-build";
import { useTheme } from "@/hooks/use-theme";
import { pdfUrl } from "@/lib/api";
import { resolveDocId } from "@/lib/doc-id";

// compile dirs are cleaned up after 1h on the compiler; recompile before the shared PDF expires
const PDF_MAX_AGE_MS = 50 * 60_000;

function App() {
  const [docId] = useState(resolveDocId);
  const { session, status, synced, me, peers, rename, setCompiling } = useCollab(docId);
  const build = useSharedBuild(session);
  const { theme, toggle: toggleTheme } = useTheme();

  const { run, isPending, error } = useCompile({
    onStart: () => setCompiling(true),
    onSettled: () => setCompiling(false),
    onResult: (result, startedAt) =>
      build.publish({
        jobId: result.jobId,
        status: result.status,
        errors: result.errors,
        by: me.name,
        at: startedAt,
      }),
  });

  function compile() {
    if (session && synced) run(session.ytext.toJSON());
  }
  const compileNow = useEffectEvent(compile);
  const pdfIsFresh = useEffectEvent(
    () => !!build.pdf && Date.now() - build.pdf.at < PDF_MAX_AGE_MS,
  );

  // once loaded, compile only if nobody has produced a (still available) PDF yet
  useEffect(() => {
    if (synced && !pdfIsFresh()) compileNow();
  }, [synced]);

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

  const compiling = [
    ...(isPending ? ["You"] : []),
    ...peers.filter((p) => p.compiling).map((p) => p.user.name),
  ];

  return (
    <div className="flex h-screen flex-col">
      <header className="flex h-12 shrink-0 items-center gap-3 border-b px-3 text-sm">
        <a href="/" className="flex items-center gap-2">
          <img src="/favicon.svg?v=2" alt="" className="size-6" />
          <span className="font-heading font-semibold">backslash</span>
        </a>
        <Button size="sm" onClick={compile} disabled={isPending || !synced}>
          <HugeiconsIcon icon={PlayIcon} data-icon="inline-start" />
          Compile
        </Button>
        <div className="min-w-0 flex-1">
          <CompileStatus
            compiling={compiling}
            build={build.latest}
            error={isPending ? null : error}
            myName={me.name}
          />
        </div>
        <CollabStatus status={status} me={me} peers={peers} onRename={rename} />
        <ShareButton />
        <ThemeToggle theme={theme} onToggle={toggleTheme} />
      </header>
      <ResizablePanelGroup orientation="horizontal" className="min-h-0 flex-1">
        <ResizablePanel>
          {session && synced ? (
            <LatexEditor
              ytext={session.ytext}
              awareness={session.provider.awareness}
              dark={theme === "dark"}
              className="h-full"
            />
          ) : (
            <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
              Loading document…
            </div>
          )}
        </ResizablePanel>
        <ResizableHandle withHandle />
        <ResizablePanel>
          <PdfViewer
            url={build.pdf ? pdfUrl(build.pdf.jobId) : null}
            className="h-full overflow-auto bg-muted p-4"
          />
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  );
}

export default App;
