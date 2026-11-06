import { expect, test } from "vite-plus/test";
import { parseLog } from "../src/parse-log.ts";

test("parses undefined control sequence with line", () => {
  const log = [
    "(./main.tex",
    "! Undefined control sequence.",
    "l.5 \\foo",
    "         ",
    "Here is how much of TeX's memory you used:",
  ].join("\n");

  expect(parseLog(log)).toEqual([{ line: 5, message: "Undefined control sequence." }]);
});

test("error without line reference", () => {
  const log = "! LaTeX Error: File `nope.sty' not found.\n\nType X to quit";
  expect(parseLog(log)).toEqual([
    { line: null, message: "LaTeX Error: File `nope.sty' not found." },
  ]);
});

test("skips trailing emergency stop", () => {
  const log = [
    "! Missing $ inserted.",
    "l.3 a^b",
    "! Emergency stop.",
    "l.3",
    "!  ==> Fatal error occurred, no output PDF file produced!",
  ].join("\n");
  expect(parseLog(log)).toEqual([{ line: 3, message: "Missing $ inserted." }]);
});

test("clean log has no errors", () => {
  expect(parseLog("Output written on main.pdf (1 page).")).toEqual([]);
});
