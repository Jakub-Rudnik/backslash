import { expect, test } from "vite-plus/test";
import { parseLog } from "../src/parse-log.ts";

const files = new Set(["main.tex", "ch/a.tex"]);

test("file-line-error in a project file", () => {
  const log = [
    "(./ch/a.tex",
    "./ch/a.tex:3: Undefined control sequence.",
    "l.3 \\foo",
    "./ch/a.tex:3:  ==> Fatal error occurred, no output PDF file produced!",
  ].join("\n");
  expect(parseLog(log, files)).toEqual([
    { file: "ch/a.tex", line: 3, message: "Undefined control sequence." },
  ]);
});

test("error inside a package is not attributed to a project file", () => {
  const log = "/usr/share/texmf/tex/latex/foo/foo.sty:120: Package foo Error: bad.";
  expect(parseLog(log, files)).toEqual([
    { file: null, line: null, message: "Package foo Error: bad." },
  ]);
});

test("classic error without file, then emergency stop", () => {
  const log = [
    "! LaTeX Error: File `nope.sty' not found.",
    "",
    "l.2 \\usepackage",
    "./main.tex:2: Emergency stop.",
    "./main.tex:2:  ==> Fatal error occurred, no output PDF file produced!",
  ].join("\n");
  expect(parseLog(log, files)).toEqual([
    { file: null, line: 2, message: "LaTeX Error: File `nope.sty' not found." },
  ]);
});

test("lone emergency stop is kept", () => {
  expect(parseLog("./main.tex:7: Emergency stop.", files)).toEqual([
    { file: "main.tex", line: 7, message: "Emergency stop." },
  ]);
});

test("clean log has no errors", () => {
  expect(parseLog("Output written on output.pdf (1 page).", files)).toEqual([]);
});
