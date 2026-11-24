import type { DocFile } from "@backslash/shared/doc";
import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";
import { cn } from "cn";
import { useRef, useState } from "react";
import {
  Command,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
  CommandShortcut,
} from "@/components/ui/command";
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

  let empty = "No matching files";
  if (mode === "commands") empty = "No matching commands";
  if (mode === "headings") {
    empty = outline.headings.length ? "No matching headings" : "The Outline has no headings";
  }

  return (
    <Command shouldFilter={false} loop className="rounded-none bg-transparent p-1.5">
      <DialogPrimitive.Title className="sr-only">Command palette</DialogPrimitive.Title>
      <CommandInput
        autoFocus
        value={input}
        onValueChange={setInput}
        placeholder={PLACEHOLDERS[mode]}
        aria-label={PLACEHOLDERS[mode]}
      />
      <CommandList className="max-h-80 pt-1.5">
        <CommandEmpty className="text-muted-foreground">{empty}</CommandEmpty>
        {items.map((item) => (
          <CommandItem
            key={item.key}
            value={item.key}
            onSelect={() => choose(item)}
            style={item.indent ? { paddingLeft: 12 + item.indent * 14 } : undefined}
          >
            <span className={cn("truncate", mode === "files" && "font-mono text-xs")}>
              {item.label}
            </span>
            {item.detail && (
              <CommandShortcut className={cn(mode !== "commands" && "font-mono tracking-normal")}>
                {item.detail}
              </CommandShortcut>
            )}
          </CommandItem>
        ))}
      </CommandList>
    </Command>
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
        className="top-[12%] block -translate-y-0 gap-0 overflow-hidden rounded-4xl p-0 sm:max-w-xl"
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
