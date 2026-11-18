import { BlobHash, MAX_BLOB_SIZE, type UploadedBlob } from "@backslash/shared";
import { projectBlobs, projects, type Db } from "@backslash/db";
import type { RateLimitStore } from "@backslash/db/auth";
import { and, eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { createReadStream } from "node:fs";
import { rm } from "node:fs/promises";
import type { Readable } from "node:stream";
import { requireProject } from "../../lib/access.ts";
import { rateLimit } from "../../lib/rate-limit.ts";
import { storageUsedBy } from "../../lib/usage.ts";
import { blobExists, blobPath, BlobTooLargeError, storeBlob } from "./blob.store.ts";

export type BlobRoutesOptions = {
  db: Db;
  dir: string;
  limits: RateLimitStore;
  /** bytes of uploaded files across all projects a user owns */
  storagePerUser: number;
};

const MB = 1024 * 1024;

async function ownerHasBlob(db: Db, ownerId: string, hash: string) {
  const [row] = await db
    .select({ hash: projectBlobs.hash })
    .from(projectBlobs)
    .innerJoin(projects, eq(projects.id, projectBlobs.projectId))
    .where(and(eq(projects.ownerId, ownerId), eq(projectBlobs.hash, hash)))
    .limit(1);
  return !!row;
}

/** Deletes a stored file no project references, so rejected uploads don't pile up on disk. */
async function removeIfUnused(db: Db, dir: string, hash: string) {
  const [used] = await db
    .select({ hash: projectBlobs.hash })
    .from(projectBlobs)
    .where(eq(projectBlobs.hash, hash))
    .limit(1);
  if (!used) await rm(blobPath(dir, hash), { force: true });
}

/** Uploaded files of a project: /api/projects/:id/blobs */
export async function blobRoutes(
  app: FastifyInstance,
  { db, dir, limits, storagePerUser }: BlobRoutesOptions,
) {
  app.addContentTypeParser("application/octet-stream", (_req, payload, done) =>
    done(null, payload),
  );

  app.post("/projects/:id/blobs", async (req, reply) => {
    const access = await requireProject(db, req, reply, "editor");
    if (!access) return reply;
    if (req.headers["content-type"] !== "application/octet-stream") {
      return reply.code(415).send({ error: "Expected application/octet-stream" });
    }
    if (!(await rateLimit(limits, req, reply, "upload"))) return reply;

    if (Number(req.headers["content-length"]) > MAX_BLOB_SIZE) {
      return reply.code(413).send({ error: "File too large" });
    }
    let blob: UploadedBlob;
    try {
      blob = await storeBlob(dir, req.body as Readable, MAX_BLOB_SIZE);
    } catch (err) {
      if (err instanceof BlobTooLargeError) {
        return reply.code(413).header("Connection", "close").send({ error: "File too large" });
      }
      throw err;
    }

    const [project] = await db
      .select({ ownerId: projects.ownerId })
      .from(projects)
      .where(eq(projects.id, access.projectId));
    if (project && !(await ownerHasBlob(db, project.ownerId, blob.hash))) {
      const free = storagePerUser - (await storageUsedBy(db, project.ownerId));
      if (blob.size > free) {
        await removeIfUnused(db, dir, blob.hash);
        const limit = Math.round(storagePerUser / MB);
        return reply.code(413).send({ error: `The project owner's storage is full (${limit} MB)` });
      }
    }

    await db
      .insert(projectBlobs)
      .values({ projectId: access.projectId, hash: blob.hash, size: blob.size })
      .onConflictDoNothing();
    return blob;
  });

  app.get("/projects/:id/blobs/:hash", async (req, reply) => {
    const access = await requireProject(db, req, reply, "viewer");
    if (!access) return reply;
    const hash = BlobHash.safeParse((req.params as { hash?: unknown }).hash);
    if (!hash.success) return reply.code(400).send({ error: "Invalid hash" });
    const [registered] = await db
      .select({ hash: projectBlobs.hash })
      .from(projectBlobs)
      .where(and(eq(projectBlobs.projectId, access.projectId), eq(projectBlobs.hash, hash.data)));
    if (!registered || !(await blobExists(dir, hash.data))) {
      return reply.code(404).send({ error: "Not found" });
    }

    return reply
      .type("application/octet-stream")
      .header("X-Content-Type-Options", "nosniff")
      .header("Content-Security-Policy", "default-src 'none'; sandbox")
      .header("Content-Disposition", "attachment")
      .header("Cache-Control", "private, no-store")
      .send(createReadStream(blobPath(dir, hash.data)));
  });
}
