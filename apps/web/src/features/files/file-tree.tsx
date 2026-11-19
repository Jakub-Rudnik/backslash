import { isTexFile } from "@backslash/shared";
import { isInFolder, parentDir, type DocFile } from "@backslash/shared/doc";
import {
  ArrowDown01Icon,
  ArrowRight01Icon,
  Cancel01Icon,
  Delete02Icon,
  Download04Icon,
  File01Icon,
  FileAddIcon,
  Folder01Icon,
  FolderAddIcon,
  FolderMoveToIcon,
  Image01Icon,
  Loading03Icon,
  MoreHorizontalIcon,
  Pdf01Icon,
  PencilEdit01Icon,
  StarIcon,
  Upload04Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { cn } from "cn";
import { useRef, useState, type DragEvent, type KeyboardEvent, type ReactNode } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { ContextMenu, ContextMenuContent, ContextMenuTrigger } from "@/components/ui/context-menu";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { Peer } from "@/features/editor/use-collab";
import type { ProjectFiles } from "@/features/files/use-project-files";
import type { useUpload } from "@/features/files/use-upload";
import { previewType } from "@/features/files/mime";
import { fromDataTransfer, fromFileList } from "@/features/files/upload-sources";

type FileTreeProps = {
  project: ProjectFiles;
  upload: ReturnType<typeof useUpload>;
  /** viewers: browse and download only */
  readOnly?: boolean;
  onDownloadZip: () => void;
  activeId: string | null;
  peers: Peer[];
  onOpen: (id: string) => void;
  className?: string;
};

type DirNode = { kind: "dir"; name: string; path: string; children: TreeNode[] };
type FileNode = { kind: "file"; name: string; path: string; file: DocFile };
type TreeNode = DirNode | FileNode;

type Editing =
  | { kind: "create"; dir: string }
  | { kind: "create-folder"; dir: string }
  | { kind: "rename-file"; id: string; path: string }
  | { kind: "rename-folder"; path: string };

type Deleting = { kind: "file"; id: string; path: string } | { kind: "folder"; path: string };

type Entry = { kind: "file"; id: string; path: string } | { kind: "folder"; path: string };

type MenuTarget = Entry | { kind: "root" };

function allFolders(nodes: TreeNode[]): string[] {
  return nodes.flatMap((n) => (n.kind === "dir" ? [n.path, ...allFolders(n.children)] : []));
}

function buildTree(files: DocFile[], folders: string[]): TreeNode[] {
  const root: DirNode = { kind: "dir", name: "", path: "", children: [] };
  const dirNode = (segs: string[]) => {
    let dir = root;
    for (const [i, name] of segs.entries()) {
      let next = dir.children.find((c): c is DirNode => c.kind === "dir" && c.name === name);
      if (!next) {
        next = { kind: "dir", name, path: segs.slice(0, i + 1).join("/"), children: [] };
        dir.children.push(next);
      }
      dir = next;
    }
    return dir;
  };
  for (const folder of folders) dirNode(folder.split("/"));
  for (const file of files) {
    const segs = file.path.split("/");
    dirNode(segs.slice(0, -1)).children.push({
      kind: "file",
      name: segs.at(-1)!,
      path: file.path,
      file,
    });
  }
  const sort = (nodes: TreeNode[]) => {
    nodes.sort((a, b) =>
      a.kind === b.kind ? a.name.localeCompare(b.name) : a.kind === "dir" ? -1 : 1,
    );
    for (const n of nodes) if (n.kind === "dir") sort(n.children);
  };
  sort(root.children);
  return root.children;
}

const indent = (depth: number) => ({ paddingLeft: 8 + depth * 14 });

/** Inline path editor; Enter commits, Escape or blur without a valid change cancels. */
function PathInput({
  initial,
  depth,
  onSubmit,
  onCancel,
}: {
  initial: string;
  depth: number;
  /** returns an error message, or null when done */
  onSubmit: (path: string) => string | null;
  onCancel: () => void;
}) {
  const [value, setValue] = useState(initial);
  const [error, setError] = useState<string | null>(null);

  function submit() {
    const path = value.trim();
    if (!path || path === initial) return onCancel();
    setError(onSubmit(path));
  }

  function onKeyDown(e: KeyboardEvent) {
    if (e.key === "Enter") submit();
    if (e.key === "Escape") onCancel();
  }

  return (
    <div className="py-0.5 pr-2" style={indent(depth)}>
      <input
        ref={(el) => {
          if (!el || el.dataset.ready) return;
          el.dataset.ready = "1";
          el.focus();
          const start = initial.lastIndexOf("/") + 1;
          const dot = initial.lastIndexOf(".");
          el.setSelectionRange(start, dot > start ? dot : initial.length);
        }}
        value={value}
        onChange={(e) => {
          setValue(e.target.value);
          setError(null);
        }}
        onKeyDown={onKeyDown}
        onBlur={() => {
          const path = value.trim();
          if (!path || path === initial || onSubmit(path)) onCancel();
        }}
        aria-invalid={!!error}
        spellCheck={false}
        className="h-7 w-full rounded-md border bg-background px-2 font-mono text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring/40 aria-invalid:border-destructive"
      />
      {error && <p className="mt-1 text-xs text-destructive">{error}</p>}
    </div>
  );
}

function RowMenu({ children }: { children: ReactNode }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label="More actions"
        className="mr-1 flex size-6 shrink-0 cursor-pointer items-center justify-center rounded-md text-muted-foreground opacity-0 group-hover/row:opacity-100 hover:bg-foreground/10 focus-visible:opacity-100 data-popup-open:opacity-100 pointer-coarse:opacity-100"
      >
        <HugeiconsIcon icon={MoreHorizontalIcon} className="size-4" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        {children}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function fileIcon(file: DocFile) {
  if (file.kind === "text") return File01Icon;
  const type = previewType(file.path);
  if (type === "application/pdf") return Pdf01Icon;
  return type ? Image01Icon : File01Icon;
}

const baseName = (path: string) => path.slice(path.lastIndexOf("/") + 1);

function canMove(item: Entry, dir: string) {
  if (parentDir(item.path) === dir) return false;
  return item.kind === "file" || !(dir === item.path || isInFolder(dir, item.path));
}

const HIDE_REFERENCE_HINT = "hide-reference-hint";

function referenceHintHidden() {
  try {
    return localStorage.getItem(HIDE_REFERENCE_HINT) === "1";
  } catch {
    return false;
  }
}

function hideReferenceHint() {
  try {
    localStorage.setItem(HIDE_REFERENCE_HINT, "1");
  } catch {
    return;
  }
}

export function FileTree({
  project,
  upload,
  readOnly = false,
  onDownloadZip,
  activeId,
  peers,
  onOpen,
  className,
}: FileTreeProps) {
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set());
  const [dropDir, setDropDir] = useState<string | null>(null);
  const dragged = useRef<Entry | null>(null);
  const [referenceHint, setReferenceHint] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuTarget, setMenuTarget] = useState<MenuTarget>({ kind: "root" });
  const fileInput = useRef<HTMLInputElement>(null);
  const uploadDir = useRef("");
  const [editingState, setEditing] = useState<Editing | null>(null);
  const [deletingState, setDeleting] = useState<Deleting | null>(null);
  const editing = readOnly ? null : editingState;
  const deleting = readOnly ? null : deletingState;
  const tree = buildTree(project.files, project.folders);
  const mainPath = project.files.find((f) => f.id === project.mainId)?.path ?? null;

  function toggle(path: string) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (!next.delete(path)) next.add(path);
      return next;
    });
  }

  function pickFiles(dir: string) {
    uploadDir.current = dir;
    fileInput.current?.click();
  }

  const hasFiles = (e: DragEvent) => e.dataTransfer.types.includes("Files");

  function dropTarget(e: DragEvent) {
    const target = e.target instanceof Element ? e.target.closest<HTMLElement>("[data-dir]") : null;
    return target?.dataset.dir ?? "";
  }

  function expand(dir: string) {
    setCollapsed((prev) => new Set([...prev].filter((p) => p !== dir)));
  }

  function remindReferences() {
    if (!referenceHintHidden()) setReferenceHint(true);
  }

  /** The row a right click or long press landed on; empty space is the root. */
  function targetOf(el: EventTarget | null): MenuTarget {
    const row = el instanceof Element ? el.closest<HTMLElement>("[data-entry]") : null;
    const path = row?.dataset.entry;
    if (path === undefined) return { kind: "root" };
    const file = project.files.find((f) => f.path === path);
    return file ? { kind: "file", id: file.id, path } : { kind: "folder", path };
  }

  function dragProps(item: Entry) {
    if (readOnly || editing) return {};
    return {
      draggable: true,
      onDragStart: (e: DragEvent) => {
        dragged.current = item;
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("text/plain", item.path);
      },
      onDragEnd: () => {
        dragged.current = null;
        setDropDir(null);
      },
    };
  }

  function onDragOver(e: DragEvent) {
    if (readOnly) return;
    const dir = dropTarget(e);
    if (dragged.current) {
      if (!canMove(dragged.current, dir)) return setDropDir(null);
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      setDropDir(dir);
    } else if (hasFiles(e)) {
      e.preventDefault();
      e.dataTransfer.dropEffect = "copy";
      setDropDir(dir);
    }
  }

  function move(item: Entry, dir: string) {
    const to = dir ? `${dir}/${baseName(item.path)}` : baseName(item.path);
    const error =
      item.kind === "file"
        ? attempt(
            () => project.validatePath(to, item.id),
            () => project.rename(item.id, to),
          )
        : attempt(
            () => project.validateFolderRename(item.path, to),
            () => project.renameFolder(item.path, to),
          );
    if (error) return upload.report(`Couldn't move ${item.path}: ${error}`);
    expand(dir);
    remindReferences();
  }

  function onDrop(e: DragEvent) {
    setDropDir(null);
    const item = dragged.current;
    dragged.current = null;
    if (item) {
      e.preventDefault();
      if (!readOnly && canMove(item, dropTarget(e))) move(item, dropTarget(e));
      return;
    }
    if (!hasFiles(e)) return;
    e.preventDefault();
    if (readOnly) return;
    const dir = dropTarget(e);
    fromDataTransfer(e.dataTransfer)
      .then((raw) => upload.start(raw, dir))
      .catch((err: unknown) =>
        upload.report(
          `Couldn't read dropped files: ${err instanceof Error ? err.message : String(err)}`,
        ),
      );
  }

  function startCreate(kind: "create" | "create-folder", dir: string) {
    expand(dir);
    setEditing({ kind, dir });
  }

  function attempt(validate: () => string | null, run: () => void): string | null {
    if (readOnly) return "Read-only";
    const error = validate();
    if (error) return error;
    try {
      run();
    } catch (err) {
      return err instanceof Error ? err.message : String(err);
    }
    setEditing(null);
    return null;
  }

  function confirmDelete() {
    if (!deleting || readOnly) return;
    if (deleting.kind === "file") project.remove(deleting.id);
    else project.removeFolder(deleting.path);
    setDeleting(null);
  }

  function renderCreate(dir: string, depth: number) {
    if (editing?.kind !== "create" && editing?.kind !== "create-folder") return null;
    if (editing.dir !== dir) return null;
    return (
      <PathInput
        initial={dir ? `${dir}/` : ""}
        depth={depth}
        onCancel={() => setEditing(null)}
        onSubmit={(path) =>
          editing.kind === "create"
            ? attempt(
                () => project.validatePath(path),
                () => onOpen(project.create(path)),
              )
            : attempt(
                () => project.validateFolderPath(path),
                () => project.createFolder(path),
              )
        }
      />
    );
  }

  function renderMoveTo(entry: Entry) {
    return (
      <DropdownMenuSub>
        <DropdownMenuSubTrigger>
          <HugeiconsIcon icon={FolderMoveToIcon} />
          Move to…
        </DropdownMenuSubTrigger>
        <DropdownMenuSubContent>
          {["", ...allFolders(tree)].map((dir) => (
            <DropdownMenuItem
              key={dir}
              disabled={!canMove(entry, dir)}
              onClick={() => move(entry, dir)}
            >
              <HugeiconsIcon icon={Folder01Icon} />
              <span className="truncate">{dir || "Project root"}</span>
            </DropdownMenuItem>
          ))}
        </DropdownMenuSubContent>
      </DropdownMenuSub>
    );
  }

  function menuItems(target: MenuTarget) {
    if (target.kind === "root") {
      return (
        <>
          <DropdownMenuItem onClick={() => startCreate("create", "")}>
            <HugeiconsIcon icon={FileAddIcon} />
            New file
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => startCreate("create-folder", "")}>
            <HugeiconsIcon icon={FolderAddIcon} />
            New folder
          </DropdownMenuItem>
          <DropdownMenuItem disabled={upload.busy} onClick={() => pickFiles("")}>
            <HugeiconsIcon icon={Upload04Icon} />
            Upload files
          </DropdownMenuItem>
        </>
      );
    }
    if (target.kind === "folder") {
      const hasMain = mainPath !== null && isInFolder(mainPath, target.path);
      return (
        <>
          <DropdownMenuItem onClick={() => startCreate("create", target.path)}>
            <HugeiconsIcon icon={FileAddIcon} />
            New file here
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => startCreate("create-folder", target.path)}>
            <HugeiconsIcon icon={FolderAddIcon} />
            New folder here
          </DropdownMenuItem>
          <DropdownMenuItem disabled={upload.busy} onClick={() => pickFiles(target.path)}>
            <HugeiconsIcon icon={Upload04Icon} />
            Upload here
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={() => setEditing({ kind: "rename-folder", path: target.path })}
          >
            <HugeiconsIcon icon={PencilEdit01Icon} />
            Rename
          </DropdownMenuItem>
          {renderMoveTo(target)}
          <DropdownMenuSeparator />
          <DropdownMenuItem
            variant="destructive"
            disabled={hasMain}
            title={hasMain ? "Contains the main file" : undefined}
            onClick={() => setDeleting({ kind: "folder", path: target.path })}
          >
            <HugeiconsIcon icon={Delete02Icon} />
            Delete folder
          </DropdownMenuItem>
        </>
      );
    }
    const isMain = target.id === project.mainId;
    return (
      <>
        <DropdownMenuItem
          onClick={() => setEditing({ kind: "rename-file", id: target.id, path: target.path })}
        >
          <HugeiconsIcon icon={PencilEdit01Icon} />
          Rename
        </DropdownMenuItem>
        {renderMoveTo(target)}
        {isTexFile(target.path) && !isMain && (
          <DropdownMenuItem onClick={() => project.setMain(target.id)}>
            <HugeiconsIcon icon={StarIcon} />
            Set as main file
          </DropdownMenuItem>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          variant="destructive"
          disabled={isMain}
          title={isMain ? "Choose another main file first" : undefined}
          onClick={() => setDeleting({ kind: "file", id: target.id, path: target.path })}
        >
          <HugeiconsIcon icon={Delete02Icon} />
          Delete
        </DropdownMenuItem>
      </>
    );
  }

  function renderNodes(nodes: TreeNode[], depth: number): ReactNode {
    return nodes.map((node) =>
      node.kind === "dir" ? renderDir(node, depth) : renderFile(node, depth),
    );
  }

  function renderDir(node: DirNode, depth: number) {
    const open = !collapsed.has(node.path);
    if (editing?.kind === "rename-folder" && editing.path === node.path) {
      return (
        <PathInput
          key={node.path}
          initial={node.path}
          depth={depth}
          onCancel={() => setEditing(null)}
          onSubmit={(to) =>
            attempt(
              () => project.validateFolderRename(node.path, to),
              () => {
                project.renameFolder(node.path, to);
                remindReferences();
              },
            )
          }
        />
      );
    }
    return (
      <div
        key={node.path}
        className={cn(
          "rounded-md",
          dropDir === node.path && "bg-primary/5 ring-1 ring-primary/40 ring-inset",
        )}
      >
        <div
          className="group/row flex items-center rounded-md hover:bg-muted"
          data-dir={node.path}
          data-entry={node.path}
          {...dragProps({ kind: "folder", path: node.path })}
        >
          <button
            type="button"
            onClick={() => toggle(node.path)}
            className="flex h-7 min-w-0 flex-1 cursor-pointer items-center gap-1.5 text-left"
            style={indent(depth)}
          >
            <HugeiconsIcon
              icon={open ? ArrowDown01Icon : ArrowRight01Icon}
              className="size-3.5 shrink-0 text-muted-foreground"
            />
            <HugeiconsIcon icon={Folder01Icon} className="size-4 shrink-0 text-muted-foreground" />
            <span className="truncate">{node.name}</span>
          </button>
          {!readOnly && <RowMenu>{menuItems({ kind: "folder", path: node.path })}</RowMenu>}
        </div>
        {open && (
          <>
            {renderCreate(node.path, depth + 1)}
            {renderNodes(node.children, depth + 1)}
          </>
        )}
      </div>
    );
  }

  function renderFile({ file, name }: FileNode, depth: number) {
    const isMain = file.id === project.mainId;
    const here = peers.filter((p) => p.fileId === file.id);
    if (editing?.kind === "rename-file" && editing.id === file.id) {
      return (
        <PathInput
          key={file.id}
          initial={file.path}
          depth={depth}
          onCancel={() => setEditing(null)}
          onSubmit={(path) =>
            attempt(
              () => project.validatePath(path, file.id),
              () => {
                project.rename(file.id, path);
                remindReferences();
              },
            )
          }
        />
      );
    }
    return (
      <div
        key={file.id}
        data-dir={parentDir(file.path)}
        data-entry={file.path}
        {...dragProps({ kind: "file", id: file.id, path: file.path })}
        className={cn(
          "group/row flex items-center rounded-md hover:bg-muted",
          file.id === activeId && "bg-muted font-medium",
        )}
      >
        <button
          type="button"
          onClick={() => onOpen(file.id)}
          className="flex h-7 min-w-0 flex-1 cursor-pointer items-center gap-1.5 text-left"
          style={{ paddingLeft: indent(depth).paddingLeft + 20 }}
        >
          <HugeiconsIcon icon={fileIcon(file)} className="size-4 shrink-0 text-muted-foreground" />
          <span className="truncate">{name}</span>
          {isMain && (
            <HugeiconsIcon
              icon={StarIcon}
              className="size-3 shrink-0 fill-amber-400 text-amber-500"
              aria-label="Main file"
            />
          )}
          <span className="ml-auto flex shrink-0 -space-x-1 pr-1">
            {here.map((p) => (
              <span
                key={p.clientId}
                title={p.user.name}
                className="size-2.5 rounded-full border border-background"
                style={{ backgroundColor: p.user.color }}
              />
            ))}
          </span>
        </button>
        {!readOnly && (
          <RowMenu>{menuItems({ kind: "file", id: file.id, path: file.path })}</RowMenu>
        )}
      </div>
    );
  }

  return (
    <div className={cn("flex flex-col text-sm", className)}>
      <div className="flex h-10 shrink-0 items-center gap-0.5 border-b pr-1 pl-3">
        <span className="mr-auto text-xs font-medium tracking-wide text-muted-foreground uppercase">
          Files
        </span>
        {!readOnly && (
          <>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="New file"
              title="New file (use / for folders)"
              onClick={() => startCreate("create", "")}
            >
              <HugeiconsIcon icon={FileAddIcon} />
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="New folder"
              title="New folder"
              onClick={() => startCreate("create-folder", "")}
            >
              <HugeiconsIcon icon={FolderAddIcon} />
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Upload files"
              title="Upload files or a .zip (or drop them here)"
              disabled={upload.busy}
              onClick={() => pickFiles("")}
            >
              <HugeiconsIcon icon={Upload04Icon} />
            </Button>
          </>
        )}
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Download as ZIP"
          title="Download project as .zip"
          disabled={project.files.length === 0}
          onClick={onDownloadZip}
        >
          <HugeiconsIcon icon={Download04Icon} />
        </Button>
        <input
          ref={fileInput}
          type="file"
          multiple
          hidden
          onChange={(e) => {
            const files = e.target.files;
            if (files?.length) void upload.start(fromFileList(files), uploadDir.current);
            e.target.value = "";
          }}
        />
      </div>
      <ContextMenu
        disabled={readOnly}
        open={menuOpen}
        onOpenChange={(open, details) => {
          if (open) setMenuTarget(targetOf(details.event.target));
          setMenuOpen(open);
        }}
      >
        <ContextMenuTrigger
          className={cn(
            "min-h-0 flex-1 overflow-y-auto p-1",
            dropDir === "" && "bg-primary/5 ring-2 ring-primary/40 ring-inset",
          )}
          onContextMenu={(e) => {
            if (!(e.target instanceof HTMLInputElement)) return;
            e.preventBaseUIHandler();
            e.stopPropagation();
          }}
          onDragOver={onDragOver}
          onDragLeave={(e) => {
            const inside =
              e.relatedTarget instanceof Node && e.currentTarget.contains(e.relatedTarget);
            if (!inside) setDropDir(null);
          }}
          onDrop={onDrop}
        >
          {renderCreate("", 0)}
          {renderNodes(tree, 0)}
          {project.files.length === 0 && project.folders.length === 0 && !editing && (
            <p className="p-3 text-xs text-muted-foreground">
              No files yet.{!readOnly && " Drop files here."}
            </p>
          )}
        </ContextMenuTrigger>
        <ContextMenuContent className="w-56">{menuItems(menuTarget)}</ContextMenuContent>
      </ContextMenu>

      {(upload.progress || upload.errors.length > 0) && (
        <div className="max-h-40 shrink-0 overflow-y-auto border-t p-2 text-xs">
          {upload.progress && (
            <p className="flex items-center gap-1.5 text-muted-foreground">
              <HugeiconsIcon icon={Loading03Icon} className="size-3.5 animate-spin" />
              Uploading {upload.progress.done}/{upload.progress.total}…
            </p>
          )}
          {upload.errors.length > 0 && (
            <div className="flex items-start gap-1">
              <ul className="min-w-0 flex-1 space-y-0.5 text-destructive">
                {upload.errors.map((e) => (
                  <li key={e} className="break-all">
                    {e}
                  </li>
                ))}
              </ul>
              <button
                type="button"
                aria-label="Dismiss"
                onClick={upload.dismissErrors}
                className="cursor-pointer rounded p-0.5 text-muted-foreground hover:bg-muted"
              >
                <HugeiconsIcon icon={Cancel01Icon} className="size-3.5" />
              </button>
            </div>
          )}
        </div>
      )}

      {referenceHint && (
        <div className="flex shrink-0 items-start gap-1 border-t p-2 text-xs text-muted-foreground">
          <p className="min-w-0 flex-1">
            References to moved or renamed files (<code>\input</code>, <code>\includegraphics</code>
            , …) aren&apos;t updated. Remember to fix them.{" "}
            <button
              type="button"
              onClick={() => {
                hideReferenceHint();
                setReferenceHint(false);
              }}
              className="cursor-pointer underline underline-offset-2 hover:text-foreground"
            >
              Don&apos;t show again
            </button>
          </p>
          <button
            type="button"
            aria-label="Dismiss"
            onClick={() => setReferenceHint(false)}
            className="cursor-pointer rounded p-0.5 hover:bg-muted"
          >
            <HugeiconsIcon icon={Cancel01Icon} className="size-3.5" />
          </button>
        </div>
      )}

      <AlertDialog
        open={!readOnly && upload.replacing !== null}
        onOpenChange={(open) => !open && upload.cancel()}
      >
        <AlertDialogContent size="sm">
          <AlertDialogHeader>
            <AlertDialogTitle>Replace existing files?</AlertDialogTitle>
            <AlertDialogDescription>
              These files will be overwritten for all collaborators:
            </AlertDialogDescription>
          </AlertDialogHeader>
          <ul className="max-h-40 overflow-y-auto font-mono text-xs break-all">
            {upload.replacing?.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={upload.confirm}>Replace</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={deleting !== null} onOpenChange={(open) => !open && setDeleting(null)}>
        <AlertDialogContent size="sm">
          <AlertDialogHeader>
            <AlertDialogTitle>
              Delete {deleting?.kind === "folder" ? "folder" : "file"}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              <span className="font-mono break-all">{deleting?.path}</span>
              {deleting?.kind === "folder" && " and everything in it"} will be deleted for all
              collaborators.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={confirmDelete}>
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
