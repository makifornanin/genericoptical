import { randomUUID } from "node:crypto";
import pg from "pg";
import { afterAll, inject } from "vitest";
import { closeDb } from "@/server/db";

// Each test file gets its own copy of the migrated template database.
const base = inject("pgBase");
const name = `t_${randomUUID().replace(/-/g, "").slice(0, 16)}`;
const admin = new pg.Client({ connectionString: `${base}/postgres` });
await admin.connect();
for (let attempt = 0; ; attempt++) {
  try {
    await admin.query(`create database ${name} template specta_template`);
    break;
  } catch (error) {
    // Concurrent copies of the same template can briefly collide; retry.
    if (attempt > 20) throw error;
    await new Promise((r) => setTimeout(r, 100 + Math.random() * 200));
  }
}
await admin.end();
process.env.DATABASE_URL = `${base}/${name}`;
process.env.APP_SECRET ??= "test-secret-test-secret-test-secret-1234";

afterAll(async () => {
  await closeDb();
  const c = new pg.Client({ connectionString: `${base}/postgres` });
  await c.connect();
  await c.query(`drop database if exists ${name} with (force)`);
  await c.end();
});
