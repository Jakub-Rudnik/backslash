import type { ReactNode } from "react";

/** Centered card of the signed-out pages (sign in, sign up, password reset). */
export function AuthCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/40 p-4">
      <div className="w-full max-w-sm space-y-6 rounded-3xl border bg-background p-8 shadow-sm">
        <div className="flex flex-col items-center gap-2 text-center">
          <img src="/favicon.svg?v=2" alt="" className="size-10" />
          <h1 className="font-heading text-xl font-semibold">{title}</h1>
        </div>
        {children}
      </div>
    </div>
  );
}
