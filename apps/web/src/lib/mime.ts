import { extension } from "@backslash/shared";

// a Map, not an object: extensions like "constructor" must not hit Object.prototype
const PREVIEWABLE = new Map([
  ["png", "image/png"],
  ["jpg", "image/jpeg"],
  ["jpeg", "image/jpeg"],
  ["gif", "image/gif"],
  ["webp", "image/webp"],
  // rendered via <img> only, which never runs scripts inside the SVG
  ["svg", "image/svg+xml"],
  ["pdf", "application/pdf"],
]);

/** MIME type for files we can preview in the browser, else null. */
export function previewType(path: string): string | null {
  return PREVIEWABLE.get(extension(path)) ?? null;
}

export function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
