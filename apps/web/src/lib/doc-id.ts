import { DocumentId } from "@backslash/shared";

const PATH = /^\/d\/([^/]+)\/?$/;

function newDocId() {
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

/** Reads the doc id from /d/<id>, or creates a new doc and rewrites the URL. */
export function resolveDocId(): string {
  const match = PATH.exec(window.location.pathname);
  if (match && DocumentId.safeParse(match[1]).success) return match[1]!;

  const id = newDocId();
  window.history.replaceState(null, "", `/d/${id}`);
  return id;
}
