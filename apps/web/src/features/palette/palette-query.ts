export type PaletteMode = "files" | "commands" | "headings";

const PREFIXES: Record<string, PaletteMode> = { ">": "commands", "@": "headings" };

/** `>` lists commands, `@` Outline headings, anything else files. */
export function parsePaletteInput(input: string): { mode: PaletteMode; query: string } {
  const mode = PREFIXES[input[0]];
  return mode ? { mode, query: input.slice(1).trim() } : { mode: "files", query: input.trim() };
}

/**
 * Items whose label contains every word of `query` (case-insensitive, any order). Those where
 * the first word appears earlier come first, then shorter labels.
 */
export function filterPalette<T>(items: T[], query: string, label: (item: T) => string): T[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return items;
  return items
    .flatMap((item) => {
      const text = label(item).toLowerCase();
      if (!words.every((w) => text.includes(w))) return [];
      return [{ item, at: text.indexOf(words[0]), length: text.length }];
    })
    .toSorted((a, b) => a.at - b.at || a.length - b.length)
    .map((m) => m.item);
}
