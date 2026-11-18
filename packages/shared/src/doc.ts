/**
 * Project structure inside the collab Y.Doc:
 *
 *   files:   Y.Map<fileId, Y.Map{ path: string, content: Y.Text }>       text file
 *                          Y.Map{ path: string, hash: string, size: number } uploaded blob
 *   project: Y.Map{ mainFileId: string }
 *
 * Files are keyed by a stable id (not path), so renames don't recreate the Y.Text
 * and don't lose concurrent edits.
 */
import * as Y from "yjs";
import { BlobHash, MAX_FILES } from "./index.ts";
import { FilePath, findPathConflict, isTexFile, resolvePathConflicts } from "./paths.ts";

const DOC_FILES_FIELD = "files";
const DOC_PROJECT_FIELD = "project";
/** single-file docs from before projects had files */
const LEGACY_TEXT_FIELD = "source";
const DEFAULT_MAIN_FILE = "main.tex";

type DocTextFile = { kind: "text"; id: string; path: string; text: Y.Text };
type DocBlobFile = { kind: "blob"; id: string; path: string; hash: string; size: number };
type DocFile = DocTextFile | DocBlobFile;

function filesMap(doc: Y.Doc) {
  return doc.getMap<Y.Map<unknown>>(DOC_FILES_FIELD);
}

function projectMap(doc: Y.Doc) {
  return doc.getMap<unknown>(DOC_PROJECT_FIELD);
}

function newFileId() {
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

/** All valid files (other clients may write garbage), with path conflicts resolved. */
function listFiles(doc: Y.Doc): DocFile[] {
  const files: DocFile[] = [];
  for (const [id, entry] of filesMap(doc)) {
    if (!(entry instanceof Y.Map)) continue;
    const path = entry.get("path");
    if (typeof path !== "string" || !FilePath.safeParse(path).success) continue;
    const text = entry.get("content");
    const hash = entry.get("hash");
    const size = entry.get("size");
    if (text instanceof Y.Text) {
      files.push({ kind: "text", id, path, text });
    } else if (BlobHash.safeParse(hash).success && typeof size === "number") {
      files.push({ kind: "blob", id, path, hash: hash as string, size });
    }
  }
  return resolvePathConflicts(files);
}

/** The chosen main file, falling back to main.tex or the first .tex file. */
function getMainFile(doc: Y.Doc, files: DocFile[] = listFiles(doc)): DocTextFile | null {
  const tex = files.filter((f): f is DocTextFile => f.kind === "text" && isTexFile(f.path));
  const chosen = projectMap(doc).get("mainFileId");
  return (
    tex.find((f) => f.id === chosen) ??
    tex.find((f) => f.path === DEFAULT_MAIN_FILE) ??
    tex.toSorted((a, b) => a.path.localeCompare(b.path))[0] ??
    null
  );
}

/** Error message if `path` can't be used (invalid or taken), else null. */
function validatePath(doc: Y.Doc, path: string, ignoreId?: string): string | null {
  if (!FilePath.safeParse(path).success) {
    return "Use letters, digits, '.', '_', '-' and '/' only";
  }
  const files = listFiles(doc);
  if (ignoreId === undefined && files.length >= MAX_FILES) {
    return `A project can have at most ${MAX_FILES} files`;
  }
  const others = files.filter((f) => f.id !== ignoreId).map((f) => f.path);
  if (findPathConflict([...others, path]) !== null) return "A file or folder with this name exists";
  return null;
}

function assertPath(doc: Y.Doc, path: string, ignoreId?: string) {
  const error = validatePath(doc, path, ignoreId);
  if (error) throw new Error(error);
}

function createFile(doc: Y.Doc, path: string, content = ""): string {
  assertPath(doc, path);
  const id = newFileId();
  doc.transact(() => {
    const entry = new Y.Map<unknown>();
    filesMap(doc).set(id, entry);
    entry.set("path", path);
    entry.set("content", new Y.Text(content));
  });
  return id;
}

function createBlobFile(doc: Y.Doc, path: string, hash: string, size: number): string {
  assertPath(doc, path);
  const id = newFileId();
  doc.transact(() => {
    const entry = new Y.Map<unknown>();
    filesMap(doc).set(id, entry);
    entry.set("path", path);
    entry.set("hash", hash);
    entry.set("size", size);
  });
  return id;
}

/** Replaces the content of an existing file (re-upload), keeping its id. */
function replaceFile(doc: Y.Doc, id: string, content: FileContent) {
  const entry = filesMap(doc).get(id);
  if (!entry) return;
  doc.transact(() => {
    if ("text" in content) {
      entry.delete("hash");
      entry.delete("size");
      entry.set("content", new Y.Text(content.text));
    } else {
      entry.delete("content");
      entry.set("hash", content.hash);
      entry.set("size", content.size);
    }
  });
}

type FileContent = { text: string } | { hash: string; size: number };

/** Creates the file, or replaces the content of the file at `path` (uploads). Returns its id. */
function upsertFile(doc: Y.Doc, path: string, content: FileContent): string {
  const existing = listFiles(doc).find((f) => f.path === path);
  if (existing) {
    replaceFile(doc, existing.id, content);
    return existing.id;
  }
  return "text" in content
    ? createFile(doc, path, content.text)
    : createBlobFile(doc, path, content.hash, content.size);
}

function renameFile(doc: Y.Doc, id: string, path: string) {
  assertPath(doc, path, id);
  filesMap(doc).get(id)?.set("path", path);
}

function deleteFile(doc: Y.Doc, id: string) {
  filesMap(doc).delete(id);
}

function isInFolder(path: string, dir: string) {
  return path.startsWith(`${dir}/`);
}

/** Error message if folder `from` can't be renamed to `to`, else null. */
function validateFolderRename(doc: Y.Doc, from: string, to: string): string | null {
  if (!FilePath.safeParse(to).success) return "Use letters, digits, '.', '_', '-' and '/' only";
  if (isInFolder(to, from)) return "Can't move a folder into itself";
  const files = listFiles(doc);
  const moved = files.filter((f) => isInFolder(f.path, from));
  const others = files.filter((f) => !isInFolder(f.path, from)).map((f) => f.path);
  const next = moved.map((f) => to + f.path.slice(from.length));
  if (findPathConflict([...others, ...next]) !== null) {
    return "A file or folder with this name exists";
  }
  return null;
}

function renameFolder(doc: Y.Doc, from: string, to: string) {
  const error = validateFolderRename(doc, from, to);
  if (error) throw new Error(error);
  const files = filesMap(doc);
  doc.transact(() => {
    for (const f of listFiles(doc)) {
      if (isInFolder(f.path, from)) files.get(f.id)?.set("path", to + f.path.slice(from.length));
    }
  });
}

function deleteFolder(doc: Y.Doc, dir: string) {
  const files = filesMap(doc);
  doc.transact(() => {
    for (const f of listFiles(doc)) if (isInFolder(f.path, dir)) files.delete(f.id);
  });
}

function setMainFile(doc: Y.Doc, id: string) {
  projectMap(doc).set("mainFileId", id);
}

/**
 * Gives an empty doc a main.tex. Old single-file docs get their text moved into it.
 * Returns true if the doc changed.
 */
function seedProject(doc: Y.Doc, defaultSource: string): boolean {
  if (filesMap(doc).size > 0) return false;
  const legacy = doc.getText(LEGACY_TEXT_FIELD);
  const source = legacy.length > 0 ? legacy.toJSON() : defaultSource;
  doc.transact(() => {
    const id = createFile(doc, DEFAULT_MAIN_FILE, source);
    setMainFile(doc, id);
    legacy.delete(0, legacy.length);
  });
  return true;
}

/**
 * For observeDeep on the files map: true if files were added/removed/renamed/replaced,
 * false for plain text edits (those target a Y.Text, not a Y.Map).
 */
function isFileTreeChange(events: Y.YEvent<Y.AbstractType<unknown>>[]): boolean {
  return events.some((e) => e.target instanceof Y.Map);
}

export {
  createBlobFile,
  createFile,
  DEFAULT_MAIN_FILE,
  deleteFile,
  deleteFolder,
  DOC_FILES_FIELD,
  DOC_PROJECT_FIELD,
  filesMap,
  getMainFile,
  isFileTreeChange,
  LEGACY_TEXT_FIELD,
  listFiles,
  projectMap,
  isInFolder,
  renameFile,
  renameFolder,
  replaceFile,
  seedProject,
  setMainFile,
  upsertFile,
  validateFolderRename,
  validatePath,
};
export type { DocBlobFile, DocFile, DocTextFile, FileContent };
