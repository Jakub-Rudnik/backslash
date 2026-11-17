# collab

Hocuspocus (Yjs) WebSocket server for real-time editing. One Yjs doc per project, the room name is the `ProjectId`; state is persisted to SQLite (`node:sqlite`, no native deps) at `DB_PATH`. Doc structure (files keyed by stable id, main file) lives in `@backslash/shared/doc`. New projects are seeded with `main.tex`; old single-file docs are migrated on load.

```bash
cp .env.example .env
vp run dev
```

The web app connects through the Vite dev proxy at `/collab`.
