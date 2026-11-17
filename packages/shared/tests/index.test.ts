import { expect, test } from "vite-plus/test";
import {
  CompileRequest,
  FilePath,
  isTextPath,
  ProjectId,
  resolvePathConflicts,
  sanitizePath,
} from "../src/index.ts";

const main = { path: "main.tex", content: "\\documentclass{article}" };

test("accepts valid compile request", () => {
  const req = { files: [main, { path: "ch/a.tex", content: "" }], mainFile: "main.tex" };
  expect(CompileRequest.safeParse(req).success).toBe(true);
});

test("rejects too long file", () => {
  const req = {
    files: [{ path: "main.tex", content: "a".repeat(1_000_001) }],
    mainFile: "main.tex",
  };
  expect(CompileRequest.safeParse(req).success).toBe(false);
});

test("rejects too large project", () => {
  const files = Array.from({ length: 6 }, (_, i) => ({
    path: `${i}.tex`,
    content: "a".repeat(999_999),
  }));
  expect(CompileRequest.safeParse({ files, mainFile: "0.tex" }).success).toBe(false);
});

test("rejects missing or non-tex main file", () => {
  expect(CompileRequest.safeParse({ files: [main], mainFile: "other.tex" }).success).toBe(false);
  const bib = { path: "refs.bib", content: "" };
  expect(CompileRequest.safeParse({ files: [main, bib], mainFile: "refs.bib" }).success).toBe(
    false,
  );
});

test("rejects path conflicts", () => {
  const dup = { files: [main, main], mainFile: "main.tex" };
  expect(CompileRequest.safeParse(dup).success).toBe(false);
  const fileVsDir = {
    files: [main, { path: "a", content: "" }, { path: "a/b.tex", content: "" }],
    mainFile: "main.tex",
  };
  expect(CompileRequest.safeParse(fileVsDir).success).toBe(false);
});

test("file path", () => {
  for (const ok of ["main.tex", "ch/intro.tex", "img/fig-1_a.png", "Makefile"]) {
    expect(FilePath.safeParse(ok).success, ok).toBe(true);
  }
  for (const bad of [
    "",
    "/etc/passwd",
    "../x.tex",
    "a/../b",
    "a//b",
    "a/",
    ".latexmkrc",
    "a b.tex",
    "ä.tex",
    "a\\b",
  ]) {
    expect(FilePath.safeParse(bad).success, bad).toBe(false);
  }
});

test("project id", () => {
  expect(ProjectId.safeParse("aB3_-xYz12").success).toBe(true);
  expect(ProjectId.safeParse("short").success).toBe(false);
  expect(ProjectId.safeParse("../../etc/passwd").success).toBe(false);
});

test("resolves path conflicts deterministically", () => {
  const files = [
    { id: "b", path: "intro.tex" },
    { id: "a", path: "intro.tex" },
    { id: "c", path: "intro.tex" },
    { id: "d", path: "ch" },
    { id: "e", path: "ch/x.tex" },
    { id: "f", path: "fig" },
    { id: "0", path: "fig/y.png" },
  ];
  const byId = Object.fromEntries(resolvePathConflicts(files).map((f) => [f.id, f.path]));
  expect(byId).toEqual({
    a: "intro.tex",
    b: "intro-2.tex",
    c: "intro-3.tex",
    d: "ch",
    e: "ch-2/x.tex",
    "0": "fig/y.png",
    f: "fig-2",
  });
});

test("compile request with blobs", () => {
  const img = { path: "fig.png", hash: "f".repeat(64) };
  expect(CompileRequest.safeParse({ files: [main, img], mainFile: "main.tex" }).success).toBe(true);
  const bad = { path: "fig.png", hash: "../etc/passwd" };
  expect(CompileRequest.safeParse({ files: [main, bad], mainFile: "main.tex" }).success).toBe(
    false,
  );
  expect(CompileRequest.safeParse({ files: [img], mainFile: "fig.png" }).success).toBe(false);
});

test("sanitizes uploaded names", () => {
  expect(sanitizePath("Wykres 1 (końcowy).PNG")).toBe("Wykres-1-koncowy.PNG");
  expect(sanitizePath("Łódź/zdjęcie.jpg")).toBe("Lodz/zdjecie.jpg");
  expect(sanitizePath("../../etc/passwd")).toBe("etc/passwd");
  expect(sanitizePath(".latexmkrc")).toBe("latexmkrc");
  expect(sanitizePath("???.png")).toBe("png");
  for (const p of ["a b/c d.tex", "ä.png", "x//y", "-a"]) {
    expect(FilePath.safeParse(sanitizePath(p)).success, p).toBe(true);
  }
});

test("shortens long paths to valid ones", () => {
  const cases = [
    `${"a".repeat(254)}/b.tex`,
    `dir/${"n".repeat(300)}.png`,
    `${"d".repeat(100)}/${"e".repeat(100)}/${"f".repeat(100)}.tex`,
    "x".repeat(400),
  ];
  for (const p of cases) {
    const out = sanitizePath(p);
    expect(out.length).toBeLessThanOrEqual(255);
    expect(FilePath.safeParse(out).success, out).toBe(true);
  }
  expect(sanitizePath(`dir/${"n".repeat(300)}.png`)).toMatch(/^dir\/n+\.png$/);
  expect(sanitizePath(`${"a".repeat(254)}/b.tex`)).toBe("b.tex");
});

test("text vs binary by extension", () => {
  expect(isTextPath("main.tex")).toBe(true);
  expect(isTextPath("refs.BIB")).toBe(true);
  expect(isTextPath("fig.png")).toBe(false);
  expect(isTextPath("Makefile")).toBe(false);
});
