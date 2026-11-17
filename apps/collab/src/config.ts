import * as z from "zod";

try {
  process.loadEnvFile();
} catch {
  throw Error("Can't load .env file!");
}

const Env = z.object({
  HOST: z.string().default("127.0.0.1"),
  PORT: z.coerce.number().int().positive().default(1234),
  // comma separated, extra allowed origins besides same-origin;
  // browsers send Origin on WS upgrade, reject others (CSWSH)
  WEB_ORIGIN: z
    .string()
    .default("http://localhost:5173,http://127.0.0.1:5173")
    .transform((v) => v.split(",").map((o) => o.trim())),
  PUBLIC_URL: z.url().default("http://localhost:5173"),
  DATABASE_URL: z.url(),
  VALKEY_URL: z.url().default("valkey://127.0.0.1:6379"),
  // same secret as the API: collab validates the API's session cookies
  BETTER_AUTH_SECRET: z.string().min(32),
  // internal HTTP server for the API (project snapshots); never expose it publicly
  INTERNAL_HOST: z.string().default("127.0.0.1"),
  INTERNAL_PORT: z.coerce.number().int().positive().default(1235),
  INTERNAL_SECRET: z.string().min(32),
});

const parsed = Env.safeParse(process.env);
if (!parsed.success) {
  console.error(`Invalid environment:\n${z.prettifyError(parsed.error)}`);
  process.exit(1);
}

export const env = parsed.data;
