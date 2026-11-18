import { collabDocuments, projects, type Db } from "@backslash/db";
import { eq } from "drizzle-orm";

const FOREIGN_KEY_VIOLATION = "23503";

/** Yjs state persistence in Postgres. */
export function documentStore(db: Db) {
  return {
    async load(projectId: string): Promise<Uint8Array | null> {
      const [row] = await db
        .select({ data: collabDocuments.data })
        .from(collabDocuments)
        .where(eq(collabDocuments.projectId, projectId));
      return row?.data ?? null;
    },

    async projectExists(projectId: string) {
      const [row] = await db
        .select({ id: projects.id })
        .from(projects)
        .where(eq(projects.id, projectId));
      return !!row;
    },

    async save(projectId: string, data: Uint8Array) {
      const now = new Date();
      try {
        await db.transaction(async (tx) => {
          await tx
            .insert(collabDocuments)
            .values({ projectId, data, updatedAt: now })
            .onConflictDoUpdate({
              target: collabDocuments.projectId,
              set: { data, updatedAt: now },
            });
          await tx.update(projects).set({ updatedAt: now }).where(eq(projects.id, projectId));
        });
      } catch (err) {
        if ((err as { cause?: { code?: string } }).cause?.code === FOREIGN_KEY_VIOLATION) return;
        if ((err as { code?: string }).code === FOREIGN_KEY_VIOLATION) return;
        throw err;
      }
    },
  };
}

export type DocumentStore = ReturnType<typeof documentStore>;
