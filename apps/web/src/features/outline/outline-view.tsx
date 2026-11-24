import type { DocFile } from "@backslash/shared/doc";
import type { CollabSession } from "@/features/editor/use-collab";
import { useOutline } from "@/features/outline/use-outline";

/** The Outline as a list; clicking a heading opens its file at that line. */
export function OutlineView({
  session,
  files,
  openAt,
}: {
  session: CollabSession | null;
  files: DocFile[];
  openAt: (fileId: string, line: number) => void;
}) {
  const { mainPath, headings } = useOutline(session);
  const idOf = new Map(files.map((f) => [f.path, f.id]));
  const top = Math.min(...headings.map((h) => h.level));

  if (!mainPath || headings.length === 0) {
    return (
      <p className="p-3 text-xs text-muted-foreground">
        {mainPath
          ? "No headings yet. Add \\section{…} to the main file or a file it includes."
          : "No main file. Add a .tex file to see its headings."}
      </p>
    );
  }

  return (
    <ul className="min-h-0 flex-1 overflow-y-auto p-1">
      {headings.map((h) => {
        const id = idOf.get(h.path);
        return (
          <li key={`${h.path}:${h.line}`}>
            <button
              type="button"
              disabled={!id}
              onClick={() => id && openAt(id, h.line)}
              title={`${h.path}:${h.line}`}
              className="flex h-7 w-full cursor-pointer items-center gap-2 rounded-md pr-2 text-left hover:bg-sidebar-accent disabled:cursor-default"
              style={{ paddingLeft: 8 + (h.level - top) * 14 }}
            >
              <span
                className={
                  h.level - top === 0 ? "truncate font-medium" : "truncate text-sidebar-foreground"
                }
              >
                {h.title}
              </span>
              {h.path !== mainPath && (
                <span className="ml-auto shrink-0 font-mono text-[10px] text-muted-foreground">
                  {h.path.split("/").at(-1)}
                </span>
              )}
            </button>
          </li>
        );
      })}
    </ul>
  );
}
