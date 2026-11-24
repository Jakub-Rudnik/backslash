import { expect, test } from "vite-plus/test";
import { buildOutline } from "@/features/outline/outline";

const project = (files: Record<string, string>) => (path: string) => files[path] ?? null;

test("lists the main file's headings with their level and line", () => {
  const read = project({
    "main.tex": [
      "\\documentclass{book}",
      "\\begin{document}",
      "\\part{Basics}",
      "\\chapter{Intro}",
      "\\section*{Why}",
      "\\subsection[Short]{A {nested} title}",
      "\\subsubsection{Detail}",
      "\\end{document}",
    ].join("\n"),
  });
  expect(buildOutline("main.tex", read)).toEqual([
    { level: 0, title: "Basics", path: "main.tex", line: 3 },
    { level: 1, title: "Intro", path: "main.tex", line: 4 },
    { level: 2, title: "Why", path: "main.tex", line: 5 },
    { level: 3, title: "A {nested} title", path: "main.tex", line: 6 },
    { level: 4, title: "Detail", path: "main.tex", line: 7 },
  ]);
});

test("follows \\input and \\include in reading order, from the project root", () => {
  const read = project({
    "src/main.tex":
      "\\section{One}\n\\input{chapters/two}\n\\section{Four}\n\\include{chapters/five}",
    "chapters/two.tex": "\\section{Two}\n\\input{chapters/three.tex}",
    "chapters/three.tex": "\n\\subsection{Three}",
    "chapters/five.tex": "\\section{Five}",
  });
  expect(buildOutline("src/main.tex", read).map((h) => [h.title, h.path, h.line])).toEqual([
    ["One", "src/main.tex", 1],
    ["Two", "chapters/two.tex", 1],
    ["Three", "chapters/three.tex", 2],
    ["Four", "src/main.tex", 3],
    ["Five", "chapters/five.tex", 1],
  ]);
});

test("skips commented-out headings and survives include cycles", () => {
  const read = project({
    "main.tex": [
      "% \\section{Hidden}",
      "\\section{Costs 5\\% more} % \\section{Also hidden}",
      "%\\input{gone}",
      "\\input{loop}",
    ].join("\n"),
    "loop.tex": "\\subsection{Loop}\n\\input{main}\n\\input{loop}",
    "gone.tex": "\\section{Gone}",
  });
  expect(buildOutline("main.tex", read).map((h) => [h.title, h.line])).toEqual([
    ["Costs 5\\% more", 2],
    ["Loop", 1],
  ]);
});

test("joins a title written over several lines", () => {
  const read = project({ "main.tex": "\\section{A long\n   title}" });
  expect(buildOutline("main.tex", read)[0].title).toBe("A long title");
});
