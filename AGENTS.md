# backslash

LaTeX editor in the browser: projects with multiple files, real-time collaboration, compiling to PDF, sharing with other accounts.

## Architecture

pnpm monorepo, TypeScript everywhere. Postgres and Valkey run via `docker compose`.

- `apps/web`: React SPA (React Router, TanStack Query, Base UI + shadcn, Tailwind, CodeMirror, pdf.js). Edits the Yjs doc through Hocuspocus.
- `apps/api`: Fastify. Auth (Better Auth), projects, members, invites, file uploads, compile requests.
- `apps/collab`: Hocuspocus server. One Yjs doc per project, persisted in Postgres.
- `apps/compiler`: BullMQ worker that runs `latexmk` and returns the PDF and errors.
- `packages/db`: Drizzle schema, migrations and client.
- `packages/shared`: types, Zod schemas and Yjs doc helpers shared by the apps.

## Structure

- Group code by feature, not by kind. Files that change together live together.
- `apps/web/src/features/<feature>`: components, hooks and helpers of one feature, flat in one folder. Shared code goes in `components/` (shadcn UI in `components/ui`), `hooks/` and `lib/`. `pages/` only holds routed pages.
- `apps/api/src/features/<feature>`: routes, service and storage of one feature. Shared code goes in `src/lib`.
- `apps/collab` and `apps/compiler` are small single-purpose services and stay flat.
- No `index.ts` barrel files, no fixed set of subfolders per feature. Create a new feature folder only when the code doesn't belong to an existing one.

## Toolchain

The toolchain is Vite+, run through the global `vp` CLI. Docs are in `node_modules/vite-plus/docs`.

- `vp install` installs dependencies. Do not call pnpm, npm or npx directly.
- `vp check` formats, lints and type checks; `vp check --fix` fixes what it can.
- `vp run -r test` runs all tests. `vp run ready` runs check, tests and build.
- `vp run dev` starts every app.
- `vpx <file>` runs a TS script. Do not add tsx or ts-node.
- `vp <name>` is a built-in command and `vp run <name>` is a `package.json` script. They can differ.
- Import Vite and Vitest APIs from `vite-plus`; lint enforces this.

A pre-commit hook runs `vp check --fix` on staged files. Before you finish a change, run `vp check` and the tests of the apps you touched.

## Code

- Keep it simple. Solve the problem at hand without speculative abstractions, extra layers, unused options or generic helpers made for a single use. A few repeated lines are better than the wrong abstraction.
- Code should explain itself through names and structure.
- Follow the patterns already used in the app you are changing.

## Formatting

Formatting is defined in the `fmt` block of the root `vite.config.ts`: 2-space indent, no tabs, double quotes, semicolons, trailing commas, LF, 100 columns. Do not add other formatter configs, and run `vp check --fix` instead of formatting by hand.

## Comments

- Do not write comments that explain what the code does or narrate its steps.
- No line or inline comments, TODO/FIXME notes or commented-out code.
- JSDoc (`/** ... */`) is allowed above a function, method or class only when it adds something the name and signature don't already say. Most functions need none.
- Allowed: short section headers that visually split a file (`/* Linting */` in tsconfig, `// --- members ---` in a long routes file) and tool directives (`// oxlint-disable-next-line`, `// @ts-expect-error`).

## Files

Do not create new Markdown files (notes, plans, summaries, docs) unless explicitly asked. Existing ones (`README.md`, `AGENTS.md`) may be edited.
