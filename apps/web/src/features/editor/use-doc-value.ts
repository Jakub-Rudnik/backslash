import { filesMap, projectMap } from "@backslash/shared/doc";
import { useEffect, useEffectEvent, useState } from "react";
import type { CollabSession } from "@/features/editor/use-collab";

const UPDATE_DELAY_MS = 150;

/**
 * `compute(session)`, recomputed shortly after anyone edits a file or changes the main file,
 * and whenever `input` changes. `initial` until there is a session.
 */
export function useDocValue<T>(
  session: CollabSession | null,
  compute: (session: CollabSession) => T,
  initial: T,
  input?: unknown,
): T {
  const [value, setValue] = useState<T>(initial);
  const recompute = useEffectEvent((s: CollabSession) => setValue(compute(s)));

  useEffect(() => {
    if (!session) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const update = () => {
      clearTimeout(timer);
      timer = setTimeout(() => recompute(session), UPDATE_DELAY_MS);
    };
    const files = filesMap(session.doc);
    const project = projectMap(session.doc);
    // oxlint-disable-next-line react/set-state-in-effect
    recompute(session);
    files.observeDeep(update);
    project.observe(update);
    return () => {
      clearTimeout(timer);
      files.unobserveDeep(update);
      project.unobserve(update);
    };
  }, [session, input]);

  return value;
}
