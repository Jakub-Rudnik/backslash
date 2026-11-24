import { HugeiconsIcon } from "@hugeicons/react";
import { cn } from "cn";
import { Button } from "@/components/ui/button";
import type { ViewId } from "@/features/sidebar/layout-settings";
import { actionsFor, VIEWS, type SidebarView, type ViewContext } from "@/features/sidebar/views";

/** The column of view icons; the active one is marked only while its panel is open. */
export function ActivityBar({
  view,
  open,
  onSelect,
}: {
  view: ViewId;
  open: boolean;
  onSelect: (id: ViewId) => void;
}) {
  return (
    <nav
      aria-label="Sidebar views"
      className="flex w-11 shrink-0 flex-col items-center gap-1 border-r bg-sidebar py-1.5 text-sidebar-foreground"
    >
      {VIEWS.map((v) => {
        const active = open && v.id === view;
        return (
          <button
            key={v.id}
            type="button"
            title={v.title}
            aria-label={v.title}
            aria-pressed={active}
            onClick={() => onSelect(v.id)}
            className={cn(
              "relative flex size-9 cursor-pointer items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2 focus-visible:ring-sidebar-ring focus-visible:outline-none",
              active &&
                "bg-sidebar-accent text-sidebar-accent-foreground before:absolute before:inset-y-1.5 before:-left-1 before:w-0.5 before:rounded-full before:bg-sidebar-primary",
            )}
          >
            <HugeiconsIcon icon={v.icon} className="size-5" />
          </button>
        );
      })}
    </nav>
  );
}

/** A view's title bar with its actions, above its body. */
export function SidebarPanel({
  view,
  ctx,
  className,
}: {
  view: SidebarView;
  ctx: ViewContext;
  className?: string;
}) {
  return (
    <div
      className={cn("flex h-full flex-col bg-sidebar text-sm text-sidebar-foreground", className)}
    >
      <div className="flex h-10 shrink-0 items-center gap-0.5 border-b border-sidebar-border pr-1 pl-3">
        <h2 className="mr-auto text-xs font-medium tracking-wide text-muted-foreground uppercase">
          {view.title}
        </h2>
        {actionsFor(view, ctx).map((a) => (
          <Button
            key={a.id}
            variant="ghost"
            size="icon-sm"
            aria-label={a.title}
            title={a.hint ?? a.title}
            disabled={a.disabled}
            onClick={a.run}
          >
            <HugeiconsIcon icon={a.icon} />
          </Button>
        ))}
      </div>
      {view.render(ctx)}
    </div>
  );
}
