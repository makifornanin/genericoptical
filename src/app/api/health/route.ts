import { sql } from "drizzle-orm";
import { connection } from "next/server";
import { getDb } from "@/server/db";

/** Liveness + database connectivity check for uptime monitors and deploy smoke tests. */
export async function GET() {
  await connection(); // always run at request time, never prerendered
  try {
    const started = Date.now();
    await getDb().execute(sql`select 1`);
    return Response.json({ status: "ok", database: "ok", latencyMs: Date.now() - started }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ status: "degraded", database: "unreachable" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
