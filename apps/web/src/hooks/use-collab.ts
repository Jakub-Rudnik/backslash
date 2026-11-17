import { HocuspocusProvider, WebSocketStatus } from "@hocuspocus/provider";
import { useCallback, useEffect, useState } from "react";
import * as Y from "yjs";
import {
  getLocalIdentity,
  resolveClashes,
  saveLocalIdentity,
  type CollabUser,
  type LocalIdentity,
} from "@/lib/user";

const COLLAB_URL = `${window.location.protocol === "https:" ? "wss" : "ws"}://${window.location.host}/collab`;

export type CollabSession = {
  doc: Y.Doc;
  provider: HocuspocusProvider;
};

export type Peer = {
  clientId: number;
  user: CollabUser;
  compiling: boolean;
  /** file the peer has open */
  fileId: string | null;
};

type AwarenessState = {
  clientId: number;
  user?: CollabUser;
  joinedAt?: number;
  compiling?: boolean;
  fileId?: unknown;
};

function toAwarenessUser({ name, color, colorLight }: LocalIdentity): CollabUser {
  return { name, color, colorLight };
}

export function useCollab(projectId: string) {
  const [session, setSession] = useState<CollabSession | null>(null);
  const [status, setStatus] = useState<WebSocketStatus>(WebSocketStatus.Connecting);
  const [synced, setSynced] = useState(false);
  const [me, setMe] = useState<LocalIdentity>(getLocalIdentity);
  const [peers, setPeers] = useState<Peer[]>([]);

  useEffect(() => {
    const doc = new Y.Doc();
    const joinedAt = Date.now();
    let identity = getLocalIdentity();

    const provider = new HocuspocusProvider({
      url: COLLAB_URL,
      name: projectId,
      document: doc,
      onStatus: ({ status }) => setStatus(status),
      onSynced: ({ state }) => setSynced(state),
      onAwarenessChange: ({ states }) => {
        const others = (states as AwarenessState[]).filter(
          (s): s is AwarenessState & { user: CollabUser } =>
            s.clientId !== doc.clientID && !!s.user,
        );
        setPeers(
          others.map((s) => ({
            clientId: s.clientId,
            user: s.user,
            compiling: !!s.compiling,
            fileId: typeof s.fileId === "string" ? s.fileId : null,
          })),
        );

        // whoever joined earlier keeps their color/name (clientId breaks ties)
        const earlier = others.filter((s) => {
          const theirs = s.joinedAt ?? 0;
          return theirs < joinedAt || (theirs === joinedAt && s.clientId < doc.clientID);
        });
        const next = resolveClashes(
          identity,
          earlier.map((s) => s.user),
          others.map((s) => s.user),
        );
        if (next !== identity) {
          identity = next;
          saveLocalIdentity(identity);
          provider.setAwarenessField("user", toAwarenessUser(identity));
          setMe(identity);
        }
      },
    });
    provider.setAwarenessField("joinedAt", joinedAt);
    provider.setAwarenessField("user", toAwarenessUser(identity));
    // provider is an external system owned by this effect; expose it once created
    // oxlint-disable-next-line react/set-state-in-effect
    setSession({ doc, provider });
    setMe(identity);

    return () => {
      provider.destroy();
      doc.destroy();
      setSession(null);
      setSynced(false);
      setPeers([]);
    };
  }, [projectId]);

  const rename = useCallback(
    (name: string) => {
      const next: LocalIdentity = { ...me, name, custom: true };
      saveLocalIdentity(next);
      session?.provider.setAwarenessField("user", toAwarenessUser(next));
      setMe(next);
    },
    [me, session],
  );

  const setCompiling = useCallback(
    (compiling: boolean) => session?.provider.setAwarenessField("compiling", compiling),
    [session],
  );

  const setActiveFile = useCallback(
    (fileId: string | null) => session?.provider.setAwarenessField("fileId", fileId),
    [session],
  );

  return { session, status, synced, me, peers, rename, setCompiling, setActiveFile };
}
