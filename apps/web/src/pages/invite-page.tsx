import { useMutation, useQuery } from "@tanstack/react-query";
import { useNavigate, useParams } from "react-router";
import { FullPageMessage } from "@/features/auth/require-auth";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";

/** /invite/:token: shows what the link grants and joins on confirmation. */
export function InvitePage() {
  const { token = "" } = useParams();
  const navigate = useNavigate();
  const preview = useQuery({
    queryKey: ["invite", token],
    queryFn: () => api.invite(token),
    retry: false,
  });
  const accept = useMutation({
    mutationFn: () => api.acceptInvite(token),
    onSuccess: ({ projectId }) => void navigate(`/p/${projectId}`, { replace: true }),
  });

  if (preview.isPending) return <FullPageMessage>Loading…</FullPageMessage>;
  if (preview.error) {
    return (
      <FullPageMessage>
        <div className="space-y-4">
          <p>{preview.error.message}</p>
          <Button variant="outline" onClick={() => void navigate("/")}>
            Go to your projects
          </Button>
        </div>
      </FullPageMessage>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/40 p-4">
      <div className="w-full max-w-sm space-y-6 rounded-3xl border bg-background p-8 text-center shadow-sm">
        <div className="space-y-2">
          <p className="text-sm text-muted-foreground">You've been invited to</p>
          <h1 className="font-heading text-xl font-semibold break-words">
            {preview.data.projectName}
          </h1>
          <p className="text-sm text-muted-foreground">
            as {preview.data.role === "editor" ? "an editor" : "a viewer (read-only)"}
          </p>
        </div>
        {accept.error && <p className="text-sm text-destructive">{accept.error.message}</p>}
        <Button className="w-full" disabled={accept.isPending} onClick={() => accept.mutate()}>
          Join project
        </Button>
      </div>
    </div>
  );
}
