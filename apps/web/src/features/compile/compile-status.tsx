import type { SharedBuild } from "@backslash/shared";
import { Alert02Icon, CheckmarkCircle02Icon, Loading03Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { cn } from "cn";

type CompileStatusProps = {
  /** names of whoever is compiling right now (including "You") */
  compiling: string[];
  build: SharedBuild | null;
  error: Error | null;
  myName: string;
};

const time = new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit" });

export function CompileStatus({ compiling, build, error, myName }: CompileStatusProps) {
  if (compiling.length > 0) {
    return (
      <span className="flex min-w-0 items-center gap-1.5 text-muted-foreground">
        <HugeiconsIcon icon={Loading03Icon} className="size-4 shrink-0 animate-spin" />
        <span className="truncate">
          {compiling.join(", ")} {compiling.length === 1 && compiling[0] === "You" ? "are" : "is"}{" "}
          compiling…
        </span>
      </span>
    );
  }

  if (error) {
    return (
      <span className="flex min-w-0 items-center gap-1.5 text-destructive">
        <HugeiconsIcon icon={Alert02Icon} className="size-4 shrink-0" />
        <span className="truncate">{error.message}</span>
      </span>
    );
  }

  if (!build) return null;

  const failed = build.status === "error";
  return (
    <span
      className={cn(
        "flex min-w-0 items-center gap-1.5",
        failed ? "text-destructive" : "text-muted-foreground",
      )}
    >
      <HugeiconsIcon
        icon={failed ? Alert02Icon : CheckmarkCircle02Icon}
        className="size-4 shrink-0"
      />
      <span className="truncate">
        {failed ? "Failed" : "Compiled"} · {build.by === myName ? "you" : build.by},{" "}
        {time.format(build.at)}
      </span>
    </span>
  );
}
