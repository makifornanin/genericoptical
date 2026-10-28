import { createHash } from "node:crypto";
import { z } from "zod";
import { APPROVED_LAST4 } from "@/lib/demo-card";
import { json, readJson, sameOrigin } from "@/lib/http";
import { placeOrder } from "@/lib/orders-api";
import { clientIp, rateLimit } from "@/lib/rate-limit";

/*
 * POST /api/checkout — places the order in the dashboard (pickup at a branch).
 *
 * Demo store payments: the browser checks the card against published test cards and sends only the
 * brand and last four digits. Card numbers never reach this server. The dashboard records an
 * approved demo payment as "Online card (demo — not charged)".
 *
 * The idempotency key comes from the browser (one per checkout attempt), so a double click or a
 * retried request returns the same order instead of creating two.
 */

const rxEye = z.object({ sph: z.string().max(8), cyl: z.string().max(8).nullable().optional(), axis: z.string().max(4).nullable().optional(), add: z.string().max(8).nullable().optional() });
const schema = z.object({
  idempotencyKey: z.string().regex(/^[A-Za-z0-9-]{8,100}$/),
  branchId: z.guid(),
  customer: z.object({ fullName: z.string().max(120), email: z.string().max(200), phone: z.string().max(40) }),
  items: z
    .array(
      z.object({
        variantId: z.guid(),
        quantity: z.number().int().min(1).max(10),
        lensVariantId: z.guid().nullish(),
        prescription: z
          .object({ mode: z.enum(["enter", "send_later", "on_file", "book_exam"]), od: rxEye.optional(), os: rxEye.optional(), pd: z.string().max(8).nullable().optional(), issuedOn: z.string().max(10).nullable().optional() })
          .nullish(),
      }),
    )
    .min(1)
    .max(20),
  payment: z.discriminatedUnion("option", [z.object({ option: z.literal("pay_at_pickup") }), z.object({ option: z.literal("demo_card"), cardBrand: z.string().max(20), cardLast4: z.string().regex(/^\d{4}$/) })]),
  expectedTotalCents: z.number().int().min(0),
  contactLensRxConfirmed: z.boolean().default(false),
  note: z.string().max(500).nullish(),
  marketingConsent: z.boolean().default(false),
  smsConsent: z.boolean().default(false),
  website: z.string().max(200).default(""),
});

export async function POST(request: Request) {
  if (!sameOrigin(request)) return json({ error: "Checkout only works from this website." }, 403);
  const ip = clientIp(request.headers);
  const limit = rateLimit(`checkout:${ip ?? "unknown"}`);
  if (!limit.allowed) return json({ error: "Too many attempts. Please wait a minute and try again." }, 429, { "Retry-After": String(limit.retryAfterSeconds) });
  const body = await readJson(request, 32 * 1024);
  if (!body.ok) return json({ error: "We couldn't read your order. Please try again." }, body.status);
  const parsed = schema.safeParse(body.body);
  if (!parsed.success) return json({ error: "Please check your details and try again." }, 400);
  const input = parsed.data;
  if (input.website) return json({ error: "We couldn't place this order. Please try again." }, 400);

  let payment: Record<string, string>;
  if (input.payment.option === "demo_card") {
    if (!APPROVED_LAST4.includes(input.payment.cardLast4)) return json({ error: "Card declined. Use the demo test card 4242 4242 4242 4242." }, 402);
    // Deterministic per checkout attempt, so a retry sends exactly the same order.
    const reference = `DEMO-${createHash("sha256").update(input.idempotencyKey).digest("hex").slice(0, 12).toUpperCase()}`;
    payment = { option: "demo_card", reference, cardLast4: input.payment.cardLast4, cardBrand: input.payment.cardBrand };
  } else payment = { option: "pay_at_pickup" };

  const res = await placeOrder({ ...input, payment }, ip);
  if (!res.ok) return json({ error: res.error, fieldErrors: res.fieldErrors }, res.status);
  return json({ number: res.data.order.number, token: res.data.token }, 201);
}
