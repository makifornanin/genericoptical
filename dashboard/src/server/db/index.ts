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

/** Postgres errors that mean "nothing was committed; running the same transaction again is safe". */
const RETRYABLE = new Set(["40001", "40P01"]); // serialization_failure, deadlock_detected
const MAX_ATTEMPTS = 3;

function pgCode(error: unknown): string | undefined {
  let e: unknown = error;
  for (let i = 0; i < 4 && e; i++) {
    const code = (e as { code?: unknown }).code;
    if (typeof code === "string" && /^[0-9A-Z]{5}$/.test(code)) return code;
    e = (e as { cause?: unknown }).cause;
  }
  return undefined;
}

/**
 * Wraps the root `transaction()` so deadlocks and serialization failures are retried with jitter.
 * Only the root call is wrapped (savepoints inside a transaction are not), and transaction bodies
 * must not perform external side effects — they may run more than once.
 */
function withTransactionRetry(db: DB): DB {
  const original = db.transaction.bind(db);
  const retrying: DB["transaction"] = async (fn, config) => {
    for (let attempt = 1; ; attempt++) {
      try {
        return await original(fn, config);
      } catch (error) {
        const code = pgCode(error);
        if (!code || !RETRYABLE.has(code) || attempt >= MAX_ATTEMPTS) throw error;
        await new Promise((r) => setTimeout(r, 15 * attempt + Math.random() * 40 * attempt));
      }
    }
  };
  db.transaction = retrying;
  return db;
}

/** Lazily connects using DATABASE_URL (read at first use so tests can point it at their own database). */
export function getDb(): DB {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set. Copy .env.example to .env.local and run `npm run db:start`.");
  if (!holder.db || holder.url !== url) {
    holder.pool = createPool(url);
    holder.db = withTransactionRetry(drizzle(holder.pool, { schema }));
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
