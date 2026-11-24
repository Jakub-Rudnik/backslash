import type { DocFile } from "@backslash/shared/doc";
import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";
import { cn } from "cn";
import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import type { CollabSession } from "@/features/editor/use-collab";
import { useOutline } from "@/features/outline/use-outline";
import { mod, useShortcut } from "@/hooks/use-shortcut";
import {
  filterPalette,
  parsePaletteInput,
  type PaletteMode,
} from "@/features/palette/palette-query";

const MAX_ITEMS = 50;

export interface PaletteCommand {
  id: string;
  title: string;
  /** shortcut shown next to the title */
  keys?: string;
  /** the command moves focus itself (to an input, a dialog), so the palette doesn't restore it */
  takesFocus?: boolean;
  run: () => void;
}

interface Item {
  key: string;
  label: string;
  detail?: string;
  indent?: number;
  takesFocus?: boolean;
  run: () => void;
}

const PLACEHOLDERS: Record<PaletteMode, string> = {
  files: "Open a file by name. Type > for commands, @ for headings",
  commands: "Run a command",
  headings: "Go to a heading of the Outline",
};

interface PaletteSources {
  session: CollabSession | null;
  files: DocFile[];
  openFile: (id: string) => void;
  openAt: (id: string, line: number) => void;
}

interface BodyProps extends PaletteSources {
  commands: PaletteCommand[];
}

function PaletteBody({
  session,
  files,
  commands,
  openFile,
  openAt,
  input,
  setInput,
  choose,
}: BodyProps & {
  input: string;
  setInput: (input: string) => void;
  choose: (item: Item) => void;
}) {
  const { mode, query } = parsePaletteInput(input);
  const outline = useOutline(mode === "headings" ? session : null);
  const [active, setActive] = useState(0);
  const list = useRef<HTMLUListElement>(null);

  let items: Item[];
  if (mode === "commands") {
    items = filterPalette(commands, query, (c) => c.title).map((c) => ({
      key: c.id,
      label: c.title,
      detail: c.keys,
      takesFocus: c.takesFocus,
      run: c.run,
    }));
  } else if (mode === "headings") {
    items = filterPalette(outline.headings, query, (h) => h.title).map((h, i) => ({
      key: `${h.fileId}:${i}`,
      label: h.title,
      detail: `${h.path}:${h.line}`,
      indent: query ? 0 : h.depth,
      run: () => openAt(h.fileId, h.line),
    }));
  } else {
    items = filterPalette(files, query, (f) => f.path).map((f) => ({
      key: f.id,
      label: f.path,
      run: () => openFile(f.id),
    }));
  }
  items = items.slice(0, MAX_ITEMS);
  const current = Math.min(active, items.length - 1);

  useEffect(() => {
    list.current?.querySelector('[data-active="true"]')?.scrollIntoView({ block: "nearest" });
  }, [current]);

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const step = e.key === "ArrowDown" ? 1 : -1;
      setActive((current + step + items.length) % Math.max(items.length, 1));
    } else if (e.key === "Enter" && items[current]) {
      e.preventDefault();
      choose(items[current]);
    }
  }

  let empty = "No matching files";
  if (mode === "commands") empty = "No matching commands";
  if (mode === "headings") {
    empty = outline.headings.length ? "No matching headings" : "The Outline has no headings";
  }

  return (
    <>
      <DialogPrimitive.Title className="sr-only">Command palette</DialogPrimitive.Title>
      <input
        autoFocus
        value={input}
        onChange={(e) => {
          setInput(e.target.value);
          setActive(0);
        }}
        onKeyDown={onKeyDown}
        placeholder={PLACEHOLDERS[mode]}
        aria-label={PLACEHOLDERS[mode]}
        role="combobox"
        aria-expanded
        aria-controls="palette-items"
        aria-activedescendant={items[current] ? `palette-${current}` : undefined}
        className="h-12 w-full border-b bg-transparent px-4 text-sm outline-none placeholder:text-muted-foreground"
      />
      <ul ref={list} id="palette-items" role="listbox" className="max-h-80 overflow-y-auto p-1.5">
        {items.length === 0 && (
          <li className="px-3 py-6 text-center text-sm text-muted-foreground">{empty}</li>
        )}
        {items.map((item, i) => (
          <li
            key={item.key}
            id={`palette-${i}`}
            role="option"
            aria-selected={i === current}
            data-active={i === current}
            onMouseMove={() => i !== current && setActive(i)}
            onClick={() => choose(item)}
            className={cn(
              "flex h-9 cursor-pointer items-center gap-3 rounded-xl px-3 text-sm",
              i === current && "bg-muted",
            )}
            style={item.indent ? { paddingLeft: 12 + item.indent * 14 } : undefined}
          >
            <span className={cn("truncate", mode === "files" && "font-mono text-xs")}>
              {item.label}
            </span>
            {item.detail && (
              <span className="ml-auto shrink-0 font-mono text-xs text-muted-foreground">
                {item.detail}
              </span>
            )}
          </li>
        ))}
      </ul>
    </>
  );
}

interface PaletteProps extends PaletteSources {
  /** read when the palette opens */
  commands: () => PaletteCommand[];
}

/** `Ctrl+P` opens files, `>` (or `F1`) commands, `@` Outline headings. */
export function CommandPalette({ commands: getCommands, ...props }: PaletteProps) {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [commands, setCommands] = useState<PaletteCommand[]>([]);
  const restoreFocus = useRef(true);
  function show(initial: string) {
    restoreFocus.current = true;
    setCommands(getCommands());
    setInput(initial);
    setOpen(true);
  }

  useShortcut(
    (e) => (mod(e) && !e.shiftKey && !e.altKey && e.key === "p") || e.key === "F1",
    (e) => show(e.key === "F1" ? ">" : ""),
  );

  function choose(item: Item) {
    restoreFocus.current = !item.takesFocus;
    setOpen(false);
    item.run();
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent
        showCloseButton={false}
        finalFocus={() => restoreFocus.current}
        className="top-[12%] block -translate-y-0 gap-0 overflow-hidden p-0 sm:max-w-xl"
      >
        <PaletteBody
          {...props}
          commands={commands}
          input={input}
          setInput={setInput}
          choose={choose}
        />
      </DialogContent>
    </Dialog>
  );
}
