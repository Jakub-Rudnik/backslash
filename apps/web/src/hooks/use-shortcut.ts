import { useEffect, useEffectEvent } from "react";

/** `Ctrl` on Linux and Windows, `Cmd` on macOS. */
export const mod = (e: KeyboardEvent) => e.ctrlKey || e.metaKey;

/**
 * Runs `run` for keys `matches` accepts, before the editor or the browser sees them
 * (capture phase, default prevented).
 */
export function useShortcut(
  matches: (e: KeyboardEvent) => boolean,
  run: (e: KeyboardEvent) => void,
) {
  const onMatch = useEffectEvent((e: KeyboardEvent) => {
    if (!matches(e)) return;
    e.preventDefault();
    e.stopPropagation();
    run(e);
  });

  useEffect(() => {
    window.addEventListener("keydown", onMatch, { capture: true });
    return () => window.removeEventListener("keydown", onMatch, { capture: true });
  }, []);
}
