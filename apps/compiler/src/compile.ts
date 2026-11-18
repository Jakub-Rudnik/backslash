import { ProjectId, type CompileJobData, type CompileResult } from "@backslash/shared";
import { copyFile, mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { dirname, join, resolve, sep } from "node:path";
import { saveCache } from "./cache.ts";
import { env } from "./config.ts";
import { parseLog } from "./parse-log.ts";
import { INPUT_TOO_LARGE, OUTPUT, OUTPUT_FAILED, runLatexmk, type LatexmkRun } from "./sandbox.ts";

const MAX_LOG_LENGTH = 200_000;

async function exists(path: string) {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

class MissingBlobError extends Error {
  constructor(readonly path: string) {
    super(`Uploaded file missing on server: ${path}`);
  }
}

/** Writes project files into `dir`; paths are validated upstream, re-checked here (path traversal). */
async function writeFiles(dir: string, files: CompileJobData["files"]) {
  for (const file of files) {
    const target = resolve(dir, file.path);
    if (!target.startsWith(dir + sep)) throw new Error(`Invalid path: ${file.path}`);
    await mkdir(dirname(target), { recursive: true });
    if ("content" in file) {
      await writeFile(target, file.content);
    } else {
      await copyFile(join(env.BLOB_DIR, file.hash), target).catch((err: NodeJS.ErrnoException) => {
        throw err.code === "ENOENT" ? new MissingBlobError(file.path) : err;
      });
    }
  }
}

export async function compileJob(
  jobId: string,
  { files, mainFile, projectId }: CompileJobData,
): Promise<CompileResult> {
  const outputDir = resolve(env.COMPILE_DIR, jobId);
  const inputDir = `${outputDir}.input`;
  const cacheDir = resolve(env.CACHE_DIR, ProjectId.parse(projectId));
  await mkdir(outputDir, { recursive: true });
  try {
    await mkdir(inputDir, { recursive: true });
    await writeFiles(inputDir, files);
    const run = await runLatexmk(inputDir, cacheDir, outputDir, mainFile, env.COMPILE_TIMEOUT_MS);
    const result = await readResult(outputDir, files, run);
    await updateCache(result, outputDir, cacheDir, files, jobId);
    return result;
  } catch (err) {
    if (!(err instanceof MissingBlobError)) throw err;
    return {
      status: "error",
      log: "",
      errors: [{ file: err.path, line: null, message: err.message }],
    };
  } finally {
    await rm(inputDir, { recursive: true, force: true });
  }
}

/** A failed build may have left broken files (.aux), so the next one starts clean. */
async function updateCache(
  result: CompileResult,
  outputDir: string,
  cacheDir: string,
  files: CompileJobData["files"],
  jobId: string,
) {
  try {
    if (result.status === "success") {
      await saveCache(outputDir, cacheDir, new Set(files.map((f) => f.path)), jobId);
    } else {
      await rm(cacheDir, { recursive: true, force: true });
    }
  } catch (err) {
    console.error(`build cache update failed for job ${jobId}:`, err);
  }
}

async function readResult(
  outputDir: string,
  files: CompileJobData["files"],
  run: LatexmkRun,
): Promise<CompileResult> {
  const texLog = await readFile(join(outputDir, `${OUTPUT}.log`), "utf8").catch(() => null);
  const log = (texLog ?? run.output).slice(0, MAX_LOG_LENGTH);
  const fail = (message: string): CompileResult => ({
    status: "error",
    log,
    errors: [{ file: null, line: null, message }],
  });

  if (run.timedOut) return fail("Compilation timed out");
  if (run.code === INPUT_TOO_LARGE) return fail("Project is too large to compile");
  if (run.code === OUTPUT_FAILED) return fail("Couldn't save the build output");

  const projectFiles = new Set(files.map((f) => f.path));
  const errors = texLog ? parseLog(texLog, projectFiles) : [];
  const hasPdf = await exists(join(outputDir, `${OUTPUT}.pdf`));

  if (run.code === 0 && hasPdf) return { status: "success", log, errors };
  return errors.length > 0 ? { status: "error", log, errors } : fail("Compilation failed");
}
