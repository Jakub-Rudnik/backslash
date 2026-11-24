import { useEffect, useEffectEvent, useRef, useState } from "react";
import type { LayoutChangedMeta, PanelImperativeHandle } from "react-resizable-panels";
import { LG, useMediaQuery } from "@/hooks/use-media-query";
import { useLayoutSettings, type ViewId } from "@/features/sidebar/layout-settings";

/**
 * Sidebar state: from `lg` up a docked, resizable panel remembered across projects; below it an
 * overlay that starts closed and closes once a file is opened. `Ctrl+Shift+B` toggles either.
 */
export function useSidebar() {
  const docked = useMediaQuery(LG);
  const { settings, update } = useLayoutSettings();
  const panelRef = useRef<PanelImperativeHandle | null>(null);
  const [overlayOpen, setOverlayOpen] = useState(false);
  const open = docked ? settings.sidebarOpen : overlayOpen;

  function setOpen(next: boolean) {
    if (!docked) return setOverlayOpen(next);
    const panel = panelRef.current;
    if (!panel) return;
    update({ sidebarOpen: next });
    if (!next) return panel.collapse();
    panel.expand();
    panel.resize(settings.sidebarWidth);
  }

  /** Clicking the open view's icon closes the panel; any other icon opens that view. */
  function select(view: ViewId) {
    if (open && view === settings.view) return setOpen(false);
    update({ view });
    if (!open) setOpen(true);
  }

  /** Remembers the width, and dragging the panel narrow enough to collapse it. */
  function onLayoutChanged(_layout: unknown, meta: LayoutChangedMeta) {
    const panel = panelRef.current;
    if (!docked || !panel || !meta.isUserInteraction) return;
    if (panel.isCollapsed()) update({ sidebarOpen: false });
    else update({ sidebarOpen: true, sidebarWidth: Math.round(panel.getSize().inPixels) });
  }

  const toggle = useEffectEvent(() => setOpen(!open));
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (!(e.ctrlKey || e.metaKey) || !e.shiftKey || e.altKey) return;
      if (e.key.toLowerCase() !== "b") return;
      e.preventDefault();
      e.stopPropagation();
      toggle();
    }
    window.addEventListener("keydown", onKeyDown, { capture: true });
    return () => window.removeEventListener("keydown", onKeyDown, { capture: true });
  }, []);

  return {
    docked,
    view: settings.view,
    open,
    /** docked panel's size on mount */
    initialSize: settings.sidebarOpen ? settings.sidebarWidth : 0,
    panelRef,
    select,
    setOpen,
    onLayoutChanged,
    /** after a file is opened, the overlay gets out of the way */
    fileOpened: () => setOverlayOpen(false),
  };
}
