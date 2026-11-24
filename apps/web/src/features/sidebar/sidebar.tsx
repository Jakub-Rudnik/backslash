import { HugeiconsIcon } from "@hugeicons/react";
import { cn } from "cn";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { ViewId } from "@/features/sidebar/layout-settings";
import { actionsFor, viewsFor, type SidebarView, type ViewContext } from "@/features/sidebar/views";

/** The column of view icons; the active one is marked only while its panel is open. */
export function ActivityBar({
  views,
  view,
  open,
  onSelect,
}: {
  views: SidebarView[];
  view: ViewId;
  open: boolean;
  onSelect: (id: ViewId) => void;
}) {
  return (
    <nav
      id="activity-bar"
      aria-label="Sidebar views"
      className="flex w-12 shrink-0 flex-col items-center gap-1 border-r py-2"
    >
      {views.map((v) => (
        <Tooltip key={v.id}>
          <TooltipTrigger
            render={
              <Button
                variant="ghost"
                size="icon"
                aria-label={v.title}
                aria-pressed={open && v.id === view}
                onClick={() => onSelect(v.id)}
                className="text-muted-foreground aria-pressed:bg-muted aria-pressed:text-foreground"
              />
            }
          >
            <HugeiconsIcon icon={v.icon} className="size-5" />
          </TooltipTrigger>
          <TooltipContent side="right">{v.title}</TooltipContent>
        </Tooltip>
      ))}
    </nav>
  );
}

/** A view's title bar with its actions, above its body. */
export function SidebarPanel({
  view,
  ctx,
  className,
  onSwitchView,
}: {
  view: SidebarView;
  ctx: ViewContext;
  className?: string;
  /** shows a switch between the views in place of the title (phones have no activity bar) */
  onSwitchView?: (id: ViewId) => void;
}) {
  return (
    <div className={cn("flex h-full flex-col bg-background text-sm", className)}>
      <div className="flex h-10 shrink-0 items-center gap-0.5 border-b pr-1 pl-3">
        {onSwitchView ? (
          <Tabs
            value={view.id}
            onValueChange={(id: ViewId) => onSwitchView(id)}
            className="mr-auto"
          >
            <TabsList className="h-8!">
              {viewsFor(ctx.readOnly).map((v) => (
                <TabsTrigger key={v.id} value={v.id} className="text-xs">
                  {v.title}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        ) : (
          <h2 className="mr-auto text-xs font-medium tracking-wide text-muted-foreground uppercase">
            {view.title}
          </h2>
        )}
        {actionsFor(view, ctx).map((a) => (
          <Tooltip key={a.id}>
            <TooltipTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={a.title}
                  disabled={a.disabled}
                  onClick={a.run}
                />
              }
            >
              <HugeiconsIcon icon={a.icon} />
            </TooltipTrigger>
            <TooltipContent side="bottom">{a.hint ?? a.title}</TooltipContent>
          </Tooltip>
        ))}
      </div>
      {view.render(ctx)}
    </div>
  );
}
