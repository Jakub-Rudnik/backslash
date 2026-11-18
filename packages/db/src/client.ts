import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { fileURLToPath } from "node:url";
import pg from "pg";
import * as schema from "./schema/index.ts";

export type Db = NodePgDatabase<typeof schema>;

export function createDb(url: string) {
  const pool = new pg.Pool({ connectionString: url, max: 10 });
  const db: Db = drizzle(pool, { schema });
  return { db, pool };
}

const MIGRATIONS = fileURLToPath(new URL("../drizzle", import.meta.url));
const MIGRATION_LOCK = 7_310_219;

/** Applies pending migrations; safe to call from several services at startup. */
export async function runMigrations(pool: pg.Pool) {
  const client = await pool.connect();
  try {
    await client.query("select pg_advisory_lock($1)", [MIGRATION_LOCK]);
    await migrate(drizzle(client), { migrationsFolder: MIGRATIONS });
  } finally {
    await client.query("select pg_advisory_unlock($1)", [MIGRATION_LOCK]).catch(() => {});
    client.release();
  }
}
