import {
  AdminListQuery,
  UpdateAdminUser,
  type AdminProjectPage,
  type AdminUserPage,
} from "@backslash/shared";
import type { Db } from "@backslash/db";
import type { FastifyInstance, FastifyReply } from "fastify";
import * as z from "zod";
import { requireAdmin } from "../../lib/access.ts";
import type { ProjectEvents } from "../../lib/events.ts";
import { MB, type Quotas } from "../../lib/usage.ts";
import {
  adminStats,
  deleteUser,
  endSessions,
  listProjects,
  listUsers,
  PAGE_SIZE,
  updateUser,
} from "./admin.service.ts";

export type AdminRoutesOptions = { db: Db; events: ProjectEvents; quotas: Quotas };

const UserParams = z.object({ userId: z.string().min(1).max(64) });

function badRequest(reply: FastifyReply, error: z.ZodError) {
  return reply.code(400).send({ error: error.issues.map((i) => i.message).join(", ") });
}

export async function adminRoutes(
  app: FastifyInstance,
  { db, events, quotas }: AdminRoutesOptions,
) {
  async function accessChanged(projectIds: string[]) {
    await Promise.all(projectIds.map((id) => events.accessChanged(id)));
  }

  app.get("/admin/stats", async (req, reply) => {
    if (!requireAdmin(req, reply)) return reply;
    return adminStats(db);
  });

  app.get("/admin/users", async (req, reply) => {
    if (!requireAdmin(req, reply)) return reply;
    const query = AdminListQuery.safeParse(req.query);
    if (!query.success) return badRequest(reply, query.error);
    return {
      ...(await listUsers(db, query.data)),
      pageSize: PAGE_SIZE,
      defaults: {
        projectLimit: quotas.projectsPerUser,
        storageLimitMb: Math.round(quotas.storagePerUser / MB),
      },
    } satisfies AdminUserPage;
  });

  app.patch("/admin/users/:userId", async (req, reply) => {
    const me = requireAdmin(req, reply);
    if (!me) return reply;
    const params = UserParams.safeParse(req.params);
    const body = UpdateAdminUser.safeParse(req.body);
    if (!params.success) return badRequest(reply, params.error);
    if (!body.success) return badRequest(reply, body.error);
    if (params.data.userId === me.id && (body.data.banned || body.data.role === "user")) {
      return reply
        .code(400)
        .send({ error: "You can't ban yourself or remove your own admin role" });
    }
    const affected = await updateUser(db, params.data.userId, body.data);
    if (!affected) return reply.code(404).send({ error: "User not found" });
    await accessChanged(affected);
    return reply.code(204).send();
  });

  app.post("/admin/users/:userId/sign-out", async (req, reply) => {
    if (!requireAdmin(req, reply)) return reply;
    const params = UserParams.safeParse(req.params);
    if (!params.success) return badRequest(reply, params.error);
    await endSessions(db, params.data.userId);
    return reply.code(204).send();
  });

  app.delete("/admin/users/:userId", async (req, reply) => {
    const me = requireAdmin(req, reply);
    if (!me) return reply;
    const params = UserParams.safeParse(req.params);
    if (!params.success) return badRequest(reply, params.error);
    if (params.data.userId === me.id) {
      return reply.code(400).send({ error: "You can't delete your own account here" });
    }
    const affected = await deleteUser(db, params.data.userId);
    if (!affected) return reply.code(404).send({ error: "User not found" });
    await accessChanged(affected);
    return reply.code(204).send();
  });

  app.get("/admin/projects", async (req, reply) => {
    if (!requireAdmin(req, reply)) return reply;
    const query = AdminListQuery.safeParse(req.query);
    if (!query.success) return badRequest(reply, query.error);
    return {
      ...(await listProjects(db, query.data)),
      pageSize: PAGE_SIZE,
    } satisfies AdminProjectPage;
  });
}
