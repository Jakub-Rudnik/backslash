import { Alert02Icon, CheckmarkCircle02Icon, Loading03Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { CompileResponse } from "@/lib/api";

type CompileStatusProps = {
  isPending: boolean;
  result: CompileResponse | undefined;
  error: Error | null;
};

export function CompileStatus({ isPending, result, error }: CompileStatusProps) {
  if (isPending) {
    return (
      <span className="flex items-center gap-1.5 text-muted-foreground">
        <HugeiconsIcon icon={Loading03Icon} className="size-4 animate-spin" />
        Compiling…
      </span>
    );
  }

  if (error) {
    return (
      <span className="flex items-center gap-1.5 text-destructive">
        <HugeiconsIcon icon={Alert02Icon} className="size-4" />
        {error.message}
      </span>
    );
  }

  if (!result) return null;

  if (result.status === "error") {
    const first = result.errors[0];
    return (
      <span className="flex min-w-0 items-center gap-1.5 text-destructive">
        <HugeiconsIcon icon={Alert02Icon} className="size-4 shrink-0" />
        <span className="truncate">
          {first
            ? `${first.line ? `Line ${first.line}: ` : ""}${first.message}`
            : "Compilation failed"}
          {result.errors.length > 1 && ` (+${result.errors.length - 1} more)`}
        </span>
      </span>
    );
  }

  return (
    <span className="flex items-center gap-1.5 text-muted-foreground">
      <HugeiconsIcon icon={CheckmarkCircle02Icon} className="size-4" />
      Compiled
    </span>
  );
}
