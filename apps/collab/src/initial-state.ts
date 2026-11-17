import { DEFAULT_SOURCE } from "@backslash/shared";
import { seedProject } from "@backslash/shared/doc";
import * as Y from "yjs";

/**
 * Seeds new projects with main.tex and migrates old single-file docs.
 * Done server-side so clients never race to insert it.
 * Returns the new state, or null if the doc was already a project.
 */
export function ensureProject(state: Uint8Array | null): Uint8Array | null {
  const doc = new Y.Doc();
  if (state) Y.applyUpdate(doc, state);
  const changed = seedProject(doc, DEFAULT_SOURCE);
  const next = changed ? Y.encodeStateAsUpdate(doc) : null;
  doc.destroy();
  return next;
}
