import { WebSocketStatus } from "@hocuspocus/provider";
import { cn } from "cn";
import type { Peer } from "@/features/editor/use-collab";
import { initials, type CollabUser } from "@/lib/user";

type CollabStatusProps = {
  status: WebSocketStatus;
  me: CollabUser;
  peers: Peer[];
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

export function CollabStatus({ status, me, peers: all }: CollabStatusProps) {
  const peers = all.filter(
    (p, i) => p.user.id !== me.id && all.findIndex((q) => q.user.id === p.user.id) === i,
  );
  const label =
    status === WebSocketStatus.Connected
      ? "Connected"
      : status === WebSocketStatus.Connecting
        ? "Connecting…"
        : "Offline, changes will sync on reconnect";

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
      <span
        role="status"
        title={label}
        aria-label={label}
        className={cn(
          "size-2.5 rounded-full",
          status === WebSocketStatus.Connected && "bg-emerald-500",
          status === WebSocketStatus.Connecting && "animate-pulse bg-amber-500",
          status === WebSocketStatus.Disconnected && "bg-destructive",
        )}
      />
    </div>
  );
}
