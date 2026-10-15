import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

// int8 (bigint) → JS number. Amounts are minor units and stay far below 2^53.
pg.types.setTypeParser(20, (v) => Number(v));

export type DB = NodePgDatabase<typeof schema>;
export type Tx = Parameters<Parameters<DB["transaction"]>[0]>[0];
/** Anything that can run queries: the root db or an open transaction. */
export type Executor = DB | Tx;

type Holder = { pool?: pg.Pool; db?: DB; url?: string };
const holder: Holder = ((globalThis as unknown as { __specta_db?: Holder }).__specta_db ??= {});

export function createPool(connectionString: string, max = 10) {
  return new pg.Pool({ connectionString, max, idleTimeoutMillis: 30_000 });
}

/** Lazily connects using DATABASE_URL (read at first use so tests can point it at their own database). */
export function getDb(): DB {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set. Copy .env.example to .env.local and run `npm run db:start`.");
  if (!holder.db || holder.url !== url) {
    holder.pool = createPool(url);
    holder.db = drizzle(holder.pool, { schema });
    holder.url = url;
  }
  return holder.db;
}

export function getPool(): pg.Pool {
  getDb();
  return holder.pool!;
}

export async function closeDb() {
  await holder.pool?.end();
  holder.pool = undefined;
  holder.db = undefined;
  holder.url = undefined;
}

export { schema };
