import { projectBlobs, projects, user, type Db, type Executor } from "@backslash/db";
import { count, eq } from "drizzle-orm";

export const MB = 1024 * 1024;

/** server-wide defaults; storage in bytes */
export type Quotas = { projectsPerUser: number; storagePerUser: number };

/** The user's limits: what an admin set for them, else the defaults. */
export async function quotasOf(db: Executor, userId: string, defaults: Quotas): Promise<Quotas> {
  const [row] = await db
    .select({ projectLimit: user.projectLimit, storageLimitMb: user.storageLimitMb })
    .from(user)
    .where(eq(user.id, userId));
  return {
    projectsPerUser: row?.projectLimit ?? defaults.projectsPerUser,
    storagePerUser: row?.storageLimitMb == null ? defaults.storagePerUser : row.storageLimitMb * MB,
  };
}

export async function ownedProjectCount(db: Db, userId: string) {
  const [row] = await db
    .select({ count: count() })
    .from(projects)
    .where(eq(projects.ownerId, userId));
  return row?.count ?? 0;
}

/** Bytes of uploaded files across the projects a user owns, each file counted once. */
export async function storageUsedBy(db: Executor, userId: string) {
  const blobs = await db
    .selectDistinct({ hash: projectBlobs.hash, size: projectBlobs.size })
    .from(projectBlobs)
    .innerJoin(projects, eq(projects.id, projectBlobs.projectId))
    .where(eq(projects.ownerId, userId));
  return blobs.reduce((sum, b) => sum + b.size, 0);
}
