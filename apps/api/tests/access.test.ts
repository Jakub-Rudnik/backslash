/**
 * Access control: every project endpoint against owner / editor / viewer / stranger / anonymous.
 * Runs against a real Postgres (TEST_DATABASE_URL) with real Better Auth sessions.
 */
import { createDb, projects, runMigrations, user } from "@backslash/db";
import { eq } from "drizzle-orm";
import { createAuth } from "@backslash/db/auth";
import type { CompileRequest, SharedBuild } from "@backslash/shared";
import { createBlobFile, createFile, seedProject } from "@backslash/shared/doc";
import type { FastifyInstance, InjectOptions } from "fastify";
import { createHash } from "node:crypto";
import { mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, test, vi } from "vite-plus/test";
import * as Y from "yjs";
import { buildApp } from "../src/app.ts";
import { memoryRateLimits, RATE_LIMITS } from "../src/lib/rate-limit.ts";
import type { CompileBackend } from "../src/features/compile/compile.backend.ts";

const DB_URL =
  process.env.TEST_DATABASE_URL ?? "postgres://backslash:backslash@127.0.0.1:5432/backslash_test";
const { db, pool } = createDb(DB_URL);

const docs = new Map<string, Y.Doc>();
const revoked: string[] = [];
const jobs = new Map<string, { projectId: string; request: CompileRequest }>();
const builds: { projectId: string; build: SharedBuild }[] = [];
const resetMails: { email: string; url: string }[] = [];
let blobDir: string;
let app: FastifyInstance;

const compile: CompileBackend = {
  async run(projectId, request) {
    const jobId = crypto.randomUUID();
    jobs.set(jobId, { projectId, request });
    return { jobId, status: "success", log: "", errors: [] };
  },
  projectOf: async (jobId) => jobs.get(jobId)?.projectId ?? null,
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

async function waitForBuild(project: string, seq: number) {
  return vi.waitFor(() => {
    const published = builds.find((b) => b.projectId === project && b.build.seq === seq);
    if (!published) throw new Error(`build ${seq} not published`);
    return published.build;
  });
}

/** Requests a compile and waits for the result the server publishes into the doc. */
async function compileProject(user: User, project: string) {
  const res = await request(user, { method: "POST", url: `/api/projects/${project}/compile` });
  expect(res.statusCode, res.body).toBe(202);
  const { seq } = res.json<{ seq: number }>();
  return waitForBuild(project, seq);
}

let signUps = 0;

async function signUp(name: string): Promise<User & { email: string }> {
  signUps += 1;
  const email = `${name}-${crypto.randomUUID()}@example.com`;
  const res = await app.inject({
    method: "POST",
    url: "/api/auth/sign-up/email",
    remoteAddress: `10.0.${signUps}.1`,
    payload: { name, email, password: "password123" },
  });
  expect(res.statusCode).toBe(200);
  const cookie = [res.headers["set-cookie"]].flat()[0]!.split(";")[0]!;
  return { cookie, id: res.json<{ user: { id: string } }>().user.id, email };
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
  const rateLimits = memoryRateLimits();
  app = buildApp({
    db,
    auth: createAuth({
      db,
      secret: "test-secret-test-secret-test-secret",
      baseURL: "http://localhost:5173",
      trustedOrigins: [],
      rateLimits,
      sendResetPassword: async ({ email }, url) => void resetMails.push({ email, url }),
    }),
    rateLimits,
    quotas: { projectsPerUser: 10, storagePerUser: 64 * 1024 },
    events: { accessChanged: async (id) => void revoked.push(id) },
    compile,
    snapshots: async (id) => {
      const doc = docs.get(id);
      return doc ? Y.encodeStateAsUpdate(doc) : null;
    },
    publishBuild: async (projectId, build) => void builds.push({ projectId, build }),
    blobDir,
    trustedOrigins: ["http://localhost:5173"],
    config: { github: false, passwordReset: true },
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
    jobId = (await compileProject(users.owner, projectId)).jobId!;
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
    createBlobFile(docs.get(other)!, "stolen.png", hash, 14);
    const build = await compileProject(users.stranger, other);
    expect(build.status).toBe("error");
    expect(build.jobId).toBeNull();
    expect(build.errors[0]?.message).toMatch(/stolen\.png/);
    docs.get(other)!.getMap("files").clear();
    seedProject(docs.get(other)!, "x");
  });

  test("a PDF of project A can't be read through project B", async () => {
    const { jobId } = await compileProject(users.owner, projectId);
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
    const { seq } = res.json<{ seq: number }>();
    const { jobId } = await waitForBuild(projectId, seq);
    const files = JSON.stringify(jobs.get(jobId!)!.request.files);
    expect(files).toContain("from server");
    expect(files).not.toContain("/etc/passwd");
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

describe("limits", () => {
  test("compiling is rate limited per user", async () => {
    const user = await signUp("busy");
    const p = await createProject(user, "Busy");
    const compile = () => request(user, { method: "POST", url: `/api/projects/${p}/compile` });
    for (let i = 0; i < RATE_LIMITS.compile.max; i++)
      expect((await compile()).statusCode).toBe(202);
    const res = await compile();
    expect(res.statusCode).toBe(429);
    expect(Number(res.headers["retry-after"])).toBeGreaterThan(0);
    const other = await request(users.owner, {
      method: "POST",
      url: `/api/projects/${projectId}/compile`,
    });
    expect(other.statusCode).toBe(202);
  });

  test("a user can't own more projects than the quota", async () => {
    const user = await signUp("hoarder");
    for (let i = 0; i < 10; i++) await createProject(user, `P${i}`);
    const res = await request(user, {
      method: "POST",
      url: "/api/projects",
      payload: { name: "x" },
    });
    expect(res.statusCode).toBe(403);
  });

  test("uploads by anyone count against the project owner's storage", async () => {
    const owner = await signUp("uploader");
    const editor = await signUp("helper");
    const p = await createProject(owner, "Big files");
    await join_(editor, await invite(owner, p, "editor"));
    expect((await uploadBlob(owner, p, "a".repeat(40 * 1024))).statusCode).toBe(200);
    expect((await uploadBlob(owner, p, "c".repeat(20 * 1024))).statusCode).toBe(200);
    const rejected = "b".repeat(10 * 1024);
    const res = await uploadBlob(editor, p, rejected);
    expect(res.statusCode).toBe(413);
    const rejectedHash = createHash("sha256").update(rejected).digest("hex");
    await expect(stat(join(blobDir, rejectedHash))).rejects.toThrow();
    expect(res.json<{ error: string }>().error).toMatch(/storage is full/);
    expect((await uploadBlob(editor, p, "small")).statusCode).toBe(200);

    const full = await createProject(owner, "Full");
    expect((await uploadBlob(owner, full, "a".repeat(40 * 1024))).statusCode).toBe(200);
    const usage = (await request(owner, { method: "GET", url: "/api/account/usage" })).json<{
      storage: { used: number };
    }>();
    expect(usage.storage.used).toBe(60 * 1024 + 5);
  });

  test("a rejected upload never deletes a file another upload just registered", async () => {
    const full = await signUp("full");
    const roomy = await signUp("roomy");
    const pf = await createProject(full, "Full");
    const pr = await createProject(roomy, "Roomy");
    expect((await uploadBlob(full, pf, "f".repeat(60 * 1024))).statusCode).toBe(200);
    for (let i = 0; i < 5; i++) {
      const content = `${i}`.repeat(10 * 1024);
      const [rejected, accepted] = await Promise.all([
        uploadBlob(full, pf, content),
        uploadBlob(roomy, pr, content),
      ]);
      expect(rejected.statusCode).toBe(413);
      expect([200, 503]).toContain(accepted.statusCode);
      if (accepted.statusCode === 200) {
        const hash = createHash("sha256").update(content).digest("hex");
        await expect(stat(join(blobDir, hash))).resolves.toBeDefined();
      }
    }
  });

  test("sign-in attempts are rate limited per IP", async () => {
    const attempt = (remoteAddress: string) =>
      app.inject({
        method: "POST",
        url: "/api/auth/sign-in/email",
        remoteAddress,
        headers: { "x-backslash-client-ip": "1.2.3.4" },
        payload: { email: "nobody@example.com", password: "wrong-password" },
      });
    for (let i = 0; i < 10; i++) expect((await attempt("10.9.9.9")).statusCode).toBe(401);
    expect((await attempt("10.9.9.9")).statusCode).toBe(429);
    expect((await attempt("10.9.9.10")).statusCode).toBe(401);
  });
});

describe("account", () => {
  test("password reset mails a link, sets the new password and signs out everywhere", async () => {
    const user = await signUp("forgetful");
    const ask = (email: string) =>
      app.inject({
        method: "POST",
        url: "/api/auth/request-password-reset",
        remoteAddress: "10.8.0.1",
        payload: { email, redirectTo: "/reset-password" },
      });

    expect((await ask("nobody-here@example.com")).statusCode).toBe(200);
    expect((await ask(user.email)).statusCode).toBe(200);
    await vi.waitFor(() => expect(resetMails.find((m) => m.email === user.email)).toBeDefined());
    expect(resetMails.some((m) => m.email === "nobody-here@example.com")).toBe(false);

    const { url } = resetMails.find((m) => m.email === user.email)!;
    const token = new URL(url).pathname.split("/").at(-1)!;
    const reset = await app.inject({
      method: "POST",
      url: "/api/auth/reset-password",
      payload: { token, newPassword: "new-password-456" },
    });
    expect(reset.statusCode, reset.body).toBe(200);

    expect((await request(user, { method: "GET", url: "/api/projects" })).statusCode).toBe(401);
    const signIn = (password: string) =>
      app.inject({
        method: "POST",
        url: "/api/auth/sign-in/email",
        remoteAddress: "10.8.0.2",
        payload: { email: user.email, password },
      });
    expect((await signIn("password123")).statusCode).toBe(401);
    expect((await signIn("new-password-456")).statusCode).toBe(200);

    const again = await app.inject({
      method: "POST",
      url: "/api/auth/reset-password",
      payload: { token, newPassword: "third-password-789" },
    });
    expect(again.statusCode).toBe(400);
  });

  test("names are validated on update", async () => {
    const user = await signUp("named");
    const update = (name: string) =>
      request(user, { method: "POST", url: "/api/auth/update-user", payload: { name } });
    expect((await update("x".repeat(81))).statusCode).toBe(400);
    expect((await update("   ")).statusCode).toBe(400);
    expect((await update("New Name")).statusCode).toBe(200);
  });

  test("usage shows owned projects and stored bytes", async () => {
    const user = await signUp("measured");
    const p = await createProject(user, "Usage");
    await uploadBlob(user, p, "12345");
    const other = await createProject(user, "Usage 2");
    await uploadBlob(user, other, "12345");
    const usage = (await request(user, { method: "GET", url: "/api/account/usage" })).json<{
      projects: { used: number; limit: number };
      storage: { used: number; limit: number };
    }>();
    expect(usage.projects).toEqual({ used: 2, limit: 10 });
    expect(usage.storage).toEqual({ used: 5, limit: 64 * 1024 });
    expect((await request(null, { method: "GET", url: "/api/account/usage" })).statusCode).toBe(
      401,
    );
  });
});

describe("admin", () => {
  let admin: User & { email: string };

  beforeAll(async () => {
    admin = await signUp("admin");
    await db.update(user).set({ role: "admin" }).where(eq(user.id, admin.id));
  });

  const signIn = (email: string, remoteAddress: string) =>
    app.inject({
      method: "POST",
      url: "/api/auth/sign-in/email",
      remoteAddress,
      payload: { email, password: "password123" },
    });

  test("only admins reach the admin API", async () => {
    const target = `/api/admin/users/${users.stranger.id}`;
    const endpoints: InjectOptions[] = [
      { method: "GET", url: "/api/admin/stats" },
      { method: "GET", url: "/api/admin/users" },
      { method: "GET", url: "/api/admin/projects" },
      { method: "PATCH", url: target, payload: { role: "admin" } },
      { method: "POST", url: `${target}/sign-out` },
      { method: "DELETE", url: target },
    ];
    for (const endpoint of endpoints) {
      const label = JSON.stringify(endpoint);
      expect((await request(null, endpoint)).statusCode, label).toBe(401);
      expect((await request(users.owner, endpoint)).statusCode, label).toBe(403);
    }
    expect((await request(admin, endpoints[0]!)).statusCode).toBe(200);
  });

  test("users can't make themselves admins", async () => {
    await request(users.stranger, {
      method: "POST",
      url: "/api/auth/update-user",
      payload: { role: "admin", banned: false },
    });
    const [row] = await db
      .select({ role: user.role })
      .from(user)
      .where(eq(user.id, users.stranger.id));
    expect(row?.role).toBe("user");
    const res = await request(users.stranger, { method: "GET", url: "/api/admin/stats" });
    expect(res.statusCode).toBe(403);
  });

  test("lists show usage but never project names", async () => {
    const writer = await signUp("writer");
    const p = await createProject(writer, "Secret novel");
    expect((await uploadBlob(writer, p, "12345")).statusCode).toBe(200);
    await compileProject(writer, p);

    const stats = await request(admin, { method: "GET", url: "/api/admin/stats" });
    expect(stats.statusCode, stats.body).toBe(200);
    const { users: userStats, compiles } = stats.json<{
      users: { total: number };
      compiles: { date: string; success: number }[];
    }>();
    expect(userStats.total).toBeGreaterThanOrEqual(5);
    expect(compiles).toHaveLength(30);
    expect(compiles.at(-1)!.success).toBeGreaterThan(0);

    const list = await request(admin, {
      method: "GET",
      url: `/api/admin/users?q=${encodeURIComponent(writer.email)}`,
    });
    expect(list.statusCode, list.body).toBe(200);
    expect(list.json()).toMatchObject({
      total: 1,
      users: [{ id: writer.id, projects: 1, storageBytes: 5, compiles30d: 1 }],
    });

    const projectList = await request(admin, { method: "GET", url: `/api/admin/projects?q=${p}` });
    expect(projectList.statusCode, projectList.body).toBe(200);
    expect(projectList.json()).toMatchObject({
      total: 1,
      projects: [{ id: p, members: 1, uploads: 1, uploadBytes: 5, compiles30d: 1 }],
    });
    expect(projectList.body).not.toContain("Secret novel");
  });

  test("per-user limits override the defaults until reset", async () => {
    const target = await signUp("limited");
    const setLimits = (payload: object) =>
      request(admin, { method: "PATCH", url: `/api/admin/users/${target.id}`, payload });
    const create = () =>
      request(target, { method: "POST", url: "/api/projects", payload: { name: "x" } });

    expect((await setLimits({ projectLimit: 1, storageLimitMb: 5 })).statusCode).toBe(204);
    expect((await create()).statusCode).toBe(201);
    expect((await create()).statusCode).toBe(403);
    const usage = (await request(target, { method: "GET", url: "/api/account/usage" })).json<{
      projects: { limit: number };
      storage: { limit: number };
    }>();
    expect(usage.projects.limit).toBe(1);
    expect(usage.storage.limit).toBe(5 * 1024 * 1024);

    expect((await setLimits({ projectLimit: null })).statusCode).toBe(204);
    expect((await create()).statusCode).toBe(201);
    expect((await setLimits({ projectLimit: -1 })).statusCode).toBe(400);
  });

  test("a banned user is signed out everywhere and can't sign in until unbanned", async () => {
    const target = await signUp("troll");
    const p = await createProject(target, "Troll");
    const ban = (banned: boolean) =>
      request(admin, {
        method: "PATCH",
        url: `/api/admin/users/${target.id}`,
        payload: { banned },
      });

    revoked.length = 0;
    expect((await ban(true)).statusCode).toBe(204);
    expect(revoked).toContain(p);
    expect((await request(target, { method: "GET", url: "/api/projects" })).statusCode).toBe(401);
    expect((await signIn(target.email, "10.7.0.1")).statusCode).toBe(403);

    expect((await ban(false)).statusCode).toBe(204);
    expect((await signIn(target.email, "10.7.0.1")).statusCode).toBe(200);
  });

  test("deleting a user removes their projects and their access to shared ones", async () => {
    const target = await signUp("leaving");
    const own = await createProject(target, "Own");
    await join_(target, await invite(users.owner, projectId, "viewer"));

    revoked.length = 0;
    const remove = () => request(admin, { method: "DELETE", url: `/api/admin/users/${target.id}` });
    expect((await remove()).statusCode).toBe(204);
    expect(revoked).toEqual(expect.arrayContaining([own, projectId]));
    const [left] = await db.select().from(projects).where(eq(projects.id, own));
    expect(left).toBeUndefined();
    expect((await remove()).statusCode).toBe(404);
  });

  test("admins can't lock themselves out", async () => {
    const url = `/api/admin/users/${admin.id}`;
    const ban = await request(admin, { method: "PATCH", url, payload: { banned: true } });
    const demote = await request(admin, { method: "PATCH", url, payload: { role: "user" } });
    const remove = await request(admin, { method: "DELETE", url });
    expect([ban.statusCode, demote.statusCode, remove.statusCode]).toEqual([400, 400, 400]);
  });
});
