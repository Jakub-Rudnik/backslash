import type { Hocuspocus } from "@hocuspocus/server";
import { ProjectId } from "@backslash/shared";
import { createServer } from "node:http";
import { timingSafeEqual } from "node:crypto";
import * as Y from "yjs";

function authorized(header: string | undefined, secret: string) {
  const expected = Buffer.from(`Bearer ${secret}`);
  const actual = Buffer.from(header ?? "");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

const SNAPSHOT = /^\/snapshot\/([^/]+)$/;

/**
 * Internal API for other services (not exposed publicly):
 *   GET /snapshot/:projectId -> current Yjs state (includes unsaved edits)
 */
export function internalServer(
  hocuspocus: Hocuspocus,
  secret: string,
  projectExists: (id: string) => Promise<boolean>,
) {
  return createServer(async (req, res) => {
    const match = SNAPSHOT.exec(req.url ?? "");
    if (req.method !== "GET" || !match) return res.writeHead(404).end();
    if (!authorized(req.headers.authorization, secret)) return res.writeHead(401).end();
    let raw: string;
    try {
      raw = decodeURIComponent(match[1]!);
    } catch {
      return res.writeHead(404).end();
    }
    const id = ProjectId.safeParse(raw);
    if (!id.success) return res.writeHead(404).end();

    try {
      if (!(await projectExists(id.data))) return res.writeHead(404).end();
      const connection = await hocuspocus.openDirectConnection(id.data);
      try {
        const state = Y.encodeStateAsUpdate(connection.document!);
        res.writeHead(200, { "content-type": "application/octet-stream" }).end(state);
      } finally {
        await connection.disconnect();
      }
    } catch (err) {
      console.error("snapshot failed:", err);
      res.writeHead(500).end();
    }
  });
}

export class ProjectNotFoundError extends Error {}
