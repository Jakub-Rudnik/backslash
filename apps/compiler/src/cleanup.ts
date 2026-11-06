import { readdir, rm, stat } from "node:fs/promises";
import { join } from "node:path";

/** Removes job dirs older than ttlMs. */
export async function cleanupOldCompiles(root: string, ttlMs: number) {
  const entries = await readdir(root, { withFileTypes: true }).catch(() => []);
  const cutoff = Date.now() - ttlMs;

  await Promise.all(
    entries
      .filter((e) => e.isDirectory())
      .map(async (e) => {
        const path = join(root, e.name);
        const { mtimeMs } = await stat(path);
        if (mtimeMs < cutoff) await rm(path, { recursive: true, force: true });
      }),
  );
}
