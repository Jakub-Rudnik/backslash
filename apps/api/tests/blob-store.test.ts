import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PassThrough, Readable } from "node:stream";
import { afterAll, beforeAll, expect, test } from "vite-plus/test";
import { blobPath, BlobTooLargeError, storeBlob } from "../src/features/blobs/blob.store.ts";

let dir: string;

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), "blobs-"));
});

afterAll(async () => {
  await rm(dir, { recursive: true, force: true });
});

const tmpFiles = async () => (await readdir(dir)).filter((f) => f.startsWith(".tmp"));

test("blobs are content-addressed and deduplicated", async () => {
  const first = await storeBlob(dir, Readable.from([Buffer.from("hello")]), 100);
  expect(first).toEqual({
    hash: "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824",
    size: 5,
  });
  await storeBlob(dir, Readable.from([Buffer.from("hello")]), 100);
  expect((await readdir(dir)).filter((f) => !f.startsWith("."))).toHaveLength(1);
  expect(await readFile(blobPath(dir, first.hash), "utf8")).toBe("hello");
});

test("too large stream is rejected without destroying the source", async () => {
  const source = new PassThrough();
  const stored = storeBlob(dir, source, 15);
  source.write(Buffer.alloc(10));
  source.write(Buffer.alloc(10));
  await expect(stored).rejects.toBeInstanceOf(BlobTooLargeError);
  expect(source.destroyed).toBe(false);
  expect(await tmpFiles()).toEqual([]);
});
