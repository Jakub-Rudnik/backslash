import { expect, test } from "vite-plus/test";
import { searchFiles } from "@/features/search/search";

test("finds every case-insensitive match, grouped by file in path order", () => {
  const files = [
    { id: "b", path: "b.tex", text: "nothing here" },
    { id: "m", path: "main.tex", text: "Intro\nthe LaTeX intro, again: INTRO" },
    { id: "a", path: "a.tex", text: "an intro" },
  ];
  expect(searchFiles(files, "intro").files).toEqual([
    { id: "a", path: "a.tex", matches: [{ line: 1, text: "an intro", from: 3, to: 8 }] },
    {
      id: "m",
      path: "main.tex",
      matches: [
        { line: 1, text: "Intro", from: 0, to: 5 },
        { line: 2, text: "the LaTeX intro, again: INTRO", from: 10, to: 15 },
        { line: 2, text: "the LaTeX intro, again: INTRO", from: 24, to: 29 },
      ],
    },
  ]);
});

test("matches nothing for a blank query, and stops at the match limit", () => {
  const files = [{ id: "m", path: "main.tex", text: "aaaa\naaaa" }];
  expect(searchFiles(files, "  ")).toEqual({ files: [], truncated: false });
  const capped = searchFiles(files, "a", 5);
  expect(capped.truncated).toBe(true);
  expect(capped.files[0].matches.map((m) => [m.line, m.from])).toEqual([
    [1, 0],
    [1, 1],
    [1, 2],
    [1, 3],
    [2, 0],
  ]);
});
