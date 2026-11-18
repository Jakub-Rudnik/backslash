import type { ReactNode } from "react";
import { Link } from "react-router";
import { ThemeToggle } from "@/components/theme-toggle";
import { UserMenu } from "@/features/auth/user-menu";
import { useTheme } from "@/hooks/use-theme";

/** Top bar: logo (to the dashboard), page-specific content, theme toggle and account menu. */
export function AppHeader({ children }: { children?: ReactNode }) {
  const { theme, toggle } = useTheme();
  return (
    <header className="flex h-12 shrink-0 items-center gap-3 border-b px-3 text-sm">
      <Link to="/" className="flex shrink-0 items-center gap-2" title="All projects">
        <img src="/favicon.svg?v=2" alt="" className="size-6" />
        <span className="font-heading font-semibold">backslash</span>
      </Link>
      {children ?? <div className="flex-1" />}
      <ThemeToggle theme={theme} onToggle={toggle} />
      <UserMenu />
    </header>
  );
}
