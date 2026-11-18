import { BlobHash, MAX_BLOB_SIZE, type UploadedBlob } from "@backslash/shared";
import { projectBlobs, projects, type Db } from "@backslash/db";
import type { RateLimitStore } from "@backslash/db/auth";
import { and, eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { createReadStream } from "node:fs";
import type { Readable } from "node:stream";
import { requireProject } from "../../lib/access.ts";
import { rateLimit } from "../../lib/rate-limit.ts";
import { blobExists, blobPath, BlobTooLargeError, storeBlob } from "./blob.store.ts";

export type BlobRoutesOptions = {
  db: Db;
  dir: string;
  limits: RateLimitStore;
  /** bytes of uploaded files across all projects a user owns */
  storagePerUser: number;
};

/** Bytes used by the uploaded files of the project's owner, each file counted once. */
async function ownerStorage(db: Db, projectId: string) {
  const [project] = await db
    .select({ ownerId: projects.ownerId })
    .from(projects)
    .where(eq(projects.id, projectId));
  if (!project) return 0;
  const blobs = await db
    .selectDistinct({ hash: projectBlobs.hash, size: projectBlobs.size })
    .from(projectBlobs)
    .innerJoin(projects, eq(projects.id, projectBlobs.projectId))
    .where(eq(projects.ownerId, project.ownerId));
  return blobs.reduce((sum, b) => sum + b.size, 0);
}

const MB = 1024 * 1024;

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

    const free = storagePerUser - (await ownerStorage(db, access.projectId));
    const quotaError = `The project owner's storage is full (${Math.round(storagePerUser / MB)} MB)`;
    const tooLarge = (size: number) =>
      size > MAX_BLOB_SIZE ? "File too large" : size > free ? quotaError : null;
    const declared = tooLarge(Number(req.headers["content-length"]) || 0);
    if (declared) return reply.code(413).send({ error: declared });

    let blob: UploadedBlob;
    try {
      blob = await storeBlob(dir, req.body as Readable, Math.max(0, Math.min(MAX_BLOB_SIZE, free)));
    } catch (err) {
      if (err instanceof BlobTooLargeError) {
        const error = free < MAX_BLOB_SIZE ? quotaError : "File too large";
        return reply.code(413).header("Connection", "close").send({ error });
      }
      throw err;
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
