import { existsSync, readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import pg from "pg";

/**
 * Runs before `next build` on Vercel (package.json "vercel-build"), where the database variables are
 * available even though Vercel won't release sensitive values to a developer machine.
 *
 * 1. Inspects the database and logs what it finds (never the connection string).
 * 2. Applies pending migrations (idempotent; additive SQL from drizzle/).
 * 3. Only if DEMO_MODE=true, a snapshot from scripts/demo-snapshot.ts is present, AND the database
 *    holds no businesses at all: loads the demo snapshot in one transaction. Existing records are
 *    never overwritten or deleted.
 *
 * Without a database URL it logs and exits so the app still builds (it renders "database unreachable").
 */

const SNAPSHOT = ".demo-snapshot/demo.json.gz";
// Insert these columns as NULL first and fill them in afterwards (breaks the customers ↔ leads cycle).
const DEFERRED: Record<string, string[]> = { leads: ["converted_customer_id"] };
const CHUNK = 1500;

function describe(url: string) {
  try {
    const u = new URL(url);
    // The host minus its first label (the endpoint id), e.g. "ap-southeast-1.aws.neon.tech".
    return `${u.hostname.includes("-pooler") ? "pooled" : "direct"} connection to ${u.hostname.split(".").slice(1).join(".")}, database "${u.pathname.slice(1)}"`;
  } catch {
    return "unparseable URL";
  }
}

async function main() {
  const url = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
  if (!url) {
    console.log("[db-setup] No DATABASE_URL: skipping migrations (the app will report the database as unreachable).");
    return;
  }
  console.log(`[db-setup] Using ${describe(url)}.`);
  const pool = new pg.Pool({ connectionString: url, max: 1 });
  try {
    const exists = async (table: string) => (await pool.query("select to_regclass($1) is not null as ok", [`public.${table}`])).rows[0].ok as boolean;
    const tableCount = Number((await pool.query("select count(*)::int as n from pg_tables where schemaname = 'public'")).rows[0].n);
    const before = (await exists("businesses")) ? (await pool.query("select count(*) filter (where is_demo)::int as demo, count(*) filter (where not is_demo)::int as real from businesses")).rows[0] : null;
    console.log(`[db-setup] Before: ${tableCount} tables; businesses: ${before ? `${before.demo} demo, ${before.real} real` : "none (no schema yet)"}.`);

    const started = Date.now();
    await migrate(drizzle(pool), { migrationsFolder: "drizzle" });
    const applied = Number((await pool.query("select count(*)::int as n from drizzle.__drizzle_migrations")).rows[0].n);
    console.log(`[db-setup] Migrations up to date (${applied} applied) in ${Date.now() - started} ms.`);

    const businesses = Number((await pool.query("select count(*)::int as n from businesses")).rows[0].n);
    if (process.env.DEMO_MODE !== "true") {
      console.log("[db-setup] DEMO_MODE is not true: no demo data loaded.");
      return;
    }
    if (!existsSync(SNAPSHOT)) {
      console.log(`[db-setup] No ${SNAPSHOT} in this deployment: no demo data loaded.`);
      return;
    }
    if (businesses > 0) {
      console.log(`[db-setup] The database already has ${businesses} business(es): demo snapshot NOT loaded, nothing overwritten.`);
      return;
    }
    await loadSnapshot(pool, applied);
  } finally {
    await pool.end();
  }
}

async function loadSnapshot(pool: pg.Pool, applied: number) {
  const snapshot = JSON.parse(gunzipSync(readFileSync(SNAPSHOT)).toString("utf8")) as { migrations: number; rows: number; createdAt: string; data: Record<string, Record<string, unknown>[]> };
  if (snapshot.migrations !== applied) throw new Error(`Snapshot was taken at ${snapshot.migrations} migrations but the database has ${applied}. Re-export it.`);
  // Parents before children, from the database's own foreign keys (ignoring the deferred columns).
  const { rows: edges } = await pool.query<{ src: string; dst: string; cols: string[] }>(`
    select con.conrelid::regclass::text as src, con.confrelid::regclass::text as dst,
           array(select attname from pg_attribute where attrelid = con.conrelid and attnum = any(con.conkey)) as cols
    from pg_constraint con
    where con.contype = 'f' and con.connamespace = 'public'::regnamespace and con.conrelid <> con.confrelid`);
  const tables = Object.keys(snapshot.data);
  const deps = new Map(tables.map((t) => [t, new Set<string>()]));
  for (const e of edges) {
    if (!deps.has(e.src) || !deps.has(e.dst)) continue;
    if ((DEFERRED[e.src] ?? []).some((c) => e.cols.includes(c))) continue;
    deps.get(e.src)!.add(e.dst);
  }
  const order: string[] = [];
  const visiting = new Set<string>();
  const visit = (t: string) => {
    if (order.includes(t)) return;
    if (visiting.has(t)) throw new Error(`Unresolved foreign-key cycle at ${t}`);
    visiting.add(t);
    for (const d of deps.get(t) ?? []) visit(d);
    visiting.delete(t);
    order.push(t);
  };
  tables.forEach(visit);

  const client = await pool.connect();
  const started = Date.now();
  try {
    await client.query("begin");
    for (const table of order) {
      const rows = snapshot.data[table];
      const deferred = DEFERRED[table] ?? [];
      const first = deferred.length ? rows.map((r) => ({ ...r, ...Object.fromEntries(deferred.map((c) => [c, null])) })) : rows;
      for (let i = 0; i < first.length; i += CHUNK) {
        await client.query(`insert into "${table}" select * from json_populate_recordset(null::"${table}", $1::json)`, [JSON.stringify(first.slice(i, i + CHUNK))]);
      }
    }
    for (const [table, cols] of Object.entries(DEFERRED)) {
      const rows = (snapshot.data[table] ?? []).filter((r) => cols.some((c) => r[c] !== null && r[c] !== undefined));
      if (!rows.length) continue;
      const set = cols.map((c) => `"${c}" = s."${c}"`).join(", ");
      await client.query(`update "${table}" t set ${set} from json_populate_recordset(null::"${table}", $1::json) s where t.id = s.id`, [JSON.stringify(rows)]);
    }
    const loaded = Number((await client.query("select count(*)::int as n from businesses where is_demo")).rows[0].n);
    if (loaded < 1) throw new Error("Snapshot loaded no demo business");
    await client.query("commit");
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
  console.log(`[db-setup] Loaded the demo snapshot from ${snapshot.createdAt}: ${snapshot.rows} rows in ${order.length} tables in ${Date.now() - started} ms.`);
}

main().catch((error) => {
  console.error("[db-setup] FAILED:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
