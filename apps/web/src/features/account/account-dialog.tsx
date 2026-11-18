import type { AccountUsage } from "@backslash/shared";
import { DashboardSpeed01Icon, LockPasswordIcon, UserIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react";
import { useQuery } from "@tanstack/react-query";
import { useState, type FormEvent, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { formField, useAccount } from "@/features/auth/account";
import { authClient } from "@/features/auth/auth-client";
import { formatSize } from "@/features/files/mime";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import { identityFor, initials } from "@/lib/user";

type Section = "profile" | "security" | "usage";

const SECTIONS: { id: Section; label: string; icon: IconSvgElement }[] = [
  { id: "profile", label: "Profile", icon: UserIcon },
  { id: "security", label: "Security", icon: LockPasswordIcon },
  { id: "usage", label: "Usage & limits", icon: DashboardSpeed01Icon },
];

const RATE_LIMIT_LABELS: Record<string, string> = {
  compile: "Compiles",
  upload: "File uploads",
  createProject: "New projects",
  createInvite: "New invite links",
  useInvite: "Opening invite links",
};

const PROVIDER_LABELS: Record<string, string> = {
  credential: "Email and password",
  github: "GitHub",
};

function useSignInMethods() {
  return useQuery({
    queryKey: ["sign-in-methods"],
    queryFn: async () => {
      const { data, error } = await authClient.listAccounts();
      if (error) throw new Error(error.message ?? "Couldn't load sign-in methods");
      return data.map((a) => a.providerId);
    },
  });
}

function errorText(error: { message?: string | undefined } | null) {
  return error ? (error.message ?? "Something went wrong") : null;
}

function Status({ error, success }: { error: string | null; success: string | null }) {
  if (error) return <p className="text-sm text-destructive">{error}</p>;
  if (success) return <p className="text-sm text-muted-foreground">{success}</p>;
  return null;
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <span className="text-sm font-medium">{label}</span>
      {children}
    </label>
  );
}

function SectionHeader({ title, description }: { title: string; description: string }) {
  return (
    <div className="space-y-1">
      <h3 className="font-heading text-base font-semibold">{title}</h3>
      <p className="text-sm text-muted-foreground">{description}</p>
    </div>
  );
}

function ProfileSection() {
  const account = useAccount();
  const methods = useSignInMethods();
  const [status, setStatus] = useState<{ error: string | null; success: string | null }>({
    error: null,
    success: null,
  });
  const [pending, setPending] = useState(false);

  async function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const name = formField(new FormData(e.currentTarget), "name").trim();
    if (!name || name === account.name) return;
    setPending(true);
    const { error } = await authClient.updateUser({ name });
    setPending(false);
    setStatus({ error: errorText(error), success: error ? null : "Name saved" });
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <div
          className="flex size-14 shrink-0 items-center justify-center rounded-full text-lg font-semibold text-black"
          style={{ backgroundColor: identityFor(account).color }}
        >
          {initials(account.name)}
        </div>
        <div className="min-w-0">
          <div className="truncate font-heading text-lg font-semibold">{account.name}</div>
          <div className="truncate text-sm text-muted-foreground">{account.email}</div>
        </div>
      </div>

      <form className="space-y-3" onSubmit={(e) => void save(e)}>
        <Field label="Name">
          <Input name="name" defaultValue={account.name} maxLength={80} required />
        </Field>
        <p className="text-xs text-muted-foreground">
          Collaborators see this name next to your cursor.
        </p>
        <Status {...status} />
        <Button type="submit" disabled={pending}>
          Save
        </Button>
      </form>

      <Field label="Email">
        <Input value={account.email} disabled readOnly />
      </Field>

      <div className="space-y-1.5">
        <div className="text-sm font-medium">Sign-in methods</div>
        {methods.isPending && <p className="text-sm text-muted-foreground">Loading…</p>}
        {methods.error && <p className="text-sm text-destructive">{methods.error.message}</p>}
        <ul className="flex flex-wrap gap-2">
          {methods.data?.map((id) => (
            <li key={id} className="rounded-full bg-muted px-3 py-1 text-xs font-medium">
              {PROVIDER_LABELS[id] ?? id}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function SecuritySection() {
  const methods = useSignInMethods();
  const hasPassword = methods.data?.includes("credential");
  const [password, setPassword] = useState<{ error: string | null; success: string | null }>({
    error: null,
    success: null,
  });
  const [sessions, setSessions] = useState<{ error: string | null; success: string | null }>({
    error: null,
    success: null,
  });
  const [pending, setPending] = useState(false);

  async function changePassword(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formElement = e.currentTarget;
    const form = new FormData(formElement);
    const newPassword = formField(form, "new");
    if (newPassword !== formField(form, "confirm")) {
      setPassword({ error: "The new passwords don't match", success: null });
      return;
    }
    setPending(true);
    const { error } = await authClient.changePassword({
      currentPassword: formField(form, "current"),
      newPassword,
      revokeOtherSessions: form.get("signOutOthers") === "on",
    });
    setPending(false);
    setPassword({ error: errorText(error), success: error ? null : "Password changed" });
    if (!error) formElement.reset();
  }

  async function signOutOthers() {
    const { error } = await authClient.revokeOtherSessions();
    setSessions({ error: errorText(error), success: error ? null : "Other devices signed out" });
  }

  return (
    <div className="space-y-8">
      <section className="space-y-4">
        <SectionHeader title="Password" description="Use at least 8 characters." />
        {methods.isPending && <p className="text-sm text-muted-foreground">Loading…</p>}
        {methods.data && !hasPassword && (
          <p className="text-sm text-muted-foreground">
            You sign in with {methods.data.map((id) => PROVIDER_LABELS[id] ?? id).join(", ")}, so
            there is no password to change.
          </p>
        )}
        {hasPassword && (
          <form className="space-y-3" onSubmit={(e) => void changePassword(e)}>
            <Field label="Current password">
              <Input name="current" type="password" autoComplete="current-password" required />
            </Field>
            <Field label="New password">
              <Input
                name="new"
                type="password"
                autoComplete="new-password"
                minLength={8}
                required
              />
            </Field>
            <Field label="Repeat new password">
              <Input
                name="confirm"
                type="password"
                autoComplete="new-password"
                minLength={8}
                required
              />
            </Field>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                name="signOutOthers"
                defaultChecked
                className="size-4 accent-primary"
              />
              Sign out of other devices
            </label>
            <Status {...password} />
            <Button type="submit" disabled={pending}>
              Change password
            </Button>
          </form>
        )}
      </section>

      <section className="space-y-4">
        <SectionHeader
          title="Sessions"
          description="Signed in somewhere you don't recognize? End every session except this one."
        />
        <Status {...sessions} />
        <Button variant="outline" onClick={() => void signOutOthers()}>
          Sign out of other devices
        </Button>
      </section>
    </div>
  );
}

function Meter({
  label,
  used,
  limit,
  format,
}: {
  label: string;
  used: number;
  limit: number;
  format: (n: number) => string;
}) {
  const percent = limit > 0 ? Math.min(100, (used / limit) * 100) : 100;
  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between gap-4 text-sm">
        <span className="font-medium">{label}</span>
        <span className="text-muted-foreground tabular-nums">
          {format(used)} of {format(limit)}
        </span>
      </div>
      <div
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={limit}
        aria-valuenow={used}
        className="h-2 overflow-hidden rounded-full bg-muted"
      >
        <div
          className={cn(
            "h-full rounded-full bg-primary transition-[width] duration-500",
            percent >= 90 && "bg-destructive",
          )}
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
}

function per(window: number) {
  if (window === 60) return "per minute";
  if (window === 3600) return "per hour";
  return `per ${window} s`;
}

function UsageSection() {
  const usage = useQuery({ queryKey: ["usage"], queryFn: api.usage });
  const data: AccountUsage | undefined = usage.data;

  return (
    <div className="space-y-8">
      <section className="space-y-5">
        <SectionHeader
          title="Usage"
          description="Uploaded files count toward the storage of the project's owner, whoever uploads them."
        />
        {usage.isPending && <p className="text-sm text-muted-foreground">Loading…</p>}
        {usage.error && <p className="text-sm text-destructive">{usage.error.message}</p>}
        {data && (
          <>
            <Meter label="Projects you own" {...data.projects} format={String} />
            <Meter label="Storage for uploaded files" {...data.storage} format={formatSize} />
          </>
        )}
      </section>

      {data && (
        <section className="space-y-4">
          <SectionHeader
            title="Rate limits"
            description="Limits that keep the service fair for everyone. They reset on their own."
          />
          <ul className="divide-y rounded-2xl border">
            {data.rateLimits.map((limit) => (
              <li key={limit.name} className="flex justify-between gap-4 px-4 py-2.5 text-sm">
                <span>{RATE_LIMIT_LABELS[limit.name] ?? limit.name}</span>
                <span className="text-muted-foreground tabular-nums">
                  {limit.max} {per(limit.window)}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

export function AccountDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [section, setSection] = useState<Section>("profile");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="gap-0 overflow-hidden p-0 sm:max-w-3xl">
        <div className="grid max-h-[85vh] sm:h-[34rem] sm:grid-cols-[13rem_minmax(0,1fr)]">
          <nav className="flex gap-1 overflow-x-auto border-b bg-muted/40 p-3 sm:flex-col sm:border-r sm:border-b-0 sm:p-4">
            <DialogTitle className="hidden px-3 pt-1 pb-3 sm:block">Settings</DialogTitle>
            {SECTIONS.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => setSection(s.id)}
                aria-current={section === s.id ? "page" : undefined}
                className={cn(
                  "flex shrink-0 cursor-pointer items-center gap-2 rounded-full px-3 py-2 text-left text-sm text-muted-foreground transition-colors outline-none hover:bg-muted hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/30",
                  section === s.id && "bg-background font-medium text-foreground shadow-xs",
                )}
              >
                <HugeiconsIcon icon={s.icon} className="size-4" />
                {s.label}
              </button>
            ))}
          </nav>
          <div className="min-h-0 overflow-y-auto p-6 sm:p-8">
            <DialogDescription className="sr-only">Your account settings</DialogDescription>
            {section === "profile" && <ProfileSection />}
            {section === "security" && <SecuritySection />}
            {section === "usage" && <UsageSection />}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
