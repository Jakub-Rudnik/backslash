import { getMainFile, listFiles } from "@backslash/shared/doc";
import type { CollabSession } from "@/features/editor/use-collab";
import { useDocValue } from "@/features/editor/use-doc-value";
import { buildOutline, type OutlineHeading } from "@/features/outline/outline";

/** A heading with the id of its file and its depth below the Outline's top level. */
export interface OutlineEntry extends OutlineHeading {
  fileId: string;
  depth: number;
}

export type Outline = { mainPath: string | null; headings: OutlineEntry[] };

const EMPTY: Outline = { mainPath: null, headings: [] };

function readOutline(session: CollabSession): Outline {
  const files = listFiles(session.doc);
  const main = getMainFile(session.doc, files);
  if (!main) return EMPTY;
  const byPath = new Map(files.map((f) => [f.path, f]));
  const readFile = (path: string) => {
    const file = byPath.get(path);
    return file?.kind === "text" ? file.text.toJSON() : null;
  };
  const headings = buildOutline(main.path, readFile);
  const top = Math.min(...headings.map((h) => h.level));
  return {
    mainPath: main.path,
    headings: headings.flatMap((h) => {
      const file = byPath.get(h.path);
      return file ? [{ ...h, fileId: file.id, depth: h.level - top }] : [];
    }),
  };
}

/** The project's Outline, kept up to date with everyone's edits. */
export function useOutline(session: CollabSession | null): Outline {
  return useDocValue(session, readOutline, EMPTY);
}
