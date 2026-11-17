import { projectMembers, type Db, type ProjectRole } from "@backslash/db";
import type { Connection, Hocuspocus } from "@hocuspocus/server";
import { eq } from "drizzle-orm";

/** what onAuthenticate stored for the connection */
export type ConnectionContext = { userId: string; role: ProjectRole };

/**
 * Keeps open connections in line with project membership: a socket whose user lost access,
 * or whose role changed, is closed. The client reconnects and goes through onAuthenticate again.
 */
export function accessReconciler(db: Db, hocuspocus: Hocuspocus<ConnectionContext>) {
  async function roles(projectId: string) {
    const rows = await db
      .select({ userId: projectMembers.userId, role: projectMembers.role })
      .from(projectMembers)
      .where(eq(projectMembers.projectId, projectId));
    return new Map(rows.map((r) => [r.userId, r.role]));
  }

  function closeIfStale(
    connection: Connection<ConnectionContext>,
    current: Map<string, ProjectRole>,
  ) {
    const { userId, role } = connection.context;
    if (current.get(userId) !== role) connection.webSocket.close(4403, "Access changed");
  }

  /** Re-checks every connection of one project (or of all open projects). */
  async function reconcile(projectId?: string) {
    const names = projectId ? [projectId] : [...hocuspocus.documents.keys()];
    for (const name of names) {
      const document = hocuspocus.documents.get(name);
      if (!document || document.connections.size === 0) continue;
      const current = await roles(name);
      document.connections.forEach((_clients, connection) => closeIfStale(connection, current));
    }
  }

  /**
   * Re-checks a connection once it's attached to the document: access may have been revoked
   * while the document was loading, before the socket was reachable by reconcile().
   */
  async function verify(connection: Connection<ConnectionContext>, projectId: string) {
    closeIfStale(connection, await roles(projectId));
  }

  return { reconcile, verify };
}
