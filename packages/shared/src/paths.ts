import * as z from "zod";

const MAX_PATH_LENGTH = 255;
// no spaces/unicode: LaTeX \input and friends choke on them
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

export { FilePath, findPathConflict, isTexFile, MAX_PATH_LENGTH, resolvePathConflicts };
