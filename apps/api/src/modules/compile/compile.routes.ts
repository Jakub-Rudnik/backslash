import type { Db } from "@backslash/db";
import type { FastifyInstance } from "fastify";
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import * as z from "zod";
import { requireProject } from "../../lib/access.ts";
import { CompileTimeoutError, type CompileBackend } from "./compile.backend.ts";
import { buildCompileRequest, CompileInputError } from "./compile.service.ts";
import type { SnapshotSource } from "./snapshots.ts";

export type CompileRoutesOptions = {
  db: Db;
  backend: CompileBackend;
  snapshots: SnapshotSource;
  blobDir: string;
};

const PdfParams = z.object({ jobId: z.uuid() });

export async function compileRoutes(
  app: FastifyInstance,
  { db, backend, snapshots, blobDir }: CompileRoutesOptions,
) {
  // viewers may compile too (read-only), they just can't publish the result to the doc
  app.post("/projects/:id/compile", async (req, reply) => {
    const access = await requireProject(db, req, reply, "viewer");
    if (!access) return reply;
    try {
      const request = await buildCompileRequest(db, snapshots, blobDir, access.projectId);
      return await backend.run(access.projectId, request);
    } catch (err) {
      if (err instanceof CompileInputError) return reply.code(400).send({ error: err.message });
      if (err instanceof CompileTimeoutError) {
        return reply.code(504).send({ error: "Compilation timed out" });
      }
      throw err;
    }
  });

  app.get("/projects/:id/compile/:jobId/pdf", async (req, reply) => {
    const access = await requireProject(db, req, reply, "viewer");
    if (!access) return reply;
    const params = PdfParams.safeParse(req.params);
    if (!params.success) return reply.code(400).send({ error: "Invalid job id" });
    const { jobId } = params.data;
    // the job must belong to this project, else any member could read any PDF by job id
    if ((await backend.projectOf(jobId)) !== access.projectId) {
      return reply.code(404).send({ error: "PDF not found" });
    }
    const pdfPath = backend.pdfPath(jobId);
    try {
      await stat(pdfPath);
    } catch {
      return reply.code(404).send({ error: "PDF not found" });
    }
    return reply
      .type("application/pdf")
      .header("Cache-Control", "private, no-store")
      .send(createReadStream(pdfPath));
  });
}
