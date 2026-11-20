import type { Db } from "@backslash/db";
import type { AccountUsage } from "@backslash/shared";
import type { FastifyInstance } from "fastify";
import { requireUser } from "../../lib/access.ts";
import { RATE_LIMITS } from "../../lib/rate-limit.ts";
import { ownedProjectCount, quotasOf, storageUsedBy, type Quotas } from "../../lib/usage.ts";

export type AccountRoutesOptions = { db: Db; quotas: Quotas };

export async function accountRoutes(app: FastifyInstance, { db, quotas }: AccountRoutesOptions) {
  app.get("/account/usage", async (req, reply) => {
    const me = requireUser(req, reply);
    if (!me) return reply;
    const [projects, storage, limits] = await Promise.all([
      ownedProjectCount(db, me.id),
      storageUsedBy(db, me.id),
      quotasOf(db, me.id, quotas),
    ]);
    return {
      projects: { used: projects, limit: limits.projectsPerUser },
      storage: { used: storage, limit: limits.storagePerUser },
      rateLimits: Object.entries(RATE_LIMITS)
        .filter(([name]) => name !== "api")
        .map(([name, rule]) => ({ name, ...rule })),
    } satisfies AccountUsage;
  });
}
