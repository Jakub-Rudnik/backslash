import Fastify from "fastify";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, expect, test } from "vite-plus/test";
import { blobRoutes } from "../src/modules/blobs/blob.routes.ts";
import { healthRoutes } from "../src/modules/health/health.routes.ts";

let dir: string;
const app = Fastify();

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), "blobs-"));
  app.register(healthRoutes);
  app.register(blobRoutes, { prefix: "/blobs", dir });
  await app.ready();
});

afterAll(async () => {
  await app.close();
  await rm(dir, { recursive: true, force: true });
});

const upload = (body: Buffer | string, type = "application/octet-stream") =>
  app.inject({ method: "POST", url: "/blobs", headers: { "content-type": type }, body });

test("health", async () => {
  const res = await app.inject("/health");
  expect(res.json()).toEqual({ ok: true });
});

test("upload is content-addressed and deduplicated", async () => {
  const first = await upload("hello");
  expect(first.statusCode).toBe(200);
  expect(first.json()).toEqual({
    // sha256("hello")
    hash: "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824",
    size: 5,
  });
  await upload("hello");
  expect((await readdir(dir)).filter((f) => !f.startsWith("."))).toHaveLength(1);
});

test("download is served as an inert attachment", async () => {
  const { hash } = (await upload("<svg onload=alert(1)>")).json<{ hash: string }>();
  const res = await app.inject(`/blobs/${hash}`);
  expect(res.statusCode).toBe(200);
  expect(res.body).toBe("<svg onload=alert(1)>");
  expect(res.headers["content-type"]).toBe("application/octet-stream");
  expect(res.headers["x-content-type-options"]).toBe("nosniff");
  expect(res.headers["content-security-policy"]).toContain("sandbox");
});

test("rejects bad hashes, unknown blobs and wrong content type", async () => {
  expect((await app.inject("/blobs/..%2F..%2Fetc%2Fpasswd")).statusCode).toBe(400);
  expect((await app.inject(`/blobs/${"0".repeat(64)}`)).statusCode).toBe(404);
  expect((await upload("x", "text/plain")).statusCode).toBe(415);
});

test("rejects too large uploads without leaving temp files", async () => {
  const res = await upload(Buffer.alloc(20 * 1024 * 1024 + 1));
  expect(res.statusCode).toBe(413);
  expect((await readdir(dir)).filter((f) => f.startsWith(".tmp"))).toEqual([]);
});

test("too large stream is rejected without destroying the source", async () => {
  const { PassThrough } = await import("node:stream");
  const { storeBlob, BlobTooLargeError } = await import("../src/modules/blobs/blob.store.ts");
  // like a request still being received: never ends
  const source = new PassThrough();
  const stored = storeBlob(dir, source, 15);
  source.write(Buffer.alloc(10));
  source.write(Buffer.alloc(10));
  await expect(stored).rejects.toBeInstanceOf(BlobTooLargeError);
  expect(source.destroyed).toBe(false);
  expect((await readdir(dir)).filter((f) => f.startsWith(".tmp"))).toEqual([]);
});
