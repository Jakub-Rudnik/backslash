import { ProjectId } from "@backslash/shared";
import { getProjectRole, hasRole, type Db, type ProjectRole } from "@backslash/db";
import type { SessionUser } from "@backslash/db/auth";
import type { FastifyReply, FastifyRequest } from "fastify";
import * as z from "zod";

declare module "fastify" {
  interface FastifyRequest {
    /** set from the session cookie for every /api request (except /api/auth) */
    user: SessionUser | null;
  }
}

/** Sends 401 and returns null when not signed in. */
export function requireUser(req: FastifyRequest, reply: FastifyReply): SessionUser | null {
  if (req.user) return req.user;
  void reply.code(401).send({ error: "Not signed in" });
  return null;
}

/** Sends 401 when not signed in, 403 when not an admin of the whole app. */
export function requireAdmin(req: FastifyRequest, reply: FastifyReply): SessionUser | null {
  const user = requireUser(req, reply);
  if (!user) return null;
  if (user.role === "admin") return user;
  void reply.code(403).send({ error: "Requires admin access" });
  return null;
}

const ProjectParams = z.object({ id: ProjectId });

export type ProjectAccess = { user: SessionUser; projectId: string; role: ProjectRole };

/**
 * The single gate for everything under /api/projects/:id.
 * Non-members get 404 (not 403), so project ids can't be probed.
 */
export async function requireProject(
  db: Db,
  req: FastifyRequest,
  reply: FastifyReply,
  min: ProjectRole,
): Promise<ProjectAccess | null> {
  const user = requireUser(req, reply);
  if (!user) return null;
  const parsed = ProjectParams.safeParse(req.params);
  const role = parsed.success ? await getProjectRole(db, parsed.data.id, user.id) : null;
  if (!parsed.success || role === null) {
    void reply.code(404).send({ error: "Project not found" });
    return null;
  }
  if (!hasRole(role, min)) {
    void reply.code(403).send({ error: `Requires ${min} access` });
    return null;
  }
  return { user, projectId: parsed.data.id, role };
}

export function toHeaders(raw: FastifyRequest["headers"]): Headers {
  const headers = new Headers();
  for (const [key, value] of Object.entries(raw)) {
    if (value === undefined) continue;
    for (const v of Array.isArray(value) ? value : [value]) headers.append(key, v);
  }
  return headers;
}

/**
 * Same-origin (scheme + host + port; also through a proxy on another host, e.g. a LAN IP)
 * or explicitly trusted. `protocol` is the request's ("http" / "https").
 */
export function isTrustedOrigin(
  origin: string,
  request: { host: string | undefined; protocol: string },
  trusted: string[],
) {
  if (trusted.includes(origin)) return true;
  try {
    const url = new URL(origin);
    return (
      request.host !== undefined &&
      url.host === request.host &&
      url.protocol === `${request.protocol}:`
    );
  } catch {
    return false;
  }
}
