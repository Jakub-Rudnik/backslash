import { CompileRequest, type ProjectFile } from "@backslash/shared";
import { getMainFile, listFiles } from "@backslash/shared/doc";
import { projectBlobs, projects, type Db } from "@backslash/db";
import { and, eq, inArray, sql } from "drizzle-orm";
import * as Y from "yjs";
import { blobExists } from "../blobs/blob.store.ts";
import type { SnapshotSource } from "./collab.client.ts";

export class CompileInputError extends Error {}

/**
 * Builds the compile input from the server's copy of the project, never from the client:
 * a client could otherwise reference files (blob hashes) of projects it can't access.
 */
export async function buildCompileRequest(
  db: Db,
  snapshots: SnapshotSource,
  blobDir: string,
  projectId: string,
): Promise<CompileRequest> {
  const state = await snapshots(projectId);
  if (!state) throw new CompileInputError("Project not found");

  const doc = new Y.Doc();
  Y.applyUpdate(doc, state);
  const docFiles = listFiles(doc);
  const main = getMainFile(doc, docFiles);
  const files = docFiles.map((f): ProjectFile =>
    f.kind === "text" ? { path: f.path, content: f.text.toJSON() } : { path: f.path, hash: f.hash },
  );
  doc.destroy();
  if (!main) throw new CompileInputError("Add a .tex file to compile");

  const hashes = [...new Set(files.flatMap((f) => ("hash" in f ? [f.hash] : [])))];
  const registered = new Set(
    hashes.length === 0
      ? []
      : (
          await db
            .select({ hash: projectBlobs.hash })
            .from(projectBlobs)
            .where(and(eq(projectBlobs.projectId, projectId), inArray(projectBlobs.hash, hashes)))
        ).map((r) => r.hash),
  );
  for (const f of files) {
    if ("hash" in f && (!registered.has(f.hash) || !(await blobExists(blobDir, f.hash)))) {
      throw new CompileInputError(`Uploaded file missing on server: ${f.path}`);
    }
  }

  const parsed = CompileRequest.safeParse({ files, mainFile: main.path });
  if (!parsed.success) {
    throw new CompileInputError(parsed.error.issues.map((i) => i.message).join(", "));
  }
  return parsed.data;
}

export async function nextCompileSeq(db: Db, projectId: string): Promise<number | null> {
  const [row] = await db
    .update(projects)
    .set({ compileSeq: sql`${projects.compileSeq} + 1` })
    .where(eq(projects.id, projectId))
    .returning({ seq: projects.compileSeq });
  return row?.seq ?? null;
}
