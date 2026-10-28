import { forwardedClientIp, publicError } from "@/server/public-api-http";
import { authenticateSiteKey, rateLimit } from "@/server/services/public-api";
import { cancelWebsiteOrder } from "@/server/services/website-orders";

/** The customer cancels an unpaid order before work starts (needs X-Order-Token). Reserved stock is released. */
export async function POST(request: Request, ctx: RouteContext<"/api/public/v1/orders/[number]/cancel">) {
  try {
    const auth = await authenticateSiteKey(request.headers.get("authorization"), "orders:write");
    await rateLimit(`order-cancel:key:${auth.keyId}`, 120, 3600);
    const { number } = await ctx.params;
    const body = await cancelWebsiteOrder(auth.businessId, number.slice(0, 40), request.headers.get("x-order-token"), { ip: forwardedClientIp(request) });
    return Response.json(body, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return publicError(error);
  }
}
