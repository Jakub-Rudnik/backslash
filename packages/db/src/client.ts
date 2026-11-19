import { DrizzleQueryError } from "drizzle-orm";
import { drizzle, type NodePgDatabase, type NodePgQueryResultHKT } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import type { PgDatabase } from "drizzle-orm/pg-core";
import { fileURLToPath } from "node:url";
import pg from "pg";
import * as schema from "./schema/index.ts";

export type Db = NodePgDatabase<typeof schema>;

/** The database or a transaction on it. */
export type Executor = PgDatabase<NodePgQueryResultHKT, typeof schema>;

const FOREIGN_KEY_VIOLATION = "23503";

export function isForeignKeyViolation(err: unknown) {
  const cause = err instanceof DrizzleQueryError ? err.cause : err;
  return cause instanceof pg.DatabaseError && cause.code === FOREIGN_KEY_VIOLATION;
}

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
