# api

Fastify HTTP API under `/api`. Auth with Better Auth (email, optional GitHub) and session cookies. Owns projects, members with roles (owner, editor, viewer) and share-link invites. Stores uploaded files content-addressed in `BLOB_DIR`. Compiles go through the BullMQ `compile` queue, at most one running and one waiting per project (`docs/adr/0002-compile-concurrency.md`). `POST /compile` answers right away with the compile number (`projects.compile_seq`); when the compile starts the API takes the project snapshot from collab's internal server, and when it ends it writes the result into the doc through collab. The compiler writes the PDF to `COMPILE_DIR` and the API serves it. When access changes it publishes on Valkey (`collab:revoke`) so collab drops the affected connections. Requests are rate limited per user (per IP when signed out) with counters in Valkey, Better Auth limits sign-in and sign-up per IP through the same store, and each user has a project and storage quota (`MAX_PROJECTS_PER_USER`, `MAX_STORAGE_PER_USER_MB`), see `docs/adr/0004-abuse-limits.md`. Password reset links are mailed over SMTP (`SMTP_URL`, any provider; Mailpit from docker compose in dev, inbox at http://localhost:8025); without `SMTP_URL` password reset is off. `GET /api/account/usage` reports the user's quotas and rate limits for the settings dialog. Migrations run on startup.

```bash
cp .env.example .env
vp run dev
```

Tests need the `backslash_test` database.
