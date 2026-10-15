import "./load-env";
import { eq, sql } from "drizzle-orm";
import { closeDb, getDb } from "@/server/db";
import { businesses } from "@/server/db/schema";
import { DEMO_ACCOUNTS, DEMO_PASSWORD, removeDemoData, seedDemo, verifyIntegrity } from "@/server/demo/seed";

/**
 * npm run db:seed           → seeds the demo business if none exists
 * npm run db:reset-demo     → deletes demo data (is_demo businesses only) and seeds again
 * Refuses to run when DEMO_MODE isn't "true", so it can't touch a production database by accident.
 */
async function main() {
  const reset = process.argv.includes("--reset");
  const days = Number(process.argv.find((a) => a.startsWith("--days="))?.split("=")[1] ?? 270);
  if (process.env.DEMO_MODE !== "true") {
    throw new Error("Seeding is only allowed when DEMO_MODE=true. Use a separate database for demos.");
  }
  const db = getDb();
  const [{ real }] = (await db.execute<{ real: number }>(sql`select count(*)::int as real from businesses where not is_demo`)).rows;
  if (Number(real) > 0) console.log(`Note: ${real} non-demo business(es) exist in this database and will not be touched.`);
  const existing = await db.select({ id: businesses.id }).from(businesses).where(eq(businesses.isDemo, true));
  if (existing.length && !reset) {
    console.log("Demo data already exists. Run `npm run db:reset-demo` to rebuild it.");
    return;
  }
  if (existing.length) {
    console.log("Removing existing demo data …");
    await removeDemoData();
  }
  const started = Date.now();
  const result = await seedDemo({ days });
  const problems = await verifyIntegrity(result.businessId);
  console.log(`\nSeeded in ${Math.round((Date.now() - started) / 1000)}s:`, result.stats, `· ${result.skipped} skipped event(s)`);
  console.log(problems.length ? `Integrity problems:\n  ${problems.join("\n  ")}` : "Integrity check passed: balances, stock and payments reconcile with their records.");
  console.log(`\nDemo sign-in (password: ${DEMO_PASSWORD}):`);
  for (const a of DEMO_ACCOUNTS) console.log(`  ${a.role.padEnd(13)} ${a.email}`);
  if (problems.length) process.exitCode = 1;
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => closeDb());
