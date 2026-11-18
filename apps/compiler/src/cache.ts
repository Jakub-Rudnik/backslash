import { cp, rename, rm } from "node:fs/promises";
import { relative } from "node:path";

/**
 * Replaces the project's build cache with the files a build produced, leaving out the project's
 * own files (a file deleted from the project must not come back from the cache).
 */
export async function saveCache(
  outputDir: string,
  cacheDir: string,
  projectFiles: Set<string>,
  jobId: string,
) {
  const next = `${cacheDir}.${jobId}.next`;
  const old = `${cacheDir}.${jobId}.old`;
  try {
    await cp(outputDir, next, {
      recursive: true,
      filter: (src) => !projectFiles.has(relative(outputDir, src)),
    });
    await rename(cacheDir, old).catch((err: NodeJS.ErrnoException) => {
      if (err.code !== "ENOENT") throw err;
    });
    await rename(next, cacheDir);
  } finally {
    await rm(next, { recursive: true, force: true });
    await rm(old, { recursive: true, force: true });
  }
}
