import { COMPILE_QUEUE, type CompileJobData, type CompileResult } from "@backslash/shared";
import { Queue, QueueEvents } from "bullmq";
import { valkey } from "../../lib/valkey.ts";

export const compileQueue = new Queue<CompileJobData, CompileResult, "compile">(COMPILE_QUEUE, {
  connection: valkey,
  defaultJobOptions: {
    attempts: 1,
    removeOnComplete: { age: 3600 },
    removeOnFail: { age: 3600 },
  },
});

export const compileQueueEvents = new QueueEvents(COMPILE_QUEUE, {
  connection: valkey.duplicate(),
});

export async function closeCompileQueue() {
  return valkey.quit();
}
