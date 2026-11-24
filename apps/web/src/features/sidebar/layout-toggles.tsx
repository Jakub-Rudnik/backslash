import { FileViewIcon, SourceCodeIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useLayoutSettings } from "@/features/sidebar/layout-settings";

const PANES = [
  { value: "code", label: "Code", icon: SourceCodeIcon },
  { value: "pdf", label: "PDF", icon: FileViewIcon },
] as const;

/** Header toggles that show or hide the code and the PDF; one of them always stays on. */
export function LayoutToggles() {
  const { settings, update } = useLayoutSettings();
  const shown = PANES.filter((p) => (p.value === "code" ? settings.showCode : settings.showPdf));

  return (
    <ToggleGroup
      multiple
      variant="outline"
      size="sm"
      spacing={0}
      aria-label="Panes"
      value={shown.map((p) => p.value)}
      onValueChange={(value) => {
        if (value.length === 0) return;
        update({ showCode: value.includes("code"), showPdf: value.includes("pdf") });
      }}
    >
      {PANES.map((p) => {
        const on = shown.includes(p);
        return (
          <Tooltip key={p.value}>
            <TooltipTrigger render={<ToggleGroupItem value={p.value} aria-label={p.label} />}>
              <HugeiconsIcon icon={p.icon} />
            </TooltipTrigger>
            <TooltipContent side="bottom">
              {on && shown.length === 1
                ? `${p.label} (the only pane shown)`
                : `${on ? "Hide" : "Show"} ${p.label}`}
            </TooltipContent>
          </Tooltip>
        );
      })}
    </ToggleGroup>
  );
}
