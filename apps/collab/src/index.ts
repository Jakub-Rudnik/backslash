import { COLLAB_REVOKE_CHANNEL, ProjectId } from "@backslash/shared";
import { createDb, getProjectRole, runMigrations } from "@backslash/db";
import { createAuth, getSessionUser } from "@backslash/db/auth";
import { Database } from "@hocuspocus/extension-database";
import { Server } from "@hocuspocus/server";
import { Valkey } from "iovalkey";
import { accessReconciler, type ConnectionContext } from "./access.ts";
import { env } from "./config.ts";
import { ensureProject } from "./initial-state.ts";
import { internalServer, ProjectNotFoundError } from "./internal.ts";
import { documentStore } from "./store.ts";

const { db, pool } = createDb(env.DATABASE_URL);
await runMigrations(pool);
const store = documentStore(db);
const auth = createAuth({
  db,
  secret: env.BETTER_AUTH_SECRET,
  baseURL: env.PUBLIC_URL,
  trustedOrigins: env.WEB_ORIGIN,
});

// same-origin (page served from the host the WS goes through, e.g. via vite proxy
// on a LAN IP) or explicitly listed in WEB_ORIGIN
function isAllowedOrigin(origin: string, headers: Headers) {
  if (env.WEB_ORIGIN.includes(origin)) return true;
  const host = headers.get("host");
  // scheme from the TLS-terminating proxy, plain http otherwise
  const proto = headers.get("x-forwarded-proto")?.split(",")[0]?.trim() ?? "http";
  try {
    const url = new URL(origin);
    return host !== null && url.host === host && url.protocol === `${proto}:`;
  } catch {
    return false;
  }
}

// membership is re-checked this often even without notifications (missed pub/sub messages)
const RECONCILE_INTERVAL_MS = 30_000;

const server = new Server<ConnectionContext>({
  address: env.HOST,
  port: env.PORT,
  // ws maxPayload; the initial sync sends the whole project (MAX_PROJECT_SIZE UTF-16 chars,
  // up to 3 bytes each in UTF-8) plus Yjs overhead
  websocketOptions: { maxPayload: 24 * 1024 * 1024 },
  debounce: 2000,
  maxDebounce: 10_000,
  stopOnSignals: false,

  async onConnect({ requestHeaders }) {
    const origin = requestHeaders.get("origin");
    if (origin && !isAllowedOrigin(origin, requestHeaders)) {
      throw new Error(`Origin not allowed: ${origin}`);
    }
  },

  // every connection: session cookie -> project membership; viewers are read-only
  async onAuthenticate({ documentName, requestHeaders, connectionConfig }) {
    const projectId = ProjectId.safeParse(documentName);
    if (!projectId.success) throw new Error("Invalid project");
    const user = await getSessionUser(auth, requestHeaders);
    if (!user) throw new Error("Not signed in");
    const role = await getProjectRole(db, projectId.data, user.id);
    if (!role) throw new Error("No access");
    connectionConfig.readOnly = role === "viewer";
    return { userId: user.id, role } satisfies ConnectionContext;
  },

  async connected({ connection, documentName }) {
    await access.verify(connection, documentName);
  },

  extensions: [
    new Database({
      fetch: async ({ documentName }) => {
        const existing = await store.load(documentName);
        if (!existing && !(await store.projectExists(documentName))) {
          throw new ProjectNotFoundError(documentName);
        }
        const seeded = ensureProject(existing);
        if (!seeded) return existing;
        // persist the seed/migration immediately: if the server restarted before the first edit,
        // a re-seeded doc (new clientID) would merge with clients' copy and duplicate the files
        await store.save(documentName, seeded);
        return seeded;
      },
      store: async ({ documentName, state }) => store.save(documentName, state),
    }),
  ],
});

const access = accessReconciler(db, server.hocuspocus);

await server.listen();

const internal = internalServer(server.hocuspocus, env.INTERNAL_SECRET, (id) =>
  store.projectExists(id),
);
internal.listen(env.INTERNAL_PORT, env.INTERNAL_HOST);

// access changed (member removed, role changed, project deleted): the API publishes the
// project id, affected sockets are closed and their clients re-authenticate
const subscriber = new Valkey(env.VALKEY_URL);
await subscriber.subscribe(COLLAB_REVOKE_CHANNEL);
const reconcile = (projectId?: string) =>
  access.reconcile(projectId).catch((err: unknown) => console.error("reconcile failed:", err));
subscriber.on("message", (_channel, projectId: string) => void reconcile(projectId));
// pub/sub doesn't replay: after a reconnect, catch up on whatever was missed
subscriber.on("ready", () => void reconcile());
const reconcileTimer = setInterval(() => void reconcile(), RECONCILE_INTERVAL_MS);

async function shutdown() {
  clearInterval(reconcileTimer);
  internal.close();
  await subscriber.quit();
  // destroy() flushes pending stores before closing
  await server.destroy();
  await pool.end();
  process.exit(0);
}

process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);
