import { z } from "zod";
import { json, readJson, sameOrigin } from "@/lib/http";
import { quoteCart } from "@/lib/orders-api";

/*
 * POST /api/cart/quote — re-prices the bag from the dashboard and says which branches can fulfil it.
 * Body: { items: [{ variantId, quantity, lensVariantId? }] }
 */

const schema = z.object({
  items: z
    .array(z.object({ variantId: z.guid(), quantity: z.number().int().min(1).max(10), lensVariantId: z.guid().nullish() }))
    .min(1)
    .max(20),
});

export async function POST(request: Request) {
  if (!sameOrigin(request)) return json({ error: "Forbidden" }, 403);
  const body = await readJson(request, 16 * 1024);
  if (!body.ok) return json({ error: "Invalid request" }, body.status);
  const parsed = schema.safeParse(body.body);
  if (!parsed.success) return json({ error: "Your bag couldn't be read. Please refresh the page." }, 400);
  const res = await quoteCart(parsed.data.items);
  if (!res.ok) return json({ error: res.error }, res.status);
  return json(res.data);
}
