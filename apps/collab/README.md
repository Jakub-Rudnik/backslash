# collab

Hocuspocus (Yjs) WebSocket server for real-time editing. Documents are rooms named by `DocumentId`; state is persisted to SQLite (`node:sqlite`, no native deps) at `DB_PATH`. New documents are seeded with `DEFAULT_SOURCE` from `@backslash/shared`.

```bash
cp .env.example .env
vp run dev
```

The web app connects through the Vite dev proxy at `/collab`.
