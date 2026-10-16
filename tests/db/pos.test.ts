import { and, eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import { getDb } from "@/server/db";
import { inventoryBalances, posHeldCarts, stockReservations } from "@/server/db/schema";
import { receiptPdf } from "@/server/receipt-pdf";
import * as customers from "@/server/services/customers";
import * as pos from "@/server/services/pos";
import * as sales from "@/server/services/sales";
import { createBusiness, customer, key, serviceProduct, stockProduct, type Fixture } from "./fixtures";

let f: Fixture;
let other: Fixture;
beforeAll(async () => {
  f = await createBusiness("Pos");
  other = await createBusiness("PosOther");
});

async function onHand(variantId: string, locationId: string) {
  const [b] = await getDb()
    .select({ onHand: inventoryBalances.onHand, reserved: inventoryBalances.reserved })
    .from(inventoryBalances)
    .where(and(eq(inventoryBalances.variantId, variantId), eq(inventoryBalances.locationId, locationId)));
  return b ?? { onHand: 0, reserved: 0 };
}

describe("quoteCart (pre-checkout validation)", () => {
  it("prices on the server like checkout, reports stock and discount problems, and writes nothing", async () => {
    const frame = await stockProduct(f, { price: 1120, qty: 2 });
    const exam = await serviceProduct(f, 500, true);
    const q = await sales.quoteCart(f.ctx.sales, { branchId: f.main.id, items: [{ variantId: frame.variantId, quantity: 2 }, { variantId: exam.variantId, quantity: 1 }] });
    expect(q.totalCents).toBe(274000);
    expect(q.taxCents).toBe(24000);
    expect(q.problems).toEqual([]);
    expect(q.available[frame.variantId]).toBe(2);

    const short = await sales.quoteCart(f.ctx.sales, { branchId: f.main.id, items: [{ variantId: frame.variantId, quantity: 3 }] });
    expect(short.problems.join(" ")).toMatch(/only 2 left/);
    const discounted = await sales.quoteCart(f.ctx.sales, { branchId: f.main.id, items: [{ variantId: frame.variantId, quantity: 1 }], orderDiscount: { type: "percent", valueBps: 3000 } });
    expect(discounted.problems.join(" ")).toMatch(/Discounts above 20%/);
    // A manager may exceed the staff limit.
    const managerQuote = await sales.quoteCart(f.ctx.manager, { branchId: f.main.id, items: [{ variantId: frame.variantId, quantity: 1 }], orderDiscount: { type: "percent", valueBps: 3000 } });
    expect(managerQuote.problems).toEqual([]);

    expect(await onHand(frame.variantId, f.main.locationId)).toEqual({ onHand: 2, reserved: 0 });
  });

  it("rejects another business's products and branches", async () => {
    const foreign = await stockProduct(other, { qty: 5 });
    await expect(sales.quoteCart(f.ctx.sales, { branchId: f.main.id, items: [{ variantId: foreign.variantId, quantity: 1 }] })).rejects.toThrow(/no longer exists/);
    const mine = await stockProduct(f, { qty: 5 });
    await expect(sales.quoteCart(f.ctx.sales, { branchId: other.main.id, items: [{ variantId: mine.variantId, quantity: 1 }] })).rejects.toThrow(/active branch/);
  });
});

describe("held carts", () => {
  it("hold → list → resume exactly once, without reserving or deducting stock", async () => {
    const frame = await stockProduct(f, { qty: 1 });
    const c = await customer(f, "Held Person");
    const held = await pos.holdCart(f.ctx.sales, { branchId: f.main.id, customerId: c.id, lines: [{ variantId: frame.variantId, qty: 1 }], estimatedTotalCents: 100000 });
    expect(held!.label).toBe("Held Person");
    expect(await onHand(frame.variantId, f.main.locationId)).toEqual({ onHand: 1, reserved: 0 });
    expect(await getDb().select().from(stockReservations).where(eq(stockReservations.variantId, frame.variantId))).toHaveLength(0);

    // The held unit can still be sold to someone else: holds never block stock.
    await sales.checkout(f.ctx.sales, { branchId: f.main.id, items: [{ variantId: frame.variantId, quantity: 1 }], payments: [{ method: "cash", amountCents: 100000 }], idempotencyKey: key() });

    const list = await pos.listHeldCarts(f.ctx.sales, f.main.id);
    expect(list.find((r) => r.id === held!.id)).toMatchObject({ label: "Held Person", itemCount: 1, customerName: "Held Person" });
    expect(await pos.listHeldCarts(f.ctx.sales, f.second.id)).toEqual([]);

    const resumed = await pos.resumeHeldCart(f.ctx.manager, held!.id);
    expect(resumed!.cart.lines).toEqual([{ variantId: frame.variantId, qty: 1, customPriceCents: null, discount: null }]);
    expect(resumed!.customer?.id).toBe(c.id);
    // Checkout re-checks stock: the unit sold meanwhile.
    await expect(sales.quoteCart(f.ctx.sales, { branchId: f.main.id, items: [{ variantId: frame.variantId, quantity: 1 }] })).resolves.toMatchObject({ problems: [expect.stringMatching(/only 0 left/)] });

    await expect(pos.resumeHeldCart(f.ctx.sales, held!.id)).rejects.toThrow(/already resumed/);
    await expect(pos.cancelHeldCart(f.ctx.sales, held!.id)).rejects.toThrow(/no longer on hold/);
  });

  it("concurrent resumes of one cart: exactly one wins", async () => {
    const frame = await stockProduct(f, { qty: 3 });
    const held = await pos.holdCart(f.ctx.sales, { branchId: f.main.id, lines: [{ variantId: frame.variantId, qty: 2 }] });
    const results = await Promise.allSettled([pos.resumeHeldCart(f.ctx.sales, held!.id), pos.resumeHeldCart(f.ctx.manager, held!.id), pos.resumeHeldCart(f.ctx.owner, held!.id)]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
  });

  it("expires holds, discards on request, and isolates businesses", async () => {
    const frame = await stockProduct(f, { qty: 3 });
    const a = await pos.holdCart(f.ctx.sales, { branchId: f.main.id, label: "Old", lines: [{ variantId: frame.variantId, qty: 1 }] });
    await getDb().update(posHeldCarts).set({ expiresAt: new Date(Date.now() - 1000) }).where(eq(posHeldCarts.id, a!.id));
    expect((await pos.listHeldCarts(f.ctx.sales, f.main.id)).some((r) => r.id === a!.id)).toBe(false);
    await expect(pos.resumeHeldCart(f.ctx.sales, a!.id)).rejects.toThrow();

    const b = await pos.holdCart(f.ctx.sales, { branchId: f.main.id, label: "Discard me", lines: [{ variantId: frame.variantId, qty: 1 }] });
    await expect(pos.cancelHeldCart(other.ctx.owner, b!.id)).rejects.toThrow();
    await expect(pos.resumeHeldCart(other.ctx.owner, b!.id)).rejects.toThrow(/not found/i);
    await pos.cancelHeldCart(f.ctx.sales, b!.id);
    expect((await pos.listHeldCarts(f.ctx.sales, f.main.id)).some((r) => r.id === b!.id)).toBe(false);

    const foreign = await stockProduct(other, { qty: 1 });
    await expect(pos.holdCart(f.ctx.sales, { branchId: f.main.id, lines: [{ variantId: foreign.variantId, qty: 1 }] })).rejects.toThrow(/no longer exists/);
    await expect(pos.holdCart(f.ctx.sales, { branchId: other.main.id, lines: [{ variantId: frame.variantId, qty: 1 }] })).rejects.toThrow(/active branch/);
  });
});

describe("counter insights and customer context", () => {
  it("summarises popular items, low stock, repeat customers, balances and recent sales from real records", async () => {
    const g = await createBusiness("Insights");
    const popular = await stockProduct(g, { name: "Popular Frame", qty: 20, price: 1000 });
    const low = await stockProduct(g, { name: "Nearly Gone", qty: 1, reorderPoint: 2 });
    const c = await customer(g, "Repeat Buyer");
    for (let i = 0; i < 3; i++) {
      await sales.checkout(g.ctx.sales, { branchId: g.main.id, customerId: c.id, items: [{ variantId: popular.variantId, quantity: 2 }], payments: [{ method: "cash", amountCents: 200000 }], idempotencyKey: key() });
    }
    // A sale with a balance due.
    const owed = await sales.checkout(g.ctx.sales, { branchId: g.main.id, customerId: c.id, items: [{ variantId: popular.variantId, quantity: 1 }], payments: [{ method: "gcash", amountCents: 40000, reference: "GC-1" }], idempotencyKey: key() });

    const ins = await pos.posInsights(g.ctx.sales, g.main.id);
    expect(ins.popular[0]).toMatchObject({ variantId: popular.variantId, quantity: 7 });
    expect(ins.lowStock.map((l) => l.variantId)).toContain(low.variantId);
    expect(ins.lowStock.map((l) => l.variantId)).not.toContain(popular.variantId);
    expect(ins.repeatCustomers[0]).toMatchObject({ customerId: c.id, visits: 4 });
    expect(ins.outstanding).toMatchObject({ count: 1, totalCents: 60000 });
    expect(ins.outstanding.sales[0].saleId).toBe(owed.saleId);
    expect(ins.recent).toHaveLength(4);
    // Other branches and businesses don't leak in.
    expect((await pos.posInsights(g.ctx.sales, g.second.id)).popular).toEqual([]);
    await expect(pos.posInsights(f.ctx.sales, g.main.id)).rejects.toThrow(/active branch/);

    const cc = await pos.posCustomerContext(g.ctx.sales, c.id);
    expect(cc).toMatchObject({ visits: 4, outstanding: { count: 1, totalCents: 60000 } });
    expect(cc.recentItems[0].productName).toBe("Popular Frame");
    await expect(pos.posCustomerContext(f.ctx.sales, c.id)).rejects.toThrow(/not found/i);
  });
});

describe("customer recognition", () => {
  it("finds customers by phone whatever the formatting, and by email case-insensitively", async () => {
    const c = await customers.createCustomer(f.ctx.sales, { firstName: "Nina", lastName: "Reyes", phone: "+63 917 555 0101", email: "Nina.Reyes@Example.com" });
    for (const q of ["09175550101", "0917-555-0101", "917 555 0101", "5550101"]) {
      const hits = await customers.searchCustomers(f.ctx.sales, q);
      expect(hits.map((h) => h.id), q).toContain(c!.id);
    }
    const byEmail = await customers.findCustomerMatches(f.ctx.sales, { email: "nina.reyes@example.COM" });
    expect(byEmail).toEqual([expect.objectContaining({ id: c!.id, matchedOn: ["email"] })]);
    const byPhone = await customers.findCustomerMatches(f.ctx.sales, { phone: "0917 555 0101" });
    expect(byPhone[0]).toMatchObject({ id: c!.id, matchedOn: ["phone"] });
    // Another business never sees them.
    expect(await customers.findCustomerMatches(other.ctx.owner, { phone: "0917 555 0101" })).toEqual([]);
    expect(await customers.searchCustomers(other.ctx.owner, "09175550101")).toEqual([]);
  });

  it("refuses a duplicate from the staff form unless confirmed, and never for system imports", async () => {
    const first = await customers.createCustomer(f.ctx.sales, { firstName: "Leo", lastName: "Santos", phone: "0918 222 3333" }, undefined, { rejectDuplicates: true });
    await expect(customers.createCustomer(f.ctx.sales, { firstName: "Leonard", lastName: "Santos", phone: "+639182223333" }, undefined, { rejectDuplicates: true })).rejects.toThrow(/Leo Santos .* already has this phone/);
    // "Create anyway" (e.g. a family sharing one phone) and programmatic callers still work.
    const second = await customers.createCustomer(f.ctx.sales, { firstName: "Lea", lastName: "Santos", phone: "0918 222 3333" });
    expect(second!.id).not.toBe(first!.id);
  });
});

describe("receipt PDF", () => {
  it("renders a PDF with the sale, a not-an-official-receipt notice and the manual payment note", async () => {
    const frame = await stockProduct(f, { price: 1120, qty: 2, name: "Ñora Frame — “Classic”" });
    const c = await customer(f, "Zoë Cruz");
    const res = await sales.checkout(f.ctx.sales, { branchId: f.main.id, customerId: c.id, items: [{ variantId: frame.variantId, quantity: 1 }], payments: [{ method: "card", amountCents: 112000, reference: "APPR 1234" }], idempotencyKey: key() });
    const data = await sales.getSale(f.ctx.owner, res.saleId);
    const bytes = await receiptPdf(data, { name: "Test Optical", legalName: null, taxRegistration: "123-456", receiptFooter: null, taxName: "VAT", currency: "PHP", locale: "en-PH", timezone: "Asia/Manila" });
    const text = Buffer.from(bytes).toString("latin1");
    expect(text.startsWith("%PDF-")).toBe(true);
    expect(bytes.length).toBeGreaterThan(1000);
  });
});
