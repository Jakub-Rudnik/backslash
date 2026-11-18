import { useState, type FormEvent } from "react";
import { Link, useSearchParams } from "react-router";
import { AuthCard } from "@/features/auth/auth-card";
import { formField } from "@/features/auth/account";
import { authClient } from "@/features/auth/auth-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function ResetPasswordPage() {
  const [params] = useSearchParams();
  const token = params.get("token");
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!token) return;
    const form = new FormData(e.currentTarget);
    const newPassword = formField(form, "password");
    if (newPassword !== formField(form, "confirm")) {
      setError("The passwords don't match");
      return;
    }
    setPending(true);
    setError(null);
    const result = await authClient.resetPassword({ newPassword, token });
    setPending(false);
    if (result.error) setError(result.error.message ?? "Something went wrong");
    else setDone(true);
  }

  if (!token || params.get("error")) {
    return (
      <AuthCard title="Link expired">
        <p className="text-center text-sm text-muted-foreground">
          This password reset link is invalid or has expired.
        </p>
        <Button className="w-full" nativeButton={false} render={<Link to="/forgot-password" />}>
          Send a new link
        </Button>
      </AuthCard>
    );
  }

  if (done) {
    return (
      <AuthCard title="Password changed">
        <p className="text-center text-sm text-muted-foreground">
          Your password was changed and you were signed out everywhere.
        </p>
        <Button className="w-full" nativeButton={false} render={<Link to="/login" />}>
          Sign in
        </Button>
      </AuthCard>
    );
  }

  return (
    <AuthCard title="Set a new password">
      <form className="space-y-3" onSubmit={(e) => void submit(e)}>
        <Input
          name="password"
          type="password"
          placeholder="New password"
          autoComplete="new-password"
          required
          minLength={8}
        />
        <Input
          name="confirm"
          type="password"
          placeholder="Repeat new password"
          autoComplete="new-password"
          required
          minLength={8}
        />
        {error && <p className="text-sm text-destructive">{error}</p>}
        <Button type="submit" className="w-full" disabled={pending}>
          Change password
        </Button>
      </form>
    </AuthCard>
  );
}
