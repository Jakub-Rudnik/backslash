# backslash

LaTeX editor in the browser: projects with multiple files, real-time collaboration, compiling to PDF, sharing with other accounts.

## Architecture

- `apps/web`: React SPA (React Router, TanStack Query, Base UI + shadcn, Tailwind, CodeMirror, pdf.js). Edits the Yjs doc through Hocuspocus.
- `apps/api`: Fastify. Auth (Better Auth), projects, members, invites, file uploads, compile requests.
- `apps/collab`: Hocuspocus server. One Yjs doc per project, persisted in Postgres.
- `apps/compiler`: BullMQ worker that runs `latexmk` and returns the PDF and errors.
- `packages/db`: Drizzle schema, migrations and client.
- `packages/shared`: types, Zod schemas and Yjs doc helpers shared by the apps.

## Local setup

- Requirements: Node, Docker, TeX Live with `latexmk`, and bubblewrap (`bwrap`, Linux) for the compile sandbox.
- `docker compose up -d` starts Postgres, Valkey and Mailpit (inbox for password reset mails at http://localhost:8025).
- Copy `.env.example` to `.env` in `apps/api`, `apps/collab` and `apps/compiler`. `BETTER_AUTH_SECRET` and `INTERNAL_SECRET` must be the same in `api` and `collab` (`openssl rand -base64 32`). Migrations run on startup.
- API tests use a separate database: `docker compose exec postgres psql -U backslash -c "create database backslash_test"`.

## Toolchain

The toolchain is Vite+, run through the global `vp` CLI. Docs are in `node_modules/vite-plus/docs`.

- Run every package command through `vp` (`vp install` installs dependencies), never pnpm, npm or npx.
- `vpx <file>` runs a TS script, in place of tsx or ts-node.
- `vp <name>` is a built-in command and `vp run <name>` is a `package.json` script. They can differ.
- `vp run -r test` runs all tests.
- Import Vite and Vitest APIs from `vite-plus`; lint enforces this.

A pre-commit hook runs `vp check --fix` on staged files. Before you finish a change, run `vp check` (format, lint, type check) and the tests of the apps you touched.

## Coding standards

Read [`CODING_STANDARDS.md`](CODING_STANDARDS.md) before writing, reviewing or testing code.

## UI changes

After changing UI, run `vp run dev` and check the changed screens in a real browser: use the browser built into your environment, or the Playwright MCP server from `.mcp.json`. Check light and dark theme, a narrow (mobile) width, empty, loading and error states, and that the console has no errors.

## Git and versions

- Every feature or fix goes on its own branch off `main` (`feat/<name>`, `fix/<name>`, `chore/<name>`) and is merged through a pull request.
- Commit messages follow [Conventional Commits](https://www.conventionalcommits.org): `type(scope): summary`, e.g. `feat(web): ...`, `fix(api): ...`. Types: `feat`, `fix`, `refactor`, `perf`, `test`, `docs`, `chore`, `ci`. Mark breaking changes with `!` (`feat(api)!: ...`).
- The project has one version, in the root `package.json` only (no versions in apps or packages, no git tags or GitHub releases), following [SemVer](https://semver.org). While in alpha (`0.x`), a branch with a `feat` or a breaking change bumps the minor version (`0.1.0` → `0.2.0`), and a branch with only fixes bumps the patch version (`0.1.0` → `0.1.1`). `docs`, `chore`, `refactor` and other types keep the version as is.

## Files

Create new Markdown files (notes, plans, summaries, docs) only when explicitly asked. Editing existing ones (`README.md`, `AGENTS.md`, `CODING_STANDARDS.md`) is fine.
