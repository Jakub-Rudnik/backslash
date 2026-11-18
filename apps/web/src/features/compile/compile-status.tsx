import type { CompileError, SharedBuild } from "@backslash/shared";
import { Alert02Icon, CheckmarkCircle02Icon, Loading03Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

type CompileStatusProps = {
  /** names of whoever is compiling right now (including "You") */
  compiling: string[];
  build: SharedBuild | null;
  error: Error | null;
  myName: string;
  /** jumps to the error location; returns false if the file no longer exists */
  canJump: (error: CompileError) => boolean;
  onJump: (error: CompileError) => void;
};

function location({ file, line }: CompileError) {
  if (file && line) return `${file}:${line}`;
  if (file) return file;
  if (line) return `Line ${line}`;
  return null;
}

function describe(error: CompileError) {
  const where = location(error);
  return where ? `${where}: ${error.message}` : error.message;
}

const time = new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit" });

export function CompileStatus({
  compiling,
  build,
  error,
  myName,
  canJump,
  onJump,
}: CompileStatusProps) {
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

  const who = build.by === myName ? "you" : build.by;
  const meta = (
    <span className="text-muted-foreground">
      · {who}, {time.format(build.at)}
    </span>
  );

  if (build.status === "error") {
    const [first, ...rest] = build.errors;
    return (
      <DropdownMenu>
        <DropdownMenuTrigger
          disabled={!first}
          className="flex max-w-full min-w-0 cursor-pointer items-center gap-1.5 rounded-md text-left text-destructive outline-none focus-visible:ring-2 focus-visible:ring-ring/40 disabled:cursor-default"
        >
          <HugeiconsIcon icon={Alert02Icon} className="size-4 shrink-0" />
          <span className="truncate">
            {first ? describe(first) : "Compilation failed"}
            {rest.length > 0 && ` (+${rest.length} more)`} {meta}
          </span>
        </DropdownMenuTrigger>
        <DropdownMenuContent className="w-auto max-w-[min(40rem,90vw)]">
          {build.errors.map((e, i) => (
            <DropdownMenuItem key={i} disabled={!canJump(e)} onClick={() => onJump(e)}>
              <span className="min-w-0">
                {location(e) && (
                  <span className="mr-2 font-mono text-xs text-muted-foreground">
                    {location(e)}
                  </span>
                )}
                {e.message}
              </span>
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    );
  }

  return (
    <span className="flex min-w-0 items-center gap-1.5 text-muted-foreground">
      <HugeiconsIcon icon={CheckmarkCircle02Icon} className="size-4 shrink-0" />
      <span className="truncate">Compiled {meta}</span>
    </span>
  );
}
