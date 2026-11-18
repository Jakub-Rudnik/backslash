import type { Db } from "@backslash/db";
import { getSessionUser, type Auth, type RateLimitStore } from "@backslash/db/auth";
import type { ServerConfig } from "@backslash/shared";
import Fastify, { type FastifyServerOptions } from "fastify";
import { isTrustedOrigin, toHeaders } from "./lib/access.ts";
import type { ProjectEvents } from "./lib/events.ts";
import { rateLimit } from "./lib/rate-limit.ts";
import { authRoutes } from "./features/auth/auth.routes.ts";
import { blobRoutes } from "./features/blobs/blob.routes.ts";
import type { CompileBackend } from "./features/compile/compile.backend.ts";
import { compileRoutes } from "./features/compile/compile.routes.ts";
import type { BuildPublisher, SnapshotSource } from "./features/compile/collab.client.ts";
import { healthRoutes } from "./features/health/health.routes.ts";
import { projectRoutes } from "./features/projects/projects.routes.ts";

export type AppDeps = {
  db: Db;
  auth: Auth;
  events: ProjectEvents;
  compile: CompileBackend;
  snapshots: SnapshotSource;
  publishBuild: BuildPublisher;
  blobDir: string;
  /** origins besides same-origin that may call the API with cookies */
  trustedOrigins: string[];
  config: ServerConfig;
  rateLimits: RateLimitStore;
  quotas: { projectsPerUser: number; storagePerUser: number };
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
    if (req.url.startsWith("/api/auth/")) return;

    const origin = req.headers.origin;
    if (!SAFE_METHODS.has(req.method) && origin) {
      const request = { host: req.headers.host, protocol: req.protocol };
      if (!isTrustedOrigin(origin, request, deps.trustedOrigins)) {
        return reply.code(403).send({ error: "Origin not allowed" });
      }
    }
    req.user = await getSessionUser(deps.auth, toHeaders(req.headers));
    if (!(await rateLimit(deps.rateLimits, req, reply, "api"))) return reply;
  });

  app.register(
    async (api) => {
      api.register(healthRoutes);
      api.get("/config", async () => deps.config);
      api.register(authRoutes, { prefix: "/auth", auth: deps.auth });
      api.register(projectRoutes, {
        db,
        events: deps.events,
        limits: deps.rateLimits,
        maxProjectsPerUser: deps.quotas.projectsPerUser,
      });
      api.register(blobRoutes, {
        db,
        dir: deps.blobDir,
        limits: deps.rateLimits,
        storagePerUser: deps.quotas.storagePerUser,
      });
      api.register(compileRoutes, {
        db,
        backend: deps.compile,
        snapshots: deps.snapshots,
        publish: deps.publishBuild,
        limits: deps.rateLimits,
        blobDir: deps.blobDir,
      });
    },
    { prefix: "/api" },
  );

  return app;
}
