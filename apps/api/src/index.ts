import { createDb, runMigrations } from "@backslash/db";
import { createAuth } from "@backslash/db/auth";
import { buildApp } from "./app.ts";
import { env } from "./config.ts";
import { valkeyEvents } from "./lib/events.ts";
import { valkey } from "./lib/valkey.ts";
import { queueBackend } from "./features/compile/compile.backend.ts";
import { compileQueue, compileQueueEvents } from "./features/compile/compile.queue.ts";
import { collabBuilds, collabSnapshots } from "./features/compile/collab.client.ts";

const { db, pool } = createDb(env.DATABASE_URL);
await runMigrations(pool);

const github =
  env.GITHUB_CLIENT_ID && env.GITHUB_CLIENT_SECRET
    ? { clientId: env.GITHUB_CLIENT_ID, clientSecret: env.GITHUB_CLIENT_SECRET }
    : undefined;

const app = buildApp({
  db,
  auth: createAuth({
    db,
    secret: env.BETTER_AUTH_SECRET,
    baseURL: env.PUBLIC_URL,
    trustedOrigins: [env.PUBLIC_URL, ...env.WEB_ORIGIN],
    github,
  }),
  events: valkeyEvents(valkey),
  compile: queueBackend(compileQueue, compileQueueEvents, env.COMPILE_DIR),
  snapshots: collabSnapshots(env.COLLAB_INTERNAL_URL, env.INTERNAL_SECRET),
  publishBuild: collabBuilds(env.COLLAB_INTERNAL_URL, env.INTERNAL_SECRET),
  blobDir: env.BLOB_DIR,
  trustedOrigins: [env.PUBLIC_URL, ...env.WEB_ORIGIN],
  config: { github: github !== undefined },
  logger: true,
  trustProxy: env.TRUST_PROXY,
});

app.listen({ port: env.PORT }, (err) => {
  if (err) {
    app.log.error(err);
    process.exit(1);
  }
});

async function shutdown() {
  await app.close();
  await pool.end();
  await valkey.quit();
  process.exit(0);
}

process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);
