# 2. One compile per project at a time, server-ordered results

- Status: accepted
- Date: 2026-11-18

## Context

Collaborators often compile at the same time or within a fraction of a second. Each request becomes its own job, so the same state gets compiled twice. The result shared through the Yjs doc is ordered by the time on the client that published it: a client whose clock is ahead can make an older PDF win over a newer one. Every compile also starts from scratch, without the `.aux`, `.toc` and `.bbl` files of the previous run.

## Decision

- **At most one running compile per project.** The API keeps a small queue per project in memory: one running compile and at most one waiting.
- **Coalesce requests.** A request while a compile runs joins the waiting compile. That one takes its snapshot only when it starts, so it includes everyone's edits.
- **The server numbers and writes results.** Each compile gets an increasing number per project (`projects.compile_seq` in Postgres, so it survives restarts). `POST /compile` returns that number right away; when the compile ends, the API writes the result into the doc through collab. Clients no longer publish results: they wait until a result with their number appears in the doc.
- **Per-project build cache.** After a successful build, the files it produced (not project files) become the project's cache, replaced atomically, and expire 15 minutes after the last compile. The next job gets them read-only in its fresh sandbox. A failed build clears the cache, so broken `.aux` files can't break the next build. The sandbox never sees another project's cache.

## Alternatives

- **Keep independent jobs**: simple, but duplicate work and client-clock ordering.
- **A per-project lock in Valkey**: needed once there is more than one API instance. With a single instance (ADR 3) the in-memory queue is enough, and the atomic cache swap keeps the cache consistent even if two jobs of one project overlap.
- **A warm sandbox or pod per project**: same speed as the cache, with the costs listed in ADR 1.

## Consequences

- Ten clicks in a second cost two compiles, and everyone gets the newest PDF.
- The cache is only a speed-up: if it is missing or stale, latexmk reruns what it needs and the PDF is still correct.
- Results are ordered by the server, so a client with a wrong clock can no longer make an older PDF win.
- Compiles now run in the background: the HTTP request no longer waits up to a minute, and a result reaches everyone even if the requester closed the tab.
- Running more than one API instance needs the per-project queue moved to Valkey.
