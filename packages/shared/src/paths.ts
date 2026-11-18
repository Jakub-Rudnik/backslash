import * as z from "zod";

const MAX_PATH_LENGTH = 255;
const SEGMENT = /^[A-Za-z0-9_-][A-Za-z0-9._-]*$/;

/** Relative, normalized project path: "main.tex", "chapters/intro.tex". No "..", no dotfiles. */
const FilePath = z
  .string()
  .min(1)
  .max(MAX_PATH_LENGTH)
  .refine((p) => p.split("/").every((s) => SEGMENT.test(s)), { error: "Invalid file path" });

type FilePath = z.infer<typeof FilePath>;

function parentDirs(path: string): string[] {
  const segs = path.split("/");
  return segs.slice(1).map((_, i) => segs.slice(0, i + 1).join("/"));
}

/** Tracks taken paths; a path clashes with an existing file, an existing dir, or has a file as an ancestor. */
class PathSet {
  private files = new Set<string>();
  private dirs = new Set<string>();

  /** index of the first clashing segment, or -1 */
  clash(path: string): number {
    const dirs = parentDirs(path);
    const fileAncestor = dirs.findIndex((d) => this.files.has(d));
    if (fileAncestor !== -1) return fileAncestor;
    if (this.files.has(path) || this.dirs.has(path)) return dirs.length;
    return -1;
  }

  add(path: string) {
    this.files.add(path);
    for (const d of parentDirs(path)) this.dirs.add(d);
  }
}

function withSuffix(segment: string, n: number, isFile: boolean) {
  const dot = isFile ? segment.lastIndexOf(".") : -1;
  return dot > 0 ? `${segment.slice(0, dot)}-${n}${segment.slice(dot)}` : `${segment}-${n}`;
}

/**
 * Concurrent edits can produce duplicate paths (two people create "intro.tex"),
 * or a file and a folder with the same name. Resolve deterministically, so every
 * client and every compile sees the same tree: lower id wins, the loser gets a "-2" suffix
 * on the clashing segment.
 */
function resolvePathConflicts<T extends { id: string; path: string }>(files: T[]): T[] {
  const taken = new PathSet();
  const sorted = files.toSorted((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return sorted.map((file) => {
    let path = file.path;
    for (let n = 2, at = taken.clash(path); at !== -1; n++, at = taken.clash(path)) {
      const segs = file.path.split("/");
      segs[at] = withSuffix(segs[at]!, n, at === segs.length - 1);
      path = segs.join("/");
    }
    taken.add(path);
    return path === file.path ? file : { ...file, path };
  });
}

/** First path clashing with an earlier one, or null. */
function findPathConflict(paths: string[]): string | null {
  const taken = new PathSet();
  for (const p of paths) {
    if (taken.clash(p) !== -1) return p;
    taken.add(p);
  }
  return null;
}

function isTexFile(path: string) {
  return path.endsWith(".tex");
}

function extension(path: string) {
  const name = path.slice(path.lastIndexOf("/") + 1);
  const dot = name.lastIndexOf(".");
  return dot > 0 ? name.slice(dot + 1).toLowerCase() : "";
}

const TEXT_EXTENSIONS = new Set([
  ...["tex", "ltx", "sty", "cls", "clo", "dtx", "ins", "def", "cfg", "fd"],
  ...["bib", "bst", "bbx", "cbx", "lbx", "dbx"],
  ...["txt", "md", "csv", "tsv", "dat", "tikz", "pgf", "lua", "asy", "gnuplot"],
]);

/** Whether a file with this path is edited as text (vs. stored as a binary blob). */
function isTextPath(path: string) {
  return TEXT_EXTENSIONS.has(extension(path));
}

/**
 * Turns an arbitrary file name (e.g. "Wykres 1 (końcowy).PNG") into a valid path segment
 * ("Wykres-1-koncowy.PNG"): strips accents, replaces anything else invalid with "-".
 */
function sanitizeSegment(name: string) {
  const clean = name
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ł/g, "l")
    .replace(/Ł/g, "L")
    .replace(/[^A-Za-z0-9._-]+/g, "-")
    .replace(/-+(?=\.)/g, "")
    .replace(/^[.-]+|-+$/g, "");
  return clean || "file";
}

const MAX_EXTENSION = 16;
const MIN_NAME = 32;

/** Fits a path into MAX_PATH_LENGTH: shortens the file name (keeping its extension), drops folders if needed. */
function shortenPath(segs: string[]) {
  const path = segs.join("/");
  if (path.length <= MAX_PATH_LENGTH) return path;
  const name = segs.at(-1)!;
  const dirs = segs.slice(0, -1).join("/");
  const prefix = dirs && dirs.length + 1 + MIN_NAME <= MAX_PATH_LENGTH ? `${dirs}/` : "";
  const dot = name.lastIndexOf(".");
  const ext = dot > 0 && name.length - dot <= MAX_EXTENSION ? name.slice(dot) : "";
  const stem = name.slice(0, name.length - ext.length);
  return prefix + stem.slice(0, MAX_PATH_LENGTH - prefix.length - ext.length) + ext;
}

/** Sanitizes every segment of a "/"-separated path; empty segments are dropped. */
function sanitizePath(path: string) {
  const segs = path
    .split("/")
    .filter((s) => s && s !== "." && s !== "..")
    .map(sanitizeSegment);
  return shortenPath(segs.length > 0 ? segs : ["file"]);
}

export {
  extension,
  FilePath,
  findPathConflict,
  isTexFile,
  isTextPath,
  MAX_PATH_LENGTH,
  resolvePathConflicts,
  sanitizePath,
};
