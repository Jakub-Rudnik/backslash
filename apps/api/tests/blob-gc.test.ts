/**
 * Garbage collection of uploaded files against a real Postgres (TEST_DATABASE_URL). Rows and files
 * are backdated instead of collecting with no grace period, so data of other test files survives.
 */
import { collabDocuments, createDb, projectBlobs, runMigrations } from "@backslash/db";
import { createAuth } from "@backslash/db/auth";
import { createBlobFile, seedProject } from "@backslash/shared/doc";
import { eq, sql } from "drizzle-orm";
import type { FastifyInstance, InjectOptions } from "fastify";
import { createHash } from "node:crypto";
import { mkdtemp, rm, stat, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, expect, test, vi } from "vite-plus/test";
import * as Y from "yjs";
import { buildApp } from "../src/app.ts";
import { collectGarbage } from "../src/features/blobs/blob.gc.ts";
import type { CompileBackend } from "../src/features/compile/compile.backend.ts";
import { memoryRateLimits } from "../src/lib/rate-limit.ts";

const DB_URL =
  process.env.TEST_DATABASE_URL ?? "postgres://backslash:backslash@127.0.0.1:5432/backslash_test";
const { db, pool } = createDb(DB_URL);
const HOUR = 60 * 60 * 1000;

let blobDir: string;
let app: FastifyInstance;
let cookie: string;

const unused: CompileBackend = {
  run: () => Promise.reject(new Error("unused")),
  projectOf: async () => null,
  pdfPath: () => "",
};

/** contents differ per run, the test database keeps projects of earlier runs */
const unique = (content: string) => `${content} ${crypto.randomUUID()}`;
const sha256 = (content: string) => createHash("sha256").update(content).digest("hex");
const exists = (hash: string) =>
  stat(join(blobDir, hash)).then(
    () => true,
    () => false,
  );

function request(opts: InjectOptions) {
  return app.inject({ ...opts, headers: { ...opts.headers, cookie } });
}

const upload = (project: string, content: string) =>
  request({
    method: "POST",
    url: `/api/projects/${project}/blobs`,
    headers: { "content-type": "application/octet-stream" },
    payload: Buffer.from(content),
  });

async function createProject(...blobs: string[]) {
  const { id } = (
    await request({ method: "POST", url: "/api/projects", payload: { name: "GC" } })
  ).json<{
    id: string;
  }>();
  const doc = new Y.Doc();
  seedProject(doc, "\\documentclass{article}");
  for (const content of blobs) {
    expect((await upload(id, content)).statusCode).toBe(200);
    createBlobFile(doc, `${sha256(content).slice(0, 8)}.png`, sha256(content), content.length);
  }
  await db.insert(collabDocuments).values({ projectId: id, data: Y.encodeStateAsUpdate(doc) });
  return id;
}

/** Makes the project's registrations and the given files look older than the grace period. */
async function backdate(project: string | null, ...hashes: string[]) {
  if (project) {
    await db
      .update(projectBlobs)
      .set({ registeredAt: sql`now() - interval '2 hours'` })
      .where(eq(projectBlobs.projectId, project));
  }
  const old = new Date(Date.now() - 2 * HOUR);
  for (const hash of hashes) await utimes(join(blobDir, hash), old, old);
}

async function storageUsed() {
  return (await request({ method: "GET", url: "/api/account/usage" })).json<{
    storage: { used: number };
  }>().storage.used;
}

/** Holds the per-hash lock until `release` is called, so others queue behind it in order. */
async function holdLock(hash: string) {
  const client = await pool.connect();
  await client.query("begin");
  await client.query("select pg_advisory_xact_lock(hashtextextended($1, 0))", [hash]);
  return async () => {
    await client.query("commit");
    client.release();
  };
}

async function waitForLockWaiters(hash: string, count: number) {
  await vi.waitFor(async () => {
    const { rows } = await pool.query<{ n: number }>(
      `select count(*)::int as n from pg_locks, (select hashtextextended($1, 0) as k) key
       where locktype = 'advisory' and not granted
         and classid = ((k >> 32) & 4294967295)::oid and objid = (k & 4294967295)::oid`,
      [hash],
    );
    expect(rows[0]!.n).toBe(count);
  });
}

beforeAll(async () => {
  await runMigrations(pool);
  blobDir = await mkdtemp(join(tmpdir(), "blobs-gc-"));
  const rateLimits = memoryRateLimits();
  app = buildApp({
    db,
    auth: createAuth({
      db,
      secret: "test-secret-test-secret-test-secret",
      baseURL: "http://localhost:5173",
      trustedOrigins: [],
      rateLimits,
    }),
    rateLimits,
    quotas: { projectsPerUser: 10, storagePerUser: 1024 * 1024 },
    events: { accessChanged: async () => {} },
    compile: unused,
    snapshots: async () => null,
    publishBuild: async () => {},
    blobDir,
    trustedOrigins: [],
    config: { github: false, passwordReset: false },
  });
  await app.ready();
  const res = await app.inject({
    method: "POST",
    url: "/api/auth/sign-up/email",
    payload: {
      name: "gc",
      email: `gc-${crypto.randomUUID()}@example.com`,
      password: "password123",
    },
  });
  cookie = [res.headers["set-cookie"]].flat()[0]!.split(";")[0]!;
});

afterAll(async () => {
  await app.close();
  await pool.end();
  await rm(blobDir, { recursive: true, force: true });
});

test("collects files no project uses and keeps the ones in use", async () => {
  const used = unique("figure in use");
  const shared = unique("figure of a deleted project, also in use elsewhere");
  const deleted = unique("figure deleted from the project");
  const orphan = unique("figure of a deleted project");
  const kept = await createProject(used, shared);
  const gone = await createProject(shared, orphan);
  expect((await upload(kept, deleted)).statusCode).toBe(200);
  expect((await request({ method: "DELETE", url: `/api/projects/${gone}` })).statusCode).toBe(204);
  const unregistered = unique("upload that never got registered");
  await writeFile(join(blobDir, sha256(unregistered)), unregistered);
  await writeFile(join(blobDir, ".tmp-crashed"), "partial");
  const fresh = unique("upload just stored");
  await writeFile(join(blobDir, sha256(fresh)), fresh);

  const reuploaded = unique("figure uploaded again, not in the saved doc yet");
  expect((await upload(kept, reuploaded)).statusCode).toBe(200);

  const all = [used, shared, deleted, orphan, unregistered, reuploaded].map(sha256);
  await backdate(kept, ...all, ".tmp-crashed");
  expect((await upload(kept, reuploaded)).statusCode).toBe(200);
  expect(await storageUsed()).toBe(
    used.length + shared.length + deleted.length + reuploaded.length,
  );

  await collectGarbage(db, blobDir, HOUR);

  expect(await exists(sha256(used))).toBe(true);
  expect(await exists(sha256(shared))).toBe(true);
  expect(await exists(sha256(fresh))).toBe(true);
  expect(await exists(sha256(reuploaded))).toBe(true);
  expect(await exists(sha256(deleted))).toBe(false);
  expect(await exists(sha256(orphan))).toBe(false);
  expect(await exists(sha256(unregistered))).toBe(false);
  expect(await exists(".tmp-crashed")).toBe(false);
  expect(await storageUsed()).toBe(used.length + shared.length + reuploaded.length);
  expect(
    (await request({ method: "GET", url: `/api/projects/${kept}/blobs/${sha256(used)}` }))
      .statusCode,
  ).toBe(200);
});

test("a re-upload keeps a file that is collected concurrently", async () => {
  const content = unique("figure uploaded again while it is collected");
  const hash = sha256(content);
  const project = await createProject();
  await writeFile(join(blobDir, hash), content);
  await backdate(null, hash);

  const release = await holdLock(hash);
  const collected = collectGarbage(db, blobDir, HOUR);
  await waitForLockWaiters(hash, 1);
  const uploaded = upload(project, content);
  await waitForLockWaiters(hash, 2);
  await release();

  expect((await uploaded).statusCode).toBe(200);
  await collected;
  expect(await exists(hash)).toBe(true);
});

test("an upload waiting behind the collector is told to retry and registers nothing", async () => {
  const content = unique("figure collected before its upload registers");
  const hash = sha256(content);
  const project = await createProject();
  await writeFile(join(blobDir, hash), content);
  await backdate(null, hash);

  const release = await holdLock(hash);
  const collected = collectGarbage(db, blobDir, HOUR);
  await waitForLockWaiters(hash, 1);
  const uploaded = upload(project, content);
  await waitForLockWaiters(hash, 2);
  await backdate(null, hash);
  await release();

  expect((await uploaded).statusCode).toBe(503);
  await collected;
  expect(await exists(hash)).toBe(false);
  const rows = await db.select().from(projectBlobs).where(eq(projectBlobs.projectId, project));
  expect(rows).toEqual([]);
  expect((await upload(project, content)).statusCode).toBe(200);
});

test("the collector waiting behind an upload keeps the file it registers", async () => {
  const content = unique("figure registered while the collector waits");
  const hash = sha256(content);
  const project = await createProject();

  const release = await holdLock(hash);
  const uploaded = upload(project, content);
  await waitForLockWaiters(hash, 1);
  await backdate(null, hash);
  const collected = collectGarbage(db, blobDir, HOUR);
  await waitForLockWaiters(hash, 2);
  await release();

  expect((await uploaded).statusCode).toBe(200);
  await collected;
  expect(await exists(hash)).toBe(true);
});
