import { useSyncExternalStore } from "react";
import * as z from "zod";

export const VIEW_IDS = ["files", "outline", "search"] as const;
export type ViewId = (typeof VIEW_IDS)[number];

export const DEFAULT_SIDEBAR_WIDTH = 240;

const STORAGE_KEY = "project-layout";

/** The project page layout (sidebar from `lg` up, Code and PDF toggles), shared by all projects like the theme. */
const LayoutSettings = z.object({
  sidebarOpen: z.boolean().catch(true),
  view: z.enum(VIEW_IDS).catch("files"),
  sidebarWidth: z.number().min(0).catch(DEFAULT_SIDEBAR_WIDTH),
  showCode: z.boolean().catch(true),
  showPdf: z.boolean().catch(true),
});
export type LayoutSettings = z.infer<typeof LayoutSettings>;

function readStored(): LayoutSettings {
  let raw: unknown = {};
  try {
    raw = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}");
  } catch {}
  const parsed = LayoutSettings.safeParse(raw);
  return parsed.success ? parsed.data : LayoutSettings.parse({});
}

let current = readStored();
const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function update(patch: Partial<LayoutSettings>) {
  current = { ...current, ...patch };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(current));
  } catch {}
  for (const l of listeners) l();
}

export function useLayoutSettings() {
  const settings = useSyncExternalStore(subscribe, () => current);
  return { settings, update };
}
