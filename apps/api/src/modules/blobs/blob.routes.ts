import { BlobHash, MAX_BLOB_SIZE, type UploadedBlob } from "@backslash/shared";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { createReadStream } from "node:fs";
import type { Readable } from "node:stream";
import * as z from "zod";
import { blobExists, blobPath, BlobTooLargeError, storeBlob } from "./blob.store.ts";

export type BlobRoutesOptions = { dir: string };

const Params = z.object({ hash: BlobHash });

export async function blobRoutes(app: FastifyInstance, { dir }: BlobRoutesOptions) {
  // raw body as a stream; size is enforced while streaming (bodyLimit doesn't apply here)
  app.addContentTypeParser("application/octet-stream", (_req, payload, done) =>
    done(null, payload),
  );

  app.post("/", async (req: FastifyRequest, reply: FastifyReply) => {
    if (req.headers["content-type"] !== "application/octet-stream") {
      return reply.code(415).send({ error: "Expected application/octet-stream" });
    }
    if (Number(req.headers["content-length"]) > MAX_BLOB_SIZE) {
      return reply.code(413).send({ error: "File too large" });
    }
    try {
      const blob: UploadedBlob = await storeBlob(dir, req.body as Readable, MAX_BLOB_SIZE);
      return blob;
    } catch (err) {
      if (err instanceof BlobTooLargeError) {
        // the client may still be sending; don't keep reading it
        return reply.code(413).header("Connection", "close").send({ error: "File too large" });
      }
      throw err;
    }
  });

  app.get("/:hash", async (req: FastifyRequest, reply: FastifyReply) => {
    const parsed = Params.safeParse(req.params);
    if (!parsed.success) return reply.code(400).send({ error: "Invalid hash" });
    const { hash } = parsed.data;
    if (!(await blobExists(dir, hash))) return reply.code(404).send({ error: "Not found" });

    // user content: never let the browser render it as a page on our origin.
    // The web app reads it with fetch() and picks the type itself.
    return reply
      .type("application/octet-stream")
      .header("X-Content-Type-Options", "nosniff")
      .header("Content-Security-Policy", "default-src 'none'; sandbox")
      .header("Content-Disposition", "attachment")
      .header("Cache-Control", "public, max-age=31536000, immutable")
      .send(createReadStream(blobPath(dir, hash)));
  });
}
