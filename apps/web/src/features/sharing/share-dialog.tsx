import type { GrantableRole, ProjectRole } from "@backslash/shared";
import {
  Cancel01Icon,
  Copy01Icon,
  Link01Icon,
  Tick02Icon,
  UserGroupIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useNavigate } from "react-router";
import { useAccount } from "@/features/auth/account";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { api, inviteUrl } from "@/lib/api";
import { identityFor, initials } from "@/lib/user";

const ROLE_LABEL: Record<ProjectRole, string> = {
  owner: "Owner",
  editor: "Editor",
  viewer: "Viewer",
};

const date = new Intl.DateTimeFormat(undefined, { dateStyle: "medium" });

function RoleSelect({
  value,
  onChange,
}: {
  value: GrantableRole;
  onChange: (role: GrantableRole) => void;
}) {
  return (
    <Select
      value={value}
      onValueChange={(v) => (v === "editor" || v === "viewer") && onChange(v)}
      items={{ editor: "Editor", viewer: "Viewer" }}
    >
      <SelectTrigger size="sm" className="w-28">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectGroup>
          <SelectItem value="editor">Editor</SelectItem>
          <SelectItem value="viewer">Viewer</SelectItem>
        </SelectGroup>
      </SelectContent>
    </Select>
  );
}

function CopyLink({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      window.prompt("Copy this link:", url);
    }
  }
  return (
    <div className="flex items-center gap-2 rounded-2xl border bg-muted/50 p-1.5 pl-3">
      <span className="min-w-0 flex-1 font-mono text-xs break-all select-all">{url}</span>
      <Button size="sm" variant="outline" onClick={() => void copy()}>
        <HugeiconsIcon icon={copied ? Tick02Icon : Copy01Icon} data-icon="inline-start" />
        {copied ? "Copied" : "Copy"}
      </Button>
    </div>
  );
}

/** Members, roles and invite links of a project. Only the owner can change anything. */
export function ShareDialog({ projectId, role }: { projectId: string; role: ProjectRole }) {
  const account = useAccount();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const isOwner = role === "owner";
  const [open, setOpen] = useState(false);
  const [inviteRole, setInviteRole] = useState<GrantableRole>("editor");
  const [created, setCreated] = useState<string | null>(null);

  const members = useQuery({
    queryKey: ["members", projectId],
    queryFn: () => api.members(projectId),
    enabled: open,
  });
  const invites = useQuery({
    queryKey: ["invites", projectId],
    queryFn: () => api.invites(projectId),
    enabled: open && isOwner,
  });

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ["members", projectId] });
    void queryClient.invalidateQueries({ queryKey: ["invites", projectId] });
  };
  const onError = { onError: (err: Error) => window.alert(err.message), onSettled: refresh };

  const setRole = useMutation({
    mutationFn: (v: { userId: string; role: GrantableRole }) =>
      api.setMemberRole(projectId, v.userId, v.role),
    ...onError,
  });
  const remove = useMutation({
    mutationFn: (userId: string) => api.removeMember(projectId, userId),
    ...onError,
  });
  const createInvite = useMutation({
    mutationFn: () => api.createInvite(projectId, inviteRole),
    onSuccess: (invite) => setCreated(inviteUrl(invite.token)),
    ...onError,
  });
  const revoke = useMutation({
    mutationFn: (inviteId: string) => api.revokeInvite(projectId, inviteId),
    ...onError,
  });
  const leave = useMutation({
    mutationFn: () => api.removeMember(projectId, account.id),
    onSuccess: () => void navigate("/"),
    onError: (err: Error) => window.alert(err.message),
  });

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setCreated(null);
      }}
    >
      <DialogTrigger render={<Button variant="outline" size="sm" />}>
        <HugeiconsIcon icon={UserGroupIcon} data-icon="inline-start" />
        Share
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Share project</DialogTitle>
          <DialogDescription>
            {isOwner
              ? "Invite people with a link. Editors can change files, viewers can only read."
              : "Only the owner can invite people and change roles."}
          </DialogDescription>
        </DialogHeader>

        {isOwner && (
          <section className="space-y-3">
            <div className="flex items-center gap-2">
              <RoleSelect value={inviteRole} onChange={setInviteRole} />
              <Button
                size="sm"
                onClick={() => createInvite.mutate()}
                disabled={createInvite.isPending}
              >
                <HugeiconsIcon icon={Link01Icon} data-icon="inline-start" />
                Create invite link
              </Button>
            </div>
            {created && (
              <div className="space-y-1">
                <CopyLink url={created} />
                <p className="text-xs text-muted-foreground">
                  Copy it now: for security the link can't be shown again. Valid for 7 days.
                </p>
              </div>
            )}
            {(invites.data?.length ?? 0) > 0 && (
              <ul className="space-y-1 text-sm">
                {invites.data?.map((inv) => (
                  <li key={inv.id} className="flex items-center gap-2 text-muted-foreground">
                    <HugeiconsIcon icon={Link01Icon} className="size-4 shrink-0" />
                    <span className="flex-1">
                      {ROLE_LABEL[inv.role]} link · expires {date.format(new Date(inv.expiresAt))}
                    </span>
                    <Button
                      size="xs"
                      variant="ghost"
                      onClick={() => revoke.mutate(inv.id)}
                      aria-label="Revoke link"
                    >
                      Revoke
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}

        <section className="space-y-2">
          <h3 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
            Members
          </h3>
          {members.isPending && <p className="text-sm text-muted-foreground">Loading…</p>}
          <ul className="max-h-72 space-y-1 overflow-y-auto">
            {members.data?.map((m) => {
              const isMe = m.userId === account.id;
              return (
                <li key={m.userId} className="flex items-center gap-3 py-1">
                  <span
                    className="flex size-8 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold text-black"
                    style={{ backgroundColor: identityFor({ id: m.userId, name: m.name }).color }}
                  >
                    {initials(m.name)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">
                      {m.name}
                      {isMe && <span className="text-muted-foreground"> (you)</span>}
                    </div>
                    <div className="truncate text-xs text-muted-foreground">{m.email}</div>
                  </div>
                  {isOwner && m.role !== "owner" ? (
                    <>
                      <RoleSelect
                        value={m.role}
                        onChange={(r) => setRole.mutate({ userId: m.userId, role: r })}
                      />
                      <Button
                        size="icon-sm"
                        variant="ghost"
                        aria-label={`Remove ${m.name}`}
                        onClick={() => remove.mutate(m.userId)}
                      >
                        <HugeiconsIcon icon={Cancel01Icon} />
                      </Button>
                    </>
                  ) : (
                    <span className="text-xs text-muted-foreground">{ROLE_LABEL[m.role]}</span>
                  )}
                </li>
              );
            })}
          </ul>
        </section>

        {!isOwner && (
          <Button variant="outline" onClick={() => leave.mutate()} disabled={leave.isPending}>
            Leave project
          </Button>
        )}
      </DialogContent>
    </Dialog>
  );
}
