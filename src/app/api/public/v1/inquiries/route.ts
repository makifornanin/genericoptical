import { readBodyCapped } from "@/server/http";
import { forwardedClientIp, publicError } from "@/server/public-api-http";
import { capturePublicLead } from "@/server/services/leads";
import { authenticateSiteKey, PublicApiError, rateLimit } from "@/server/services/public-api";

const MAX_BYTES = 16 * 1024;

/**
 * Website inquiry intake. Creates (or adds to) a lead with source "website"; the GHL outbox then
 * finds or creates the contact. The response never says whether the person already existed.
 */
export async function POST(request: Request) {
  try {
    const auth = await authenticateSiteKey(request.headers.get("authorization"), "inquiries:write");
    const raw = await readBodyCapped(request, MAX_BYTES);
    if (raw === null) throw new PublicApiError(413, "Payload too large");
    let body: unknown;
    try {
      body = JSON.parse(raw);
    } catch {
      throw new PublicApiError(400, "Send a JSON body.");
    }
    // The visitor IP is only trusted because the request carries a valid site key.
    const ip = forwardedClientIp(request);
    if (ip) await rateLimit(`inquiry:ip:${auth.businessId}:${ip}`, 8, 600);
    await rateLimit(`inquiry:key:${auth.keyId}`, 120, 3600);
    await capturePublicLead(auth.businessId, body, { ip });
    return Response.json({ ok: true }, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return publicError(error);
  }
}
