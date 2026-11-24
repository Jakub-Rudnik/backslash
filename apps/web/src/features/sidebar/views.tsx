import {
  Download04Icon,
  FileAddIcon,
  Folder01Icon,
  FolderAddIcon,
  LeftToRightListBulletIcon,
  Search01Icon,
  Upload04Icon,
} from "@hugeicons/core-free-icons";
import type { IconSvgElement } from "@hugeicons/react";
import type { ReactNode, Ref } from "react";
import type { CollabSession, Peer } from "@/features/editor/use-collab";
import { FileTree, type FileTreeHandle } from "@/features/files/file-tree";
import type { ProjectFiles } from "@/features/files/use-project-files";
import type { useUpload } from "@/features/files/use-upload";
import { OutlineView } from "@/features/outline/outline-view";
import { SearchView } from "@/features/search/search-view";
import type { ViewId } from "@/features/sidebar/layout-settings";

/** What the project page hands every sidebar view. */
export interface ViewContext {
  session: CollabSession | null;
  project: ProjectFiles;
  upload: ReturnType<typeof useUpload>;
  readOnly: boolean;
  activeId: string | null;
  peers: Peer[];
  openFile: (id: string) => void;
  /** opens the file scrolled to `line` (1-based) */
  openAt: (id: string, line: number) => void;
  /** kept by the page, so it survives switching views */
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  downloadZip: () => void;
  /** the Files view's tree, while it's mounted */
  fileTree: FileTreeHandle & { ref: Ref<FileTreeHandle> };
}

/** A toolbar button of a view. */
export interface ViewAction {
  id: string;
  title: string;
  icon: IconSvgElement;
  /** tooltip, when it says more than the title */
  hint?: string;
  /** hidden from viewers */
  editorsOnly?: boolean;
  disabled?: boolean;
  run: () => void;
}

export interface SidebarView {
  id: ViewId;
  title: string;
  icon: IconSvgElement;
  actions: (ctx: ViewContext) => ViewAction[];
  render: (ctx: ViewContext) => ReactNode;
}

/** The sidebar's views, in activity bar order. A new side feature is one more entry here. */
export const VIEWS: SidebarView[] = [
  {
    id: "files",
    title: "Files",
    icon: Folder01Icon,
    actions: (ctx) => [
      {
        id: "new-file",
        title: "New file",
        hint: "New file (use / for folders)",
        icon: FileAddIcon,
        editorsOnly: true,
        run: () => ctx.fileTree.startCreate("create"),
      },
      {
        id: "new-folder",
        title: "New folder",
        icon: FolderAddIcon,
        editorsOnly: true,
        run: () => ctx.fileTree.startCreate("create-folder"),
      },
      {
        id: "upload",
        title: "Upload files",
        hint: "Upload files or a .zip (or drop them here)",
        icon: Upload04Icon,
        editorsOnly: true,
        disabled: ctx.upload.busy,
        run: () => ctx.fileTree.pickFiles(),
      },
      {
        id: "download-zip",
        title: "Download as ZIP",
        hint: "Download project as .zip",
        icon: Download04Icon,
        disabled: ctx.project.files.length === 0,
        run: ctx.downloadZip,
      },
    ],
    render: (ctx) => (
      <FileTree
        ref={ctx.fileTree.ref}
        project={ctx.project}
        upload={ctx.upload}
        readOnly={ctx.readOnly}
        activeId={ctx.activeId}
        peers={ctx.peers}
        onOpen={ctx.openFile}
        className="min-h-0 flex-1"
      />
    ),
  },
  {
    id: "outline",
    title: "Outline",
    icon: LeftToRightListBulletIcon,
    actions: () => [],
    render: (ctx) => (
      <OutlineView session={ctx.session} files={ctx.project.files} openAt={ctx.openAt} />
    ),
  },
  {
    id: "search",
    title: "Search",
    icon: Search01Icon,
    actions: () => [],
    render: (ctx) => (
      <SearchView
        session={ctx.session}
        query={ctx.searchQuery}
        onQueryChange={ctx.setSearchQuery}
        openAt={ctx.openAt}
      />
    ),
  },
];

export function viewById(id: ViewId): SidebarView {
  return VIEWS.find((v) => v.id === id) ?? VIEWS[0];
}

/** The view's actions the current member may use. */
export function actionsFor(view: SidebarView, ctx: ViewContext) {
  return view.actions(ctx).filter((a) => !(a.editorsOnly && ctx.readOnly));
}
