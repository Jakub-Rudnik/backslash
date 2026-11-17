import { DocumentId } from "@backslash/shared";
import { Database } from "@hocuspocus/extension-database";
import { Server } from "@hocuspocus/server";
import { env } from "./config.ts";
import { openDb } from "./db.ts";
import { initialState } from "./initial-state.ts";

const db = openDb(env.DB_PATH);

// same-origin (page served from the host the WS goes through, e.g. via vite proxy
// on a LAN IP) or explicitly listed in WEB_ORIGIN
function isAllowedOrigin(origin: string, host: string | null) {
  if (env.WEB_ORIGIN.includes(origin)) return true;
  try {
    return host !== null && new URL(origin).host === host;
  } catch {
    return false;
  }
}

const server = new Server({
  address: env.HOST,
  port: env.PORT,
  // ws maxPayload; source limit is 1MB, leave room for Yjs overhead
  websocketOptions: { maxPayload: 4 * 1024 * 1024 },
  debounce: 2000,
  maxDebounce: 10_000,
  stopOnSignals: false,

  async onConnect({ documentName, requestHeaders }) {
    const origin = requestHeaders.get("origin");
    if (origin && !isAllowedOrigin(origin, requestHeaders.get("host"))) {
      throw new Error(`Origin not allowed: ${origin}`);
    }
    if (!DocumentId.safeParse(documentName).success) {
      throw new Error("Invalid document name");
    }
  },

  extensions: [
    new Database({
      fetch: async ({ documentName }) => {
        const existing = db.get(documentName);
        if (existing) return existing;
        // persist the seed immediately: if the server restarted before the first edit,
        // a re-seeded doc (new clientID) would merge with clients' copy and duplicate the text
        const state = initialState();
        db.put(documentName, state);
        return state;
      },
      store: async ({ documentName, state }) => db.put(documentName, state),
    }),
  ],
});

await server.listen();

async function shutdown() {
  // destroy() flushes pending stores before closing
  await server.destroy();
  db.close();
  process.exit(0);
}

process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);
