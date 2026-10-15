// Runs a real PostgreSQL server for local development and demos (no Docker needed).
// Data persists in .data/postgres. Point DATABASE_URL at a hosted Postgres in production instead.
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import EmbeddedPostgres from "embedded-postgres";
import pg from "pg";

const port = Number(process.env.DB_PORT ?? 54329);
const database = process.env.DB_NAME ?? "specta";
const dataDir = resolve(process.env.DB_DATA_DIR ?? ".data/postgres");

const server = new EmbeddedPostgres({
  databaseDir: dataDir,
  user: "postgres",
  password: "postgres",
  port,
  persistent: true,
  // Always UTF-8: on Windows initdb otherwise defaults to WIN1252, which can't store "₱" and many names.
  initdbFlags: ["--encoding=UTF8", "--locale=C"],
  onLog: () => {},
  onError: (e) => console.error(String(e)),
});

if (!existsSync(resolve(dataDir, "PG_VERSION"))) {
  console.log(`Initialising a new PostgreSQL cluster in ${dataDir} …`);
  await server.initialise();
}
await server.start();

const admin = new pg.Client({ connectionString: `postgres://postgres:postgres@localhost:${port}/postgres` });
await admin.connect();
const exists = await admin.query("select 1 from pg_database where datname = $1", [database]);
if (!exists.rowCount) {
  await admin.query(`create database "${database}" encoding 'UTF8' template template0`);
  console.log(`Created database "${database}".`);
}
await admin.end();

console.log(`PostgreSQL is running → postgres://postgres:postgres@localhost:${port}/${database}`);
console.log("Press Ctrl+C to stop.");

let stopping = false;
const stop = async () => {
  if (stopping) return;
  stopping = true;
  console.log("\nStopping PostgreSQL …");
  await server.stop();
  process.exit(0);
};
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
setInterval(() => {}, 1 << 30);
