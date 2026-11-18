import type { CompileError } from "@backslash/shared";

const FILE_LINE_ERROR = /^(\S+?):(\d+): (.*)$/;
const LINE_REF = /^l\.(\d+)/;
const LOOKAHEAD = 12;

function projectPath(file: string, projectFiles: ReadonlySet<string>) {
  const path = file.replace(/^\.\//, "");
  return projectFiles.has(path) ? path : null;
}

/**
 * Extracts errors from a TeX log produced with -file-line-error.
 * Files outside `projectFiles` (packages, classes) are reported as `file: null, line: null`.
 */
export function parseLog(log: string, projectFiles: ReadonlySet<string>): CompileError[] {
  const lines = log.split(/\r?\n/);
  const errors: CompileError[] = [];

  for (let i = 0; i < lines.length; i++) {
    const current = lines[i]!;
    let error: CompileError | null = null;

    const fileLine = FILE_LINE_ERROR.exec(current);
    if (fileLine) {
      const file = projectPath(fileLine[1]!, projectFiles);
      error = { file, line: file ? Number(fileLine[2]) : null, message: fileLine[3]!.trim() };
    } else if (current.startsWith("! ")) {
      let line: number | null = null;
      for (let j = i + 1; j < Math.min(lines.length, i + 1 + LOOKAHEAD); j++) {
        const next = lines[j]!;
        if (next.startsWith("! ") || FILE_LINE_ERROR.test(next)) break;
        const match = LINE_REF.exec(next);
        if (match) {
          line = Number(match[1]);
          break;
        }
      }
      error = { file: null, line, message: current.slice(2).trim() };
    }

    if (!error) continue;
    if (error.message.startsWith("==>")) continue;
    if (error.message === "Emergency stop." && errors.length > 0) continue;
    errors.push(error);
  }

  return errors;
}
