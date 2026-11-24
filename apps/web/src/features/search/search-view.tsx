import { filesMap, listFiles } from "@backslash/shared/doc";
import { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import type { CollabSession } from "@/features/editor/use-collab";
import { MAX_MATCHES, searchFiles, type SearchMatch } from "@/features/search/search";

const UPDATE_DELAY_MS = 150;
const CONTEXT_CHARS = 24;

type Results = ReturnType<typeof searchFiles>;

function search(session: CollabSession, query: string): Results {
  const files = listFiles(session.doc).flatMap((f) =>
    f.kind === "text" ? [{ id: f.id, path: f.path, text: f.text.toJSON() }] : [],
  );
  return searchFiles(files, query);
}

/** Results for `query`, kept up to date with everyone's edits. */
function useSearch(session: CollabSession | null, query: string): Results {
  const [results, setResults] = useState<Results>({ files: [], truncated: false });

  useEffect(() => {
    if (!session) return;
    const run = () => setResults(search(session, query));
    let timer = setTimeout(run, UPDATE_DELAY_MS);
    const update = () => {
      clearTimeout(timer);
      timer = setTimeout(run, UPDATE_DELAY_MS);
    };
    const files = filesMap(session.doc);
    files.observeDeep(update);
    return () => {
      clearTimeout(timer);
      files.unobserveDeep(update);
    };
  }, [session, query]);

  return results;
}

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
  const results = useSearch(session, query);
  const count = results.files.reduce((n, f) => n + f.matches.length, 0);

  return (
    <>
      <div className="shrink-0 space-y-1.5 p-2">
        <Input
          autoFocus
          type="search"
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          placeholder="Search in text files"
          aria-label="Search in text files"
          className="h-8"
        />
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
              <span className="ml-auto shrink-0 rounded-full bg-sidebar-accent px-1.5 text-[10px] text-muted-foreground tabular-nums">
                {file.matches.length}
              </span>
            </h3>
            <ul>
              {file.matches.map((m) => (
                <li key={`${m.line}:${m.from}`}>
                  <button
                    type="button"
                    onClick={() => openAt(file.id, m.line)}
                    className="flex h-7 w-full cursor-pointer items-center gap-2 rounded-md pr-2 pl-4 text-left font-mono text-xs hover:bg-sidebar-accent"
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
