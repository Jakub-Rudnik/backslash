import { resolve } from "node:path";
import * as z from "zod";

try {
  process.loadEnvFile();
} catch {
  throw Error("Can't load .env file!");
}

const Env = z.object({
  VALKEY_URL: z.url().default("valkey://127.0.0.1:6379"),
  CONCURRENCY: z.coerce.number().int().min(1).max(32).default(2),
  // keep below the API wait (60s) so the API gets a result instead of a timeout
  COMPILE_TIMEOUT_MS: z.coerce.number().int().min(1000).max(55_000).default(30_000),
  COMPILE_DIR: z
    .string()
    .default("../../.data/compiles")
    .transform((p) => resolve(p)),
  // how long compile dirs (and PDFs) are kept; matches queue removeOnComplete
  COMPILE_TTL_MS: z.coerce.number().int().positive().default(3_600_000),
});

const parsed = Env.safeParse(process.env);
if (!parsed.success) {
  console.error(`Invalid environment:\n${z.prettifyError(parsed.error)}`);
  process.exit(1);
}

export const env = parsed.data;
