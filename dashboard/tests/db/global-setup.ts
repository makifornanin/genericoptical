import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import EmbeddedPostgres from "embedded-postgres";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import pg from "pg";
import type { TestProject } from "vitest/node";

const PORT = Number(process.env.TEST_DB_PORT ?? 54339);
export const TEMPLATE = "specta_template";

/** Starts a throwaway PostgreSQL, migrates a template database once, and shares the URL with tests. */
export default async function setup(project: TestProject) {
  const dir = mkdtempSync(join(tmpdir(), "specta-test-pg-"));
  const server = new EmbeddedPostgres({
    databaseDir: dir,
    user: "postgres",
    password: "postgres",
    port: PORT,
    persistent: false,
    initdbFlags: ["--encoding=UTF8", "--locale=C"],
    onLog: () => {},
  });
  await server.initialise();
  await server.start();
  const base = `postgres://postgres:postgres@localhost:${PORT}`;
  const admin = new pg.Client({ connectionString: `${base}/postgres` });
  await admin.connect();
  await admin.query(`create database ${TEMPLATE} encoding 'UTF8' template template0`);
  await admin.end();
  const pool = new pg.Pool({ connectionString: `${base}/${TEMPLATE}`, max: 1 });
  await migrate(drizzle(pool), { migrationsFolder: "drizzle" });
  await pool.end();
  project.provide("pgBase", base);
  return async () => {
    await server.stop();
    rmSync(dir, { recursive: true, force: true });
  };
}

declare module "vitest" {
  export interface ProvidedContext {
    pgBase: string;
  }
}
