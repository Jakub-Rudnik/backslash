import type { DocFile } from "@backslash/shared/doc";
import { strToU8, zip, type Zippable } from "fflate";
import { fetchBlob } from "@/lib/api";

/** Builds a .zip of the whole project and starts the download. */
export async function downloadProjectZip(files: DocFile[], name: string) {
  const entries: Zippable = {};
  await Promise.all(
    files.map(async (f) => {
      entries[f.path] =
        f.kind === "text"
          ? strToU8(f.text.toJSON())
          : new Uint8Array(await (await fetchBlob(f.hash)).arrayBuffer());
    }),
  );
  const data = await new Promise<Uint8Array>((resolve, reject) =>
    zip(entries, (err, out) => (err ? reject(err) : resolve(out))),
  );
  const url = URL.createObjectURL(
    new Blob([data as Uint8Array<ArrayBuffer>], { type: "application/zip" }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
