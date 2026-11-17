import { listFiles } from "@backslash/shared/doc";
import { expect, test } from "vite-plus/test";
import * as Y from "yjs";
import { ensureProject } from "../src/initial-state.ts";

const load = (state: Uint8Array) => {
  const doc = new Y.Doc();
  Y.applyUpdate(doc, state);
  return doc;
};

test("seeds a new project", () => {
  const state = ensureProject(null);
  expect(state).not.toBeNull();
  expect(listFiles(load(state!)).map((f) => f.path)).toEqual(["main.tex"]);
});

test("leaves existing projects alone", () => {
  expect(ensureProject(ensureProject(null))).toBeNull();
});

test("migrates a single-file doc", () => {
  const old = new Y.Doc();
  old.getText("source").insert(0, "old text");
  const [file] = listFiles(load(ensureProject(Y.encodeStateAsUpdate(old))!));
  expect(file?.kind === "text" && file.text.toJSON()).toBe("old text");
});
