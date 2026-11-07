import { Moon02Icon, Sun03Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Button } from "@/components/ui/button";
import type { Theme } from "@/hooks/use-theme";

type ThemeToggleProps = {
  theme: Theme;
  onToggle: () => void;
};

export function ThemeToggle({ theme, onToggle }: ThemeToggleProps) {
  const label = theme === "dark" ? "Switch to light mode" : "Switch to dark mode";
  return (
    <Button variant="ghost" size="icon-sm" onClick={onToggle} aria-label={label} title={label}>
      <HugeiconsIcon icon={theme === "dark" ? Sun03Icon : Moon02Icon} />
    </Button>
  );
}
