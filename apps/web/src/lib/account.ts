import { createContext, use } from "react";
import type { Account } from "@/lib/auth-client";

export const AccountContext = createContext<Account | null>(null);

/** The signed-in account; only inside <RequireAuth>. */
export function useAccount(): Account {
  const account = use(AccountContext);
  if (!account) throw new Error("useAccount() outside <RequireAuth>");
  return account;
}

/** Only allow same-site relative redirects (no open redirect via ?next=). */
export function safeNext(next: string | null) {
  return next && next.startsWith("/") && !next.startsWith("//") ? next : "/";
}

/** A text field of a submitted form. */
export function formField(form: FormData, name: string) {
  const value = form.get(name);
  return typeof value === "string" ? value : "";
}
