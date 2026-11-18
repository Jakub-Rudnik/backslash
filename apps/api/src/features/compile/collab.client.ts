import type { SharedBuild } from "@backslash/shared";

/** Current Yjs state of a project, straight from the collab server (the DB copy lags behind). */
export type SnapshotSource = (projectId: string) => Promise<Uint8Array | null>;

/** Writes a compile result into the project's doc, where every collaborator sees it. */
export type BuildPublisher = (projectId: string, build: SharedBuild) => Promise<void>;

export function collabSnapshots(baseUrl: string, secret: string): SnapshotSource {
  return async (projectId) => {
    const res = await fetch(`${baseUrl}/snapshot/${encodeURIComponent(projectId)}`, {
      headers: { authorization: `Bearer ${secret}` },
      signal: AbortSignal.timeout(10_000),
    });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`collab snapshot failed: ${res.status}`);
    return new Uint8Array(await res.arrayBuffer());
  };
}

export function collabBuilds(baseUrl: string, secret: string): BuildPublisher {
  return async (projectId, build) => {
    const res = await fetch(`${baseUrl}/build/${encodeURIComponent(projectId)}`, {
      method: "POST",
      headers: { authorization: `Bearer ${secret}`, "content-type": "application/json" },
      body: JSON.stringify(build),
      signal: AbortSignal.timeout(10_000),
    });
    if (res.status === 404) return;
    if (!res.ok) throw new Error(`collab build publish failed: ${res.status}`);
  };
}
