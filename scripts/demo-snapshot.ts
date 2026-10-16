import "./load-env";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { gzipSync } from "node:zlib";
import pg from "pg";

/**
 * Exports the local DEMO data as a compressed JSON snapshot that `scripts/vercel-db-setup.ts` can load
 * into an empty hosted database in a few bulk statements (the per-record seed is too slow over a
 * long network path, and Vercel doesn't release sensitive variables to run it locally).
 *
 *   npm run db:reset-demo                      # fresh, integrity-checked demo data locally
 *   npx tsx scripts/demo-snapshot.ts .demo-snapshot/demo.json.gz
 *
 * Only demo businesses are exported. Sessions, sign-in throttling, password-reset and OAuth state,
 * API keys and rate-limit counters are never included.
 */
export const EXCLUDED_TABLES = new Set(["sessions", "login_attempts", "password_reset_tokens", "oauth_states", "api_keys", "api_rate_limits"]);

async function main() {
  const out = process.argv[2];
  if (!out) throw new Error("Usage: tsx scripts/demo-snapshot.ts <output.json.gz>");
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    const { rows: biz } = await client.query<{ id: string; is_demo: boolean }>("select id, is_demo from businesses");
    if (!biz.length || biz.some((b) => !b.is_demo)) throw new Error("The source database must contain demo businesses only.");
    const { rows: tables } = await client.query<{ tablename: string }>("select tablename from pg_tables where schemaname = 'public' order by tablename");
    const { rows: migrations } = await client.query<{ n: number }>("select count(*)::int as n from drizzle.__drizzle_migrations");
    const data: Record<string, unknown[]> = {};
    let total = 0;
    for (const { tablename } of tables) {
      if (EXCLUDED_TABLES.has(tablename)) continue;
      // Raw text for every type (no Date conversion: `date` columns would shift by the local UTC
      // offset), except json/jsonb which must stay JSON values for json_populate_recordset.
      const { rows } = await client.query({ text: `select * from "${tablename}"`, types: { getTypeParser: (oid: number) => (oid === 114 || oid === 3802 ? JSON.parse : (v: string) => v) } as unknown as pg.CustomTypesConfig });
      if (rows.length) data[tablename] = rows;
      total += rows.length;
    }
    const snapshot = { format: 1, createdAt: new Date().toISOString(), migrations: migrations[0].n, rows: total, data };
    mkdirSync(dirname(out), { recursive: true });
    const gz = gzipSync(JSON.stringify(snapshot));
    writeFileSync(out, gz);
    console.log(`Wrote ${out}: ${Object.keys(data).length} tables, ${total} rows, ${(gz.length / 1024 / 1024).toFixed(1)} MB, schema at ${migrations[0].n} migrations.`);
  } finally {
    await client.end();
  }
}

if (process.argv[1]?.endsWith("demo-snapshot.ts")) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
