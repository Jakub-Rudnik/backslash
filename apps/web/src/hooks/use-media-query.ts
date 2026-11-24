import { useCallback, useSyncExternalStore } from "react";

/** Tailwind's default breakpoints (`md`, `lg`), for layouts that differ in markup, not just in CSS. */
export const MD = "(min-width: 48rem)";
export const LG = "(min-width: 64rem)";

export function useMediaQuery(query: string) {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const media = window.matchMedia(query);
      media.addEventListener("change", onChange);
      return () => media.removeEventListener("change", onChange);
    },
    [query],
  );
  return useSyncExternalStore(subscribe, () => window.matchMedia(query).matches);
}
