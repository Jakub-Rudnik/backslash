import { WebSocketStatus } from "@hocuspocus/provider";
import { cn } from "cn";
import type { Peer } from "@/hooks/use-collab";
import { initials, type CollabUser } from "@/lib/user";

type CollabStatusProps = {
  status: WebSocketStatus;
  me: CollabUser;
  peers: Peer[];
  onRename: (name: string) => void;
};

const MAX_AVATARS = 5;

function Avatar({
  user,
  title,
  compiling,
  className,
}: {
  user: CollabUser;
  title: string;
  compiling?: boolean;
  className?: string;
}) {
  return (
    <span
      title={title}
      className={cn(
        "flex size-7 items-center justify-center rounded-full border-2 border-background text-[11px] font-semibold text-black",
        compiling && "animate-pulse",
        className,
      )}
      style={{ backgroundColor: user.color }}
    >
      {initials(user.name)}
    </span>
  );
}

export function CollabStatus({ status, me, peers, onRename }: CollabStatusProps) {
  const label =
    status === WebSocketStatus.Connected
      ? "Connected"
      : status === WebSocketStatus.Connecting
        ? "Connecting…"
        : "Offline, changes will sync on reconnect";

  function rename() {
    const name = window.prompt("Your name (visible to collaborators)", me.name)?.trim();
    if (name) onRename(name.slice(0, 40));
  }

  return (
    <div className="flex items-center gap-2">
      <div className="flex items-center -space-x-1.5">
        {peers.slice(0, MAX_AVATARS).map(({ clientId, user, compiling }) => (
          <Avatar
            key={clientId}
            user={user}
            compiling={compiling}
            title={compiling ? `${user.name} (compiling…)` : user.name}
          />
        ))}
        {peers.length > MAX_AVATARS && (
          <span
            title={peers
              .slice(MAX_AVATARS)
              .map((p) => p.user.name)
              .join(", ")}
            className="flex size-7 items-center justify-center rounded-full border-2 border-background bg-muted text-[11px] font-semibold"
          >
            +{peers.length - MAX_AVATARS}
          </span>
        )}
      </div>
      <button
        type="button"
        onClick={rename}
        title={`You: ${me.name} · ${label}\nClick to rename`}
        aria-label={`You: ${me.name}. Rename`}
        className="relative cursor-pointer rounded-full outline-none focus-visible:ring-3 focus-visible:ring-ring/30"
      >
        <Avatar user={me} title="" className="ring-2 ring-foreground/70" />
        <span
          aria-hidden
          className={cn(
            "absolute -right-0.5 -bottom-0.5 size-2.5 rounded-full border-2 border-background",
            status === WebSocketStatus.Connected && "bg-emerald-500",
            status === WebSocketStatus.Connecting && "animate-pulse bg-amber-500",
            status === WebSocketStatus.Disconnected && "bg-destructive",
          )}
        />
      </button>
    </div>
  );
}
