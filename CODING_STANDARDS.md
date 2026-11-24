# Coding standards

## Structure

- Group code by feature: files that change together live together in one flat feature folder.
- `apps/web/src/features/<feature>`: components, hooks and helpers of one feature. Shared code goes in `components/` (shadcn UI in `components/ui`), `hooks/` and `lib/`. `pages/` only holds routed pages.
- `apps/api/src/features/<feature>`: routes, service and storage of one feature. Shared code goes in `src/lib`.
- `apps/collab` and `apps/compiler` are small single-purpose services and stay flat.
- Import each module from the file that defines it (no `index.ts` barrels). Put new code in an existing feature folder; create a new one only when none fits.

## Code

- Write only what the problem at hand needs, and extract a helper once it has a second caller. A few repeated lines are better than the wrong abstraction.
- No `as` type assertions (`as const` is fine): validate unknown data with Zod or narrow it with `instanceof`. Declare interfaces and `extends` instead of `Pick`/`Omit`. Lint enforces both.

## Comments

Let names and structure explain the code. The only comments are:

- JSDoc (`/** ... */`) above a function, method or class when it adds something the name and signature don't already say. Most functions need none.
- Short section headers that visually split a file (`/* Linting */` in tsconfig, `// --- members ---` in a long routes file).
- Tool directives (`// oxlint-disable-next-line`, `// @ts-expect-error`).

Everything else goes: comments narrating what the code does, inline comments, TODO/FIXME notes, commented-out code.

## Tests

- Unit tests only for logic that can realistically break: access control, concurrency, parsing, sandboxing, non-trivial data transformations.
- Prefer a few tests that cover a whole behavior over many small ones per function.
- UI flows that matter (sign in, projects, editing, uploads, compiling, sharing) need end-to-end tests. When you change one of them, update or add its e2e test.

## Formatting

Formatting lives only in the `fmt` block of the root `vite.config.ts`. Apply it with `vp check --fix`.
