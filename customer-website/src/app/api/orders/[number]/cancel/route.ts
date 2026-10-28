import { json, readJson, sameOrigin } from "@/lib/http";
import { cancelOrder } from "@/lib/orders-api";
import { clientIp } from "@/lib/rate-limit";

/** POST /api/orders/:number/cancel { token } — the customer cancels an unpaid order before work starts. */
export async function POST(request: Request, ctx: RouteContext<"/api/orders/[number]/cancel">) {
  if (!sameOrigin(request)) return json({ error: "Forbidden" }, 403);
  const body = await readJson(request, 2048);
  const token = body.ok && body.body && typeof body.body === "object" ? (body.body as { token?: unknown }).token : null;
  if (typeof token !== "string" || token.length > 100) return json({ error: "We couldn't find that order." }, 404);
  const { number } = await ctx.params;
  const res = await cancelOrder(number, token, clientIp(request.headers));
  if (!res.ok) return json({ error: res.error }, res.status);
  return json({ ok: true, status: res.data.order.status });
}
