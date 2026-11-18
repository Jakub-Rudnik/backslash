import type { Hocuspocus } from "@hocuspocus/server";
import { ProjectId, SharedBuild } from "@backslash/shared";
import { writeBuild } from "@backslash/shared/doc";
import { createServer, type IncomingMessage } from "node:http";
import { timingSafeEqual } from "node:crypto";
import * as Y from "yjs";

function authorized(header: string | undefined, secret: string) {
  const expected = Buffer.from(`Bearer ${secret}`);
  const actual = Buffer.from(header ?? "");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

const ROUTE = /^\/(snapshot|build)\/([^/]+)$/;
const MAX_BODY = 1_000_000;

async function readJson(req: IncomingMessage): Promise<unknown> {
  let body = "";
  for await (const chunk of req) {
    body += String(chunk);
    if (body.length > MAX_BODY) throw new Error("body too large");
  }
  return JSON.parse(body);
}

/**
 * Internal API for other services (not exposed publicly):
 *   GET  /snapshot/:projectId -> current Yjs state (includes unsaved edits)
 *   POST /build/:projectId    <- SharedBuild, written into the doc for every collaborator
 */
export function internalServer(
  hocuspocus: Hocuspocus,
  secret: string,
  projectExists: (id: string) => Promise<boolean>,
) {
  return createServer(async (req, res) => {
    const match = ROUTE.exec(req.url ?? "");
    const route = match?.[1];
    const method = route === "snapshot" ? "GET" : "POST";
    if (!match || req.method !== method) return res.writeHead(404).end();
    if (!authorized(req.headers.authorization, secret)) return res.writeHead(401).end();
    let raw: string;
    try {
      raw = decodeURIComponent(match[2]!);
    } catch {
      return res.writeHead(404).end();
    }
    const id = ProjectId.safeParse(raw);
    if (!id.success) return res.writeHead(404).end();

    let build: SharedBuild | null = null;
    if (route === "build") {
      const parsed = SharedBuild.safeParse(await readJson(req).catch(() => null));
      if (!parsed.success) return res.writeHead(400).end();
      build = parsed.data;
    }

    try {
      if (!(await projectExists(id.data))) return res.writeHead(404).end();
      const connection = await hocuspocus.openDirectConnection(id.data);
      try {
        if (build) {
          const next = build;
          await connection.transact((doc) => writeBuild(doc, next));
          res.writeHead(204).end();
        } else {
          const state = Y.encodeStateAsUpdate(connection.document!);
          res.writeHead(200, { "content-type": "application/octet-stream" }).end(state);
        }
      } finally {
        await connection.disconnect();
      }
    } catch (err) {
      console.error(`${route} failed:`, err);
      res.writeHead(500).end();
    }
  });
}

export class ProjectNotFoundError extends Error {}
