import { expect, test } from "vite-plus/test";
import { filterPalette, parsePaletteInput } from "@/features/palette/palette-query";

test("the first character picks the palette mode", () => {
  expect(parsePaletteInput("main")).toEqual({ mode: "files", query: "main" });
  expect(parsePaletteInput(">comp")).toEqual({ mode: "commands", query: "comp" });
  expect(parsePaletteInput("@ intro")).toEqual({ mode: "headings", query: "intro" });
});

test("keeps items containing every word, in any order, best matches first", () => {
  const items = ["chapters/intro.tex", "intro.tex", "main.tex", "figures/chapter-plot.png"];
  expect(filterPalette(items, "INTRO chap", (s) => s)).toEqual(["chapters/intro.tex"]);
  expect(filterPalette(items, "intro", (s) => s)).toEqual(["intro.tex", "chapters/intro.tex"]);
  expect(filterPalette(items, "", (s) => s)).toEqual(items);
});
