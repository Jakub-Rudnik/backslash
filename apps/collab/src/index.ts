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

function isAllowedOrigin(origin: string, headers: Headers) {
  if (env.WEB_ORIGIN.includes(origin)) return true;
  const host = headers.get("host");
  const proto = headers.get("x-forwarded-proto")?.split(",")[0]?.trim() ?? "http";
  try {
    const url = new URL(origin);
    return host !== null && url.host === host && url.protocol === `${proto}:`;
  } catch {
    return false;
  }
}

const RECONCILE_INTERVAL_MS = 30_000;
const MAX_CONNECTIONS_PER_USER = 20;
const MAX_DOC_SIZE = 50 * 1024 * 1024;

/** projects whose doc outgrew MAX_DOC_SIZE: they stay readable but nobody can edit them */
const oversized = new Set<string>();

function rejection(reason: string, message: string) {
  return Object.assign(new Error(message), { reason });
}

function connectionsOf(userId: string) {
  let count = 0;
  for (const document of server.hocuspocus.documents.values()) {
    document.connections.forEach((_clients, connection) => {
      if (connection.context.userId === userId) count += 1;
    });
  }
  return count;
}

function checkSize(projectId: string, state: Uint8Array) {
  if (state.length <= MAX_DOC_SIZE) {
    oversized.delete(projectId);
    return;
  }
  if (oversized.has(projectId)) return;
  oversized.add(projectId);
  console.warn(
    `project ${projectId} is over the size limit (${state.length} bytes), now read-only`,
  );
  server.hocuspocus.documents.get(projectId)?.connections.forEach((_clients, connection) => {
    if (!connection.readOnly) connection.webSocket.close(4413, "Project too large");
  });
}

const server = new Server<ConnectionContext>({
  address: env.HOST,
  port: env.PORT,
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

  async onAuthenticate({ documentName, requestHeaders, connectionConfig }) {
    const projectId = ProjectId.safeParse(documentName);
    if (!projectId.success) throw new Error("Invalid project");
    const user = await getSessionUser(auth, requestHeaders);
    if (!user) throw new Error("Not signed in");
    const role = await getProjectRole(db, projectId.data, user.id);
    if (!role) throw new Error("No access");
    if (connectionsOf(user.id) >= MAX_CONNECTIONS_PER_USER) {
      throw rejection("too-many-connections", "Too many open connections");
    }
    connectionConfig.readOnly = role === "viewer" || oversized.has(projectId.data);
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
        if (existing) checkSize(documentName, existing);
        const seeded = ensureProject(existing);
        if (!seeded) return existing;
        await store.save(documentName, seeded);
        return seeded;
      },
      store: async ({ documentName, state }) => {
        await store.save(documentName, state);
        checkSize(documentName, state);
      },
    }),
  ],
});

const access = accessReconciler(db, server.hocuspocus);

await server.listen();

const internal = internalServer(server.hocuspocus, env.INTERNAL_SECRET, (id) =>
  store.projectExists(id),
);
internal.listen(env.INTERNAL_PORT, env.INTERNAL_HOST);

const subscriber = new Valkey(env.VALKEY_URL);
await subscriber.subscribe(COLLAB_REVOKE_CHANNEL);
const reconcile = (projectId?: string) =>
  access.reconcile(projectId).catch((err: unknown) => console.error("reconcile failed:", err));
subscriber.on("message", (_channel, projectId: string) => void reconcile(projectId));
subscriber.on("ready", () => void reconcile());
const reconcileTimer = setInterval(() => void reconcile(), RECONCILE_INTERVAL_MS);

async function shutdown() {
  clearInterval(reconcileTimer);
  internal.close();
  await subscriber.quit();
  await server.destroy();
  await pool.end();
  process.exit(0);
}

process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);
