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
// GoHighLevel tests talk to an in-memory simulator; these are dummy values, never real credentials.
process.env.GHL_CLIENT_ID ??= "test-client-id";
process.env.GHL_CLIENT_SECRET ??= "test-client-secret";
process.env.APP_URL ??= "http://localhost:3000";
process.env.LOG_LEVEL ??= "error";
if (!process.env.GHL_TEST_WEBHOOK_PRIVATE_KEY) {
  // A throwaway Ed25519 key pair stands in for HighLevel's signing key.
  const { generateKeyPairSync } = await import("node:crypto");
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  process.env.GHL_WEBHOOK_ED25519_PUBLIC_KEY = publicKey.export({ type: "spki", format: "pem" }).toString();
  process.env.GHL_TEST_WEBHOOK_PRIVATE_KEY = privateKey.export({ type: "pkcs8", format: "pem" }).toString();
}

afterAll(async () => {
  await closeDb();
  const c = new pg.Client({ connectionString: `${base}/postgres` });
  await c.connect();
  await c.query(`drop database if exists ${name} with (force)`);
  await c.end();
});
