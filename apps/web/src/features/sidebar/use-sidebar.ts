import { useRef, useState } from "react";
import type { LayoutChangedMeta, PanelImperativeHandle } from "react-resizable-panels";
import { LG, MD, useMediaQuery } from "@/hooks/use-media-query";
import { mod, useShortcut } from "@/hooks/use-shortcut";
import { useLayoutSettings, type ViewId } from "@/features/sidebar/layout-settings";

export type PhoneTab = "view" | "code" | "pdf";

/**
 * Sidebar state: from `lg` up a docked, resizable panel remembered across projects; from `md` an
 * overlay that starts closed and closes once a file is opened; below `md` (phones) one pane at a
 * time, where the sidebar is the first tab. `Ctrl+Shift+B` (or `Ctrl+\\`) toggles any of them.
 */
export function useSidebar() {
  const docked = useMediaQuery(LG);
  const phone = !useMediaQuery(MD);
  const { settings, update } = useLayoutSettings();
  const panelRef = useRef<PanelImperativeHandle | null>(null);
  const [overlayOpen, setOverlayOpen] = useState(false);
  const [phoneTab, setPhoneTab] = useState<PhoneTab>("code");
  let open = overlayOpen;
  if (phone) open = phoneTab === "view";
  else if (docked) open = settings.sidebarOpen;

  function setOpen(next: boolean) {
    if (phone) return setPhoneTab(next ? "view" : "code");
    if (!docked) return setOverlayOpen(next);
    const panel = panelRef.current;
    if (!panel) return;
    update({ sidebarOpen: next });
    if (!next) return panel.collapse();
    panel.expand();
    panel.resize(settings.sidebarWidth);
  }

  function show(view: ViewId) {
    update({ view });
    if (!open) setOpen(true);
  }

  /** Clicking the open view's icon closes the panel; any other icon opens that view. */
  function select(view: ViewId) {
    if (open && view === settings.view) setOpen(false);
    else show(view);
  }

  /** Remembers the width, and dragging the panel narrow enough to collapse it. */
  function onLayoutChanged(_layout: unknown, meta: LayoutChangedMeta) {
    const panel = panelRef.current;
    if (!docked || !panel || !meta.isUserInteraction) return;
    if (panel.isCollapsed()) update({ sidebarOpen: false });
    else update({ sidebarOpen: true, sidebarWidth: Math.round(panel.getSize().inPixels) });
  }

  useShortcut(
    (e) => mod(e) && !e.altKey && ((e.shiftKey && e.key.toLowerCase() === "b") || e.key === "\\"),
    () => setOpen(!open),
  );

  return {
    docked,
    phone,
    phoneTab,
    setPhoneTab,
    view: settings.view,
    open,
    /** docked panel's size on mount */
    initialSize: settings.sidebarOpen ? settings.sidebarWidth : 0,
    panelRef,
    select,
    show,
    setOpen,
    onLayoutChanged,
    /** after a file is opened, the overlay gets out of the way and the code shows */
    fileOpened: () => {
      setOverlayOpen(false);
      setPhoneTab("code");
      if (!settings.showCode) update({ showCode: true });
    },
  };
}
