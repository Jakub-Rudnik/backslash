import type { CompileJobData, CompileRequest, CompileResult } from "@backslash/shared";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import type { Queue, QueueEvents } from "bullmq";

export class CompileTimeoutError extends Error {}

export type CompileResponse = CompileResult & { jobId: string };

/** Runs compiles and knows which project a job (and its PDF) belongs to. */
export type CompileBackend = {
  run(projectId: string, request: CompileRequest): Promise<CompileResponse>;
  /** project of a finished job, null if unknown or expired */
  projectOf(jobId: string): Promise<string | null>;
  pdfPath(jobId: string): string;
};

const WAIT_MS = 60_000;

export function queueBackend(
  queue: Queue<CompileJobData, CompileResult, "compile">,
  events: QueueEvents,
  compileDir: string,
): CompileBackend {
  return {
    async run(projectId, request) {
      const jobId = randomUUID();
      const job = await queue.add("compile", { ...request, projectId }, { jobId });
      try {
        const result = await job.waitUntilFinished(events, WAIT_MS);
        return { jobId, ...result };
      } catch (err) {
        const state = await job.getState();
        if (state === "waiting") await job.remove().catch(() => {});
        if (state === "waiting" || state === "active") throw new CompileTimeoutError();
        throw err;
      }
    },
    async projectOf(jobId) {
      const job = await queue.getJob(jobId);
      return job?.data.projectId ?? null;
    },
    pdfPath: (jobId) => join(compileDir, jobId, "output.pdf"),
  };
}
