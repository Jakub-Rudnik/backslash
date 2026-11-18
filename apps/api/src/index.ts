import { createDb, runMigrations } from "@backslash/db";
import { createAuth } from "@backslash/db/auth";
import { buildApp } from "./app.ts";
import { env } from "./config.ts";
import { valkeyEvents } from "./lib/events.ts";
import { smtpMailer } from "./lib/mailer.ts";
import { resetPasswordMail } from "./features/auth/auth.mails.ts";
import { valkeyRateLimits } from "./lib/rate-limit.ts";
import { valkey } from "./lib/valkey.ts";
import { queueBackend } from "./features/compile/compile.backend.ts";
import { compileQueue, compileQueueEvents } from "./features/compile/compile.queue.ts";
import { collabBuilds, collabSnapshots } from "./features/compile/collab.client.ts";
import { collectGarbage } from "./features/blobs/blob.gc.ts";

const { db, pool } = createDb(env.DATABASE_URL);
await runMigrations(pool);

const github =
  env.GITHUB_CLIENT_ID && env.GITHUB_CLIENT_SECRET
    ? { clientId: env.GITHUB_CLIENT_ID, clientSecret: env.GITHUB_CLIENT_SECRET }
    : undefined;

const rateLimits = valkeyRateLimits(valkey);
const mailer = env.SMTP_URL ? smtpMailer(env.SMTP_URL, env.MAIL_FROM) : null;

const app = buildApp({
  db,
  auth: createAuth({
    db,
    secret: env.BETTER_AUTH_SECRET,
    baseURL: env.PUBLIC_URL,
    trustedOrigins: [env.PUBLIC_URL, ...env.WEB_ORIGIN],
    github,
    rateLimits,
    sendResetPassword: mailer
      ? (user, url) => mailer({ to: user.email, ...resetPasswordMail(user.name, url) })
      : undefined,
  }),
  events: valkeyEvents(valkey),
  compile: queueBackend(compileQueue, compileQueueEvents, env.COMPILE_DIR),
  snapshots: collabSnapshots(env.COLLAB_INTERNAL_URL, env.INTERNAL_SECRET),
  publishBuild: collabBuilds(env.COLLAB_INTERNAL_URL, env.INTERNAL_SECRET),
  blobDir: env.BLOB_DIR,
  trustedOrigins: [env.PUBLIC_URL, ...env.WEB_ORIGIN],
  config: { github: github !== undefined, passwordReset: mailer !== null },
  rateLimits,
  quotas: {
    projectsPerUser: env.MAX_PROJECTS_PER_USER,
    storagePerUser: env.MAX_STORAGE_PER_USER_MB * 1024 * 1024,
  },
  logger: true,
  trustProxy: env.TRUST_PROXY,
});

app.listen({ port: env.PORT }, (err) => {
  if (err) {
    app.log.error(err);
    process.exit(1);
  }
});

const HOUR = 60 * 60 * 1000;

async function collectBlobs() {
  try {
    const result = await collectGarbage(db, env.BLOB_DIR, HOUR);
    app.log.info(result, "blob garbage collection done");
  } catch (err) {
    app.log.error(err, "blob garbage collection failed");
  }
}

void collectBlobs();
const blobGcTimer = setInterval(() => void collectBlobs(), HOUR);

async function shutdown() {
  clearInterval(blobGcTimer);
  await app.close();
  await pool.end();
  await valkey.quit();
  process.exit(0);
}

process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);
