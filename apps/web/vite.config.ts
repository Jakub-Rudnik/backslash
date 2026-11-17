import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
import { defineConfig, lazyPlugins } from "vite-plus";

const API_URL = process.env.API_URL ?? "http://127.0.0.1:3000";
const COLLAB_URL = process.env.COLLAB_URL ?? "ws://127.0.0.1:1234";

// https://vite.dev/config/
export default defineConfig({
  plugins: lazyPlugins(() => [react(), tailwindcss()]),
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  server: {
    // listen on LAN too (proxied api/collab stay on loopback)
    host: true,
    proxy: {
      // same-origin in dev: no CORS, auth cookies just work. The API serves /api itself.
      "/api": { target: API_URL },
      "/collab": {
        target: COLLAB_URL,
        ws: true,
        rewrite: (path) => path.replace(/^\/collab/, ""),
      },
    },
  },
});
