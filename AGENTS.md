# backslash

Self-hosted LaTeX editor in the browser: real-time collaboration, compiling to PDF, sharing. Monorepo: `apps/web` (React SPA), `apps/api` (Fastify), `apps/collab` (Hocuspocus, Yjs), `apps/compiler` (BullMQ worker running `latexmk`), `packages/db` (Drizzle), `packages/shared`.

Run every package command through `vp` (Vite+, docs in `node_modules/vite-plus/docs`), never pnpm, npm or npx. `vpx <file>` runs a TS script. `vp <name>` is a built-in command and `vp run <name>` a `package.json` script; they can differ.

Give notes, plans and summaries in your reply; add a Markdown file only when asked.

- **Code**: read [`CODING_STANDARDS.md`](CODING_STANDARDS.md) before writing, reviewing or testing code. It defines when a change is done.
- **Setup**: when a service, `.env` file or the test database is missing, follow [Development in `README.md`](README.md#development).
- **Git**: read [`CONTRIBUTING.md`](CONTRIBUTING.md) before branching, committing, opening a pull request or bumping the version.

## Agent skills

### Issue tracker

GitHub Issues (`Jakub-Rudnik/backslash`) via `gh`. See `docs/agents/issue-tracker.md`.

### Triage labels

Default vocabulary: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: root `GLOSSARY.md` + `docs/adr/`. See `docs/agents/domain.md`.
