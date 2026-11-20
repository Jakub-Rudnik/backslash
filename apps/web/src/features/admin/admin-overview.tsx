import type { AdminStats, CompileDay } from "@backslash/shared";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { formatSize } from "@/features/files/mime";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";

const dayFormat = new Intl.DateTimeFormat(undefined, {
  month: "short",
  day: "numeric",
  timeZone: "UTC",
});

const totalOf = (d: CompileDay) => d.success + d.error + d.timeout + d.failed;

function Tile({ label, value, detail }: { label: string; value: string; detail?: string }) {
  return (
    <div className="rounded-3xl border p-4">
      <div className="text-sm text-muted-foreground">{label}</div>
      <div className="mt-1 font-heading text-2xl font-semibold tabular-nums">{value}</div>
      {detail && <div className="mt-1 text-xs text-muted-foreground">{detail}</div>}
    </div>
  );
}

function CompileChart({ days }: { days: CompileDay[] }) {
  const [active, setActive] = useState<number | null>(null);
  const max = Math.max(...days.map(totalOf));
  if (max === 0) {
    return (
      <p className="rounded-3xl border border-dashed p-8 text-center text-sm text-muted-foreground">
        No compiles in the last 30 days.
      </p>
    );
  }
  const shown = active === null ? null : days[active];

  return (
    <div className="rounded-3xl border p-4">
      <div className="mb-3 flex items-baseline justify-between gap-4 text-xs text-muted-foreground">
        <span className="tabular-nums">max {max} / day</span>
        {shown ? (
          <span className="tabular-nums" aria-live="polite">
            <span className="font-medium text-foreground">
              {dayFormat.format(new Date(shown.date))}: {totalOf(shown)}
            </span>{" "}
            · {shown.success} ok · {shown.error} errors · {shown.timeout + shown.failed} failed
          </span>
        ) : (
          <span>Hover a day for details</span>
        )}
      </div>
      <div className="flex h-40 items-end gap-0.5 border-b" onMouseLeave={() => setActive(null)}>
        {days.map((d, i) => (
          <button
            key={d.date}
            type="button"
            aria-label={`${dayFormat.format(new Date(d.date))}: ${totalOf(d)} compiles`}
            onMouseEnter={() => setActive(i)}
            onFocus={() => setActive(i)}
            onBlur={() => setActive(null)}
            className="group flex h-full flex-1 cursor-default items-end outline-none"
          >
            <span
              className={cn(
                "w-full rounded-t-[4px] bg-chart-3 transition-colors dark:bg-chart-2",
                active === i && "bg-foreground dark:bg-foreground",
                "group-focus-visible:ring-3 group-focus-visible:ring-ring/50",
              )}
              style={{ height: `${(totalOf(d) / max) * 100}%` }}
            />
          </button>
        ))}
      </div>
      <div className="mt-2 flex justify-between text-xs text-muted-foreground">
        <span>{dayFormat.format(new Date(days[0]!.date))}</span>
        <span>{dayFormat.format(new Date(days.at(-1)!.date))}</span>
      </div>
      <div className="sr-only">
        <table>
          <caption>Compiles per day</caption>
          <thead>
            <tr>
              <th>Day</th>
              <th>Succeeded</th>
              <th>Errors</th>
              <th>Timed out</th>
              <th>Failed</th>
            </tr>
          </thead>
          <tbody>
            {days.map((d) => (
              <tr key={d.date}>
                <td>{d.date}</td>
                <td>{d.success}</td>
                <td>{d.error}</td>
                <td>{d.timeout}</td>
                <td>{d.failed}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Overview({ stats }: { stats: AdminStats }) {
  const compiles = stats.compiles.reduce(
    (sum, d) => ({
      total: sum.total + totalOf(d),
      success: sum.success + d.success,
      errors: sum.errors + d.error,
      broken: sum.broken + d.timeout + d.failed,
    }),
    { total: 0, success: 0, errors: 0, broken: 0 },
  );
  const successRate =
    compiles.total === 0 ? "–" : `${Math.round((compiles.success / compiles.total) * 100)}%`;

  return (
    <div className="space-y-8">
      <section className="space-y-3">
        <h2 className="font-heading text-lg font-semibold">Users and projects</h2>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Tile
            label="Users"
            value={String(stats.users.total)}
            detail={`+${stats.users.new7d} this week · +${stats.users.new30d} in 30 days`}
          />
          <Tile
            label="Active this week"
            value={String(stats.users.active7d)}
            detail={`${stats.users.banned} banned`}
          />
          <Tile
            label="Projects"
            value={String(stats.projects.total)}
            detail={`+${stats.projects.new30d} in 30 days`}
          />
          <Tile label="Uploaded files" value={formatSize(stats.storageBytes)} detail="on disk" />
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="font-heading text-lg font-semibold">Compiles, last 30 days</h2>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Tile label="Compiles" value={String(compiles.total)} />
          <Tile
            label="Succeeded"
            value={successRate}
            detail={`${compiles.errors} with LaTeX errors`}
          />
          <Tile
            label="Timed out or crashed"
            value={String(compiles.broken)}
            detail="problems on the server side"
          />
          <Tile
            label="Average time"
            value={
              stats.compileAvgMs === null ? "–" : `${(stats.compileAvgMs / 1000).toFixed(1)} s`
            }
          />
        </div>
        <CompileChart days={stats.compiles} />
      </section>
    </div>
  );
}

export function AdminOverview() {
  const stats = useQuery({ queryKey: ["admin", "stats"], queryFn: api.admin.stats });
  if (stats.isPending) return <p className="text-sm text-muted-foreground">Loading…</p>;
  if (stats.error) return <p className="text-sm text-destructive">{stats.error.message}</p>;
  return <Overview stats={stats.data} />;
}
