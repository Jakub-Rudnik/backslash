import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";

export function openDb(path: string) {
  mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS documents (
      name TEXT PRIMARY KEY,
      data BLOB NOT NULL,
      updated_at INTEGER NOT NULL
    );
  `);

  const select = db.prepare("SELECT data FROM documents WHERE name = ?");
  const upsert = db.prepare(`
    INSERT INTO documents (name, data, updated_at) VALUES (?, ?, ?)
    ON CONFLICT(name) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at
  `);

  return {
    get(name: string): Uint8Array | null {
      const row = select.get(name) as { data: Uint8Array } | undefined;
      return row?.data ?? null;
    },
    put(name: string, data: Uint8Array) {
      upsert.run(name, data, Date.now());
    },
    close() {
      db.close();
    },
  };
}

export type Db = ReturnType<typeof openDb>;
