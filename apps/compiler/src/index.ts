import { COMPILE_QUEUE, type CompileJobData, type CompileResult } from "@backslash/shared";
import { Worker } from "bullmq";
import { mkdir } from "node:fs/promises";
import { cleanupOldCompiles } from "./cleanup.ts";
import { compileJob } from "./compile.ts";
import { env } from "./config.ts";
import { valkey } from "./lib/valkey.ts";
import { checkSandbox } from "./sandbox.ts";

await checkSandbox();
await mkdir(env.COMPILE_DIR, { recursive: true });
await mkdir(env.CACHE_DIR, { recursive: true });

const worker = new Worker<CompileJobData, CompileResult, "compile">(
  COMPILE_QUEUE,
  (job) => compileJob(job.id!, job.data),
  { connection: valkey, concurrency: env.CONCURRENCY },
);

worker.on("completed", (job, result) => {
  console.log(`job ${job.id} ${result.status}`);
});
worker.on("failed", (job, err) => {
  console.error(`job ${job?.id} failed:`, err);
});
worker.on("error", (err) => {
  console.error("worker error:", err);
});

const CACHE_TTL_MS = 15 * 60_000;

const runCleanup = () =>
  Promise.all([
    cleanupOldCompiles(env.COMPILE_DIR, env.COMPILE_TTL_MS),
    cleanupOldCompiles(env.CACHE_DIR, CACHE_TTL_MS),
  ]).catch((err) => console.error("cleanup failed:", err));
await runCleanup();
const cleanupTimer = setInterval(runCleanup, 5 * 60_000);

console.log(`compiler worker listening on "${COMPILE_QUEUE}" (concurrency ${env.CONCURRENCY})`);

async function shutdown() {
  clearInterval(cleanupTimer);
  await worker.close();
  await valkey.quit();
  process.exit(0);
}

process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);
