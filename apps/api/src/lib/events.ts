import { COLLAB_REVOKE_CHANNEL } from "@backslash/shared";
import type { Valkey } from "iovalkey";

/** Notifications to other services about access changes. */
export type ProjectEvents = {
  /** collaborators' connections must re-authenticate (member removed, role changed, project deleted) */
  accessChanged(projectId: string): Promise<void>;
};

export function valkeyEvents(valkey: Valkey): ProjectEvents {
  return {
    accessChanged: async (projectId) => {
      await valkey.publish(COLLAB_REVOKE_CHANNEL, projectId);
    },
  };
}
