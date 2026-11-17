/**
 * Access control: every project endpoint against owner / editor / viewer / stranger / anonymous.
 * Runs against a real Postgres (TEST_DATABASE_URL) with real Better Auth sessions.
 */
import { createDb, runMigrations } from "@backslash/db";
import { createAuth } from "@backslash/db/auth";
import { createBlobFile, createFile, seedProject } from "@backslash/shared/doc";
import type { FastifyInstance, InjectOptions } from "fastify";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, test } from "vite-plus/test";
import * as Y from "yjs";
import { buildApp } from "../src/app.ts";
import type { CompileBackend } from "../src/modules/compile/compile.backend.ts";

const DB_URL =
  process.env.TEST_DATABASE_URL ?? "postgres://backslash:backslash@127.0.0.1:5432/backslash_test";
const { db, pool } = createDb(DB_URL);

const docs = new Map<string, Y.Doc>();
const revoked: string[] = [];
const jobs = new Map<string, string>();
let blobDir: string;
let app: FastifyInstance;

const compile: CompileBackend = {
  async run(projectId, request) {
    const jobId = crypto.randomUUID();
    jobs.set(jobId, projectId);
    return { jobId, status: "success", log: JSON.stringify(request), errors: [] };
  },
  projectOf: async (jobId) => jobs.get(jobId) ?? null,
  // no real PDFs: an existing project file is enough to test the access path
  pdfPath: () => join(import.meta.dirname, "access.test.ts"),
};

type User = { cookie: string; id: string };
const users: Record<"owner" | "editor" | "viewer" | "stranger", User> = {} as never;
let projectId: string;

async function request(user: User | null, opts: InjectOptions) {
  return app.inject({
    ...opts,
    headers: { ...opts.headers, ...(user ? { cookie: user.cookie } : {}) },
  });
}

async function signUp(name: string): Promise<User> {
  const res = await app.inject({
    method: "POST",
    url: "/api/auth/sign-up/email",
    payload: { name, email: `${name}-${crypto.randomUUID()}@example.com`, password: "password123" },
  });
  expect(res.statusCode).toBe(200);
  const cookie = [res.headers["set-cookie"]].flat()[0]!.split(";")[0]!;
  return { cookie, id: res.json<{ user: { id: string } }>().user.id };
}

async function createProject(owner: User, name = "Thesis") {
  const res = await request(owner, { method: "POST", url: "/api/projects", payload: { name } });
  expect(res.statusCode).toBe(201);
  const { id } = res.json<{ id: string }>();
  const doc = new Y.Doc();
  seedProject(doc, "\\documentclass{article}\\begin{document}x\\end{document}");
  docs.set(id, doc);
  return id;
}

async function invite(owner: User, project: string, role: "editor" | "viewer") {
  const res = await request(owner, {
    method: "POST",
    url: `/api/projects/${project}/invites`,
    payload: { role },
  });
  expect(res.statusCode).toBe(201);
  return res.json<{ token: string }>().token;
}

async function join_(user: User, token: string) {
  const res = await request(user, { method: "POST", url: `/api/invites/${token}/accept` });
  expect(res.statusCode).toBe(200);
}

async function uploadBlob(user: User, project: string, body: string) {
  return request(user, {
    method: "POST",
    url: `/api/projects/${project}/blobs`,
    headers: { "content-type": "application/octet-stream" },
    payload: Buffer.from(body),
  });
}

beforeAll(async () => {
  await runMigrations(pool);
  blobDir = await mkdtemp(join(tmpdir(), "blobs-"));
  app = buildApp({
    db,
    auth: createAuth({
      db,
      secret: "test-secret-test-secret-test-secret",
      baseURL: "http://localhost:5173",
      trustedOrigins: [],
    }),
    events: { accessChanged: async (id) => void revoked.push(id) },
    compile,
    snapshots: async (id) => {
      const doc = docs.get(id);
      return doc ? Y.encodeStateAsUpdate(doc) : null;
    },
    blobDir,
    trustedOrigins: ["http://localhost:5173"],
    config: { github: false },
  });
  await app.ready();

  for (const name of ["owner", "editor", "viewer", "stranger"] as const) {
    users[name] = await signUp(name);
  }
  projectId = await createProject(users.owner);
  await join_(users.editor, await invite(users.owner, projectId, "editor"));
  await join_(users.viewer, await invite(users.owner, projectId, "viewer"));
});

afterAll(async () => {
  await app.close();
  await pool.end();
  await rm(blobDir, { recursive: true, force: true });
});

type Who = keyof typeof users | "anonymous";
const ALL: Who[] = ["owner", "editor", "viewer", "stranger", "anonymous"];
const RANK = { viewer: 1, editor: 2, owner: 3 } as const;

/** Expected status class for `who` on an endpoint that needs `min`. */
function expected(who: Who, min: keyof typeof RANK) {
  if (who === "anonymous") return 401;
  if (who === "stranger") return 404;
  return RANK[who] >= RANK[min] ? "ok" : 403;
}

describe("access matrix", () => {
  let hash: string;
  let jobId: string;

  beforeAll(async () => {
    hash = (await uploadBlob(users.owner, projectId, "img")).json<{ hash: string }>().hash;
    createBlobFile(docs.get(projectId)!, "img.png", hash, 3);
    jobId = (
      await request(users.owner, { method: "POST", url: `/api/projects/${projectId}/compile` })
    ).json<{ jobId: string }>().jobId;
  });

  const endpoints: [string, keyof typeof RANK, () => InjectOptions][] = [
    ["GET project", "viewer", () => ({ method: "GET", url: `/api/projects/${projectId}` })],
    [
      "PATCH project",
      "owner",
      () => ({ method: "PATCH", url: `/api/projects/${projectId}`, payload: { name: "Thesis" } }),
    ],
    ["GET members", "viewer", () => ({ method: "GET", url: `/api/projects/${projectId}/members` })],
    [
      "PATCH member",
      "owner",
      () => ({
        method: "PATCH",
        url: `/api/projects/${projectId}/members/${users.editor.id}`,
        payload: { role: "editor" },
      }),
    ],
    ["GET invites", "owner", () => ({ method: "GET", url: `/api/projects/${projectId}/invites` })],
    [
      "POST invite",
      "owner",
      () => ({
        method: "POST",
        url: `/api/projects/${projectId}/invites`,
        payload: { role: "viewer" },
      }),
    ],
    [
      "POST blob",
      "editor",
      () => ({
        method: "POST",
        url: `/api/projects/${projectId}/blobs`,
        headers: { "content-type": "application/octet-stream" },
        payload: Buffer.from("x"),
      }),
    ],
    [
      "GET blob",
      "viewer",
      () => ({ method: "GET", url: `/api/projects/${projectId}/blobs/${hash}` }),
    ],
    [
      "POST compile",
      "viewer",
      () => ({ method: "POST", url: `/api/projects/${projectId}/compile` }),
    ],
    [
      "GET pdf",
      "viewer",
      () => ({ method: "GET", url: `/api/projects/${projectId}/compile/${jobId}/pdf` }),
    ],
  ];

  for (const [name, min, opts] of endpoints) {
    for (const who of ALL) {
      const want = expected(who, min);
      test(`${name} as ${who} -> ${want}`, async () => {
        const res = await request(who === "anonymous" ? null : users[who], opts());
        if (want === "ok") expect(res.statusCode, res.body).toBeLessThan(300);
        else expect(res.statusCode, res.body).toBe(want);
      });
    }
  }

  test("project list only shows own projects", async () => {
    const list = async (u: User) =>
      (await request(u, { method: "GET", url: "/api/projects" }))
        .json<{ id: string }[]>()
        .map((p) => p.id);
    expect(await list(users.viewer)).toContain(projectId);
    expect(await list(users.stranger)).not.toContain(projectId);
    expect((await request(null, { method: "GET", url: "/api/projects" })).statusCode).toBe(401);
  });
});

describe("cross-project isolation", () => {
  let other: string;
  beforeAll(async () => {
    // the stranger's own project
    other = await createProject(users.stranger, "Other");
  });

  test("a blob of project A can't be read through project B", async () => {
    const { hash } = (await uploadBlob(users.owner, projectId, "secret figure")).json<{
      hash: string;
    }>();
    const res = await request(users.stranger, {
      method: "GET",
      url: `/api/projects/${other}/blobs/${hash}`,
    });
    expect(res.statusCode).toBe(404);
  });

  test("compiling with a foreign blob hash in the doc fails", async () => {
    const { hash } = (await uploadBlob(users.owner, projectId, "another secret")).json<{
      hash: string;
    }>();
    // a malicious client writes the hash into its own project's doc
    createBlobFile(docs.get(other)!, "stolen.png", hash, 14);
    const res = await request(users.stranger, {
      method: "POST",
      url: `/api/projects/${other}/compile`,
    });
    expect(res.statusCode).toBe(400);
    expect(res.json<{ error: string }>().error).toMatch(/stolen\.png/);
    docs.get(other)!.getMap("files").clear();
    seedProject(docs.get(other)!, "x");
  });

  test("a PDF of project A can't be read through project B", async () => {
    const { jobId } = (
      await request(users.owner, { method: "POST", url: `/api/projects/${projectId}/compile` })
    ).json<{ jobId: string }>();
    const res = await request(users.stranger, {
      method: "GET",
      url: `/api/projects/${other}/compile/${jobId}/pdf`,
    });
    expect(res.statusCode).toBe(404);
  });

  test("compile input comes from the server's doc, not the request", async () => {
    createFile(docs.get(projectId)!, "server-side.tex", "from server");
    const res = await request(users.owner, {
      method: "POST",
      url: `/api/projects/${projectId}/compile`,
      payload: {
        files: [{ path: "main.tex", content: "\\input{/etc/passwd}" }],
        mainFile: "main.tex",
      },
    });
    expect(res.json<{ log: string }>().log).toContain("from server");
    expect(res.json<{ log: string }>().log).not.toContain("/etc/passwd");
  });
});

describe("members and invites", () => {
  test("invite links never downgrade and can be revoked", async () => {
    const p = await createProject(users.owner, "Invites");
    await join_(users.editor, await invite(users.owner, p, "editor"));
    await join_(users.editor, await invite(users.owner, p, "viewer"));
    const members = (
      await request(users.owner, { method: "GET", url: `/api/projects/${p}/members` })
    ).json<{ userId: string; role: string }[]>();
    expect(members.find((m) => m.userId === users.editor.id)?.role).toBe("editor");

    const token = await invite(users.owner, p, "viewer");
    const [inv] = (
      await request(users.owner, { method: "GET", url: `/api/projects/${p}/invites` })
    ).json<{ id: string }[]>();
    await request(users.owner, { method: "DELETE", url: `/api/projects/${p}/invites/${inv!.id}` });
    const res = await request(users.stranger, {
      method: "POST",
      url: `/api/invites/${token}/accept`,
    });
    expect(res.statusCode).toBe(404);
  });

  test("invalid invite tokens are rejected", async () => {
    const res = await request(users.stranger, {
      method: "POST",
      url: `/api/invites/${"x".repeat(43)}/accept`,
    });
    expect(res.statusCode).toBe(404);
  });

  test("removing a member revokes access and notifies collab", async () => {
    const p = await createProject(users.owner, "Removal");
    await join_(users.viewer, await invite(users.owner, p, "editor"));
    expect(
      (await request(users.viewer, { method: "GET", url: `/api/projects/${p}` })).statusCode,
    ).toBe(200);

    const res = await request(users.owner, {
      method: "DELETE",
      url: `/api/projects/${p}/members/${users.viewer.id}`,
    });
    expect(res.statusCode).toBe(204);
    expect(revoked).toContain(p);
    expect(
      (await request(users.viewer, { method: "GET", url: `/api/projects/${p}` })).statusCode,
    ).toBe(404);
  });

  test("members can leave, the owner can't", async () => {
    const p = await createProject(users.owner, "Leave");
    await join_(users.viewer, await invite(users.owner, p, "viewer"));
    const leave = (u: User) =>
      request(u, { method: "DELETE", url: `/api/projects/${p}/members/${u.id}` });
    expect((await leave(users.viewer)).statusCode).toBe(204);
    expect((await leave(users.owner)).statusCode).toBe(400);
  });

  test("editors can't manage members", async () => {
    const res = await request(users.editor, {
      method: "DELETE",
      url: `/api/projects/${projectId}/members/${users.viewer.id}`,
    });
    expect(res.statusCode).toBe(403);
  });

  test("deleting a project removes access for everyone", async () => {
    const p = await createProject(users.owner, "Doomed");
    await join_(users.editor, await invite(users.owner, p, "editor"));
    expect(
      (await request(users.editor, { method: "DELETE", url: `/api/projects/${p}` })).statusCode,
    ).toBe(403);
    expect(
      (await request(users.owner, { method: "DELETE", url: `/api/projects/${p}` })).statusCode,
    ).toBe(204);
    expect(
      (await request(users.editor, { method: "GET", url: `/api/projects/${p}` })).statusCode,
    ).toBe(404);
    expect(revoked).toContain(p);
  });
});

describe("csrf", () => {
  test("same host but another scheme is a different origin", async () => {
    const res = await request(users.owner, {
      method: "POST",
      url: "/api/projects",
      headers: { origin: "https://192.168.1.5:5173", host: "192.168.1.5:5173" },
      payload: { name: "x" },
    });
    expect(res.statusCode).toBe(403);
  });

  test("state-changing requests from foreign origins are rejected", async () => {
    const res = await request(users.owner, {
      method: "POST",
      url: "/api/projects",
      headers: { origin: "https://evil.example" },
      payload: { name: "x" },
    });
    expect(res.statusCode).toBe(403);
  });

  test("same-origin and trusted origins pass", async () => {
    for (const origin of ["http://localhost:5173", "http://192.168.1.5:5173"]) {
      // inject requests are plain http
      const res = await request(users.owner, {
        method: "POST",
        url: "/api/projects",
        headers: { origin, host: new URL(origin).host },
        payload: { name: "ok" },
      });
      expect(res.statusCode, origin).toBe(201);
    }
  });
});
