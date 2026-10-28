import { handleMarketplaceWebhook } from "@/server/integrations/ghl";
import { MAX_WEBHOOK_BYTES } from "@/server/integrations/ghl/webhooks";
import { readBodyCapped } from "@/server/http";

/**
 * Marketplace app webhook (one URL for the whole app, configured in the HighLevel developer portal).
 * Events are verified with HighLevel's published signing key and routed by locationId.
 */
export async function POST(request: Request) {
  const raw = await readBodyCapped(request, MAX_WEBHOOK_BYTES);
  if (raw === null) return Response.json({ error: "Payload too large" }, { status: 413 });
  const result = await handleMarketplaceWebhook(raw, request.headers);
  return Response.json(result.body, { status: result.status });
}
