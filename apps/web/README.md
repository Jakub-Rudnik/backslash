# web

React SPA: dashboard, LaTeX editor with real-time collaboration, file tree with uploads, PDF preview, sharing. Edits the project's Yjs doc through Hocuspocus and talks to the API over REST. Code is grouped by feature in `src/features`. In development the Vite dev server proxies `/api` to the API and `/collab` (WebSocket) to collab.

```bash
vp run dev
```
