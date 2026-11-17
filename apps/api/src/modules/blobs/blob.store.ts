import { createHash, randomUUID } from "node:crypto";
import { createWriteStream } from "node:fs";
import { mkdir, rename, rm, stat } from "node:fs/promises";
import { join } from "node:path";
import { Transform, type Readable } from "node:stream";
import { pipeline } from "node:stream/promises";

export class BlobTooLargeError extends Error {}

/** Content-addressed file store: blobs live at <dir>/<sha256>. */
export function blobPath(dir: string, hash: string) {
  return join(dir, hash);
}

/** Streams `input` into the store, enforcing `maxSize`. Returns its sha256 and size. */
export async function storeBlob(dir: string, input: Readable, maxSize: number) {
  await mkdir(dir, { recursive: true });
  const hash = createHash("sha256");
  let size = 0;
  const meter = new Transform({
    transform(chunk: Buffer, _enc, done) {
      size += chunk.length;
      if (size > maxSize) return done(new BlobTooLargeError());
      hash.update(chunk);
      done(null, chunk);
    },
  });

  // write to a temp name first, so a half-written upload never shows up under a hash
  const tmp = join(dir, `.tmp-${randomUUID()}`);
  // input is piped (not part of the pipeline): on a size error the pipeline would destroy
  // the request socket before the route could send its 413
  const written = pipeline(meter, createWriteStream(tmp));
  const onInputError = (err: Error) => meter.destroy(err);
  input.on("error", onInputError);
  input.pipe(meter);
  try {
    await written;
    const digest = hash.digest("hex");
    // same content already stored: rename just replaces it with identical bytes
    await rename(tmp, blobPath(dir, digest));
    return { hash: digest, size };
  } catch (err) {
    // stop writing, discard the rest of the body
    input.unpipe(meter);
    input.resume();
    throw err;
  } finally {
    input.off("error", onInputError);
    await rm(tmp, { force: true });
  }
}

export async function blobExists(dir: string, hash: string) {
  try {
    return (await stat(blobPath(dir, hash))).isFile();
  } catch {
    return false;
  }
}
