import { expect, test } from "vite-plus/test";
import * as Y from "yjs";
import {
  createBlobFile,
  createFile,
  deleteFile,
  deleteFolder,
  getMainFile,
  LEGACY_TEXT_FIELD,
  listFiles,
  renameFile,
  renameFolder,
  replaceFile,
  seedProject,
  setMainFile,
  upsertFile,
  validatePath,
  type DocFile,
} from "../src/doc.ts";

const content = (f: DocFile | undefined) => (f?.kind === "text" ? f.text.toJSON() : f?.hash);

test("seeds empty doc with main.tex", () => {
  const doc = new Y.Doc();
  expect(seedProject(doc, "hello")).toBe(true);
  expect(seedProject(doc, "hello")).toBe(false);
  const [file] = listFiles(doc);
  expect(file?.path).toBe("main.tex");
  expect(content(file)).toBe("hello");
  expect(getMainFile(doc)?.id).toBe(file?.id);
});

test("migrates legacy single-file doc", () => {
  const doc = new Y.Doc();
  doc.getText(LEGACY_TEXT_FIELD).insert(0, "old");
  seedProject(doc, "default");
  expect(content(listFiles(doc)[0])).toBe("old");
  expect(doc.getText(LEGACY_TEXT_FIELD).length).toBe(0);
});

test("create, rename, delete", () => {
  const doc = new Y.Doc();
  const id = createFile(doc, "a.tex", "x");
  expect(() => createFile(doc, "a.tex")).toThrow();
  expect(() => createFile(doc, "a.tex/b.tex")).toThrow();
  expect(validatePath(doc, "../a.tex")).not.toBeNull();

  renameFile(doc, id, "ch/a.tex");
  expect(listFiles(doc).map((f) => f.path)).toEqual(["ch/a.tex"]);
  expect(content(listFiles(doc)[0])).toBe("x");
  // renaming onto itself is fine
  expect(validatePath(doc, "ch/a.tex", id)).toBeNull();

  deleteFile(doc, id);
  expect(listFiles(doc)).toEqual([]);
});

test("main file falls back to main.tex, then first .tex", () => {
  const doc = new Y.Doc();
  createFile(doc, "refs.bib");
  const b = createFile(doc, "b.tex");
  expect(getMainFile(doc)?.id).toBe(b);
  const main = createFile(doc, "main.tex");
  expect(getMainFile(doc)?.id).toBe(main);
  setMainFile(doc, b);
  expect(getMainFile(doc)?.id).toBe(b);
  deleteFile(doc, b);
  expect(getMainFile(doc)?.id).toBe(main);
});

test("concurrent creates of the same path converge", () => {
  const a = new Y.Doc();
  const b = new Y.Doc();
  createFile(a, "x.tex", "from a");
  createFile(b, "x.tex", "from b");
  Y.applyUpdate(a, Y.encodeStateAsUpdate(b));
  Y.applyUpdate(b, Y.encodeStateAsUpdate(a));
  const paths = (doc: Y.Doc) => listFiles(doc).map((f) => [f.path, content(f)]);
  expect(paths(a)).toEqual(paths(b));
  expect(
    paths(a)
      .map(([p]) => String(p))
      .toSorted((x, y) => x.localeCompare(y)),
  ).toEqual(["x-2.tex", "x.tex"]);
});

test("ignores malformed entries", () => {
  const doc = new Y.Doc();
  const files = doc.getMap("files");
  files.set("bad1", "not a map");
  const bad2 = new Y.Map();
  files.set("bad2", bad2);
  bad2.set("path", "../evil.tex");
  bad2.set("content", new Y.Text("x"));
  expect(listFiles(doc)).toEqual([]);
});

test("rename and delete folders", () => {
  const doc = new Y.Doc();
  createFile(doc, "ch/a.tex");
  createFile(doc, "ch/sub/b.tex");
  createFile(doc, "chx.tex");
  createFile(doc, "other/c.tex");
  const paths = () =>
    listFiles(doc)
      .map((f) => f.path)
      .toSorted((a, b) => a.localeCompare(b));

  expect(() => renameFolder(doc, "ch", "other")).not.toThrow();
  expect(paths()).toEqual(["chx.tex", "other/a.tex", "other/c.tex", "other/sub/b.tex"]);
  expect(() => renameFolder(doc, "other", "chx.tex")).toThrow();
  expect(() => renameFolder(doc, "other", "other/deeper")).toThrow();

  deleteFolder(doc, "other/sub");
  expect(paths()).toEqual(["chx.tex", "other/a.tex", "other/c.tex"]);
});

const HASH = "a".repeat(64);

test("blob files and replacing content", () => {
  const doc = new Y.Doc();
  const img = createBlobFile(doc, "fig.png", HASH, 10);
  expect(listFiles(doc)).toEqual([
    { kind: "blob", id: img, path: "fig.png", hash: HASH, size: 10 },
  ]);
  expect(() => createBlobFile(doc, "fig.png", HASH, 10)).toThrow();

  replaceFile(doc, img, { hash: "b".repeat(64), size: 20 });
  expect(listFiles(doc)[0]).toMatchObject({ kind: "blob", hash: "b".repeat(64), size: 20 });

  const tex = createFile(doc, "a.tex", "old");
  replaceFile(doc, tex, { text: "new" });
  expect(content(listFiles(doc).find((f) => f.id === tex))).toBe("new");

  // kind changes keep the id
  replaceFile(doc, tex, { hash: HASH, size: 1 });
  expect(listFiles(doc).find((f) => f.id === tex)?.kind).toBe("blob");
  replaceFile(doc, tex, { text: "back" });
  expect(content(listFiles(doc).find((f) => f.id === tex))).toBe("back");
});

test("blob is never the main file", () => {
  const doc = new Y.Doc();
  createBlobFile(doc, "main.tex", HASH, 1);
  expect(getMainFile(doc)).toBeNull();
});

test("ignores blobs with invalid hash", () => {
  const doc = new Y.Doc();
  const entry = new Y.Map();
  doc.getMap("files").set("x", entry);
  entry.set("path", "a.png");
  entry.set("hash", "../../etc/passwd");
  entry.set("size", 1);
  expect(listFiles(doc)).toEqual([]);
});

test("upsert creates or replaces by path", () => {
  const doc = new Y.Doc();
  const id = upsertFile(doc, "fig.png", { hash: HASH, size: 1 });
  expect(upsertFile(doc, "fig.png", { hash: "c".repeat(64), size: 2 })).toBe(id);
  expect(listFiles(doc)).toHaveLength(1);
  expect(listFiles(doc)[0]).toMatchObject({ hash: "c".repeat(64) });
});

test("file count limit", () => {
  const doc = new Y.Doc();
  for (let i = 0; i < 200; i++) createFile(doc, `f${i}.tex`);
  expect(() => createFile(doc, "one-more.tex")).toThrow(/at most/);
  // renames still work at the limit
  expect(validatePath(doc, "renamed.tex", listFiles(doc)[0]!.id)).toBeNull();
});

test("concurrent text replaces don't merge", () => {
  const a = new Y.Doc();
  const id = createFile(a, "a.tex", "original");
  const b = new Y.Doc();
  Y.applyUpdate(b, Y.encodeStateAsUpdate(a));
  replaceFile(a, id, { text: "from a" });
  replaceFile(b, id, { text: "from b" });
  Y.applyUpdate(a, Y.encodeStateAsUpdate(b));
  Y.applyUpdate(b, Y.encodeStateAsUpdate(a));
  const result = content(listFiles(a)[0]);
  expect(result).toBe(content(listFiles(b)[0]));
  expect(["from a", "from b"]).toContain(result);
});
