import { DOC_BUILD_FIELD, SharedBuild } from "@backslash/shared";
import { useCallback, useEffect, useState } from "react";
import type { CollabSession } from "@/hooks/use-collab";

type BuildState = { latest: SharedBuild | null; pdf: SharedBuild | null };

const EMPTY: BuildState = { latest: null, pdf: null };

// values come from other clients, so validate them
function read(session: CollabSession): BuildState {
  const map = session.doc.getMap(DOC_BUILD_FIELD);
  const latest = SharedBuild.safeParse(map.get("latest"));
  const pdf = SharedBuild.safeParse(map.get("pdf"));
  return {
    latest: latest.success ? latest.data : null,
    pdf: pdf.success ? pdf.data : null,
  };
}

/** Latest compile result shared through the Yjs doc: everyone sees the same PDF and errors. */
export function useSharedBuild(session: CollabSession | null) {
  const [state, setState] = useState<BuildState>(EMPTY);

  useEffect(() => {
    if (!session) return;
    const map = session.doc.getMap(DOC_BUILD_FIELD);
    const update = () => setState(read(session));
    update();
    map.observe(update);
    return () => map.unobserve(update);
  }, [session]);

  const publish = useCallback(
    (build: SharedBuild) => {
      if (!session) return;
      const map = session.doc.getMap(DOC_BUILD_FIELD);
      const current = read(session);
      // a slower, older compile must not overwrite a newer one
      if (current.latest && current.latest.at > build.at) return;
      session.doc.transact(() => {
        map.set("latest", build);
        if (build.status === "success") map.set("pdf", build);
      });
    },
    [session],
  );

  return { ...state, publish };
}
