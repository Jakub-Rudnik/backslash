import { GithubIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useQuery } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { Link, Navigate, useNavigate, useSearchParams } from "react-router";
import { AuthCard } from "@/features/auth/auth-card";
import { FullPageMessage } from "@/features/auth/require-auth";
import { formField, safeNext } from "@/features/auth/account";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/api";
import { authClient } from "@/features/auth/auth-client";

type Mode = "sign-in" | "sign-up";

export function LoginPage({ mode }: { mode: Mode }) {
  const [params] = useSearchParams();
  const next = safeNext(params.get("next"));
  const navigate = useNavigate();
  const session = authClient.useSession();
  const config = useQuery({ queryKey: ["config"], queryFn: api.config, staleTime: Infinity });
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  if (session.isPending) return <FullPageMessage>Loading…</FullPageMessage>;
  if (session.data) return <Navigate to={next} replace />;

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const email = formField(form, "email");
    const password = formField(form, "password");
    setPending(true);
    setError(null);
    const result =
      mode === "sign-up"
        ? await authClient.signUp.email({ email, password, name: formField(form, "name").trim() })
        : await authClient.signIn.email({ email, password });
    setPending(false);
    if (result.error) {
      setError(result.error.message ?? "Something went wrong");
      return;
    }
    void navigate(next, { replace: true });
  }

  async function github() {
    setError(null);
    const result = await authClient.signIn.social({ provider: "github", callbackURL: next });
    if (result.error) setError(result.error.message ?? "GitHub sign-in failed");
  }

  const other = mode === "sign-in" ? "/signup" : "/login";
  const keepNext = next === "/" ? "" : `?next=${encodeURIComponent(next)}`;

  return (
    <AuthCard title={mode === "sign-in" ? "Sign in to backslash" : "Create an account"}>
      {config.data?.github && (
        <>
          <Button variant="outline" className="w-full" onClick={() => void github()}>
            <HugeiconsIcon icon={GithubIcon} data-icon="inline-start" />
            Continue with GitHub
          </Button>
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <div className="h-px flex-1 bg-border" />
            or
            <div className="h-px flex-1 bg-border" />
          </div>
        </>
      )}

      <form className="space-y-3" onSubmit={(e) => void submit(e)}>
        {mode === "sign-up" && (
          <Input name="name" placeholder="Name" autoComplete="name" required maxLength={80} />
        )}
        <Input name="email" type="email" placeholder="Email" autoComplete="email" required />
        <Input
          name="password"
          type="password"
          placeholder="Password"
          autoComplete={mode === "sign-up" ? "new-password" : "current-password"}
          required
          minLength={mode === "sign-up" ? 8 : undefined}
        />
        {error && <p className="text-sm text-destructive">{error}</p>}
        <Button type="submit" className="w-full" disabled={pending}>
          {mode === "sign-in" ? "Sign in" : "Sign up"}
        </Button>
        {mode === "sign-in" && config.data?.passwordReset && (
          <Link
            to="/forgot-password"
            className="block text-center text-sm text-muted-foreground hover:text-foreground hover:underline"
          >
            Forgot your password?
          </Link>
        )}
      </form>

      <p className="text-center text-sm text-muted-foreground">
        {mode === "sign-in" ? "No account yet? " : "Already have an account? "}
        <Link to={other + keepNext} className="font-medium text-foreground underline">
          {mode === "sign-in" ? "Sign up" : "Sign in"}
        </Link>
      </p>
    </AuthCard>
  );
}
