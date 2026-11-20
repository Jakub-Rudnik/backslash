import type { AdminUser, AdminUserPage, UpdateAdminUser } from "@backslash/shared";
import {
  Delete02Icon,
  Logout03Icon,
  MoreHorizontalIcon,
  Shield01Icon,
  SlidersHorizontalIcon,
  UserBlock01Icon,
  UserCheck01Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
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
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { formField, useAccount } from "@/features/auth/account";
import { formatSize } from "@/features/files/mime";
import { api } from "@/lib/api";
import { formatDate } from "./format-date";
import { Pagination, SearchForm } from "./list-controls";

type Defaults = AdminUserPage["defaults"];

type Action =
  | { kind: "update"; user: AdminUser; changes: UpdateAdminUser }
  | { kind: "sign-out"; user: AdminUser }
  | { kind: "delete"; user: AdminUser };

const MB = 1024 * 1024;

function limitField(form: FormData, name: string) {
  const value = formField(form, name).trim();
  return value === "" ? null : Number(value);
}

function LimitsDialog({
  user,
  defaults,
  onSave,
  onClose,
}: {
  user: AdminUser;
  defaults: Defaults;
  onSave: (changes: UpdateAdminUser) => Promise<unknown>;
  onClose: () => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setPending(true);
    try {
      await onSave({
        projectLimit: limitField(form, "projectLimit"),
        storageLimitMb: limitField(form, "storageLimitMb"),
      });
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
            <DialogTitle>Limits for {user.name}</DialogTitle>
            <DialogDescription>Leave a field empty to use the default.</DialogDescription>
          </DialogHeader>
          <label className="block space-y-1.5">
            <span className="text-sm font-medium">Projects they can own</span>
            <Input
              name="projectLimit"
              type="number"
              min={0}
              max={100_000}
              defaultValue={user.projectLimit ?? ""}
              placeholder={`Default: ${defaults.projectLimit}`}
            />
          </label>
          <label className="block space-y-1.5">
            <span className="text-sm font-medium">Storage for uploaded files (MB)</span>
            <Input
              name="storageLimitMb"
              type="number"
              min={0}
              max={10_000_000}
              defaultValue={user.storageLimitMb ?? ""}
              placeholder={`Default: ${defaults.storageLimitMb}`}
            />
          </label>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <DialogFooter>
            <Button type="submit" disabled={pending}>
              Save
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function UserActions({
  user,
  isSelf,
  onAction,
  onEditLimits,
  onConfirm,
}: {
  user: AdminUser;
  isSelf: boolean;
  onAction: (action: Action) => void;
  onEditLimits: () => void;
  onConfirm: (kind: "ban" | "delete") => void;
}) {
  const update = (changes: UpdateAdminUser) => onAction({ kind: "update", user, changes });
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={`Actions for ${user.email}`}
        className="flex size-8 cursor-pointer items-center justify-center rounded-full text-muted-foreground hover:bg-muted"
      >
        <HugeiconsIcon icon={MoreHorizontalIcon} className="size-4" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        <DropdownMenuItem onClick={onEditLimits}>
          <HugeiconsIcon icon={SlidersHorizontalIcon} />
          Edit limits
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => onAction({ kind: "sign-out", user })}>
          <HugeiconsIcon icon={Logout03Icon} />
          Sign out everywhere
        </DropdownMenuItem>
        {!isSelf && (
          <>
            <DropdownMenuItem
              onClick={() => update({ role: user.role === "admin" ? "user" : "admin" })}
            >
              <HugeiconsIcon icon={Shield01Icon} />
              {user.role === "admin" ? "Remove admin role" : "Make admin"}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            {user.banned ? (
              <DropdownMenuItem onClick={() => update({ banned: false })}>
                <HugeiconsIcon icon={UserCheck01Icon} />
                Unban
              </DropdownMenuItem>
            ) : (
              <DropdownMenuItem variant="destructive" onClick={() => onConfirm("ban")}>
                <HugeiconsIcon icon={UserBlock01Icon} />
                Ban
              </DropdownMenuItem>
            )}
            <DropdownMenuItem variant="destructive" onClick={() => onConfirm("delete")}>
              <HugeiconsIcon icon={Delete02Icon} />
              Delete account
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function Usage({ used, limit, custom }: { used: string; limit: string; custom: boolean }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      {used}
      <span className="text-muted-foreground">/ {limit}</span>
      {custom && (
        <Badge variant="outline" title="Set by an admin">
          custom
        </Badge>
      )}
    </span>
  );
}

export function AdminUsers() {
  const me = useAccount();
  const queryClient = useQueryClient();
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [limitsFor, setLimitsFor] = useState<AdminUser | null>(null);
  const [confirm, setConfirm] = useState<{ kind: "ban" | "delete"; user: AdminUser } | null>(null);
  const users = useQuery({
    queryKey: ["admin", "users", q, page],
    queryFn: () => api.admin.users(q, page),
    placeholderData: keepPreviousData,
  });

  const action = useMutation({
    mutationFn: async (a: Action) => {
      if (a.kind === "update") return api.admin.updateUser(a.user.id, a.changes);
      if (a.kind === "sign-out") return api.admin.signOutUser(a.user.id);
      return api.admin.deleteUser(a.user.id);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ["admin"] }),
  });

  const data = users.data;

  return (
    <div className="space-y-4">
      <SearchForm
        placeholder="Search by name or email"
        initial={q}
        onSearch={(value) => {
          setQ(value);
          setPage(1);
        }}
      />

      {users.isPending && <p className="text-sm text-muted-foreground">Loading…</p>}
      {users.error && <p className="text-sm text-destructive">{users.error.message}</p>}
      {action.error && (
        <p className="text-sm text-destructive">
          Couldn't update {action.variables?.user.email}: {action.error.message}
        </p>
      )}
      {action.isSuccess && action.variables.kind === "sign-out" && (
        <p className="text-sm text-muted-foreground">
          {action.variables.user.email} was signed out everywhere.
        </p>
      )}
      {data?.users.length === 0 && (
        <div className="rounded-3xl border border-dashed p-10 text-center text-sm text-muted-foreground">
          {q ? `No users match "${q}".` : "No users yet."}
        </div>
      )}

      {data && data.users.length > 0 && (
        <>
          <div className="overflow-x-auto rounded-3xl border">
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-muted-foreground">
                <tr className="border-b">
                  <th className="px-4 py-2.5 font-medium">User</th>
                  <th className="hidden px-4 py-2.5 font-medium md:table-cell">Joined</th>
                  <th className="hidden px-4 py-2.5 font-medium md:table-cell">Last active</th>
                  <th className="px-4 py-2.5 font-medium">Projects</th>
                  <th className="hidden px-4 py-2.5 font-medium sm:table-cell">Storage</th>
                  <th className="hidden px-4 py-2.5 font-medium lg:table-cell">Compiles (30 d)</th>
                  <th className="w-12 px-2 py-2.5">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {data.users.map((u) => (
                  <tr key={u.id} className={u.banned ? "text-muted-foreground" : undefined}>
                    <td className="max-w-64 px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span className="truncate font-medium">{u.name}</span>
                        {u.role === "admin" && <Badge variant="secondary">Admin</Badge>}
                        {u.banned && <Badge variant="destructive">Banned</Badge>}
                      </div>
                      <div className="truncate text-xs text-muted-foreground">{u.email}</div>
                    </td>
                    <td className="hidden px-4 py-3 whitespace-nowrap md:table-cell">
                      {formatDate(u.createdAt)}
                    </td>
                    <td className="hidden px-4 py-3 whitespace-nowrap md:table-cell">
                      {formatDate(u.lastActiveAt)}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap tabular-nums">
                      <Usage
                        used={String(u.projects)}
                        limit={String(u.projectLimit ?? data.defaults.projectLimit)}
                        custom={u.projectLimit !== null}
                      />
                    </td>
                    <td className="hidden px-4 py-3 whitespace-nowrap tabular-nums sm:table-cell">
                      <Usage
                        used={formatSize(u.storageBytes)}
                        limit={formatSize((u.storageLimitMb ?? data.defaults.storageLimitMb) * MB)}
                        custom={u.storageLimitMb !== null}
                      />
                    </td>
                    <td className="hidden px-4 py-3 tabular-nums lg:table-cell">{u.compiles30d}</td>
                    <td className="px-2 py-3">
                      <UserActions
                        user={u}
                        isSelf={u.id === me.id}
                        onAction={(a) => action.mutate(a)}
                        onEditLimits={() => setLimitsFor(u)}
                        onConfirm={(kind) => setConfirm({ kind, user: u })}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination page={page} pageSize={data.pageSize} total={data.total} onPage={setPage} />
        </>
      )}

      {limitsFor && data && (
        <LimitsDialog
          user={limitsFor}
          defaults={data.defaults}
          onClose={() => setLimitsFor(null)}
          onSave={(changes) => action.mutateAsync({ kind: "update", user: limitsFor, changes })}
        />
      )}

      <AlertDialog open={confirm !== null} onOpenChange={(open) => !open && setConfirm(null)}>
        <AlertDialogContent size="sm">
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirm?.kind === "ban" ? "Ban this user?" : "Delete this account?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirm?.kind === "ban"
                ? `${confirm.user.email} is signed out everywhere and can't sign in until you unban them. Their projects stay.`
                : `${confirm?.user.email} and the ${confirm?.user.projects} projects they own are deleted for everyone. This can't be undone.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                if (confirm?.kind === "ban") {
                  action.mutate({ kind: "update", user: confirm.user, changes: { banned: true } });
                } else if (confirm) {
                  action.mutate({ kind: "delete", user: confirm.user });
                }
                setConfirm(null);
              }}
            >
              {confirm?.kind === "ban" ? "Ban" : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
