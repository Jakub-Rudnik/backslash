import { BlobHash, MAX_BLOB_SIZE, type UploadedBlob } from "@backslash/shared";
import { projectBlobs, projects, type Db } from "@backslash/db";
import type { RateLimitStore } from "@backslash/db/auth";
import { and, eq, sql } from "drizzle-orm";
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

async function ownerHasBlob(db: Pick<Db, "select">, ownerId: string, hash: string) {
  const [row] = await db
    .select({ hash: projectBlobs.hash })
    .from(projectBlobs)
    .innerJoin(projects, eq(projects.id, projectBlobs.projectId))
    .where(and(eq(projects.ownerId, ownerId), eq(projectBlobs.hash, hash)))
    .limit(1);
  return !!row;
}

async function isReferenced(db: Pick<Db, "select">, hash: string) {
  const [row] = await db
    .select({ hash: projectBlobs.hash })
    .from(projectBlobs)
    .where(eq(projectBlobs.hash, hash))
    .limit(1);
  return !!row;
}

type Registration = "registered" | "over-quota" | "gone";

/**
 * Registers a stored file with the project, unless it would put the owner over quota; a rejected
 * file no project uses is deleted. Runs under a per-hash lock, so a concurrent upload of the
 * same content can't register a file this one is deleting (it sees it gone and asks to retry).
 */
async function register(
  db: Db,
  dir: string,
  projectId: string,
  blob: UploadedBlob,
  storagePerUser: number,
): Promise<Registration> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${blob.hash}, 0))`);
    if (!(await blobExists(dir, blob.hash))) return "gone";

    const [project] = await tx
      .select({ ownerId: projects.ownerId })
      .from(projects)
      .where(eq(projects.id, projectId));
    if (project && !(await ownerHasBlob(tx, project.ownerId, blob.hash))) {
      const free = storagePerUser - (await storageUsedBy(tx, project.ownerId));
      if (blob.size > free) {
        if (!(await isReferenced(tx, blob.hash)))
          await rm(blobPath(dir, blob.hash), { force: true });
        return "over-quota";
      }
    }

    await tx
      .insert(projectBlobs)
      .values({ projectId, hash: blob.hash, size: blob.size })
      .onConflictDoNothing();
    return "registered";
  });
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

    const registration = await register(db, dir, access.projectId, blob, storagePerUser);
    if (registration === "over-quota") {
      const limit = Math.round(storagePerUser / MB);
      return reply.code(413).send({ error: `The project owner's storage is full (${limit} MB)` });
    }
    if (registration === "gone") {
      return reply.code(503).send({ error: "Upload interrupted, please try again" });
    }
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
