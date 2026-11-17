import type { Db } from "@backslash/db";
import { getSessionUser, type Auth } from "@backslash/db/auth";
import type { ServerConfig } from "@backslash/shared";
import Fastify, { type FastifyServerOptions } from "fastify";
import { isTrustedOrigin, toHeaders } from "./lib/access.ts";
import type { ProjectEvents } from "./lib/events.ts";
import { authRoutes } from "./modules/auth/auth.routes.ts";
import { blobRoutes } from "./modules/blobs/blob.routes.ts";
import type { CompileBackend } from "./modules/compile/compile.backend.ts";
import { compileRoutes } from "./modules/compile/compile.routes.ts";
import type { SnapshotSource } from "./modules/compile/snapshots.ts";
import { healthRoutes } from "./modules/health/health.routes.ts";
import { projectRoutes } from "./modules/projects/projects.routes.ts";

export type AppDeps = {
  db: Db;
  auth: Auth;
  events: ProjectEvents;
  compile: CompileBackend;
  snapshots: SnapshotSource;
  blobDir: string;
  /** origins besides same-origin that may call the API with cookies */
  trustedOrigins: string[];
  config: ServerConfig;
  logger?: FastifyServerOptions["logger"];
  /** which proxies may set X-Forwarded-* (request scheme for origin checks) */
  trustProxy?: FastifyServerOptions["trustProxy"];
};

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

export function buildApp(deps: AppDeps) {
  const app = Fastify({ logger: deps.logger ?? false, trustProxy: deps.trustProxy ?? "loopback" });
  const { db } = deps;

  app.decorateRequest("user", null);

  app.addHook("onRequest", async (req, reply) => {
    // Better Auth does its own origin checks and session handling
    if (req.url.startsWith("/api/auth/")) return;

    // CSRF: cookies authenticate, so state-changing requests must come from our own pages
    const origin = req.headers.origin;
    if (!SAFE_METHODS.has(req.method) && origin) {
      const request = { host: req.headers.host, protocol: req.protocol };
      if (!isTrustedOrigin(origin, request, deps.trustedOrigins)) {
        return reply.code(403).send({ error: "Origin not allowed" });
      }
    }
    req.user = await getSessionUser(deps.auth, toHeaders(req.headers));
  });

  app.register(
    async (api) => {
      api.register(healthRoutes);
      api.get("/config", async () => deps.config);
      api.register(authRoutes, { prefix: "/auth", auth: deps.auth });
      api.register(projectRoutes, { db, events: deps.events });
      api.register(blobRoutes, { db, dir: deps.blobDir });
      api.register(compileRoutes, {
        db,
        backend: deps.compile,
        snapshots: deps.snapshots,
        blobDir: deps.blobDir,
      });
    },
    { prefix: "/api" },
  );

  return app;
}
