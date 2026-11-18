import {
  createFile,
  deleteFile,
  deleteFolder,
  filesMap,
  getMainFile,
  isFileTreeChange,
  listFiles,
  projectMap,
  renameFile,
  renameFolder,
  setMainFile,
  upsertFile,
  validateFolderRename,
  validatePath,
  type DocFile,
  type FileContent,
} from "@backslash/shared/doc";
import { useEffect, useMemo, useState } from "react";
import type { CollabSession } from "@/features/editor/use-collab";

type FilesState = { files: DocFile[]; mainId: string | null };

const EMPTY: FilesState = { files: [], mainId: null };

function read(session: CollabSession): FilesState {
  const files = listFiles(session.doc);
  return { files, mainId: getMainFile(session.doc, files)?.id ?? null };
}

/** File tree of the project doc; re-renders on add/remove/rename, not on text edits. */
export function useProjectFiles(session: CollabSession | null) {
  const [state, setState] = useState<FilesState>(EMPTY);

  useEffect(() => {
    if (!session) return;
    const files = filesMap(session.doc);
    const project = projectMap(session.doc);
    const update = () => setState(read(session));
    const onFiles = (events: Parameters<Parameters<typeof files.observeDeep>[0]>[0]) => {
      if (isFileTreeChange(events)) update();
    };
    update();
    files.observeDeep(onFiles);
    project.observe(update);
    return () => {
      files.unobserveDeep(onFiles);
      project.unobserve(update);
      setState(EMPTY);
    };
  }, [session]);

  const actions = useMemo(() => {
    const doc = () => {
      if (!session) throw new Error("Not connected");
      return session.doc;
    };
    return {
      validatePath: (path: string, ignoreId?: string) => validatePath(doc(), path, ignoreId),
      validateFolderRename: (from: string, to: string) => validateFolderRename(doc(), from, to),
      create: (path: string, content?: string) => createFile(doc(), path, content),
      upsert: (path: string, content: FileContent) => upsertFile(doc(), path, content),
      /** current (not render-time) list, for multi-step actions like uploads */
      current: () => listFiles(doc()),
      rename: (id: string, path: string) => renameFile(doc(), id, path),
      remove: (id: string) => deleteFile(doc(), id),
      renameFolder: (from: string, to: string) => renameFolder(doc(), from, to),
      removeFolder: (dir: string) => deleteFolder(doc(), dir),
      setMain: (id: string) => setMainFile(doc(), id),
    };
  }, [session]);

  return { ...state, ...actions };
}

export type ProjectFiles = ReturnType<typeof useProjectFiles>;
