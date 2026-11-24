import { Pdf01Icon, SourceCodeIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { cn } from "cn";
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
    { id: "pdf", label: "PDF", icon: Pdf01Icon },
  ] as const;

  return (
    <nav
      aria-label="Panes"
      className="grid shrink-0 grid-cols-3 border-t bg-sidebar pb-[env(safe-area-inset-bottom)]"
    >
      {tabs.map((t) => (
        <button
          key={t.id}
          type="button"
          aria-current={t.id === tab ? "page" : undefined}
          onClick={() => onSelect(t.id)}
          className={cn(
            "flex h-14 cursor-pointer flex-col items-center justify-center gap-0.5 text-[11px] font-medium text-muted-foreground",
            t.id === tab && "text-foreground",
          )}
        >
          <HugeiconsIcon icon={t.icon} className="size-5" />
          {t.label}
        </button>
      ))}
    </nav>
  );
}
