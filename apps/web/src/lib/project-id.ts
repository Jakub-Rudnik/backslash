import { ProjectId } from "@backslash/shared";

const PATH = /^\/d\/([^/]+)\/?$/;

function newProjectId() {
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

/** Reads the project id from /d/<id>, or creates a new project and rewrites the URL. */
export function resolveProjectId(): string {
  const match = PATH.exec(window.location.pathname);
  if (match && ProjectId.safeParse(match[1]).success) return match[1]!;

  const id = newProjectId();
  window.history.replaceState(null, "", `/d/${id}`);
  return id;
}
