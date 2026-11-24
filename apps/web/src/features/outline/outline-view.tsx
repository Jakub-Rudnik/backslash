import type { CollabSession } from "@/features/editor/use-collab";
import { useOutline } from "@/features/outline/use-outline";

/** The Outline as a list; clicking a heading opens its file at that line. */
export function OutlineView({
  session,
  synced,
  openAt,
}: {
  session: CollabSession | null;
  synced: boolean;
  openAt: (fileId: string, line: number) => void;
}) {
  const { mainPath, headings } = useOutline(session);

  if (!synced || !mainPath || headings.length === 0) {
    let message = "Loading project…";
    if (synced) {
      message = mainPath
        ? "No headings yet. Add \\section{…} to the main file or a file it includes."
        : "No main file. Add a .tex file to see its headings.";
    }
    return <p className="p-3 text-xs text-muted-foreground">{message}</p>;
  }

  return (
    <ul className="min-h-0 flex-1 overflow-y-auto p-1">
      {headings.map((h, i) => (
        <li key={`${h.fileId}:${i}`}>
          <button
            type="button"
            onClick={() => openAt(h.fileId, h.line)}
            title={`${h.path}:${h.line}`}
            className="flex h-7 w-full cursor-pointer items-center gap-2 rounded-md pr-2 text-left hover:bg-muted focus-visible:bg-muted focus-visible:outline-none"
            style={{ paddingLeft: 8 + h.depth * 14 }}
          >
            <span className={h.depth === 0 ? "truncate font-medium" : "truncate"}>{h.title}</span>
            {h.path !== mainPath && (
              <span className="ml-auto shrink-0 font-mono text-[10px] text-muted-foreground">
                {h.path.split("/").at(-1)}
              </span>
            )}
          </button>
        </li>
      ))}
    </ul>
  );
}
