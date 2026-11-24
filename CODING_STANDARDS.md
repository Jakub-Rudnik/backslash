# Coding standards

## Structure

- Group code by feature: files that change together live in one flat feature folder.
- `apps/web/src/features/<feature>`: components, hooks and helpers of one feature. Shared code goes in `components/` (shadcn UI in `components/ui`), `hooks/` and `lib/`; `pages/` holds only routed pages.
- `apps/api/src/features/<feature>`: routes, service and storage of one feature. Shared code goes in `src/lib`.
- `apps/collab` and `apps/compiler` are small single-purpose services and stay flat.
- Import each module from the file that defines it (no `index.ts` barrels). Put new code in an existing feature folder; create one only when none fits.

## Code

- Build only what the task needs (YAGNI) and extract a helper at its second caller.
- Validate unknown data with Zod or narrow it with `instanceof`; `as` assertions are limited to `as const`.
- Declare interfaces and `extends` in place of `Pick`/`Omit`.
- Import Vite and Vitest APIs from `vite-plus`.

Lint enforces the last three.

## Comments

Let names and structure explain the code. The only comments are:

- JSDoc (`/** ... */`) above a function, method or class when it adds something the name and signature don't already say. Most functions need none.
- Short section headers that visually split a file (`/* Linting */` in tsconfig, `// --- members ---` in a long routes file).
- Tool directives (`// oxlint-disable-next-line`, `// @ts-expect-error`).

## Tests

- Unit tests only for logic that can realistically break: access control, concurrency, parsing, sandboxing, non-trivial data transformations.
- Prefer a few tests that cover a whole behavior over many small ones per function.
- The UI flows that matter (sign in, projects, editing, uploads, compiling, sharing) have no automated end-to-end tests yet; the UI checklist covers them by hand.

## Done

A change is done when all of these hold:

- `vp check` exits 0. `vp check --fix` applies the formatting and the lint fixes it can.
- `vp run test` exits 0 in every app and package you touched that has a `test` script.
- If it changes UI: every item of the UI checklist holds.

### UI checklist

Run `vp run dev` and open each changed screen in a real browser (the one built into your environment, or the Playwright MCP server from `.mcp.json`). Each item holds for every changed screen, or does not apply to it:

- Light theme renders correctly.
- Dark theme renders correctly.
- Narrow (mobile) width renders correctly.
- Empty, loading and error states each render correctly.
- Every changed flow works from start to finish.
- The browser console shows no errors.
