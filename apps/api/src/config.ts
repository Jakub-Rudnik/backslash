import { resolve } from "node:path";
import * as z from "zod";

try {
  process.loadEnvFile();
} catch {
  throw Error("Can't load .env file!");
}

const Env = z.object({
  PORT: z.coerce.number().int().positive().default(3000),
  VALKEY_URL: z.url().default("valkey://127.0.0.1:6379"),
  WEB_ORIGIN: z.url().default("http://127.0.0.1:5173"),
  COMPILE_DIR: z
    .string()
    .default("../../.data/compiles")
    .transform((p) => resolve(p)),
});

const parsed = Env.safeParse(process.env);
if (!parsed.success) {
  console.error(`Invalid environment:\n${z.prettifyError(parsed.error)}`);
  process.exit(1);
}

export const env = parsed.data;
