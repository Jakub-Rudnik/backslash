import type { CompileError } from "@backslash/shared";

const LINE_REF = /^l\.(\d+)/;
// how far after a "!" line to look for its "l.<n>" line reference
const LOOKAHEAD = 12;

/**
 * Extracts errors from a TeX log (classic, non file-line-error format).
 * Errors start with "! ", the source line follows as "l.<n> ...".
 */
export function parseLog(log: string): CompileError[] {
  const lines = log.split(/\r?\n/);
  const errors: CompileError[] = [];

  for (let i = 0; i < lines.length; i++) {
    const current = lines[i]!;
    if (!current.startsWith("! ")) continue;

    const message = current.slice(2).trim();
    // follow-up noise after the real error
    if (message.startsWith("==>")) continue;
    if (message === "Emergency stop." && errors.length > 0) continue;

    let line: number | null = null;
    for (let j = i + 1; j < Math.min(lines.length, i + 1 + LOOKAHEAD); j++) {
      const next = lines[j]!;
      if (next.startsWith("! ")) break;
      const match = LINE_REF.exec(next);
      if (match) {
        line = Number(match[1]);
        break;
      }
    }

    errors.push({ line, message });
  }

  return errors;
}
