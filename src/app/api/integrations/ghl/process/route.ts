import { timingSafeEqual, createHash } from "node:crypto";
import { eq } from "drizzle-orm";
import { getDb } from "@/server/db";
import { integrationConnections } from "@/server/db/schema";
import { processGhlOutbox } from "@/server/integrations/ghl";

/**
 * Drains the GoHighLevel outbox for every connected business. Call from a scheduler
 * (e.g. Vercel Cron every 5 minutes) with `Authorization: Bearer $CRON_SECRET`.
 */
export async function POST(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return Response.json({ error: "CRON_SECRET is not configured" }, { status: 503 });
  const provided = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  const ok = timingSafeEqual(createHash("sha256").update(provided).digest(), createHash("sha256").update(secret).digest());
  if (!ok) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const rows = await getDb().select({ businessId: integrationConnections.businessId }).from(integrationConnections).where(eq(integrationConnections.status, "connected"));
  const results = [];
  for (const r of rows) results.push({ businessId: r.businessId, ...(await processGhlOutbox(r.businessId)) });
  return Response.json({ results });
}

export const GET = POST;
