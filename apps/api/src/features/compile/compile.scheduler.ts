import type { CompileRequest, SharedBuild } from "@backslash/shared";
import type { FastifyBaseLogger } from "fastify";
import { CompileTimeoutError, type CompileBackend } from "./compile.backend.ts";
import { CompileInputError } from "./compile.service.ts";

export type SchedulerDeps = {
  /** next compile number of the project, null when the project doesn't exist */
  nextSeq: (projectId: string) => Promise<number | null>;
  prepare: (projectId: string) => Promise<CompileRequest>;
  backend: CompileBackend;
  publish: (projectId: string, build: SharedBuild) => Promise<void>;
  log: FastifyBaseLogger;
};

type Pending = { seq: Promise<number | null>; by: string };
type ProjectQueue = { pending: Pending | null };

/**
 * Runs at most one compile per project and keeps at most one more waiting. Requests made while
 * a compile runs join the waiting one, which snapshots the project only when it starts, so it
 * includes everyone's edits. Results are written to the doc in compile order.
 */
export function compileScheduler({ nextSeq, prepare, backend, publish, log }: SchedulerDeps) {
  const queues = new Map<string, ProjectQueue>();

  async function compile(projectId: string, seq: number, by: string) {
    const at = Date.now();
    const fail = (message: string): SharedBuild => ({
      seq,
      jobId: null,
      status: "error",
      errors: [{ file: null, line: null, message }],
      by,
      at,
    });

    let build: SharedBuild;
    try {
      const result = await backend.run(projectId, await prepare(projectId));
      build = { seq, jobId: result.jobId, status: result.status, errors: result.errors, by, at };
    } catch (err) {
      if (err instanceof CompileInputError) build = fail(err.message);
      else if (err instanceof CompileTimeoutError) build = fail("Compilation timed out");
      else {
        log.error({ err, projectId }, "compile failed");
        build = fail("Compilation failed");
      }
    }

    try {
      await publish(projectId, build);
    } catch (err) {
      log.error({ err, projectId }, "publishing compile result failed");
    }
  }

  async function drain(projectId: string, queue: ProjectQueue) {
    while (queue.pending) {
      const { seq, by } = queue.pending;
      queue.pending = null;
      const number = await seq.catch((err: unknown) => {
        log.error({ err, projectId }, "compile number failed");
        return null;
      });
      if (number !== null) await compile(projectId, number, by);
    }
    queues.delete(projectId);
  }

  return {
    /** Resolves to the number of the compile that will include the project's current state. */
    request(projectId: string, by: string): Promise<number | null> {
      let queue = queues.get(projectId);
      if (queue?.pending) return queue.pending.seq;

      const pending = { seq: nextSeq(projectId), by };
      if (queue) {
        queue.pending = pending;
      } else {
        queue = { pending };
        queues.set(projectId, queue);
        void drain(projectId, queue);
      }
      return pending.seq;
    },
  };
}
