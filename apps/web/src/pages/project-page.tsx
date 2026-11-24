import type { CompileError, ProjectRole } from "@backslash/shared";
import type { HocuspocusProvider } from "@hocuspocus/provider";
import { useEffect, useEffectEvent, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { Download04Icon, MinusSignIcon, PlayIcon, PlusSignIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useQuery } from "@tanstack/react-query";
import { cn } from "cn";
import { Link, useParams } from "react-router";
import { AppHeader } from "@/components/app-header";
import { CollabStatus } from "@/features/editor/collab-status";
import { CompileErrors } from "@/features/compile/compile-errors";
import { CompileStatus } from "@/features/compile/compile-status";
import { BlobViewer } from "@/features/files/blob-viewer";
import type { FileTreeHandle } from "@/features/files/file-tree";
import { LatexEditor, type Reveal } from "@/features/editor/latex-editor";
import { PdfViewer } from "@/features/compile/pdf-viewer";
import { FullPageMessage } from "@/features/auth/require-auth";
import { useAccount } from "@/features/auth/account";
import { ShareDialog } from "@/features/sharing/share-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { ActivityBar, SidebarPanel } from "@/features/sidebar/sidebar";
import { useSidebar } from "@/features/sidebar/use-sidebar";
import {
  actionsFor,
  viewById,
  viewsFor,
  type SidebarView,
  type ViewContext,
} from "@/features/sidebar/views";
import { useLayoutSettings } from "@/features/sidebar/layout-settings";
import { LayoutToggles } from "@/features/sidebar/layout-toggles";
import { PhoneTabs } from "@/features/sidebar/phone-tabs";
import { CommandPalette, type PaletteCommand } from "@/features/palette/command-palette";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import { useActiveFile } from "@/features/editor/use-active-file";
import { useCollab } from "@/features/editor/use-collab";
import { useCompile } from "@/features/compile/use-compile";
import { useProjectFiles } from "@/features/files/use-project-files";
import { useSharedBuild } from "@/features/compile/use-shared-build";
import { useUpload } from "@/features/files/use-upload";
import { useTheme } from "@/hooks/use-theme";
import { mod, useShortcut } from "@/hooks/use-shortcut";
import { api, ApiError, pdfUrl } from "@/lib/api";
import { downloadProjectZip } from "@/features/files/zip-export";

const PDF_MAX_AGE_MS = 50 * 60_000;
const ZOOM_STEPS = [0.5, 0.75, 1, 1.25, 1.5, 2, 3];
const DEFAULT_ZOOM_STEP = 2;

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
  const readOnly = collab.readOnly ?? role === "viewer";
  const build = useSharedBuild(session);
  const project = useProjectFiles(session);
  const { active, open } = useActiveFile(project.files, project.mainId);
  const [reveal, setReveal] = useState<(Reveal & { fileId: string }) | null>(null);
  const [syncError, setSyncError] = useState<Error | null>(null);
  const mainFile = project.files.find((f) => f.id === project.mainId) ?? null;
  const upload = useUpload(projectId, project, (id) => openFile(id));

  const fileBase = name.replace(/[^\w.-]+/g, "-") || "project";
  const [zoomStep, setZoomStep] = useState(DEFAULT_ZOOM_STEP);
  const pdf = build.pdf?.jobId ? pdfUrl(projectId, build.pdf.jobId) : null;

  function downloadZip() {
    downloadProjectZip(projectId, project.files, `${fileBase}.zip`).catch((err: unknown) =>
      upload.report(`ZIP download failed: ${err instanceof Error ? err.message : String(err)}`),
    );
  }
  const { theme } = useTheme();
  const sidebar = useSidebar();
  const fileTreeRef = useRef<FileTreeHandle>(null);
  const fileTree = {
    ref: (handle: FileTreeHandle | null) => {
      fileTreeRef.current = handle;
    },
    startCreate: (kind: "create" | "create-folder") => fileTreeRef.current?.startCreate(kind),
    pickFiles: () => fileTreeRef.current?.pickFiles(),
  };
  const [searchQuery, setSearchQuery] = useState("");
  const [shareOpen, setShareOpen] = useState(false);
  const [errorsOpen, setErrorsOpen] = useState(false);
  const { settings: layout, update: updateLayout } = useLayoutSettings();

  const { run, isPending, error } = useCompile(projectId, build.latest);
  useEffect(() => {
    setCompiling(isPending);
  }, [isPending, setCompiling]);

  const activeId = active?.id ?? null;
  useEffect(() => {
    setActiveFile(activeId);
  }, [activeId, setActiveFile]);

  function openFile(id: string) {
    setReveal(null);
    open(id);
    sidebar.fileOpened();
  }

  const viewContext: ViewContext = {
    session,
    project,
    upload,
    readOnly,
    synced,
    activeId,
    peers,
    openFile,
    openAt,
    searchQuery,
    setSearchQuery,
    downloadZip,
    fileTree,
  };
  const views = viewsFor(readOnly);
  const sidebarView = viewById(sidebar.view, readOnly);

  const fileForError = (e: CompileError) =>
    e.file ? project.files.find((f) => f.path === e.file) : undefined;

  function openAt(id: string, line: number) {
    open(id);
    setReveal((prev) => ({ fileId: id, line, key: (prev?.key ?? 0) + 1 }));
    sidebar.fileOpened();
  }

  function jumpTo(e: CompileError) {
    const file = fileForError(e);
    if (!file) return;
    if (e.line) openAt(file.id, e.line);
    else openFile(file.id);
  }

  async function compile() {
    if (!session || !synced || !mainFile) return;
    setErrorsOpen(false);
    const ready = readOnly || (await waitForSync(session.provider));
    setSyncError(
      ready ? null : new Error("Your latest edits haven't reached the server, try again"),
    );
    if (ready) void run();
  }
  const compileNow = useEffectEvent(compile);
  const pdfIsFresh = useEffectEvent(
    () => !!build.pdf && Date.now() - build.pdf.at < PDF_MAX_AGE_MS,
  );

  useEffect(() => {
    // oxlint-disable-next-line react/set-state-in-effect
    if (synced && !pdfIsFresh()) void compileNow();
  }, [synced]);

  useShortcut(
    (e) => mod(e) && (e.key === "s" || e.key === "Enter"),
    () => void compile(),
  );

  const errors = build.latest?.errors ?? [];
  /** Built when the palette opens, so titles like "Hide sidebar" match the layout then. */
  function paletteCommands(): PaletteCommand[] {
    const viewCommands = (view: SidebarView) =>
      actionsFor(view, viewContext).map((a) => ({
        id: `${view.id}:${a.id}`,
        title: a.title,
        takesFocus: true,
        run: () => {
          flushSync(() => sidebar.show(view.id));
          a.run();
        },
      }));
    return [
      {
        id: "toggle-sidebar",
        title: sidebar.open ? "Hide sidebar" : "Show sidebar",
        keys: "Ctrl+Shift+B",
        run: () => sidebar.setOpen(!sidebar.open),
      },
      ...views.map((v) => ({
        id: `show:${v.id}`,
        title: `Show ${v.title}`,
        takesFocus: v.id === "search",
        run: () => sidebar.show(v.id),
      })),
      ...views.flatMap(viewCommands),
      ...(sidebar.phone
        ? [
            { id: "show-code", title: "Show code", run: () => sidebar.setPhoneTab("code") },
            { id: "show-pdf", title: "Show PDF", run: () => sidebar.setPhoneTab("pdf") },
          ]
        : [
            {
              id: "toggle-code",
              title: layout.showCode ? "Hide code" : "Show code",
              run: () =>
                updateLayout(
                  layout.showCode ? { showCode: false, showPdf: true } : { showCode: true },
                ),
            },
            {
              id: "toggle-pdf",
              title: layout.showPdf ? "Hide PDF" : "Show PDF",
              run: () =>
                updateLayout(
                  layout.showPdf ? { showPdf: false, showCode: true } : { showPdf: true },
                ),
            },
          ]),
      ...(mainFile
        ? [{ id: "compile", title: "Compile", keys: "Ctrl+S", run: () => void compile() }]
        : []),
      ...(errors.length > 0
        ? [
            {
              id: "compile-errors",
              title: "Show compile errors",
              run: () => {
                if (sidebar.phone) sidebar.setPhoneTab("pdf");
                else updateLayout({ showPdf: true });
                setErrorsOpen(true);
              },
            },
          ]
        : []),
      { id: "share", title: "Share", takesFocus: true, run: () => setShareOpen(true) },
    ];
  }

  const compiling = [
    ...(isPending ? ["You"] : []),
    ...peers.filter((p) => p.compiling).map((p) => p.user.name),
  ];

  if (denied) {
    return (
      <FullPageMessage>
        <div className="space-y-4">
          <p>
            {denied === "too-many-connections"
              ? "You have too many projects open. Close some tabs and reload this page."
              : "You no longer have access to this project."}
          </p>
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

  const codePane = (
    <>
      <div className="flex h-10 shrink-0 items-center border-b px-3 text-xs text-muted-foreground">
        <span className="truncate font-mono">{active?.path}</span>
      </div>
      <div className="min-h-0 flex-1">{editorPanel}</div>
    </>
  );

  const pdfPane = (
    <>
      <div className="flex h-10 shrink-0 items-center gap-3 border-b px-2 text-sm">
        <Button
          size="sm"
          className="h-7"
          onClick={() => void compile()}
          disabled={isPending || !synced || !mainFile}
          title={synced && !mainFile ? "Add a .tex file to compile" : undefined}
        >
          <HugeiconsIcon icon={PlayIcon} data-icon="inline-start" />
          Recompile
        </Button>
        <CompileStatus
          compiling={compiling}
          build={build.latest}
          error={isPending ? null : (syncError ?? error)}
          myName={me.name}
        />
        <div className="ml-auto flex shrink-0 items-center text-xs text-muted-foreground">
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Zoom out"
            disabled={zoomStep === 0}
            onClick={() => setZoomStep(zoomStep - 1)}
          >
            <HugeiconsIcon icon={MinusSignIcon} />
          </Button>
          <button
            type="button"
            title="Reset zoom"
            onClick={() => setZoomStep(DEFAULT_ZOOM_STEP)}
            className="w-10 cursor-pointer text-center tabular-nums"
          >
            {Math.round(ZOOM_STEPS[zoomStep] * 100)}%
          </button>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Zoom in"
            disabled={zoomStep === ZOOM_STEPS.length - 1}
            onClick={() => setZoomStep(zoomStep + 1)}
          >
            <HugeiconsIcon icon={PlusSignIcon} />
          </Button>
          {pdf ? (
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Download PDF"
              title="Download PDF"
              nativeButton={false}
              render={<a href={pdf} download={`${fileBase}.pdf`} />}
            >
              <HugeiconsIcon icon={Download04Icon} />
            </Button>
          ) : (
            <Button variant="ghost" size="icon-sm" aria-label="Download PDF" disabled>
              <HugeiconsIcon icon={Download04Icon} />
            </Button>
          )}
        </div>
      </div>
      {!isPending && (
        <CompileErrors
          errors={errors}
          canJump={(e) => !!fileForError(e)}
          onJump={jumpTo}
          open={errorsOpen}
          onOpenChange={setErrorsOpen}
        />
      )}
      <PdfViewer
        url={pdf}
        zoom={ZOOM_STEPS[zoomStep]}
        className={cn(
          "min-h-0 flex-1 overflow-auto bg-muted p-4 transition-opacity",
          build.latest?.status === "error" && "opacity-50",
        )}
      />
    </>
  );

  return (
    <div className="flex h-dvh flex-col">
      <AppHeader>
        <svg
          aria-hidden
          viewBox="0 0 10 20"
          className="mx-1 h-4 w-2 shrink-0 text-brand max-sm:hidden"
        >
          <line
            x1="2"
            y1="2"
            x2="8"
            y2="18"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          />
        </svg>
        <span className="max-w-64 min-w-0 truncate font-medium" title={name}>
          {name}
        </span>
        {readOnly && <Badge variant="secondary">Read-only</Badge>}
        <div className="flex-1" />
        {!sidebar.phone && <LayoutToggles />}
        <CollabStatus status={status} me={me} peers={peers} />
        <ShareDialog
          projectId={projectId}
          role={role}
          open={shareOpen}
          onOpenChange={setShareOpen}
        />
      </AppHeader>
      <CommandPalette
        session={session}
        files={project.files}
        commands={paletteCommands}
        openFile={openFile}
        openAt={openAt}
      />
      {sidebar.phone ? (
        <>
          <div className="min-h-0 flex-1">
            <SidebarPanel
              view={sidebarView}
              ctx={viewContext}
              onSwitchView={sidebar.show}
              className={cn(sidebar.phoneTab !== "view" && "hidden")}
            />
            <div className={cn("flex h-full flex-col", sidebar.phoneTab !== "code" && "hidden")}>
              {codePane}
            </div>
            <div className={cn("flex h-full flex-col", sidebar.phoneTab !== "pdf" && "hidden")}>
              {pdfPane}
            </div>
          </div>
          <PhoneTabs view={sidebarView} tab={sidebar.phoneTab} onSelect={sidebar.setPhoneTab} />
        </>
      ) : (
        <div className="flex min-h-0 flex-1">
          <ActivityBar
            views={views}
            view={sidebar.view}
            open={sidebar.open}
            onSelect={sidebar.select}
          />
          {!sidebar.docked && (
            <Sheet
              open={sidebar.open}
              modal="trap-focus"
              onOpenChange={(open, details) => {
                // the activity bar's own click toggles or switches the view
                if (
                  details.event.target instanceof Element &&
                  details.event.target.closest("#activity-bar")
                ) {
                  return details.cancel();
                }
                sidebar.setOpen(open);
              }}
            >
              <SheetContent
                side="left"
                showCloseButton={false}
                overlayClassName="top-12 left-12"
                className="data-[side=left]:top-12 data-[side=left]:left-12 data-[side=left]:h-auto data-[side=left]:w-72"
              >
                <SheetTitle className="sr-only">{sidebarView.title}</SheetTitle>
                <SidebarPanel view={sidebarView} ctx={viewContext} />
              </SheetContent>
            </Sheet>
          )}
          <ResizablePanelGroup
            orientation="horizontal"
            className="min-w-0 flex-1"
            onLayoutChanged={sidebar.onLayoutChanged}
          >
            {sidebar.docked && (
              <>
                <ResizablePanel
                  id="sidebar"
                  panelRef={sidebar.panelRef}
                  collapsible
                  defaultSize={sidebar.initialSize}
                  minSize={160}
                  maxSize="40"
                >
                  <SidebarPanel view={sidebarView} ctx={viewContext} />
                </ResizablePanel>
                <ResizableHandle />
              </>
            )}
            {layout.showCode && (
              <ResizablePanel id="code" className="flex flex-col">
                {codePane}
              </ResizablePanel>
            )}
            {layout.showCode && layout.showPdf && <ResizableHandle withHandle />}
            {layout.showPdf && (
              <ResizablePanel id="pdf" className="flex flex-col">
                {pdfPane}
              </ResizablePanel>
            )}
          </ResizablePanelGroup>
        </div>
      )}
    </div>
  );
}
