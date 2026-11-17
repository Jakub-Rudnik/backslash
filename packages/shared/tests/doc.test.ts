import { expect, test } from "vite-plus/test";
import * as Y from "yjs";
import {
  createFile,
  deleteFile,
  deleteFolder,
  getMainFile,
  LEGACY_TEXT_FIELD,
  listFiles,
  renameFile,
  renameFolder,
  seedProject,
  setMainFile,
  validatePath,
} from "../src/doc.ts";

test("seeds empty doc with main.tex", () => {
  const doc = new Y.Doc();
  expect(seedProject(doc, "hello")).toBe(true);
  expect(seedProject(doc, "hello")).toBe(false);
  const [file] = listFiles(doc);
  expect(file?.path).toBe("main.tex");
  expect(file?.text.toJSON()).toBe("hello");
  expect(getMainFile(doc)?.id).toBe(file?.id);
});

test("migrates legacy single-file doc", () => {
  const doc = new Y.Doc();
  doc.getText(LEGACY_TEXT_FIELD).insert(0, "old");
  seedProject(doc, "default");
  expect(listFiles(doc)[0]?.text.toJSON()).toBe("old");
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
  expect(listFiles(doc)[0]?.text.toJSON()).toBe("x");
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
  const paths = (doc: Y.Doc) => listFiles(doc).map((f) => [f.path, f.text.toJSON()]);
  expect(paths(a)).toEqual(paths(b));
  expect(
    paths(a)
      .map(([p]) => p)
      .toSorted(),
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
      .toSorted();

  expect(() => renameFolder(doc, "ch", "other")).not.toThrow();
  expect(paths()).toEqual(["chx.tex", "other/a.tex", "other/c.tex", "other/sub/b.tex"]);
  expect(() => renameFolder(doc, "other", "chx.tex")).toThrow();
  expect(() => renameFolder(doc, "other", "other/deeper")).toThrow();

  deleteFolder(doc, "other/sub");
  expect(paths()).toEqual(["chx.tex", "other/a.tex", "other/c.tex"]);
});
