# collab

Hocuspocus (Yjs) WebSocket server for real-time editing. One Yjs doc per project, the room name is the `ProjectId`; state is persisted to Postgres (`collab_documents`). Every connection is authenticated with the API's session cookie and checked against project membership; viewers get read-only connections. When access changes the API publishes on Valkey (`collab:revoke`) and the project's sockets are closed, so clients re-authenticate. An internal HTTP server (`INTERNAL_PORT`, bearer `INTERNAL_SECRET`) serves project snapshots to the API for compiling and writes compile results into the doc (`build` map), so clients no longer publish results themselves. Doc structure (files keyed by stable id, main file) lives in `@backslash/shared/doc`. New projects are seeded with `main.tex`; old single-file docs are migrated on load.

```bash
cp .env.example .env
vp run dev
```

The web app connects through the Vite dev proxy at `/collab`.
