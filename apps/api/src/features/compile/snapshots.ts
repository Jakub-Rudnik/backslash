/** Current Yjs state of a project, straight from the collab server (the DB copy lags behind). */
export type SnapshotSource = (projectId: string) => Promise<Uint8Array | null>;

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
