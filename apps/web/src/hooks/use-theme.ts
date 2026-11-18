import { useSyncExternalStore } from "react";

export type Theme = "light" | "dark";

const STORAGE_KEY = "theme";
const media = window.matchMedia("(prefers-color-scheme: dark)");

function readStored(): Theme | null {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    return value === "light" || value === "dark" ? value : null;
  } catch {
    return null;
  }
}

function resolve(): Theme {
  return readStored() ?? (media.matches ? "dark" : "light");
}

function apply(theme: Theme) {
  document.documentElement.classList.toggle("dark", theme === "dark");
}

let current: Theme = resolve();
const listeners = new Set<() => void>();

function set(theme: Theme) {
  current = theme;
  apply(theme);
  for (const l of listeners) l();
}

media.addEventListener("change", () => {
  if (!readStored()) set(resolve());
});

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function toggle() {
  const next = current === "dark" ? "light" : "dark";
  try {
    localStorage.setItem(STORAGE_KEY, next);
  } catch {}
  set(next);
}

export function useTheme() {
  const theme = useSyncExternalStore(subscribe, () => current);
  return { theme, toggle };
}
