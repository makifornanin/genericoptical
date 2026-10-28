import "./load-env";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { closeDb, getDb } from "@/server/db";

async function main() {
  const db = getDb();
  await migrate(db, { migrationsFolder: "drizzle" });
  console.log("Database schema is up to date.");
  await closeDb();
}

main().catch(async (error) => {
  const cause = (error as { cause?: { message?: string } })?.cause;
  console.error("Migration failed:", error instanceof Error ? error.message : error, cause?.message ? `
Cause: ${cause.message}` : "");
  await closeDb();
  process.exit(1);
});
