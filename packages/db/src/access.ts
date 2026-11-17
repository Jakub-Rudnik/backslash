import { and, eq } from "drizzle-orm";
import type { Db } from "./client.ts";
import { projectMembers } from "./schema/index.ts";

export type ProjectRole = "owner" | "editor" | "viewer";

const RANK: Record<ProjectRole, number> = { viewer: 1, editor: 2, owner: 3 };

export function hasRole(role: ProjectRole | null, min: ProjectRole): boolean {
  return role !== null && RANK[role] >= RANK[min];
}

export function higherRole(a: ProjectRole, b: ProjectRole): ProjectRole {
  return RANK[a] >= RANK[b] ? a : b;
}

/** The user's role in the project, or null if they aren't a member (or it doesn't exist). */
export async function getProjectRole(
  db: Db,
  projectId: string,
  userId: string,
): Promise<ProjectRole | null> {
  const [row] = await db
    .select({ role: projectMembers.role })
    .from(projectMembers)
    .where(and(eq(projectMembers.projectId, projectId), eq(projectMembers.userId, userId)))
    .limit(1);
  return row?.role ?? null;
}
