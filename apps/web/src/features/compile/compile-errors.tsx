import type { CompileError } from "@backslash/shared";
import { useState } from "react";
import { Alert02Icon, ArrowDown01Icon, ArrowUp01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";

type CompileErrorsProps = {
  errors: CompileError[];
  /** false if the error's file no longer exists */
  canJump: (error: CompileError) => boolean;
  onJump: (error: CompileError) => void;
};

function location({ file, line }: CompileError) {
  if (file && line) return `${file}:${line}`;
  if (file) return file;
  if (line) return `Line ${line}`;
  return null;
}

/** Strip under the PDF toolbar: the first error, expandable to all of them. */
export function CompileErrors({ errors, canJump, onJump }: CompileErrorsProps) {
  const [open, setOpen] = useState(false);
  const [first] = errors;
  if (!first) return null;

  const single = errors.length === 1;
  const where = location(first);

  return (
    <div className="shrink-0 border-b border-destructive/25 bg-destructive/5 text-sm">
      <button
        type="button"
        onClick={() => (single ? onJump(first) : setOpen(!open))}
        disabled={single && !canJump(first)}
        aria-expanded={single ? undefined : open}
        className="flex w-full min-w-0 cursor-pointer items-center gap-2 px-3 py-2 text-left text-destructive outline-none focus-visible:bg-destructive/10 disabled:cursor-default"
      >
        <HugeiconsIcon icon={Alert02Icon} className="size-4 shrink-0" />
        <span className="shrink-0 font-semibold">
          {single ? "1 error" : `${errors.length} errors`}
        </span>
        {where && <span className="shrink-0 font-mono text-xs">{where}</span>}
        <span className="min-w-0 flex-1 truncate text-foreground">{first.message}</span>
        {!single && (
          <HugeiconsIcon
            icon={open ? ArrowUp01Icon : ArrowDown01Icon}
            className="size-4 shrink-0"
          />
        )}
      </button>
      {open && !single && (
        <ul className="max-h-48 overflow-auto border-t border-destructive/25 py-1">
          {errors.map((e, i) => (
            <li key={i}>
              <button
                type="button"
                disabled={!canJump(e)}
                onClick={() => onJump(e)}
                className="flex w-full cursor-pointer items-baseline gap-2.5 py-1.5 pr-3 pl-9 text-left outline-none hover:bg-destructive/10 focus-visible:bg-destructive/10 disabled:cursor-default disabled:hover:bg-transparent"
              >
                {location(e) && (
                  <span className="shrink-0 font-mono text-xs text-muted-foreground">
                    {location(e)}
                  </span>
                )}
                <span className="min-w-0">{e.message}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
