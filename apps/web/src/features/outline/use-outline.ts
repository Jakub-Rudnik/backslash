import { filesMap, getMainFile, listFiles, projectMap } from "@backslash/shared/doc";
import { useEffect, useState } from "react";
import type { CollabSession } from "@/features/editor/use-collab";
import { buildOutline, type OutlineHeading } from "@/features/outline/outline";

const UPDATE_DELAY_MS = 150;

export type Outline = { mainPath: string | null; headings: OutlineHeading[] };

function read(session: CollabSession): Outline {
  const files = listFiles(session.doc);
  const main = getMainFile(session.doc, files);
  if (!main) return { mainPath: null, headings: [] };
  const byPath = new Map(files.map((f) => [f.path, f]));
  const readFile = (path: string) => {
    const file = byPath.get(path);
    return file?.kind === "text" ? file.text.toJSON() : null;
  };
  return { mainPath: main.path, headings: buildOutline(main.path, readFile) };
}

/** The project's Outline, kept up to date with everyone's edits. */
export function useOutline(session: CollabSession | null): Outline {
  const [outline, setOutline] = useState<Outline>({ mainPath: null, headings: [] });

  useEffect(() => {
    if (!session) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const update = () => {
      clearTimeout(timer);
      timer = setTimeout(() => setOutline(read(session)), UPDATE_DELAY_MS);
    };
    const files = filesMap(session.doc);
    const project = projectMap(session.doc);
    // oxlint-disable-next-line react/set-state-in-effect
    setOutline(read(session));
    files.observeDeep(update);
    project.observe(update);
    return () => {
      clearTimeout(timer);
      files.unobserveDeep(update);
      project.unobserve(update);
    };
  }, [session]);

  return outline;
}
