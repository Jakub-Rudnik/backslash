import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";

async function healthHandler(request: FastifyRequest, reply: FastifyReply) {
  return { ok: true };
}

export async function healthRoutes(app: FastifyInstance) {
  app.get("/health", healthHandler);
}
