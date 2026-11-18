import { resolve } from "node:path";
import * as z from "zod";

if (process.env.NODE_ENV !== "production") {
  try {
    process.loadEnvFile();
  } catch {
    throw Error("Can't load .env file!");
  }
}

const list = (v: string) =>
  v
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean);

const Env = z
  .object({
    HOST: z.string().default("127.0.0.1"),
    PORT: z.coerce.number().int().positive().default(3000),
    TRUST_PROXY: z.string().default("loopback"),
    VALKEY_URL: z.url().default("valkey://127.0.0.1:6379"),
    DATABASE_URL: z.url(),
    /** public URL of the web app (OAuth callbacks, auth cookies) */
    PUBLIC_URL: z.url().default("http://localhost:5173"),
    WEB_ORIGIN: z.string().default("").transform(list),
    BETTER_AUTH_SECRET: z.string().min(32, "generate one: openssl rand -base64 32"),
    GITHUB_CLIENT_ID: z.string().optional(),
    GITHUB_CLIENT_SECRET: z.string().optional(),
    /** collab's internal HTTP server (project snapshots for compiling) */
    COLLAB_INTERNAL_URL: z.url().default("http://127.0.0.1:1235"),
    INTERNAL_SECRET: z.string().min(32, "generate one: openssl rand -base64 32"),
    COMPILE_DIR: z
      .string()
      .default("../../.data/compiles")
      .transform((p) => resolve(p)),
    BLOB_DIR: z
      .string()
      .default("../../.data/blobs")
      .transform((p) => resolve(p)),
    /** smtp(s)://user:password@host:port; password reset is off without it */
    SMTP_URL: z.url().or(z.literal("")).optional(),
    MAIL_FROM: z.string().default("backslash <no-reply@localhost>"),
    MAX_PROJECTS_PER_USER: z.coerce.number().int().positive().default(100),
    /** uploaded files across all projects a user owns */
    MAX_STORAGE_PER_USER_MB: z.coerce.number().int().positive().default(1024),
  })
  .refine((e) => !e.GITHUB_CLIENT_ID === !e.GITHUB_CLIENT_SECRET, {
    message: "Set both GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET, or neither",
  });

const parsed = Env.safeParse(process.env);
if (!parsed.success) {
  console.error(`Invalid environment:\n${z.prettifyError(parsed.error)}`);
  process.exit(1);
}

export const env = parsed.data;
