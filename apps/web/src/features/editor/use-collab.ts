import { HocuspocusProvider, WebSocketStatus } from "@hocuspocus/provider";
import { useCallback, useEffect, useEffectEvent, useRef, useState } from "react";
import * as Y from "yjs";
import { identityFor, resolveColorClash, type CollabUser } from "@/lib/user";

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

function isCollabUser(u: unknown): u is CollabUser {
  if (!u || typeof u !== "object") return false;
  const { id, name, color } = u as Record<string, unknown>;
  return typeof id === "string" && typeof name === "string" && typeof color === "string";
}

/**
 * Connects to the project's collab doc. The server checks the session cookie and membership;
 * `denied` is set when it refuses (no access, access revoked, signed out).
 */
export function useCollab(projectId: string, account: { id: string; name: string }) {
  const [session, setSession] = useState<CollabSession | null>(null);
  const [status, setStatus] = useState<WebSocketStatus>(WebSocketStatus.Connecting);
  const [synced, setSynced] = useState(false);
  const [denied, setDenied] = useState(false);
  const [readOnly, setReadOnly] = useState<boolean | null>(null);
  const [me, setMe] = useState<CollabUser>(() => identityFor(account));
  const [peers, setPeers] = useState<Peer[]>([]);
  const { id: accountId, name: accountName } = account;
  const identityRef = useRef<CollabUser>(me);
  const currentName = useEffectEvent(() => accountName);

  useEffect(() => {
    const doc = new Y.Doc();
    const joinedAt = Date.now();
    identityRef.current = identityFor({ id: accountId, name: currentName() });

    const provider = new HocuspocusProvider({
      url: COLLAB_URL,
      name: projectId,
      document: doc,
      onStatus: ({ status }) => setStatus(status),
      onSynced: ({ state }) => setSynced(state),
      onAuthenticated: ({ scope }) => {
        setDenied(false);
        setReadOnly(scope === "readonly");
      },
      onAuthenticationFailed: () => {
        setDenied(true);
        setSynced(false);
      },
      onAwarenessChange: ({ states }) => {
        const others = (states as AwarenessState[]).filter(
          (s): s is AwarenessState & { user: CollabUser } =>
            s.clientId !== doc.clientID && isCollabUser(s.user),
        );
        setPeers(
          others.map((s) => ({
            clientId: s.clientId,
            user: s.user,
            compiling: !!s.compiling,
            fileId: typeof s.fileId === "string" ? s.fileId : null,
          })),
        );

        const earlier = others.filter((s) => {
          const theirs = s.joinedAt ?? 0;
          return theirs < joinedAt || (theirs === joinedAt && s.clientId < doc.clientID);
        });
        const next = resolveColorClash(
          identityRef.current,
          earlier.map((s) => s.user),
          others.map((s) => s.user),
        );
        if (next !== identityRef.current) {
          identityRef.current = next;
          provider.setAwarenessField("user", next);
          setMe(next);
        }
      },
    });
    provider.setAwarenessField("joinedAt", joinedAt);
    provider.setAwarenessField("user", identityRef.current);
    // oxlint-disable-next-line react/set-state-in-effect
    setSession({ doc, provider });
    setMe(identityRef.current);

    return () => {
      provider.destroy();
      doc.destroy();
      setSession(null);
      setSynced(false);
      setDenied(false);
      setReadOnly(null);
      setPeers([]);
    };
  }, [projectId, accountId]);

  useEffect(() => {
    if (!session || identityRef.current.name === accountName) return;
    identityRef.current = { ...identityRef.current, name: accountName };
    session.provider.setAwarenessField("user", identityRef.current);
    // oxlint-disable-next-line react/set-state-in-effect
    setMe(identityRef.current);
  }, [session, accountName]);

  const setCompiling = useCallback(
    (compiling: boolean) => session?.provider.setAwarenessField("compiling", compiling),
    [session],
  );

  const setActiveFile = useCallback(
    (fileId: string | null) => session?.provider.setAwarenessField("fileId", fileId),
    [session],
  );

  return { session, status, synced, denied, readOnly, me, peers, setCompiling, setActiveFile };
}
