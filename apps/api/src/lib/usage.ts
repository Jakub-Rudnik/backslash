import { projectBlobs, projects, type Db, type Executor } from "@backslash/db";
import { count, eq } from "drizzle-orm";

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
