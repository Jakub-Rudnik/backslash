# 2. One compile per project at a time, server-ordered results

- Status: accepted
- Date: 2026-11-18

## Context

Collaborators often compile at the same time or within a fraction of a second. Each request becomes its own job, so the same state gets compiled twice. The result shared through the Yjs doc is ordered by the time on the client that published it: a client whose clock is ahead can make an older PDF win over a newer one. Every compile also starts from scratch, without the `.aux`, `.toc` and `.bbl` files of the previous run.

## Decision

- **At most one running compile per project**, enforced by a lock in Valkey so it holds across workers.
- **Coalesce requests.** A request while a compile runs marks the project dirty. When the compile ends, one more runs with a snapshot taken at its start, so it includes everyone's edits. Further requests join that pending compile. A project has at most one running and one pending compile.
- **The server orders results.** Each compile gets an increasing number per project. The server writes the result into the doc and a higher number always wins. Clients no longer publish results.
- **Per-project build cache.** Files the build produced (not project files) are kept per project for a while after the last compile. A job copies them into its fresh sandbox and writes them back atomically after a successful build. The sandbox never sees another project's cache.

## Alternatives

- **Keep independent jobs**: simple, but duplicate work and client-clock ordering.
- **A warm sandbox or pod per project**: same speed as the cache, with the costs listed in ADR 1.

## Consequences

- Ten clicks in a second cost two compiles, and everyone gets the newest PDF.
- The cache is only a speed-up: if it is missing or stale, latexmk reruns what it needs and the PDF is still correct.
- Viewers can't write a fake build result into the doc.
