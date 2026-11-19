import { MAX_BLOB_SIZE, MAX_FILES } from "@backslash/shared";
import { unzip } from "fflate";

/** A file to upload; `path` is relative to the target folder and not sanitized yet. */
export type RawUpload = { path: string; data: Blob };

const IGNORED = /(^|\/)(__MACOSX|\.DS_Store|Thumbs\.db|desktop\.ini)(\/|$)|(^|\/)\./;
const MAX_ZIP_TOTAL = 100 * 1024 * 1024;

export function isIgnored(path: string) {
  return IGNORED.test(path);
}

export function fromFileList(files: FileList | File[]): RawUpload[] {
  return [...files].map((f) => ({ path: f.name, data: f }));
}

async function readEntry(entry: FileSystemEntry, prefix: string): Promise<RawUpload[]> {
  if (entry instanceof FileSystemFileEntry) {
    const file = await new Promise<File>((resolve, reject) => entry.file(resolve, reject));
    return [{ path: prefix + entry.name, data: file }];
  }
  if (!(entry instanceof FileSystemDirectoryEntry)) return [];
  const reader = entry.createReader();
  const children: FileSystemEntry[] = [];
  for (;;) {
    const batch = await new Promise<FileSystemEntry[]>((resolve, reject) =>
      reader.readEntries(resolve, reject),
    );
    if (batch.length === 0) break;
    children.push(...batch);
  }
  const nested = await Promise.all(children.map((c) => readEntry(c, `${prefix}${entry.name}/`)));
  return nested.flat();
}

/** Files and folders from a drop. Must be called synchronously in the drop handler. */
export function fromDataTransfer(dt: DataTransfer): Promise<RawUpload[]> {
  const entries = [...dt.items]
    .map((item) => item.webkitGetAsEntry?.())
    .filter((e): e is FileSystemEntry => !!e);
  if (entries.length === 0) return Promise.resolve(fromFileList(dt.files));
  return Promise.all(entries.map((e) => readEntry(e, ""))).then((r) => r.flat());
}

/** Drops a single top-level folder shared by all entries ("thesis/main.tex" -> "main.tex"). */
function stripCommonRoot(paths: string[]): string[] {
  const roots = new Set(paths.map((p) => (p.includes("/") ? p.slice(0, p.indexOf("/")) : null)));
  const [root] = roots;
  if (roots.size !== 1 || root === null || root === undefined) return paths;
  return paths.map((p) => p.slice(root.length + 1));
}

/** Extracts a .zip, skipping junk and refusing archives that unpack too large. */
export async function fromZip(zip: Blob): Promise<RawUpload[]> {
  const data = new Uint8Array(await zip.arrayBuffer());
  let total = 0;
  let count = 0;
  let tooLarge = false;
  const files = await new Promise<Record<string, Uint8Array>>((resolve, reject) =>
    unzip(
      data,
      {
        filter: (f) => {
          if (f.name.endsWith("/") || isIgnored(f.name)) return false;
          total += f.originalSize;
          count += 1;
          if (f.originalSize > MAX_BLOB_SIZE || total > MAX_ZIP_TOTAL || count > MAX_FILES) {
            tooLarge = true;
            return false;
          }
          return true;
        },
      },
      (err, result) => (err ? reject(err) : resolve(result)),
    ),
  );
  if (tooLarge) throw new Error("ZIP is too large or has too many files");
  const names = Object.keys(files);
  const paths = stripCommonRoot(names);
  return names.map((name, i) => ({
    path: paths[i]!,
    data: new Blob([files[name]!.slice()]),
  }));
}
