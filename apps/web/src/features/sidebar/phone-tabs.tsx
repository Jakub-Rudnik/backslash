import { FileViewIcon, SourceCodeIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { PhoneTab } from "@/features/sidebar/use-sidebar";
import type { SidebarView } from "@/features/sidebar/views";

/** Bottom tab bar on phones: the last-used sidebar view, the code and the PDF. */
export function PhoneTabs({
  view,
  tab,
  onSelect,
}: {
  view: SidebarView;
  tab: PhoneTab;
  onSelect: (tab: PhoneTab) => void;
}) {
  const tabs = [
    { id: "view", label: view.title, icon: view.icon },
    { id: "code", label: "Code", icon: SourceCodeIcon },
    { id: "pdf", label: "PDF", icon: FileViewIcon },
  ] as const;

  return (
    <nav
      aria-label="Panes"
      className="grid shrink-0 grid-cols-3 border-t bg-background pb-[env(safe-area-inset-bottom)]"
    >
      {tabs.map((t) => (
        <button
          key={t.id}
          type="button"
          aria-current={t.id === tab ? "page" : undefined}
          onClick={() => onSelect(t.id)}
          className="group flex h-14 cursor-pointer flex-col items-center justify-center gap-1 text-xs font-medium text-muted-foreground outline-none aria-[current=page]:text-foreground"
        >
          <span className="flex h-7 w-12 items-center justify-center rounded-full transition-colors group-hover:bg-muted group-focus-visible:ring-3 group-focus-visible:ring-ring/30 group-aria-[current=page]:bg-muted">
            <HugeiconsIcon icon={t.icon} className="size-5" />
          </span>
          {t.label}
        </button>
      ))}
    </nav>
  );
}
