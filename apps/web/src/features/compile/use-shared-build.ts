import { DOC_BUILD_FIELD } from "@backslash/shared";
import { readBuilds, type DocBuilds } from "@backslash/shared/doc";
import { useEffect, useState } from "react";
import type { CollabSession } from "@/features/editor/use-collab";

const EMPTY: DocBuilds = { latest: null, pdf: null };

/** Latest compile result, written into the doc by the server: everyone sees the same PDF and errors. */
export function useSharedBuild(session: CollabSession | null) {
  const [state, setState] = useState<DocBuilds>(EMPTY);

  useEffect(() => {
    if (!session) return;
    const map = session.doc.getMap(DOC_BUILD_FIELD);
    const update = () => setState(readBuilds(session.doc));
    update();
    map.observe(update);
    return () => {
      map.unobserve(update);
      setState(EMPTY);
    };
  }, [session]);

  return state;
}
