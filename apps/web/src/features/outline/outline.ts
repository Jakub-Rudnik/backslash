/** A heading of the Outline: `level` 0 is `\part`, 4 is `\subsubsection`; `line` is 1-based. */
export interface OutlineHeading {
  level: number;
  title: string;
  path: string;
  line: number;
}

const LEVELS: Record<string, number> = {
  part: 0,
  chapter: 1,
  section: 2,
  subsection: 3,
  subsubsection: 4,
};

const COMMAND = /\\(part|chapter|section|subsection|subsubsection|input|include)\b\*?\s*/g;

/** Index just past the group that opens at `start` (`{` or `[`), or -1 when it never closes. */
function groupEnd(text: string, start: number, open: string, close: string) {
  let depth = 0;
  for (let i = start; i < text.length; i++) {
    if (text[i] === "\\") i++;
    else if (text[i] === open) depth++;
    else if (text[i] === close && --depth === 0) return i + 1;
  }
  return -1;
}

/** `text` with comments blanked out, keeping every offset and line where it was. */
function withoutComments(text: string) {
  let out = "";
  let comment = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === "\n") comment = false;
    else if (!comment && c === "\\") {
      out += c + (text[i + 1] ?? "");
      i++;
      continue;
    } else if (c === "%") comment = true;
    out += comment ? " " : c;
  }
  return out;
}

/** Where LaTeX finds `\input{name}`: compiles run from the project root, `.tex` is optional. */
function includedPath(name: string, readFile: (path: string) => string | null) {
  const path = name.trim().replace(/^\.\//, "");
  return readFile(path) === null ? `${path}.tex` : path;
}

/** The Outline of the document that starts at `mainPath`; `readFile` returns a text file's content. */
export function buildOutline(
  mainPath: string,
  readFile: (path: string) => string | null,
): OutlineHeading[] {
  const headings: OutlineHeading[] = [];
  const visited = new Set<string>();
  const visit = (path: string) => {
    const raw = visited.has(path) ? null : readFile(path);
    if (raw === null) return;
    visited.add(path);
    const text = withoutComments(raw);
    for (const match of text.matchAll(COMMAND)) {
      let at = match.index + match[0].length;
      if (text[at] === "[") at = groupEnd(text, at, "[", "]");
      if (at < 0 || text[at] !== "{") continue;
      const end = groupEnd(text, at, "{", "}");
      if (end < 0) continue;
      const arg = text.slice(at + 1, end - 1);
      if (match[1] === "input" || match[1] === "include") {
        visit(includedPath(arg, readFile));
        continue;
      }
      headings.push({
        level: LEVELS[match[1]],
        title: arg.replace(/\s+/g, " ").trim(),
        path,
        line: text.slice(0, match.index).split("\n").length,
      });
    }
  };
  visit(mainPath);
  return headings;
}
