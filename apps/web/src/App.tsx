import type { CompileError } from "@backslash/shared";
import { useEffect, useEffectEvent, useState } from "react";
import { PlayIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { CollabStatus } from "@/components/collab-status";
import { CompileStatus } from "@/components/compile-status";
import { BlobViewer } from "@/components/blob-viewer";
import { FileTree } from "@/components/file-tree";
import { LatexEditor, type Reveal } from "@/components/latex-editor";
import { PdfViewer } from "@/components/pdf-viewer";
import { ShareButton } from "@/components/share-button";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import { useActiveFile } from "@/hooks/use-active-file";
import { useCollab } from "@/hooks/use-collab";
import { useCompile } from "@/hooks/use-compile";
import { useProjectFiles } from "@/hooks/use-project-files";
import { useSharedBuild } from "@/hooks/use-shared-build";
import { useUpload } from "@/hooks/use-upload";
import { useTheme } from "@/hooks/use-theme";
import { pdfUrl } from "@/lib/api";
import { resolveProjectId } from "@/lib/project-id";
import { downloadProjectZip } from "@/lib/zip-export";

// compile dirs are cleaned up after 1h on the compiler; recompile before the shared PDF expires
const PDF_MAX_AGE_MS = 50 * 60_000;

function App() {
  const [projectId] = useState(resolveProjectId);
  const { session, status, synced, me, peers, rename, setCompiling, setActiveFile } =
    useCollab(projectId);
  const build = useSharedBuild(session);
  const project = useProjectFiles(session);
  const { active, open } = useActiveFile(project.files, project.mainId);
  const [reveal, setReveal] = useState<(Reveal & { fileId: string }) | null>(null);
  const mainFile = project.files.find((f) => f.id === project.mainId) ?? null;
  const upload = useUpload(project, (id) => open(id));

  function downloadZip() {
    downloadProjectZip(project.files, `${projectId}.zip`).catch((err: unknown) =>
      upload.report(`ZIP download failed: ${err instanceof Error ? err.message : String(err)}`),
    );
  }
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

  // tell collaborators which file we're in
  const activeId = active?.id ?? null;
  useEffect(() => {
    setActiveFile(activeId);
  }, [activeId, setActiveFile]);

  function openFile(id: string) {
    setReveal(null);
    open(id);
  }

  const fileForError = (e: CompileError) =>
    e.file ? project.files.find((f) => f.path === e.file) : undefined;

  function jumpTo(e: CompileError) {
    const file = fileForError(e);
    if (!file) return;
    open(file.id);
    if (e.line) setReveal({ fileId: file.id, line: e.line, key: Date.now() });
  }

  function compile() {
    if (!session || !synced || !mainFile) return;
    run({
      files: project.files.map((f) =>
        f.kind === "text"
          ? { path: f.path, content: f.text.toJSON() }
          : { path: f.path, hash: f.hash },
      ),
      mainFile: mainFile.path,
    });
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

  let editorPanel;
  if (!session || !synced || !active) {
    editorPanel = (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        {session && synced ? "No file open" : "Loading project…"}
      </div>
    );
  } else if (active.kind === "blob") {
    editorPanel = <BlobViewer file={active} className="h-full" />;
  } else {
    editorPanel = (
      <LatexEditor
        ytext={active.text}
        path={active.path}
        reveal={reveal?.fileId === active.id ? reveal : null}
        awareness={session.provider.awareness}
        dark={theme === "dark"}
        className="h-full"
      />
    );
  }

  return (
    <div className="flex h-screen flex-col">
      <header className="flex h-12 shrink-0 items-center gap-3 border-b px-3 text-sm">
        <a href="/" className="flex items-center gap-2">
          <img src="/favicon.svg?v=2" alt="" className="size-6" />
          <span className="font-heading font-semibold">backslash</span>
        </a>
        <Button
          size="sm"
          onClick={compile}
          disabled={isPending || !synced || !mainFile}
          title={synced && !mainFile ? "Add a .tex file to compile" : undefined}
        >
          <HugeiconsIcon icon={PlayIcon} data-icon="inline-start" />
          Compile
        </Button>
        <div className="min-w-0 flex-1">
          <CompileStatus
            compiling={compiling}
            build={build.latest}
            error={isPending ? null : error}
            myName={me.name}
            canJump={(e) => !!fileForError(e)}
            onJump={jumpTo}
          />
        </div>
        <CollabStatus status={status} me={me} peers={peers} onRename={rename} />
        <ShareButton />
        <ThemeToggle theme={theme} onToggle={toggleTheme} />
      </header>
      <ResizablePanelGroup orientation="horizontal" className="min-h-0 flex-1">
        <ResizablePanel defaultSize="16" minSize={160} maxSize="40">
          <FileTree
            project={project}
            upload={upload}
            onDownloadZip={downloadZip}
            activeId={activeId}
            peers={peers}
            onOpen={openFile}
            className="h-full"
          />
        </ResizablePanel>
        <ResizableHandle />
        <ResizablePanel defaultSize="42">{editorPanel}</ResizablePanel>
        <ResizableHandle withHandle />
        <ResizablePanel defaultSize="42">
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
