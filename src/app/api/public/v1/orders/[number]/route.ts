import { publicError } from "@/server/public-api-http";
import { authenticateSiteKey, rateLimit } from "@/server/services/public-api";
import { getWebsiteOrder } from "@/server/services/website-orders";

/** The customer's view of a website order. Needs the order's token (X-Order-Token); otherwise 404. */
export async function GET(request: Request, ctx: RouteContext<"/api/public/v1/orders/[number]">) {
  try {
    const auth = await authenticateSiteKey(request.headers.get("authorization"), "orders:read");
    await rateLimit(`order-read:key:${auth.keyId}`, 600, 60);
    const { number } = await ctx.params;
    const body = await getWebsiteOrder(auth.businessId, number.slice(0, 40), request.headers.get("x-order-token"));
    return Response.json(body, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return publicError(error);
  }
}
