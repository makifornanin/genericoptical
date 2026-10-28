import { createHash, timingSafeEqual } from "node:crypto";
import { processAllDue } from "@/server/integrations/ghl";
import { log } from "@/server/log";

/**
 * Durable sync worker. Call from a scheduler every few minutes (e.g. Vercel Cron) with
 * `Authorization: Bearer $CRON_SECRET`. Add `?reconcile=1` (e.g. hourly) to also run reconciliation.
 * Each business is processed in isolation; one failing business never blocks the others.
 */
export async function POST(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return Response.json({ error: "CRON_SECRET is not configured" }, { status: 503 });
  const provided = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  const ok = timingSafeEqual(createHash("sha256").update(provided).digest(), createHash("sha256").update(secret).digest());
  if (!ok) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const reconcile = new URL(request.url).searchParams.get("reconcile") === "1";
  const started = Date.now();
  const result = await processAllDue({ reconcile });
  log.info("ghl.worker_run", { businesses: Object.keys(result.results).length, recovered: result.recovered, reconcile, ms: Date.now() - started });
  return Response.json(result);
}

export const GET = POST;
