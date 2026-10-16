import { sql } from "drizzle-orm";
import { getDb } from "@/server/db";
import { log } from "@/server/log";
import { GHL } from "./engine";

/**
 * Runs the GHL worker for one business if it has events due now. One indexed query when nothing is
 * due, so it can follow every server action. Never throws: the scheduled worker is the safety net.
 */
export async function kickGhlIfDue(businessId: string) {
  try {
    const { rows } = await getDb().execute<{ due: boolean }>(sql`
      select exists (
        select 1 from integration_sync_events
        where business_id = ${businessId} and provider = ${GHL} and status in ('pending', 'retry_scheduled') and next_attempt_at <= now()
      ) as due`);
    if (!rows[0]?.due) return 0;
    const { kickGhl } = await import("./index");
    return await kickGhl(businessId);
  } catch (error) {
    log.warn("ghl.kick_if_due_failed", { businessId, error: error instanceof Error ? error.message.slice(0, 200) : String(error) });
    return 0;
  }
}
