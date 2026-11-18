import { useState, type FormEvent } from "react";
import { Link } from "react-router";
import { AuthCard } from "@/features/auth/auth-card";
import { formField } from "@/features/auth/account";
import { authClient } from "@/features/auth/auth-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function ForgotPasswordPage() {
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const email = formField(new FormData(e.currentTarget), "email");
    setPending(true);
    setError(null);
    const result = await authClient.requestPasswordReset({ email, redirectTo: "/reset-password" });
    setPending(false);
    if (result.error) setError(result.error.message ?? "Something went wrong");
    else setSentTo(email);
  }

  return (
    <AuthCard title="Reset your password">
      {sentTo ? (
        <p className="text-center text-sm text-muted-foreground">
          If an account exists for <span className="font-medium text-foreground">{sentTo}</span>, we
          sent it a link to set a new password. The link expires in an hour.
        </p>
      ) : (
        <form className="space-y-3" onSubmit={(e) => void submit(e)}>
          <p className="text-sm text-muted-foreground">
            Enter your email and we'll send you a link to set a new password.
          </p>
          <Input name="email" type="email" placeholder="Email" autoComplete="email" required />
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button type="submit" className="w-full" disabled={pending}>
            Send reset link
          </Button>
        </form>
      )}
      <p className="text-center text-sm text-muted-foreground">
        <Link to="/login" className="font-medium text-foreground underline">
          Back to sign in
        </Link>
      </p>
    </AuthCard>
  );
}
