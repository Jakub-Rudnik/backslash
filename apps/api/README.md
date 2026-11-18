# api

Fastify HTTP API under `/api`. Auth with Better Auth (email, optional GitHub) and session cookies. Owns projects, members with roles (owner, editor, viewer) and share-link invites. Stores uploaded files content-addressed in `BLOB_DIR`. Compiles go through the BullMQ `compile` queue, at most one running and one waiting per project (`docs/adr/0002-compile-concurrency.md`). `POST /compile` answers right away with the compile number (`projects.compile_seq`); when the compile starts the API takes the project snapshot from collab's internal server, and when it ends it writes the result into the doc through collab. The compiler writes the PDF to `COMPILE_DIR` and the API serves it. When access changes it publishes on Valkey (`collab:revoke`) so collab drops the affected connections. Migrations run on startup.

```bash
cp .env.example .env
vp run dev
```

Tests need the `backslash_test` database.
