import { ChartColumnIcon, Folder01Icon, UserMultiple02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react";
import { Navigate, useSearchParams } from "react-router";
import { AppHeader } from "@/components/app-header";
import { AdminOverview } from "@/features/admin/admin-overview";
import { AdminProjects } from "@/features/admin/admin-projects";
import { AdminUsers } from "@/features/admin/admin-users";
import { useAccount } from "@/features/auth/account";
import { cn } from "@/lib/utils";

const TABS = [
  { id: "overview", label: "Overview", icon: ChartColumnIcon },
  { id: "users", label: "Users", icon: UserMultiple02Icon },
  { id: "projects", label: "Projects", icon: Folder01Icon },
] as const satisfies { id: string; label: string; icon: IconSvgElement }[];

type Tab = (typeof TABS)[number]["id"];

function tabFrom(value: string | null): Tab {
  return TABS.find((t) => t.id === value)?.id ?? "overview";
}

export function AdminPage() {
  const account = useAccount();
  const [params, setParams] = useSearchParams();
  const tab = tabFrom(params.get("tab"));

  if (account.role !== "admin") return <Navigate to="/" replace />;

  return (
    <div className="flex min-h-screen flex-col">
      <AppHeader />
      <main className="mx-auto w-full max-w-6xl flex-1 p-4 sm:p-8">
        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <h1 className="font-heading text-2xl font-semibold">Admin</h1>
          <nav className="flex gap-1 overflow-x-auto rounded-full bg-muted p-1">
            {TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                aria-current={tab === t.id ? "page" : undefined}
                onClick={() => setParams(t.id === "overview" ? {} : { tab: t.id })}
                className={cn(
                  "flex shrink-0 cursor-pointer items-center gap-2 rounded-full px-3 py-1.5 text-sm text-muted-foreground transition-colors outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/30",
                  tab === t.id && "bg-background font-medium text-foreground shadow-xs",
                )}
              >
                <HugeiconsIcon icon={t.icon} className="size-4" />
                {t.label}
              </button>
            ))}
          </nav>
        </div>
        {tab === "overview" && <AdminOverview />}
        {tab === "users" && <AdminUsers />}
        {tab === "projects" && <AdminProjects />}
      </main>
    </div>
  );
}
