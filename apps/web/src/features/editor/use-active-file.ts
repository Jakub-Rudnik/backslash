import type { DocFile } from "@backslash/shared/doc";
import { useEffect, useState } from "react";

function readHash() {
  return window.location.hash.slice(1) || null;
}

/**
 * Open file, kept in the URL hash so a shared link opens the same file.
 * Falls back to the main file when the requested one doesn't exist (or got deleted).
 */
export function useActiveFile(files: DocFile[], mainId: string | null) {
  const [requested, setRequested] = useState(readHash);
  const active =
    files.find((f) => f.id === requested) ?? files.find((f) => f.id === mainId) ?? null;
  const activeId = active?.id ?? null;

  useEffect(() => {
    if (activeId && readHash() !== activeId) {
      window.history.replaceState(null, "", `#${activeId}`);
    }
  }, [activeId]);

  return { active, open: setRequested };
}
