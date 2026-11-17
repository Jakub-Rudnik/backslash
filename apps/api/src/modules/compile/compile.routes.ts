import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { compile, CompileTimeoutError, getPdfpath } from "./compile.service.ts";
import { CompileRequest, MAX_PROJECT_SIZE } from "@backslash/shared";
import * as z from "zod";
import { stat } from "node:fs/promises";
import { createReadStream } from "node:fs";

async function compileHandler(req: FastifyRequest, reply: FastifyReply) {
  const parsed = CompileRequest.safeParse(req.body);

  if (!parsed.success) {
    return reply.code(400).send({ error: z.flattenError(parsed.error) });
  }

  try {
    return await compile(parsed.data);
  } catch (err) {
    if (err instanceof CompileTimeoutError) {
      return reply.code(504).send({ error: "Compilation timed out" });
    }
    throw err;
  }
}

const PdfParams = z.object({ id: z.uuid() });

async function pdfHandler(req: FastifyRequest, reply: FastifyReply) {
  const parsed = PdfParams.safeParse(req.params);

  if (!parsed.success) {
    return reply.code(400).send({ error: "Invalid job id" });
  }

  const pdfPath = getPdfpath(parsed.data.id);

  try {
    await stat(pdfPath);
  } catch {
    return reply.code(404).send({ error: "PDF not found" });
  }

  return reply
    .type("application/pdf")
    .header("Cache-Control", "no-store")
    .send(createReadStream(pdfPath));
}

export async function compileRoutes(app: FastifyInstance) {
  // projects are up to MAX_PROJECT_SIZE chars; JSON escaping and multi-byte chars add overhead
  app.post("/", { bodyLimit: 4 * MAX_PROJECT_SIZE }, compileHandler);
  app.get("/:id/pdf", pdfHandler);
}
