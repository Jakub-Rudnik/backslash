import type { Db } from "@backslash/db";
import type { CompileStarted } from "@backslash/shared";
import type { FastifyInstance } from "fastify";
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import * as z from "zod";
import { requireProject } from "../../lib/access.ts";
import { rateLimit } from "../../lib/rate-limit.ts";
import type { RateLimitStore } from "@backslash/db/auth";
import type { CompileBackend } from "./compile.backend.ts";
import { compileScheduler } from "./compile.scheduler.ts";
import { buildCompileRequest, nextCompileSeq, recordCompile } from "./compile.service.ts";
import type { BuildPublisher, SnapshotSource } from "./collab.client.ts";

export type CompileRoutesOptions = {
  db: Db;
  backend: CompileBackend;
  snapshots: SnapshotSource;
  publish: BuildPublisher;
  blobDir: string;
  limits: RateLimitStore;
};

const PdfParams = z.object({ jobId: z.uuid() });

export async function compileRoutes(
  app: FastifyInstance,
  { db, backend, snapshots, publish, blobDir, limits }: CompileRoutesOptions,
) {
  const scheduler = compileScheduler({
    nextSeq: (projectId) => nextCompileSeq(db, projectId),
    prepare: (projectId) => buildCompileRequest(db, snapshots, blobDir, projectId),
    backend,
    publish,
    record: (compile) => recordCompile(db, compile),
    log: app.log,
  });

  app.post("/projects/:id/compile", async (req, reply) => {
    const access = await requireProject(db, req, reply, "viewer");
    if (!access) return reply;
    if (!(await rateLimit(limits, req, reply, "compile"))) return reply;
    const { id, name } = access.user;
    const seq = await scheduler.request(access.projectId, { id, name });
    if (seq === null) return reply.code(404).send({ error: "Project not found" });
    return reply.code(202).send({ seq } satisfies CompileStarted);
  });

  app.get("/projects/:id/compile/:jobId/pdf", async (req, reply) => {
    const access = await requireProject(db, req, reply, "viewer");
    if (!access) return reply;
    const params = PdfParams.safeParse(req.params);
    if (!params.success) return reply.code(400).send({ error: "Invalid job id" });
    const { jobId } = params.data;
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
