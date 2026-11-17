import { isTexFile } from "@backslash/shared";
import { isInFolder, type DocFile } from "@backslash/shared/doc";
import {
  ArrowDown01Icon,
  ArrowRight01Icon,
  Delete02Icon,
  File01Icon,
  FileAddIcon,
  Folder01Icon,
  MoreHorizontalIcon,
  PencilEdit01Icon,
  StarIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { cn } from "cn";
import { useState, type KeyboardEvent, type ReactNode } from "react";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { Peer } from "@/hooks/use-collab";
import type { ProjectFiles } from "@/hooks/use-project-files";

type FileTreeProps = {
  project: ProjectFiles;
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
  | { kind: "rename-file"; id: string; path: string }
  | { kind: "rename-folder"; path: string };

type Deleting = { kind: "file"; id: string; path: string } | { kind: "folder"; path: string };

function buildTree(files: DocFile[]): TreeNode[] {
  const root: DirNode = { kind: "dir", name: "", path: "", children: [] };
  for (const file of files) {
    const segs = file.path.split("/");
    let dir = root;
    for (const [i, name] of segs.slice(0, -1).entries()) {
      let next = dir.children.find((c): c is DirNode => c.kind === "dir" && c.name === name);
      if (!next) {
        next = { kind: "dir", name, path: segs.slice(0, i + 1).join("/"), children: [] };
        dir.children.push(next);
      }
      dir = next;
    }
    dir.children.push({ kind: "file", name: segs.at(-1)!, path: file.path, file });
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
        // focus the input as soon as it appears; selecting the name part like file managers do
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
        className="mr-1 flex size-6 shrink-0 cursor-pointer items-center justify-center rounded-md text-muted-foreground opacity-0 group-hover/row:opacity-100 hover:bg-foreground/10 focus-visible:opacity-100 data-popup-open:opacity-100"
      >
        <HugeiconsIcon icon={MoreHorizontalIcon} className="size-4" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        {children}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function FileTree({ project, activeId, peers, onOpen, className }: FileTreeProps) {
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set());
  const [editing, setEditing] = useState<Editing | null>(null);
  const [deleting, setDeleting] = useState<Deleting | null>(null);
  const tree = buildTree(project.files);
  const mainPath = project.files.find((f) => f.id === project.mainId)?.path ?? null;

  function toggle(path: string) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (!next.delete(path)) next.add(path);
      return next;
    });
  }

  function startCreate(dir: string) {
    setCollapsed((prev) => new Set([...prev].filter((p) => p !== dir)));
    setEditing({ kind: "create", dir });
  }

  // actions validate first, so they only throw on a race with another client
  function attempt(validate: () => string | null, run: () => void): string | null {
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
    if (!deleting) return;
    if (deleting.kind === "file") project.remove(deleting.id);
    else project.removeFolder(deleting.path);
    setDeleting(null);
  }

  function renderCreate(dir: string, depth: number) {
    if (editing?.kind !== "create" || editing.dir !== dir) return null;
    return (
      <PathInput
        initial={dir ? `${dir}/` : ""}
        depth={depth}
        onCancel={() => setEditing(null)}
        onSubmit={(path) =>
          attempt(
            () => project.validatePath(path),
            () => onOpen(project.create(path)),
          )
        }
      />
    );
  }

  function renderNodes(nodes: TreeNode[], depth: number): ReactNode {
    return nodes.map((node) =>
      node.kind === "dir" ? renderDir(node, depth) : renderFile(node, depth),
    );
  }

  function renderDir(node: DirNode, depth: number) {
    const open = !collapsed.has(node.path);
    const hasMain = mainPath !== null && isInFolder(mainPath, node.path);
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
              () => project.renameFolder(node.path, to),
            )
          }
        />
      );
    }
    return (
      <div key={node.path}>
        <div className="group/row flex items-center rounded-md hover:bg-muted">
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
          <RowMenu>
            <DropdownMenuItem onClick={() => startCreate(node.path)}>
              <HugeiconsIcon icon={FileAddIcon} />
              New file here
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => setEditing({ kind: "rename-folder", path: node.path })}
            >
              <HugeiconsIcon icon={PencilEdit01Icon} />
              Rename / move
            </DropdownMenuItem>
            <DropdownMenuItem
              variant="destructive"
              disabled={hasMain}
              title={hasMain ? "Contains the main file" : undefined}
              onClick={() => setDeleting({ kind: "folder", path: node.path })}
            >
              <HugeiconsIcon icon={Delete02Icon} />
              Delete folder
            </DropdownMenuItem>
          </RowMenu>
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
              () => project.rename(file.id, path),
            )
          }
        />
      );
    }
    return (
      <div
        key={file.id}
        className={cn(
          "group/row flex items-center rounded-md hover:bg-muted",
          file.id === activeId && "bg-muted font-medium",
        )}
      >
        <button
          type="button"
          onClick={() => onOpen(file.id)}
          className="flex h-7 min-w-0 flex-1 cursor-pointer items-center gap-1.5 text-left"
          // align with folder names (past the chevron)
          style={{ paddingLeft: indent(depth).paddingLeft + 20 }}
        >
          <HugeiconsIcon icon={File01Icon} className="size-4 shrink-0 text-muted-foreground" />
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
        <RowMenu>
          <DropdownMenuItem
            onClick={() => setEditing({ kind: "rename-file", id: file.id, path: file.path })}
          >
            <HugeiconsIcon icon={PencilEdit01Icon} />
            Rename / move
          </DropdownMenuItem>
          {isTexFile(file.path) && !isMain && (
            <DropdownMenuItem onClick={() => project.setMain(file.id)}>
              <HugeiconsIcon icon={StarIcon} />
              Set as main file
            </DropdownMenuItem>
          )}
          <DropdownMenuItem
            variant="destructive"
            disabled={isMain}
            title={isMain ? "Choose another main file first" : undefined}
            onClick={() => setDeleting({ kind: "file", id: file.id, path: file.path })}
          >
            <HugeiconsIcon icon={Delete02Icon} />
            Delete
          </DropdownMenuItem>
        </RowMenu>
      </div>
    );
  }

  return (
    <div className={cn("flex flex-col text-sm", className)}>
      <div className="flex h-10 shrink-0 items-center justify-between border-b pr-1 pl-3">
        <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
          Files
        </span>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="New file"
          title="New file (use / for folders)"
          onClick={() => startCreate("")}
        >
          <HugeiconsIcon icon={FileAddIcon} />
        </Button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-1">
        {renderCreate("", 0)}
        {renderNodes(tree, 0)}
        {project.files.length === 0 && !editing && (
          <p className="p-3 text-xs text-muted-foreground">No files yet.</p>
        )}
      </div>

      <AlertDialog open={deleting !== null} onOpenChange={(open) => !open && setDeleting(null)}>
        <AlertDialogContent size="sm">
          <AlertDialogHeader>
            <AlertDialogTitle>
              Delete {deleting?.kind === "folder" ? "folder" : "file"}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              <span className="font-mono">{deleting?.path}</span>
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
