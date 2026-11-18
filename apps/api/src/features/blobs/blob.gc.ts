import { BlobHash } from "@backslash/shared";
import { filesMap } from "@backslash/shared/doc";
import { collabDocuments, projectBlobs, type Db } from "@backslash/db";
import { and, eq, lt, notInArray, sql } from "drizzle-orm";
import { readdir, rm, stat } from "node:fs/promises";
import { join } from "node:path";
import * as Y from "yjs";
import { blobPath } from "./blob.store.ts";

/**
 * Serializes registering, rejecting and collecting a file: whoever holds it sees whether the file
 * exists and which projects use it, and nobody else changes that until the transaction ends.
 */
export async function lockBlob(tx: Pick<Db, "execute">, hash: string) {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${hash}, 0))`);
}

export async function isReferenced(db: Pick<Db, "select">, hash: string) {
  const [row] = await db
    .select({ hash: projectBlobs.hash })
    .from(projectBlobs)
    .where(eq(projectBlobs.hash, hash))
    .limit(1);
  return !!row;
}

/** Every hash in the doc's file entries, including entries hidden by a path conflict. */
function hashesInDoc(state: Uint8Array | undefined) {
  if (!state) return [];
  const doc = new Y.Doc();
  Y.applyUpdate(doc, state);
  const hashes = new Set<string>();
  for (const entry of filesMap(doc).values()) {
    const hash = entry instanceof Y.Map ? entry.get("hash") : undefined;
    if (typeof hash === "string") hashes.add(hash);
  }
  doc.destroy();
  return [...hashes];
}

/** Drops registrations older than `cutoff` of files the project's saved doc no longer has. */
async function releaseUnusedRegistrations(db: Db, cutoff: Date) {
  const candidates = await db
    .selectDistinct({ projectId: projectBlobs.projectId })
    .from(projectBlobs)
    .where(lt(projectBlobs.registeredAt, cutoff));
  let released = 0;
  for (const { projectId } of candidates) {
    const [doc] = await db
      .select({ data: collabDocuments.data })
      .from(collabDocuments)
      .where(eq(collabDocuments.projectId, projectId));
    const result = await db
      .delete(projectBlobs)
      .where(
        and(
          eq(projectBlobs.projectId, projectId),
          lt(projectBlobs.registeredAt, cutoff),
          notInArray(projectBlobs.hash, hashesInDoc(doc?.data)),
        ),
      );
    released += result.rowCount ?? 0;
  }
  return released;
}

async function modifiedBefore(path: string, cutoff: Date) {
  try {
    return (await stat(path)).mtime < cutoff;
  } catch {
    return false;
  }
}

/** Deletes files older than `cutoff` that no project uses, and leftovers of failed uploads. */
async function deleteUnusedFiles(db: Db, dir: string, cutoff: Date) {
  let names: string[];
  try {
    names = await readdir(dir);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return 0;
    throw err;
  }
  let deleted = 0;
  for (const name of names) {
    if (name.startsWith(".tmp-")) {
      if (await modifiedBefore(join(dir, name), cutoff)) await rm(join(dir, name), { force: true });
      continue;
    }
    if (!BlobHash.safeParse(name).success) continue;
    const removed = await db.transaction(async (tx) => {
      await lockBlob(tx, name);
      if (!(await modifiedBefore(blobPath(dir, name), cutoff))) return false;
      if (await isReferenced(tx, name)) return false;
      await rm(blobPath(dir, name), { force: true });
      return true;
    });
    if (removed) deleted += 1;
  }
  return deleted;
}

/**
 * Removes uploaded files no project uses any more: deleted from a project, left behind by a
 * deleted project or account, or never registered. Files and registrations younger than
 * `graceMs` are kept, so uploads that aren't in a saved doc yet survive.
 */
export async function collectGarbage(db: Db, dir: string, graceMs: number) {
  const cutoff = new Date(Date.now() - graceMs);
  const releasedRegistrations = await releaseUnusedRegistrations(db, cutoff);
  const deletedFiles = await deleteUnusedFiles(db, dir, cutoff);
  return { releasedRegistrations, deletedFiles };
}
