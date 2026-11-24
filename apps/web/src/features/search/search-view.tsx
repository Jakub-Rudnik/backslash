import { listFiles } from "@backslash/shared/doc";
import { Search01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Badge } from "@/components/ui/badge";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import type { CollabSession } from "@/features/editor/use-collab";
import { useDocValue } from "@/features/editor/use-doc-value";
import { MAX_MATCHES, searchFiles, type SearchMatch } from "@/features/search/search";

const CONTEXT_CHARS = 24;

type Results = ReturnType<typeof searchFiles>;

function search(session: CollabSession, query: string): Results {
  const files = listFiles(session.doc).flatMap((f) =>
    f.kind === "text" ? [{ id: f.id, path: f.path, text: f.text.toJSON() }] : [],
  );
  return searchFiles(files, query);
}

const NO_RESULTS: Results = { files: [], truncated: false };

function MatchText({ match }: { match: SearchMatch }) {
  const start = Math.max(0, match.from - CONTEXT_CHARS);
  return (
    <span className="truncate">
      {start > 0 && "…"}
      {match.text.slice(start, match.from).trimStart()}
      <mark className="rounded-sm bg-amber-200/70 text-foreground dark:bg-amber-400/30">
        {match.text.slice(match.from, match.to)}
      </mark>
      {match.text.slice(match.to)}
    </span>
  );
}

/** Plain-text search across the project's text files; clicking a match opens it at that line. */
export function SearchView({
  session,
  query,
  onQueryChange,
  openAt,
}: {
  session: CollabSession | null;
  query: string;
  onQueryChange: (query: string) => void;
  openAt: (fileId: string, line: number) => void;
}) {
  const results = useDocValue(session, (s) => search(s, query), NO_RESULTS, query);
  const count = results.files.reduce((n, f) => n + f.matches.length, 0);

  return (
    <>
      <div className="shrink-0 space-y-1.5 p-2">
        <InputGroup>
          <InputGroupInput
            autoFocus
            type="search"
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            placeholder="Search in text files"
            aria-label="Search in text files"
          />
          <InputGroupAddon>
            <HugeiconsIcon icon={Search01Icon} />
          </InputGroupAddon>
        </InputGroup>
        {query.trim() && (
          <p className="px-1 text-xs text-muted-foreground">
            {count === 0
              ? "No results"
              : `${results.truncated ? `First ${MAX_MATCHES}` : count} ${count === 1 ? "result" : "results"} in ${results.files.length} ${results.files.length === 1 ? "file" : "files"}`}
          </p>
        )}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-1 pb-1">
        {results.files.map((file) => (
          <section key={file.id} className="mb-1">
            <h3 className="flex items-center gap-2 px-2 py-1 text-xs font-medium">
              <span className="truncate font-mono">{file.path}</span>
              <Badge variant="secondary" className="ml-auto tabular-nums">
                {file.matches.length}
              </Badge>
            </h3>
            <ul>
              {file.matches.map((m) => (
                <li key={`${m.line}:${m.from}`}>
                  <button
                    type="button"
                    onClick={() => openAt(file.id, m.line)}
                    className="flex h-7 w-full cursor-pointer items-center gap-2 rounded-md pr-2 pl-4 text-left font-mono text-xs hover:bg-muted focus-visible:bg-muted focus-visible:outline-none"
                  >
                    <span className="w-6 shrink-0 text-right text-muted-foreground tabular-nums">
                      {m.line}
                    </span>
                    <MatchText match={m} />
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </>
  );
}
