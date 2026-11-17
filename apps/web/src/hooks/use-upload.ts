import {
  extension,
  FilePath,
  findPathConflict,
  isTextPath,
  MAX_BLOB_SIZE,
  MAX_FILE_SIZE,
  MAX_FILES,
  sanitizePath,
} from "@backslash/shared";
import type { FileContent } from "@backslash/shared/doc";
import { useRef, useState } from "react";
import type { ProjectFiles } from "@/hooks/use-project-files";
import { uploadBlob } from "@/lib/api";
import { formatSize } from "@/lib/mime";
import { fromZip, isIgnored, type RawUpload } from "@/lib/upload-sources";

type Item = { path: string; data: Blob };

const PARALLEL = 4;

/** Text files become collaborative text, unless they aren't valid UTF-8 (then a blob). */
async function toContent(projectId: string, { path, data }: Item): Promise<FileContent> {
  if (isTextPath(path) && data.size <= MAX_FILE_SIZE) {
    try {
      const text = new TextDecoder("utf-8", { fatal: true }).decode(await data.arrayBuffer());
      return { text };
    } catch {
      // not UTF-8 (e.g. latin-1 .tex), keep the bytes as they are
    }
  }
  if (data.size > MAX_BLOB_SIZE) {
    throw new Error(`too large (${formatSize(data.size)}, max ${formatSize(MAX_BLOB_SIZE)})`);
  }
  return uploadBlob(projectId, data);
}

async function mapLimit<T>(items: T[], limit: number, fn: (item: T) => Promise<void>) {
  const queue = [...items];
  const workers = Array.from({ length: Math.min(limit, queue.length) }, async () => {
    for (let item = queue.shift(); item; item = queue.shift()) await fn(item);
  });
  await Promise.all(workers);
}

/**
 * Uploads files into the project: text files go into the Yjs doc, the rest into the blob store.
 * Zips are extracted. Existing files at the same path are replaced after confirmation.
 */
const message = (err: unknown) => (err instanceof Error ? err.message : String(err));

/** Turns dropped/picked files into validated items; problems go into `failed`. */
async function prepare(raw: RawUpload[], dir: string, existing: Set<string>, failed: string[]) {
  const expanded: RawUpload[] = [];
  for (const r of raw) {
    if (extension(r.path) !== "zip") {
      expanded.push(r);
      continue;
    }
    try {
      expanded.push(...(await fromZip(r.data)));
    } catch (err) {
      failed.push(`${r.path}: ${message(err)}`);
    }
  }

  // sanitize, last one wins for duplicate paths
  const byPath = new Map<string, Item>();
  for (const r of expanded.filter((r) => !isIgnored(r.path))) {
    const path = sanitizePath(dir ? `${dir}/${r.path}` : r.path);
    byPath.set(path, { path, data: r.data });
  }

  // validate against the project plus what this upload adds before it
  const taken = [...existing];
  const items: Item[] = [];
  for (const item of byPath.values()) {
    if (!existing.has(item.path)) {
      const error = !FilePath.safeParse(item.path).success
        ? "invalid name"
        : findPathConflict([...taken, item.path])
          ? "a file or folder with this name exists"
          : taken.length >= MAX_FILES
            ? `a project can have at most ${MAX_FILES} files`
            : null;
      if (error) {
        failed.push(`${item.path}: ${error}`);
        continue;
      }
      taken.push(item.path);
    }
    items.push(item);
  }
  return items;
}

/**
 * Uploads files into the project: text files go into the Yjs doc, the rest into the blob store.
 * Zips are extracted. Existing files at the same path are replaced after confirmation.
 * One upload at a time.
 */
export function useUpload(
  projectId: string,
  project: ProjectFiles,
  onUploaded?: (fileId: string) => void,
) {
  const [pending, setPending] = useState<{ items: Item[]; replacing: string[] } | null>(null);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  // ref, not state: must block a second start() before the next render
  const busy = useRef(false);
  const [isBusy, setIsBusy] = useState(false);

  const report = (...messages: string[]) =>
    messages.length > 0 && setErrors((e) => [...e, ...messages]);

  function setBusy(value: boolean) {
    busy.current = value;
    setIsBusy(value);
  }

  async function commit(items: Item[]) {
    setPending(null);
    setProgress({ done: 0, total: items.length });
    const failed: string[] = [];
    const ids: string[] = [];
    try {
      await mapLimit(items, PARALLEL, async (item) => {
        try {
          const content = await toContent(projectId, item);
          ids.push(project.upsert(item.path, content));
        } catch (err) {
          failed.push(`${item.path}: ${message(err)}`);
        }
        setProgress((p) => p && { ...p, done: p.done + 1 });
      });
    } finally {
      setProgress(null);
      setBusy(false);
      report(...failed);
    }
    if (ids.length === 1 && items.length === 1) onUploaded?.(ids[0]!);
  }

  /** `dir` is the target folder ("" for the root). */
  async function start(raw: RawUpload[], dir: string) {
    if (busy.current) {
      report("Another upload is in progress");
      return;
    }
    setBusy(true);
    setErrors([]);
    const failed: string[] = [];
    try {
      const existing = new Set(project.current().map((f) => f.path));
      const items = await prepare(raw, dir, existing, failed);
      report(...failed);
      const replacing = items.filter((i) => existing.has(i.path)).map((i) => i.path);
      if (replacing.length > 0) {
        // stays busy until confirm/cancel
        setPending({ items, replacing });
        return;
      }
      if (items.length > 0) {
        await commit(items);
        return;
      }
    } catch (err) {
      report(`Upload failed: ${message(err)}`);
    }
    setBusy(false);
  }

  return {
    start,
    busy: isBusy,
    /** files that would be overwritten; call confirm() or cancel() */
    replacing: pending?.replacing ?? null,
    confirm: () => pending && void commit(pending.items),
    cancel: () => {
      setPending(null);
      setBusy(false);
    },
    progress,
    errors,
    dismissErrors: () => setErrors([]),
    /** show an error in the same place as upload errors */
    report: (msg: string) => report(msg),
  };
}
