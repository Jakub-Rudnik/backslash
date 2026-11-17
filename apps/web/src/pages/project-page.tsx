import type { CompileError, ProjectRole } from "@backslash/shared";
import type { HocuspocusProvider } from "@hocuspocus/provider";
import { useEffect, useEffectEvent, useState } from "react";
import { PlayIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "react-router";
import { AppHeader } from "@/components/app-header";
import { CollabStatus } from "@/components/collab-status";
import { CompileStatus } from "@/components/compile-status";
import { BlobViewer } from "@/components/blob-viewer";
import { FileTree } from "@/components/file-tree";
import { LatexEditor, type Reveal } from "@/components/latex-editor";
import { PdfViewer } from "@/components/pdf-viewer";
import { FullPageMessage } from "@/components/require-auth";
import { useAccount } from "@/lib/account";
import { ShareDialog } from "@/components/share-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import { useActiveFile } from "@/hooks/use-active-file";
import { useCollab } from "@/hooks/use-collab";
import { useCompile } from "@/hooks/use-compile";
import { useProjectFiles } from "@/hooks/use-project-files";
import { useSharedBuild } from "@/hooks/use-shared-build";
import { useUpload } from "@/hooks/use-upload";
import { useTheme } from "@/hooks/use-theme";
import { api, ApiError, pdfUrl } from "@/lib/api";
import { downloadProjectZip } from "@/lib/zip-export";

// compile dirs are cleaned up after 1h on the compiler; recompile before the shared PDF expires
const PDF_MAX_AGE_MS = 50 * 60_000;

/** True once local edits reached the server (it compiles its own copy), false on timeout. */
function waitForSync(provider: HocuspocusProvider, timeoutMs = 5000): Promise<boolean> {
  if (!provider.hasUnsyncedChanges) return Promise.resolve(true);
  return new Promise((resolve) => {
    const done = (synced: boolean) => {
      clearTimeout(timer);
      provider.off("unsyncedChanges", onChange);
      resolve(synced);
    };
    const onChange = ({ number }: { number: number }) => number === 0 && done(true);
    const timer = setTimeout(() => done(false), timeoutMs);
    provider.on("unsyncedChanges", onChange);
  });
}

/** /p/:projectId: loads the project's metadata (and checks access) before connecting. */
export function ProjectPage() {
  const { projectId = "" } = useParams();
  const project = useQuery({
    queryKey: ["project", projectId],
    queryFn: () => api.project(projectId),
    retry: false,
  });

  if (project.isPending) return <FullPageMessage>Loading project…</FullPageMessage>;
  if (project.error) {
    const notFound = project.error instanceof ApiError && project.error.status === 404;
    return (
      <FullPageMessage>
        <div className="space-y-4">
          <p>
            {notFound
              ? "This project doesn't exist or you don't have access to it."
              : project.error.message}
          </p>
          <Link to="/" className="font-medium text-foreground underline">
            Back to your projects
          </Link>
        </div>
      </FullPageMessage>
    );
  }
  return (
    <ProjectEditor
      key={projectId}
      projectId={projectId}
      name={project.data.name}
      role={project.data.role}
    />
  );
}

function ProjectEditor({
  projectId,
  name,
  role,
}: {
  projectId: string;
  name: string;
  role: ProjectRole;
}) {
  const account = useAccount();
  const collab = useCollab(projectId, account);
  const { session, status, synced, denied, me, peers, setCompiling, setActiveFile } = collab;
  // the server's word wins (it changes live when the owner changes our role)
  const readOnly = collab.readOnly ?? role === "viewer";
  const build = useSharedBuild(session);
  const project = useProjectFiles(session);
  const { active, open } = useActiveFile(project.files, project.mainId);
  const [reveal, setReveal] = useState<(Reveal & { fileId: string }) | null>(null);
  const [syncError, setSyncError] = useState<Error | null>(null);
  const mainFile = project.files.find((f) => f.id === project.mainId) ?? null;
  const upload = useUpload(projectId, project, (id) => open(id));

  function downloadZip() {
    const fileName = `${name.replace(/[^\w.-]+/g, "-") || "project"}.zip`;
    downloadProjectZip(projectId, project.files, fileName).catch((err: unknown) =>
      upload.report(`ZIP download failed: ${err instanceof Error ? err.message : String(err)}`),
    );
  }
  const { theme } = useTheme();

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

  async function compile() {
    if (!session || !synced || !mainFile) return;
    // viewers' local changes are never acknowledged, there's nothing of theirs to wait for
    const ready = readOnly || (await waitForSync(session.provider));
    // compiling now would miss our latest edits
    setSyncError(
      ready ? null : new Error("Your latest edits haven't reached the server, try again"),
    );
    if (ready) run(projectId);
  }
  const compileNow = useEffectEvent(compile);
  const pdfIsFresh = useEffectEvent(
    () => !!build.pdf && Date.now() - build.pdf.at < PDF_MAX_AGE_MS,
  );

  // once loaded, compile only if nobody has produced a (still available) PDF yet
  useEffect(() => {
    // compile() only sets state after an await (async), not synchronously in the effect
    // oxlint-disable-next-line react/set-state-in-effect
    if (synced && !pdfIsFresh()) void compileNow();
  }, [synced]);

  // Ctrl/Cmd+S and Ctrl/Cmd+Enter compile; capture phase so CodeMirror doesn't get them
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (!(e.ctrlKey || e.metaKey)) return;
      if (e.key !== "s" && e.key !== "Enter") return;
      e.preventDefault();
      e.stopPropagation();
      void compileNow();
    }
    window.addEventListener("keydown", onKeyDown, { capture: true });
    return () => window.removeEventListener("keydown", onKeyDown, { capture: true });
  }, []);

  const compiling = [
    ...(isPending ? ["You"] : []),
    ...peers.filter((p) => p.compiling).map((p) => p.user.name),
  ];

  if (denied) {
    return (
      <FullPageMessage>
        <div className="space-y-4">
          <p>You no longer have access to this project.</p>
          <Link to="/" className="font-medium text-foreground underline">
            Back to your projects
          </Link>
        </div>
      </FullPageMessage>
    );
  }

  let editorPanel;
  if (!session || !synced || !active) {
    editorPanel = (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        {session && synced ? "No file open" : "Loading project…"}
      </div>
    );
  } else if (active.kind === "blob") {
    editorPanel = <BlobViewer projectId={projectId} file={active} className="h-full" />;
  } else {
    editorPanel = (
      <LatexEditor
        ytext={active.text}
        path={active.path}
        reveal={reveal?.fileId === active.id ? reveal : null}
        readOnly={readOnly}
        awareness={session.provider.awareness}
        dark={theme === "dark"}
        className="h-full"
      />
    );
  }

  return (
    <div className="flex h-screen flex-col">
      <AppHeader>
        <span className="max-w-48 shrink-0 truncate font-medium" title={name}>
          {name}
        </span>
        {readOnly && <Badge variant="secondary">Read-only</Badge>}
        <Button
          size="sm"
          onClick={() => void compile()}
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
            error={isPending ? null : (syncError ?? error)}
            myName={me.name}
            canJump={(e) => !!fileForError(e)}
            onJump={jumpTo}
          />
        </div>
        <CollabStatus status={status} me={me} peers={peers} />
        <ShareDialog projectId={projectId} role={role} />
      </AppHeader>
      <ResizablePanelGroup orientation="horizontal" className="min-h-0 flex-1">
        <ResizablePanel defaultSize="16" minSize={160} maxSize="40">
          <FileTree
            project={project}
            upload={upload}
            readOnly={readOnly}
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
            url={build.pdf ? pdfUrl(projectId, build.pdf.jobId) : null}
            className="h-full overflow-auto bg-muted p-4"
          />
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  );
}
