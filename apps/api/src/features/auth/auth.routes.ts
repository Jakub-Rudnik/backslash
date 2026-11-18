import type { Auth } from "@backslash/db/auth";
import type { FastifyInstance } from "fastify";
import { toHeaders } from "../../lib/access.ts";

/** Hands /api/auth/* to Better Auth (it speaks Fetch Request/Response). */
export async function authRoutes(app: FastifyInstance, { auth }: { auth: Auth }) {
  app.route({
    method: ["GET", "POST"],
    url: "/*",
    async handler(req, reply) {
      const url = new URL(req.url, `http://${req.headers.host ?? "localhost"}`);
      const body =
        req.method === "POST" && req.body !== undefined ? JSON.stringify(req.body) : undefined;
      const response = await auth.handler(
        new Request(url, { method: req.method, headers: toHeaders(req.headers), body }),
      );
      reply.code(response.status);
      for (const [key, value] of response.headers) {
        if (key === "set-cookie") continue;
        reply.header(key, value);
      }
      const cookies = response.headers.getSetCookie();
      if (cookies.length > 0) reply.header("set-cookie", cookies);
      return reply.send(response.body ? Buffer.from(await response.arrayBuffer()) : null);
    },
  });
}
