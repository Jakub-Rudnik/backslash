import type { ReactNode } from "react";
import { Navigate, useLocation } from "react-router";
import { AccountContext } from "@/lib/account";
import { authClient } from "@/lib/auth-client";

export function FullPageMessage({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-screen items-center justify-center p-6 text-center text-sm text-muted-foreground">
      {children}
    </div>
  );
}

/** Renders children for signed-in users, else redirects to /login (and back afterwards). */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { data, isPending } = authClient.useSession();
  const location = useLocation();
  if (isPending) return <FullPageMessage>Loading…</FullPageMessage>;
  if (!data) {
    const next = encodeURIComponent(location.pathname + location.search + location.hash);
    return <Navigate to={`/login?next=${next}`} replace />;
  }
  return <AccountContext value={data.user}>{children}</AccountContext>;
}
