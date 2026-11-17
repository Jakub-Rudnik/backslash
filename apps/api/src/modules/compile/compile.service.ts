import type { CompileRequest } from "@backslash/shared";
import { randomUUID } from "node:crypto";
import { compileQueue, compileQueueEvents } from "./compile.queue.ts";
import { join } from "node:path";
import { env } from "../../config.ts";
import { blobExists } from "../blobs/blob.store.ts";

export class CompileTimeoutError extends Error {}

export class MissingBlobError extends Error {}

export async function compile(request: CompileRequest) {
  // fail fast with a clear message instead of a LaTeX "file not found"
  for (const file of request.files) {
    if ("hash" in file && !(await blobExists(env.BLOB_DIR, file.hash))) {
      throw new MissingBlobError(`Uploaded file missing on server: ${file.path}`);
    }
  }

  const jobId = randomUUID();
  const job = await compileQueue.add("compile", request, { jobId });

  try {
    const result = await job.waitUntilFinished(compileQueueEvents, 60_000);
    return { jobId, ...result };
  } catch (err) {
    const state = await job.getState();
    if (state === "waiting" || state === "active") {
      throw new CompileTimeoutError();
    }
    throw err;
  }
}

export function getPdfpath(jobId: string) {
  return join(env.COMPILE_DIR, jobId, "output.pdf");
}
