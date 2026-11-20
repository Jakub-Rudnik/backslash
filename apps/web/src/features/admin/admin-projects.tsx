import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { formatSize } from "@/features/files/mime";
import { api } from "@/lib/api";
import { formatDate } from "./format-date";
import { Pagination, SearchForm } from "./list-controls";

export function AdminProjects() {
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const projects = useQuery({
    queryKey: ["admin", "projects", q, page],
    queryFn: () => api.admin.projects(q, page),
    placeholderData: keepPreviousData,
  });
  const data = projects.data;

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <SearchForm
          placeholder="Search by owner email or project ID"
          initial={q}
          onSearch={(value) => {
            setQ(value);
            setPage(1);
          }}
        />
        <p className="text-xs text-muted-foreground">
          Names and content of projects are private and not shown here.
        </p>
      </div>

      {projects.isPending && <p className="text-sm text-muted-foreground">Loading…</p>}
      {projects.error && <p className="text-sm text-destructive">{projects.error.message}</p>}
      {data?.projects.length === 0 && (
        <div className="rounded-3xl border border-dashed p-10 text-center text-sm text-muted-foreground">
          {q ? `No projects match "${q}".` : "No projects yet."}
        </div>
      )}

      {data && data.projects.length > 0 && (
        <>
          <div className="overflow-x-auto rounded-3xl border">
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-muted-foreground">
                <tr className="border-b">
                  <th className="px-4 py-2.5 font-medium">Owner</th>
                  <th className="hidden px-4 py-2.5 font-medium sm:table-cell">Members</th>
                  <th className="px-4 py-2.5 font-medium">Size</th>
                  <th className="hidden px-4 py-2.5 font-medium lg:table-cell">Compiles (30 d)</th>
                  <th className="hidden px-4 py-2.5 font-medium md:table-cell">Created</th>
                  <th className="px-4 py-2.5 font-medium">Last edit</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {data.projects.map((p) => (
                  <tr key={p.id}>
                    <td className="max-w-64 px-4 py-3">
                      <div className="truncate font-medium">{p.ownerName}</div>
                      <div className="truncate text-xs text-muted-foreground">
                        {p.ownerEmail} · <span className="font-mono">{p.id}</span>
                      </div>
                    </td>
                    <td className="hidden px-4 py-3 tabular-nums sm:table-cell">{p.members}</td>
                    <td className="px-4 py-3 whitespace-nowrap tabular-nums">
                      <div>{formatSize(p.docBytes)} text</div>
                      <div className="text-xs text-muted-foreground">
                        {p.uploads} {p.uploads === 1 ? "file" : "files"},{" "}
                        {formatSize(p.uploadBytes)}
                      </div>
                    </td>
                    <td className="hidden px-4 py-3 tabular-nums lg:table-cell">{p.compiles30d}</td>
                    <td className="hidden px-4 py-3 whitespace-nowrap md:table-cell">
                      {formatDate(p.createdAt)}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">{formatDate(p.updatedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination page={page} pageSize={data.pageSize} total={data.total} onPage={setPage} />
        </>
      )}
    </div>
  );
}
