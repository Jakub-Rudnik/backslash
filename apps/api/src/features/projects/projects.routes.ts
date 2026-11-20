import {
  CreateInvite,
  CreateProject,
  UpdateMember,
  UpdateProject,
  type CreatedInvite,
  type InvitePreview,
  type ProjectInvite,
  type ProjectMember,
  type ProjectSummary,
} from "@backslash/shared";
import { higherRole, projectInvites, projectMembers, projects, user, type Db } from "@backslash/db";
import { and, desc, eq, gt } from "drizzle-orm";
import type { FastifyInstance, FastifyReply } from "fastify";
import { createHash, randomBytes } from "node:crypto";
import * as z from "zod";
import { requireProject, requireUser } from "../../lib/access.ts";
import type { ProjectEvents } from "../../lib/events.ts";
import { rateLimit } from "../../lib/rate-limit.ts";
import { ownedProjectCount, quotasOf, type Quotas } from "../../lib/usage.ts";
import type { RateLimitStore } from "@backslash/db/auth";

export type ProjectRoutesOptions = {
  db: Db;
  events: ProjectEvents;
  limits: RateLimitStore;
  quotas: Quotas;
};

const INVITE_TTL_MS = 7 * 24 * 3600_000;

function newId(bytes = 12) {
  return randomBytes(bytes).toString("base64url");
}

const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

function badRequest(reply: FastifyReply, error: z.ZodError) {
  return reply.code(400).send({ error: error.issues.map((i) => i.message).join(", ") });
}

export async function projectRoutes(
  app: FastifyInstance,
  { db, events, limits, quotas }: ProjectRoutesOptions,
) {
  // --- projects ---

  app.get("/projects", async (req, reply) => {
    const me = requireUser(req, reply);
    if (!me) return reply;
    const rows = await db
      .select({
        id: projects.id,
        name: projects.name,
        role: projectMembers.role,
        ownerName: user.name,
        updatedAt: projects.updatedAt,
      })
      .from(projectMembers)
      .innerJoin(projects, eq(projects.id, projectMembers.projectId))
      .innerJoin(user, eq(user.id, projects.ownerId))
      .where(eq(projectMembers.userId, me.id))
      .orderBy(desc(projects.updatedAt));
    return rows.map((r): ProjectSummary => ({ ...r, updatedAt: r.updatedAt.toISOString() }));
  });

  app.post("/projects", async (req, reply) => {
    const me = requireUser(req, reply);
    if (!me) return reply;
    const body = CreateProject.safeParse(req.body);
    if (!body.success) return badRequest(reply, body.error);
    if (!(await rateLimit(limits, req, reply, "createProject"))) return reply;
    const { projectsPerUser } = await quotasOf(db, me.id, quotas);
    if ((await ownedProjectCount(db, me.id)) >= projectsPerUser) {
      return reply
        .code(403)
        .send({ error: `You can own at most ${projectsPerUser} projects, delete one first` });
    }
    const id = newId();
    await db.transaction(async (tx) => {
      await tx.insert(projects).values({ id, name: body.data.name, ownerId: me.id });
      await tx.insert(projectMembers).values({ projectId: id, userId: me.id, role: "owner" });
    });
    return reply.code(201).send({ id });
  });

  app.get("/projects/:id", async (req, reply) => {
    const access = await requireProject(db, req, reply, "viewer");
    if (!access) return reply;
    const [project] = await db
      .select({
        id: projects.id,
        name: projects.name,
        ownerName: user.name,
        updatedAt: projects.updatedAt,
      })
      .from(projects)
      .innerJoin(user, eq(user.id, projects.ownerId))
      .where(eq(projects.id, access.projectId));
    if (!project) return reply.code(404).send({ error: "Project not found" });
    return {
      ...project,
      role: access.role,
      updatedAt: project.updatedAt.toISOString(),
    } satisfies ProjectSummary;
  });

  app.patch("/projects/:id", async (req, reply) => {
    const access = await requireProject(db, req, reply, "owner");
    if (!access) return reply;
    const body = UpdateProject.safeParse(req.body);
    if (!body.success) return badRequest(reply, body.error);
    await db
      .update(projects)
      .set({ name: body.data.name, updatedAt: new Date() })
      .where(eq(projects.id, access.projectId));
    return reply.code(204).send();
  });

  app.delete("/projects/:id", async (req, reply) => {
    const access = await requireProject(db, req, reply, "owner");
    if (!access) return reply;
    await db.delete(projects).where(eq(projects.id, access.projectId));
    await events.accessChanged(access.projectId);
    return reply.code(204).send();
  });

  // --- members ---

  app.get("/projects/:id/members", async (req, reply) => {
    const access = await requireProject(db, req, reply, "viewer");
    if (!access) return reply;
    const rows = await db
      .select({
        userId: user.id,
        name: user.name,
        email: user.email,
        image: user.image,
        role: projectMembers.role,
      })
      .from(projectMembers)
      .innerJoin(user, eq(user.id, projectMembers.userId))
      .where(eq(projectMembers.projectId, access.projectId))
      .orderBy(projectMembers.createdAt);
    return rows satisfies ProjectMember[];
  });

  const MemberParams = z.object({ userId: z.string().min(1) });

  app.patch("/projects/:id/members/:userId", async (req, reply) => {
    const access = await requireProject(db, req, reply, "owner");
    if (!access) return reply;
    const params = MemberParams.safeParse(req.params);
    const body = UpdateMember.safeParse(req.body);
    if (!params.success) return badRequest(reply, params.error);
    if (!body.success) return badRequest(reply, body.error);
    if (params.data.userId === access.user.id) {
      return reply.code(400).send({ error: "The owner's role can't be changed" });
    }
    const updated = await db
      .update(projectMembers)
      .set({ role: body.data.role })
      .where(
        and(
          eq(projectMembers.projectId, access.projectId),
          eq(projectMembers.userId, params.data.userId),
        ),
      )
      .returning({ userId: projectMembers.userId });
    if (updated.length === 0) return reply.code(404).send({ error: "Member not found" });
    await events.accessChanged(access.projectId);
    return reply.code(204).send();
  });

  app.delete("/projects/:id/members/:userId", async (req, reply) => {
    const access = await requireProject(db, req, reply, "viewer");
    if (!access) return reply;
    const params = MemberParams.safeParse(req.params);
    if (!params.success) return badRequest(reply, params.error);
    const self = params.data.userId === access.user.id;
    if (!self && access.role !== "owner") {
      return reply.code(403).send({ error: "Requires owner access" });
    }
    if (self && access.role === "owner") {
      return reply.code(400).send({ error: "The owner can't leave; delete the project instead" });
    }
    const removed = await db
      .delete(projectMembers)
      .where(
        and(
          eq(projectMembers.projectId, access.projectId),
          eq(projectMembers.userId, params.data.userId),
        ),
      )
      .returning({ userId: projectMembers.userId });
    if (removed.length === 0) return reply.code(404).send({ error: "Member not found" });
    await events.accessChanged(access.projectId);
    return reply.code(204).send();
  });

  // --- invites (share links) ---

  app.get("/projects/:id/invites", async (req, reply) => {
    const access = await requireProject(db, req, reply, "owner");
    if (!access) return reply;
    const rows = await db
      .select({
        id: projectInvites.id,
        role: projectInvites.role,
        expiresAt: projectInvites.expiresAt,
      })
      .from(projectInvites)
      .where(
        and(
          eq(projectInvites.projectId, access.projectId),
          gt(projectInvites.expiresAt, new Date()),
        ),
      )
      .orderBy(desc(projectInvites.createdAt));
    return rows.map((r): ProjectInvite => ({
      id: r.id,
      role: r.role === "editor" ? "editor" : "viewer",
      expiresAt: r.expiresAt.toISOString(),
    }));
  });

  app.post("/projects/:id/invites", async (req, reply) => {
    const access = await requireProject(db, req, reply, "owner");
    if (!access) return reply;
    const body = CreateInvite.safeParse(req.body);
    if (!body.success) return badRequest(reply, body.error);
    if (!(await rateLimit(limits, req, reply, "createInvite"))) return reply;
    const token = newId(32);
    const invite = {
      id: newId(),
      role: body.data.role,
      expiresAt: new Date(Date.now() + INVITE_TTL_MS),
    };
    await db.insert(projectInvites).values({
      ...invite,
      projectId: access.projectId,
      tokenHash: hashToken(token),
      createdBy: access.user.id,
    });
    return reply.code(201).send({
      ...invite,
      expiresAt: invite.expiresAt.toISOString(),
      token,
    } satisfies CreatedInvite);
  });

  const InviteParams = z.object({ inviteId: z.string().min(1) });

  app.delete("/projects/:id/invites/:inviteId", async (req, reply) => {
    const access = await requireProject(db, req, reply, "owner");
    if (!access) return reply;
    const params = InviteParams.safeParse(req.params);
    if (!params.success) return badRequest(reply, params.error);
    const { inviteId } = params.data;
    await db
      .delete(projectInvites)
      .where(and(eq(projectInvites.id, inviteId), eq(projectInvites.projectId, access.projectId)));
    return reply.code(204).send();
  });

  const TokenParams = z.object({ token: z.string().min(16).max(128) });

  async function findInvite(token: string) {
    const [invite] = await db
      .select({
        projectId: projectInvites.projectId,
        projectName: projects.name,
        role: projectInvites.role,
      })
      .from(projectInvites)
      .innerJoin(projects, eq(projects.id, projectInvites.projectId))
      .where(
        and(
          eq(projectInvites.tokenHash, hashToken(token)),
          gt(projectInvites.expiresAt, new Date()),
        ),
      );
    return invite;
  }

  app.get("/invites/:token", async (req, reply) => {
    if (!requireUser(req, reply)) return reply;
    if (!(await rateLimit(limits, req, reply, "useInvite"))) return reply;
    const params = TokenParams.safeParse(req.params);
    const invite = params.success ? await findInvite(params.data.token) : undefined;
    if (!invite) return reply.code(404).send({ error: "Invite link is invalid or expired" });
    return {
      ...invite,
      role: invite.role === "editor" ? "editor" : "viewer",
    } satisfies InvitePreview;
  });

  app.post("/invites/:token/accept", async (req, reply) => {
    const me = requireUser(req, reply);
    if (!me) return reply;
    if (!(await rateLimit(limits, req, reply, "useInvite"))) return reply;
    const params = TokenParams.safeParse(req.params);
    const invite = params.success ? await findInvite(params.data.token) : undefined;
    if (!invite) return reply.code(404).send({ error: "Invite link is invalid or expired" });

    const upgraded = await db.transaction(async (tx) => {
      const [existing] = await tx
        .select({ role: projectMembers.role })
        .from(projectMembers)
        .where(
          and(eq(projectMembers.projectId, invite.projectId), eq(projectMembers.userId, me.id)),
        )
        .for("update");
      if (!existing) {
        await tx
          .insert(projectMembers)
          .values({ projectId: invite.projectId, userId: me.id, role: invite.role })
          .onConflictDoNothing();
        return false;
      }
      if (higherRole(existing.role, invite.role) === existing.role) return false;
      await tx
        .update(projectMembers)
        .set({ role: invite.role })
        .where(
          and(eq(projectMembers.projectId, invite.projectId), eq(projectMembers.userId, me.id)),
        );
      return true;
    });
    if (upgraded) await events.accessChanged(invite.projectId);
    return { projectId: invite.projectId };
  });
}
