import { z } from "zod";
import { json, readJson, sameOrigin } from "@/lib/http";
import { lookupOrder } from "@/lib/orders-api";
import { clientIp, rateLimit } from "@/lib/rate-limit";

/** POST /api/orders/lookup { number, email } → { href } of the order page, or 404. */
export async function POST(request: Request) {
  if (!sameOrigin(request)) return json({ error: "Forbidden" }, 403);
  const ip = clientIp(request.headers);
  const limit = rateLimit(`lookup:${ip ?? "unknown"}`);
  if (!limit.allowed) return json({ error: "Too many attempts. Please wait a minute and try again." }, 429, { "Retry-After": String(limit.retryAfterSeconds) });
  const body = await readJson(request, 2048);
  const parsed = body.ok ? z.object({ number: z.string().trim().max(40), email: z.string().trim().max(200) }).safeParse(body.body) : null;
  if (!parsed?.success) return json({ error: "Enter your order number and email." }, 400);
  const res = await lookupOrder(parsed.data.number, parsed.data.email, ip);
  if (!res.ok) return json({ error: res.status === 404 ? "We couldn't find an order with that number and email." : res.error }, res.status);
  return json({ href: `/order/${res.data.number}?t=${encodeURIComponent(res.data.token)}` });
}
