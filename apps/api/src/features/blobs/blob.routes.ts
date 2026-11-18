import { BlobHash, MAX_BLOB_SIZE, type UploadedBlob } from "@backslash/shared";
import { projectBlobs, type Db } from "@backslash/db";
import { and, eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { createReadStream } from "node:fs";
import type { Readable } from "node:stream";
import { requireProject } from "../../lib/access.ts";
import { blobExists, blobPath, BlobTooLargeError, storeBlob } from "./blob.store.ts";

export type BlobRoutesOptions = { db: Db; dir: string };

/** Uploaded files of a project: /api/projects/:id/blobs */
export async function blobRoutes(app: FastifyInstance, { db, dir }: BlobRoutesOptions) {
  app.addContentTypeParser("application/octet-stream", (_req, payload, done) =>
    done(null, payload),
  );

  app.post("/projects/:id/blobs", async (req, reply) => {
    const access = await requireProject(db, req, reply, "editor");
    if (!access) return reply;
    if (req.headers["content-type"] !== "application/octet-stream") {
      return reply.code(415).send({ error: "Expected application/octet-stream" });
    }
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
