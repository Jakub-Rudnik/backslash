import type { CompileRequest } from "@backslash/shared";
import { randomUUID } from "node:crypto";
import { compileQueue, compileQueueEvents } from "./compile.queue.ts";
import { join } from "node:path";
import { env } from "../../config.ts";

export class CompileTimeoutError extends Error {}

export async function compile(request: CompileRequest) {
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
