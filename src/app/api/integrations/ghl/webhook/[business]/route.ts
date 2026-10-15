import { eq, or } from "drizzle-orm";
import { getDb } from "@/server/db";
import { businesses } from "@/server/db/schema";
import { handleGhlWebhook } from "@/server/integrations/ghl";

/**
 * Inbound GoHighLevel workflow webhook: POST /api/integrations/ghl/webhook/<business-slug>
 * Header `x-webhook-secret` must match the secret shown in Settings → Integrations.
 */
export async function POST(request: Request, ctx: RouteContext<"/api/integrations/ghl/webhook/[business]">) {
  // Reject oversized payloads before reading them into memory.
  if (Number(request.headers.get("content-length") ?? 0) > 100_000) return Response.json({ error: "Payload too large" }, { status: 413 });
  const { business } = await ctx.params;
  const isUuid = /^[0-9a-f-]{36}$/i.test(business);
  const [biz] = await getDb()
    .select({ id: businesses.id })
    .from(businesses)
    .where(isUuid ? or(eq(businesses.slug, business), eq(businesses.id, business)) : eq(businesses.slug, business))
    .limit(1);
  if (!biz) return Response.json({ error: "Unknown business" }, { status: 404 });
  const raw = await request.text();
  const result = await handleGhlWebhook({ businessId: biz.id }, request.headers, raw);
  return Response.json(result.body, { status: result.status });
}
