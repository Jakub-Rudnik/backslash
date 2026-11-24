export interface SearchableFile {
  id: string;
  path: string;
  text: string;
}

/** One match: the 1-based line, its text, and where the match sits in it. */
export interface SearchMatch {
  line: number;
  text: string;
  from: number;
  to: number;
}

export interface FileMatches {
  id: string;
  path: string;
  matches: SearchMatch[];
}

export const MAX_MATCHES = 1000;

/**
 * Plain-text, case-insensitive search across `files`, grouped by file in path order.
 * Stops after `limit` matches and says so with `truncated`.
 */
export function searchFiles(
  files: SearchableFile[],
  query: string,
  limit = MAX_MATCHES,
): { files: FileMatches[]; truncated: boolean } {
  const needle = query.toLowerCase();
  const results: FileMatches[] = [];
  if (!needle.trim()) return { files: results, truncated: false };
  let count = 0;
  for (const file of files.toSorted((a, b) => a.path.localeCompare(b.path))) {
    const matches: SearchMatch[] = [];
    for (const [i, text] of file.text.split("\n").entries()) {
      const haystack = text.toLowerCase();
      for (let at = haystack.indexOf(needle); at !== -1; at = haystack.indexOf(needle, at + 1)) {
        if (count === limit) {
          if (matches.length > 0) results.push({ id: file.id, path: file.path, matches });
          return { files: results, truncated: true };
        }
        matches.push({ line: i + 1, text, from: at, to: at + needle.length });
        count++;
      }
    }
    if (matches.length > 0) results.push({ id: file.id, path: file.path, matches });
  }
  return { files: results, truncated: false };
}
