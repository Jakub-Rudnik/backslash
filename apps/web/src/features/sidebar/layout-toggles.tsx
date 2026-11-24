import { Pdf01Icon, SourceCodeIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { cn } from "cn";
import { useLayoutSettings } from "@/features/sidebar/layout-settings";

/** Header toggles that show or hide the code and the PDF; one of them always stays on. */
export function LayoutToggles({ className }: { className?: string }) {
  const { settings, update } = useLayoutSettings();
  const toggles = [
    { key: "showCode", label: "Code", icon: SourceCodeIcon, on: settings.showCode },
    { key: "showPdf", label: "PDF", icon: Pdf01Icon, on: settings.showPdf },
  ] as const;

  return (
    <div
      role="group"
      aria-label="Layout"
      className={cn("flex shrink-0 items-center rounded-full bg-muted p-0.5", className)}
    >
      {toggles.map((t) => {
        const last = t.on && toggles.every((o) => o === t || !o.on);
        return (
          <button
            key={t.key}
            type="button"
            aria-pressed={t.on}
            disabled={last}
            title={
              last ? `${t.label} (the only pane shown)` : `${t.on ? "Hide" : "Show"} ${t.label}`
            }
            onClick={() => update({ [t.key]: !t.on })}
            className={cn(
              "flex h-7 cursor-pointer items-center gap-1.5 rounded-full px-2.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground disabled:cursor-default",
              t.on && "bg-background text-foreground shadow-sm",
            )}
          >
            <HugeiconsIcon icon={t.icon} className="size-3.5" />
            {t.label}
          </button>
        );
      })}
    </div>
  );
}
