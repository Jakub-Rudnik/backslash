import { useCallback, useEffect, useState } from "react";

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

// keep in sync with the inline script in index.html (prevents a flash on load)
function apply(theme: Theme) {
  document.documentElement.classList.toggle("dark", theme === "dark");
}

export function useTheme() {
  const [theme, setTheme] = useState<Theme>(resolve);

  useEffect(() => {
    apply(theme);
  }, [theme]);

  // follow the OS setting until the user picks a theme explicitly
  useEffect(() => {
    const onChange = () => {
      if (!readStored()) setTheme(resolve());
    };
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, []);

  const toggle = useCallback(() => {
    setTheme((current) => {
      const next = current === "dark" ? "light" : "dark";
      try {
        localStorage.setItem(STORAGE_KEY, next);
      } catch {
        // storage unavailable; theme still applies for this session
      }
      return next;
    });
  }, []);

  return { theme, toggle };
}
