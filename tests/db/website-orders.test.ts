import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import { POST as quotePOST } from "@/app/api/public/v1/cart/quote/route";
import { GET as lensesGET } from "@/app/api/public/v1/lenses/route";
import { POST as cancelPOST } from "@/app/api/public/v1/orders/[number]/cancel/route";
import { GET as orderGET } from "@/app/api/public/v1/orders/[number]/route";
import { POST as lookupPOST } from "@/app/api/public/v1/orders/lookup/route";
import { POST as orderPOST } from "@/app/api/public/v1/orders/route";
import { GET as siteGET } from "@/app/api/public/v1/site/route";
import { getDb } from "@/server/db";
import { businesses, customers, inventoryBalances, payments, products, saleItems, sales, stockReservations, websiteOrders } from "@/server/db/schema";
import { createSiteKey } from "@/server/services/public-api";
import { createBusiness, lensProduct, serviceProduct, stockProduct, type Fixture } from "./fixtures";

const BASE = "http://dash.test/api/public/v1";
const json = (path: string, body: unknown, key: string, extra: Record<string, string> = {}) =>
  new Request(`${BASE}${path}`, { method: "POST", headers: { authorization: `Bearer ${key}`, "content-type": "application/json", ...extra }, body: JSON.stringify(body) });
const get = (path: string, key: string, extra: Record<string, string> = {}) => new Request(`${BASE}${path}`, { headers: { authorization: `Bearer ${key}`, ...extra } });
const numberCtx = (number: string) => ({ params: Promise.resolve({ number }) }) as RouteContext<"/api/public/v1/orders/[number]">;

let f: Fixture;
let key: string;
let frame: { productId: string; variantId: string };
let lens: { productId: string; variantId: string };
let care: { productId: string; variantId: string };
let hidden: { productId: string; variantId: string };
let exam: { productId: string; variantId: string };

async function publish(productId: string) {
  await getDb().update(products).set({ showOnWebsite: true }).where(and(eq(products.businessId, f.businessId), eq(products.id, productId)));
}
async function setOrdering(enabled: boolean) {
  await getDb().update(businesses).set({ settings: { maxStaffDiscountBps: 2000, websiteOrders: { enabled } } }).where(eq(businesses.id, f.businessId));
}
async function available(variantId: string, locationId = f.main.locationId) {
  const [b] = await getDb().select().from(inventoryBalances).where(and(eq(inventoryBalances.variantId, variantId), eq(inventoryBalances.locationId, locationId)));
  return b ? b.onHand - b.reserved : 0;
}

const FRAME = 2950;
const LENS = 2000;

function order(overrides: Record<string, unknown> = {}) {
  return {
    idempotencyKey: randomUUID(),
    branchId: f.main.id,
    customer: { fullName: "Ana Reyes Santos", email: `ana-${randomUUID().slice(0, 6)}@example.com`, phone: "0917 123 4567" },
    items: [{ variantId: frame.variantId, quantity: 1, lensVariantId: lens.variantId, prescription: { mode: "send_later" } }],
    payment: { option: "pay_at_pickup" },
    expectedTotalCents: (FRAME + LENS) * 100,
    ...overrides,
  };
}

beforeAll(async () => {
  f = await createBusiness("Web");
  key = (await createSiteKey(f.businessId, "Website")).key;
  frame = await stockProduct(f, { name: "Arden 101", price: FRAME, qty: 12 });
  lens = await lensProduct(f, LENS, 700);
  care = await stockProduct(f, { name: "Lens Cloth", price: 120, qty: 20 });
  hidden = await stockProduct(f, { name: "Unpublished", price: 1000, qty: 5 });
  exam = await serviceProduct(f, 500);
  for (const p of [frame, lens, care, exam]) await publish(p.productId);
  await setOrdering(true);
});

describe("lenses and quotes", () => {
  it("lists published prescription lenses with a type, and /site says ordering is on", async () => {
    const res = await lensesGET(get("/lenses", key));
    expect(res.status).toBe(200);
    const { lenses } = await res.json();
    expect(lenses).toEqual([expect.objectContaining({ variantId: lens.variantId, priceCents: LENS * 100, type: "single_vision" })]);
    const site = await (await siteGET(get("/site", key))).json();
    expect(site.ordering).toMatchObject({ enabled: true, fulfilment: ["pickup"], demoPayments: true });
  });

  it("prices the bag from the catalogue and says which branches can fulfil it, without stock counts", async () => {
    const res = await quotePOST(json("/cart/quote", { items: [{ variantId: frame.variantId, quantity: 1, lensVariantId: lens.variantId }, { variantId: care.variantId, quantity: 2 }] }, key));
    expect(res.status).toBe(200);
    const q = await res.json();
    expect(q.totalCents).toBe((FRAME + LENS + 240) * 100);
    expect(q.lines.map((l: { variantId: string }) => l.variantId)).toEqual([frame.variantId, lens.variantId, care.variantId]);
    const main = q.branches.find((b: { branchId: string }) => b.branchId === f.main.id);
    const second = q.branches.find((b: { branchId: string }) => b.branchId === f.second.id);
    expect(main.canFulfil).toBe(true);
    expect(second.canFulfil).toBe(false);
    expect(second.unavailableVariantIds.sort()).toEqual([frame.variantId, care.variantId].sort());
    expect(JSON.stringify(q)).not.toMatch(/onHand|reserved|cost/i);
  });

  it("refuses unpublished items, services on their own, and lenses on non-frames", async () => {
    expect((await quotePOST(json("/cart/quote", { items: [{ variantId: hidden.variantId, quantity: 1 }] }, key))).status).toBe(400);
    expect((await quotePOST(json("/cart/quote", { items: [{ variantId: exam.variantId, quantity: 1 }] }, key))).status).toBe(400);
    expect((await quotePOST(json("/cart/quote", { items: [{ variantId: lens.variantId, quantity: 1 }] }, key))).status).toBe(400);
  });
});

describe("placing orders", () => {
  it("creates a confirmed website order with stock reserved, a new customer and a status link", async () => {
    const before = await available(frame.variantId);
    const body = order();
    const res = await orderPOST(json("/orders", body, key, { "x-client-ip": "203.0.113.7" }));
    expect(res.status).toBe(201);
    const out = await res.json();
    expect(out.order.number).toMatch(/^ORD-/);
    expect(out.order).toMatchObject({ status: "open", stage: "confirmed", paymentStatus: "unpaid", paymentOption: "pay_at_pickup", totalCents: (FRAME + LENS) * 100, balanceDueCents: (FRAME + LENS) * 100, canCancel: true });
    expect(out.token).toMatch(/^[A-Za-z0-9_-]{32}$/);
    expect(await available(frame.variantId)).toBe(before - 1);

    const [sale] = await getDb().select().from(sales).where(and(eq(sales.businessId, f.businessId), eq(sales.number, out.order.number)));
    expect(sale).toMatchObject({ kind: "order", channel: "website", fulfillmentStatus: "confirmed", soldByMembershipId: null });
    const items = await getDb().select().from(saleItems).where(eq(saleItems.saleId, sale.id));
    expect(items.map((i) => i.productType)).toEqual(["stock", "made_to_order"]);
    expect(items[1].notes).toMatch(/For Arden 101.*customer will send it/);
    const reservations = await getDb().select().from(stockReservations).where(eq(stockReservations.saleId, sale.id));
    expect(reservations).toEqual([expect.objectContaining({ variantId: frame.variantId, quantity: 1, status: "active" })]);
    const [cust] = await getDb().select().from(customers).where(eq(customers.id, sale.customerId!));
    expect(cust).toMatchObject({ firstName: "Ana", lastName: "Reyes Santos", email: body.customer.email, source: "website" });
    const [web] = await getDb().select().from(websiteOrders).where(eq(websiteOrders.saleId, sale.id));
    expect(web.accessTokenHash).toMatch(/^[0-9a-f]{64}$/);
    expect(web.accessTokenHash).not.toContain(out.token);
    expect(web.clientIp).toBe("203.0.113.7");

    // The customer's view needs the token; a wrong token looks exactly like a wrong number.
    const ok = await orderGET(get(`/orders/${out.order.number}`, key, { "x-order-token": out.token }), numberCtx(out.order.number));
    expect(ok.status).toBe(200);
    const view = await ok.json();
    expect(view.order.items).toHaveLength(2);
    expect(JSON.stringify(view)).not.toMatch(/cost|onHand|accessTokenHash/i);
    expect((await orderGET(get(`/orders/${out.order.number}`, key, { "x-order-token": "wrong-token-wrong-token-wrong-tok" }), numberCtx(out.order.number))).status).toBe(404);
    expect((await orderGET(get(`/orders/${out.order.number}`, key), numberCtx(out.order.number))).status).toBe(404);
  });

  it("is idempotent: a retried checkout returns the same order and link; reusing the key with other details is refused", async () => {
    const body = order();
    const first = await (await orderPOST(json("/orders", body, key))).json();
    const again = await orderPOST(json("/orders", body, key));
    expect(again.status).toBe(201);
    const second = await again.json();
    expect(second.order.number).toBe(first.order.number);
    expect(second.token).toBe(first.token);
    expect(second.replayed).toBe(true);
    const changed = await orderPOST(json("/orders", { ...body, items: [{ variantId: care.variantId, quantity: 1 }], expectedTotalCents: 12000 }, key));
    expect(changed.status).toBe(409);
  });

  it("records the simulated card payment as online_demo (not charged) and marks the order paid", async () => {
    const res = await orderPOST(json("/orders", order({ payment: { option: "demo_card", reference: "DEMO-7K2Q9XWA", cardLast4: "4242", cardBrand: "Visa" } }), key));
    expect(res.status).toBe(201);
    const out = await res.json();
    expect(out.order).toMatchObject({ paymentStatus: "paid", balanceDueCents: 0, canCancel: false });
    const [sale] = await getDb().select().from(sales).where(and(eq(sales.businessId, f.businessId), eq(sales.number, out.order.number)));
    const pay = await getDb().select().from(payments).where(eq(payments.saleId, sale.id));
    expect(pay).toEqual([expect.objectContaining({ method: "online_demo", amountCents: (FRAME + LENS) * 100, reference: "DEMO-7K2Q9XWA", receivedByMembershipId: null })]);
    expect(pay[0].notes).toMatch(/No money was charged/);
  });

  it("refuses an order whose prices changed, or that the branch can't fulfil, without writing anything", async () => {
    const count = async () => (await getDb().select({ id: sales.id }).from(sales).where(eq(sales.businessId, f.businessId))).length;
    const n = await count();
    const stale = await orderPOST(json("/orders", order({ expectedTotalCents: 100 }), key));
    expect(stale.status).toBe(409);
    expect((await stale.json()).error).toMatch(/Prices changed/);
    const tooMany = await orderPOST(json("/orders", order({ items: [{ variantId: frame.variantId, quantity: 10 }], expectedTotalCents: FRAME * 10 * 100 }), key));
    expect(tooMany.status).toBe(409);
    expect((await tooMany.json()).error).toMatch(/sold out/);
    const elsewhere = await orderPOST(json("/orders", order({ branchId: f.second.id }), key));
    expect(elsewhere.status).toBe(409);
    expect(await count()).toBe(n);
  });

  it("matches a returning customer by email without changing their record", async () => {
    const email = `returning-${randomUUID().slice(0, 6)}@example.com`;
    const a = await (await orderPOST(json("/orders", order({ customer: { fullName: "Bea Cruz", email, phone: "0917 555 0001" }, items: [{ variantId: care.variantId, quantity: 1 }], expectedTotalCents: 12000 }), key))).json();
    const b = await (await orderPOST(json("/orders", order({ customer: { fullName: "Someone Else", email: email.toUpperCase(), phone: "0917 555 0002" }, items: [{ variantId: care.variantId, quantity: 1 }], expectedTotalCents: 12000 }), key))).json();
    const rows = await getDb().select().from(sales).where(and(eq(sales.businessId, f.businessId), eq(sales.number, a.order.number)));
    const rows2 = await getDb().select().from(sales).where(and(eq(sales.businessId, f.businessId), eq(sales.number, b.order.number)));
    expect(rows2[0].customerId).toBe(rows[0].customerId);
    const [c] = await getDb().select().from(customers).where(eq(customers.id, rows[0].customerId!));
    expect(c.firstName).toBe("Bea");
    expect(c.phone).toMatch(/0001$/);
  });

  it("validates typed prescriptions and keeps them on the website order, not in clinical records", async () => {
    const bad = await orderPOST(json("/orders", order({ items: [{ variantId: frame.variantId, quantity: 1, lensVariantId: lens.variantId, prescription: { mode: "enter", od: { sph: "-2.30" }, os: { sph: "-2.00", cyl: "-0.75" }, pd: "63" } }] }), key));
    expect(bad.status).toBe(400);
    const errors = (await bad.json()).fieldErrors;
    expect(Object.keys(errors).join(" ")).toMatch(/od\.sph/);
    expect(Object.keys(errors).join(" ")).toMatch(/os\.axis/);

    const good = await orderPOST(json("/orders", order({ items: [{ variantId: frame.variantId, quantity: 1, lensVariantId: lens.variantId, prescription: { mode: "enter", od: { sph: "-2.25", cyl: "", axis: "" }, os: { sph: "-2", cyl: "-0.75", axis: "90", add: "" }, pd: "63", issuedOn: "2026-08-01" } }] }), key));
    expect(good.status).toBe(201);
    const out = await good.json();
    expect(out.order.prescriptions[0]).toMatchObject({ mode: "enter", values: { od: { sph: "-2.25", cyl: null }, os: { sph: "-2.00", cyl: "-0.75", axis: "90" }, pd: "63.0" } });
    const missing = await orderPOST(json("/orders", order({ items: [{ variantId: frame.variantId, quantity: 1, lensVariantId: lens.variantId }] }), key));
    expect(missing.status).toBe(400);
  });

  it("lets the customer cancel an unpaid order before work starts, releasing the reserved frame", async () => {
    const out = await (await orderPOST(json("/orders", order(), key))).json();
    const held = await available(frame.variantId);
    const ctx = numberCtx(out.order.number) as unknown as RouteContext<"/api/public/v1/orders/[number]/cancel">;
    expect((await cancelPOST(json(`/orders/${out.order.number}/cancel`, {}, key, { "x-order-token": "nope-nope-nope-nope-nope-nope-no" }), ctx)).status).toBe(404);
    const res = await cancelPOST(json(`/orders/${out.order.number}/cancel`, {}, key, { "x-order-token": out.token }), ctx);
    expect(res.status).toBe(200);
    const view = await res.json();
    expect(view.order).toMatchObject({ status: "cancelled", cancelledByCustomer: true, canCancel: false });
    expect(await available(frame.variantId)).toBe(held + 1);
    // Cancelling twice is harmless.
    expect((await cancelPOST(json(`/orders/${out.order.number}/cancel`, {}, key, { "x-order-token": out.token }), ctx)).status).toBe(200);
  });
});

describe("find my order", () => {
  it("gives back the status link for the right number and email only", async () => {
    const body = order();
    const out = await (await orderPOST(json("/orders", body, key))).json();
    const ok = await lookupPOST(json("/orders/lookup", { number: out.order.number.toLowerCase(), email: body.customer.email.toUpperCase() }, key));
    expect(ok.status).toBe(200);
    expect(await ok.json()).toEqual({ number: out.order.number, token: out.token });
    expect((await lookupPOST(json("/orders/lookup", { number: out.order.number, email: "someone@example.com" }, key))).status).toBe(404);
    expect((await lookupPOST(json("/orders/lookup", { number: "ORD-999999", email: body.customer.email }, key))).status).toBe(404);
  });
});

describe("guards", () => {
  it("needs the orders scopes", async () => {
    const readOnly = await createSiteKey(f.businessId, "Read only", ["site:read", "catalog:read"]);
    expect((await orderPOST(json("/orders", order(), readOnly.key))).status).toBe(403);
  });

  it("drops honeypot submissions and refuses orders while ordering is switched off", async () => {
    expect((await orderPOST(json("/orders", order({ website: "spam" }), key))).status).toBe(400);
    await setOrdering(false);
    try {
      const res = await orderPOST(json("/orders", order(), key));
      expect(res.status).toBe(403);
      const site = await (await siteGET(get("/site", key))).json();
      expect(site.ordering.enabled).toBe(false);
    } finally {
      await setOrdering(true);
    }
  });
});
