import { DEFAULT_SOURCE, DOC_TEXT_FIELD } from "@backslash/shared";
import * as Y from "yjs";

/** Yjs update for a brand new document, seeded server-side so clients never race to insert it. */
export function initialState(): Uint8Array {
  const doc = new Y.Doc();
  doc.getText(DOC_TEXT_FIELD).insert(0, DEFAULT_SOURCE);
  const update = Y.encodeStateAsUpdate(doc);
  doc.destroy();
  return update;
}
