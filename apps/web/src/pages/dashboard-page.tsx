import type { ProjectSummary } from "@backslash/shared";
import {
  Delete02Icon,
  Logout01Icon,
  MoreHorizontalIcon,
  PencilEdit01Icon,
  PlusSignIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router";
import { AppHeader } from "@/components/app-header";
import { formField, useAccount } from "@/features/auth/account";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/api";

const relative = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });

function ago(iso: string) {
  const minutes = Math.round((new Date(iso).getTime() - Date.now()) / 60_000);
  if (Math.abs(minutes) < 60) return relative.format(minutes, "minute");
  const hours = Math.round(minutes / 60);
  if (Math.abs(hours) < 24) return relative.format(hours, "hour");
  return relative.format(Math.round(hours / 24), "day");
}

/** Name dialog for creating and renaming projects. */
function NameDialog({
  title,
  initial,
  submitLabel,
  onSubmit,
  onClose,
}: {
  title: string;
  initial: string;
  submitLabel: string;
  onSubmit: (name: string) => Promise<unknown>;
  onClose: () => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const name = formField(new FormData(e.currentTarget), "name").trim();
    if (!name) return;
    setPending(true);
    try {
      await onSubmit(name);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <form onSubmit={(e) => void submit(e)} className="space-y-4">
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
          </DialogHeader>
          <Input name="name" defaultValue={initial} maxLength={100} required autoFocus />
          {error && <p className="text-sm text-destructive">{error}</p>}
          <DialogFooter>
            <Button type="submit" disabled={pending}>
              {submitLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function DashboardPage() {
  const account = useAccount();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const projects = useQuery({ queryKey: ["projects"], queryFn: api.projects });
  const [dialog, setDialog] = useState<
    | { kind: "create" }
    | { kind: "rename"; project: ProjectSummary }
    | { kind: "delete"; project: ProjectSummary }
    | { kind: "leave"; project: ProjectSummary }
    | null
  >(null);

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["projects"] });
  const remove = useMutation({
    mutationFn: async (d: { kind: "delete" | "leave"; project: ProjectSummary }) =>
      d.kind === "delete"
        ? api.deleteProject(d.project.id)
        : api.removeMember(d.project.id, account.id),
    onSettled: refresh,
  });

  return (
    <div className="flex min-h-screen flex-col">
      <AppHeader />
      <main className="mx-auto w-full max-w-4xl flex-1 p-4 sm:p-8">
        <div className="mb-6 flex items-center justify-between gap-4">
          <h1 className="font-heading text-2xl font-semibold">Projects</h1>
          <Button onClick={() => setDialog({ kind: "create" })}>
            <HugeiconsIcon icon={PlusSignIcon} data-icon="inline-start" />
            New project
          </Button>
        </div>

        {projects.isPending && <p className="text-sm text-muted-foreground">Loading…</p>}
        {projects.error && <p className="text-sm text-destructive">{projects.error.message}</p>}
        {remove.error && (
          <p className="mb-4 text-sm text-destructive">
            {remove.variables?.kind === "delete" ? "Couldn't delete" : "Couldn't leave"} "
            {remove.variables?.project.name}": {remove.error.message}
          </p>
        )}
        {projects.data?.length === 0 && (
          <div className="rounded-3xl border border-dashed p-10 text-center text-sm text-muted-foreground">
            No projects yet. Create one, or open an invite link someone shared with you.
          </div>
        )}

        <ul className="divide-y rounded-3xl border">
          {projects.data?.map((p) => (
            <li key={p.id} className="flex items-center gap-3 px-4 py-3">
              <Link to={`/p/${p.id}`} className="min-w-0 flex-1">
                <div className="truncate font-medium hover:underline">{p.name}</div>
                <div className="truncate text-xs text-muted-foreground">
                  {p.role === "owner" ? "You" : p.ownerName} · edited {ago(p.updatedAt)}
                </div>
              </Link>
              {p.role !== "owner" && (
                <Badge variant="secondary" className="capitalize">
                  {p.role}
                </Badge>
              )}
              <DropdownMenu>
                <DropdownMenuTrigger
                  aria-label="Project actions"
                  className="flex size-8 cursor-pointer items-center justify-center rounded-full text-muted-foreground hover:bg-muted"
                >
                  <HugeiconsIcon icon={MoreHorizontalIcon} className="size-4" />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-48">
                  {p.role === "owner" ? (
                    <>
                      <DropdownMenuItem onClick={() => setDialog({ kind: "rename", project: p })}>
                        <HugeiconsIcon icon={PencilEdit01Icon} />
                        Rename
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        variant="destructive"
                        onClick={() => setDialog({ kind: "delete", project: p })}
                      >
                        <HugeiconsIcon icon={Delete02Icon} />
                        Delete
                      </DropdownMenuItem>
                    </>
                  ) : (
                    <DropdownMenuItem
                      variant="destructive"
                      onClick={() => setDialog({ kind: "leave", project: p })}
                    >
                      <HugeiconsIcon icon={Logout01Icon} />
                      Leave project
                    </DropdownMenuItem>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            </li>
          ))}
        </ul>
      </main>

      {dialog?.kind === "create" && (
        <NameDialog
          title="New project"
          initial="Untitled"
          submitLabel="Create"
          onClose={() => setDialog(null)}
          onSubmit={async (name) => {
            const { id } = await api.createProject(name);
            void refresh();
            void navigate(`/p/${id}`);
          }}
        />
      )}
      {dialog?.kind === "rename" && (
        <NameDialog
          title="Rename project"
          initial={dialog.project.name}
          submitLabel="Rename"
          onClose={() => setDialog(null)}
          onSubmit={async (name) => {
            await api.renameProject(dialog.project.id, name);
            await refresh();
          }}
        />
      )}
      <AlertDialog
        open={dialog?.kind === "delete" || dialog?.kind === "leave"}
        onOpenChange={(open) => !open && setDialog(null)}
      >
        <AlertDialogContent size="sm">
          <AlertDialogHeader>
            <AlertDialogTitle>
              {dialog?.kind === "delete" ? "Delete project?" : "Leave project?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {dialog?.kind === "delete"
                ? `"${dialog.project.name}" and all its files will be deleted for everyone. This can't be undone.`
                : "You'll need a new invite link to get back in."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                if (dialog?.kind === "delete" || dialog?.kind === "leave") remove.mutate(dialog);
                setDialog(null);
              }}
            >
              {dialog?.kind === "delete" ? "Delete" : "Leave"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
