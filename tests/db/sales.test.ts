import { and, eq, sql } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import { getDb } from "@/server/db";
import { inventoryBalances, payments, stockMovements } from "@/server/db/schema";
import * as sales from "@/server/services/sales";
import { createBusiness, customer, key, lensProduct, serviceProduct, stockProduct, type Fixture } from "./fixtures";

let f: Fixture;
beforeAll(async () => {
  f = await createBusiness("Sales");
});

async function balance(variantId: string, locationId: string) {
  const [b] = await getDb()
    .select()
    .from(inventoryBalances)
    .where(and(eq(inventoryBalances.variantId, variantId), eq(inventoryBalances.locationId, locationId)));
  return b ?? { onHand: 0, reserved: 0 };
}

describe("POS checkout", () => {
  it("prices on the server from catalogue prices (VAT inclusive), deducts stock and records the movement and payment", async () => {
    const frame = await stockProduct(f, { price: 1120, cost: 400, qty: 5 });
    const exam = await serviceProduct(f, 500, true);
    const c = await customer(f);
    const res = await sales.checkout(f.ctx.sales, {
      branchId: f.main.id,
      customerId: c.id,
      items: [
        { variantId: frame.variantId, quantity: 2 },
        { variantId: exam.variantId, quantity: 1 },
      ],
      payments: [{ method: "cash", amountCents: 274000, tenderedCents: 300000 }],
      idempotencyKey: key(),
    });
    const detail = await sales.getSale(f.ctx.owner, res.saleId);
    // 2 × 1,120 + 500 = 2,740. VAT 12% inclusive on the frames only: 2,240 × 12/112 = 240.00.
    expect(detail.sale.totalCents).toBe(274000);
    expect(detail.sale.taxCents).toBe(24000);
    expect(detail.sale.paymentStatus).toBe("paid");
    expect(detail.sale.balanceDueCents).toBe(0);
    expect(detail.payments[0].payment.changeCents).toBe(26000);
    expect(detail.sale.costCents).toBe(80000);
    const bal = await balance(frame.variantId, f.main.locationId);
    expect(bal.onHand).toBe(3);
    const moves = await getDb().select().from(stockMovements).where(eq(stockMovements.referenceId, res.saleId));
    expect(moves).toHaveLength(1);
    expect(moves[0]).toMatchObject({ type: "sale", quantity: -2, onHandAfter: 3 });
  });

  it("is retry-safe: the same idempotency key never deducts stock or takes payment twice", async () => {
    const frame = await stockProduct(f, { qty: 4 });
    const input = { branchId: f.main.id, items: [{ variantId: frame.variantId, quantity: 1 }], payments: [{ method: "card" as const, amountCents: 100000, reference: `AUTH-${key()}` }], idempotencyKey: key() };
    const first = await sales.checkout(f.ctx.sales, input);
    const second = await sales.checkout(f.ctx.sales, input);
    expect(second.saleId).toBe(first.saleId);
    expect(second.replayed).toBe(true);
    expect((await balance(frame.variantId, f.main.locationId)).onHand).toBe(3);
    const pays = await getDb().select().from(payments).where(eq(payments.saleId, first.saleId));
    expect(pays).toHaveLength(1);
  });

  it("handles concurrent retries of the same request (one sale, one deduction)", async () => {
    const frame = await stockProduct(f, { qty: 5 });
    const input = { branchId: f.main.id, items: [{ variantId: frame.variantId, quantity: 1 }], payments: [{ method: "cash" as const, amountCents: 100000 }], idempotencyKey: key() };
    const results = await Promise.all([sales.checkout(f.ctx.sales, input), sales.checkout(f.ctx.sales, input), sales.checkout(f.ctx.sales, input)]);
    expect(new Set(results.map((r) => r.saleId)).size).toBe(1);
    expect((await balance(frame.variantId, f.main.locationId)).onHand).toBe(4);
  });

  it("never oversells: concurrent checkouts for the last unit — exactly one succeeds", async () => {
    const frame = await stockProduct(f, { qty: 1 });
    const attempt = () =>
      sales.checkout(f.ctx.sales, {
        branchId: f.main.id,
        items: [{ variantId: frame.variantId, quantity: 1 }],
        payments: [{ method: "cash", amountCents: 100000 }],
        idempotencyKey: key(),
      });
    const results = await Promise.allSettled([attempt(), attempt(), attempt(), attempt()]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const rejected = results.filter((r) => r.status === "rejected") as PromiseRejectedResult[];
    expect(rejected).toHaveLength(3);
    for (const r of rejected) expect(String(r.reason.message)).toMatch(/not enough stock/i);
    expect((await balance(frame.variantId, f.main.locationId)).onHand).toBe(0);
  });

  it("rejects a sale when stock is insufficient and writes nothing", async () => {
    const frame = await stockProduct(f, { qty: 2 });
    await expect(
      sales.checkout(f.ctx.sales, { branchId: f.main.id, items: [{ variantId: frame.variantId, quantity: 3 }], payments: [{ method: "cash", amountCents: 300000 }], idempotencyKey: key() }),
    ).rejects.toThrow(/not enough stock/i);
    expect((await balance(frame.variantId, f.main.locationId)).onHand).toBe(2);
  });

  it("requires a customer to leave a balance due and rejects overpayment", async () => {
    const frame = await stockProduct(f, { qty: 3 });
    await expect(
      sales.checkout(f.ctx.sales, { branchId: f.main.id, items: [{ variantId: frame.variantId, quantity: 1 }], payments: [{ method: "cash", amountCents: 50000 }], idempotencyKey: key() }),
    ).rejects.toThrow(/link a customer/i);
    await expect(
      sales.checkout(f.ctx.sales, { branchId: f.main.id, items: [{ variantId: frame.variantId, quantity: 1 }], payments: [{ method: "cash", amountCents: 150000 }], idempotencyKey: key() }),
    ).rejects.toThrow(/exceed/i);
  });

  it("enforces the staff discount limit; managers can exceed it", async () => {
    const frame = await stockProduct(f, { qty: 3 });
    const input = { branchId: f.main.id, items: [{ variantId: frame.variantId, quantity: 1 }], orderDiscount: { type: "percent" as const, valueBps: 3000 }, payments: [{ method: "cash" as const, amountCents: 70000 }] };
    await expect(sales.checkout(f.ctx.sales, { ...input, idempotencyKey: key() })).rejects.toThrow(/manager/i);
    const ok = await sales.checkout(f.ctx.manager, { ...input, idempotencyKey: key() });
    expect(ok.totalCents).toBe(70000);
  });

  it("allows a custom price and lab cost only on made-to-order lines", async () => {
    const lens = await lensProduct(f, 2000, 800);
    const frame = await stockProduct(f, { price: 1000, qty: 2 });
    const res = await sales.checkout(f.ctx.manager, {
      branchId: f.main.id,
      items: [
        { variantId: lens.variantId, quantity: 1, unitPriceCents: 350000, unitCostCents: 150000 },
        { variantId: frame.variantId, quantity: 1, unitPriceCents: 1 }, // ignored for stocked items
      ],
      payments: [{ method: "cash", amountCents: 450000 }],
      idempotencyKey: key(),
    });
    const s = await sales.getSale(f.ctx.owner, res.saleId);
    expect(s.items.find((i) => i.variantId === lens.variantId)).toMatchObject({ unitPriceCents: 350000, unitCostCents: 150000 });
    expect(s.items.find((i) => i.variantId === frame.variantId)!.unitPriceCents).toBe(100000);
  });
});

describe("payments", () => {
  it("tracks partial payments to fully paid, rejecting overpayment and duplicate references", async () => {
    const frame = await stockProduct(f, { price: 3000, qty: 2 });
    const c = await customer(f);
    const sale = await sales.checkout(f.ctx.sales, {
      branchId: f.main.id,
      customerId: c.id,
      items: [{ variantId: frame.variantId, quantity: 1 }],
      payments: [{ method: "gcash", amountCents: 100000, reference: `GC-${key()}` }],
      idempotencyKey: key(),
    });
    let s = (await sales.getSale(f.ctx.owner, sale.saleId)).sale;
    expect(s.paymentStatus).toBe("partially_paid");
    expect(s.balanceDueCents).toBe(200000);

    await expect(sales.recordPayment(f.ctx.sales, { saleId: sale.saleId, method: "cash", amountCents: 250000, idempotencyKey: key() })).rejects.toThrow(/balance due/i);

    const ref = `GC-${key()}`;
    await sales.recordPayment(f.ctx.sales, { saleId: sale.saleId, method: "gcash", amountCents: 120000, reference: ref, idempotencyKey: key() });
    await expect(sales.recordPayment(f.ctx.sales, { saleId: sale.saleId, method: "gcash", amountCents: 10000, reference: ref, idempotencyKey: key() })).rejects.toThrow(/already been recorded/i);
    s = (await sales.getSale(f.ctx.owner, sale.saleId)).sale;
    expect(s.balanceDueCents).toBe(80000);

    const payKey = key();
    await sales.recordPayment(f.ctx.sales, { saleId: sale.saleId, method: "cash", amountCents: 80000, idempotencyKey: payKey });
    const replay = await sales.recordPayment(f.ctx.sales, { saleId: sale.saleId, method: "cash", amountCents: 80000, idempotencyKey: payKey });
    expect(replay.replayed).toBe(true);
    s = (await sales.getSale(f.ctx.owner, sale.saleId)).sale;
    expect(s).toMatchObject({ paymentStatus: "paid", balanceDueCents: 0, paidCents: 300000 });
  });

  it("voiding a payment restores the balance", async () => {
    const frame = await stockProduct(f, { price: 1000, qty: 2 });
    const c = await customer(f);
    const sale = await sales.checkout(f.ctx.sales, { branchId: f.main.id, customerId: c.id, items: [{ variantId: frame.variantId, quantity: 1 }], payments: [{ method: "cash", amountCents: 100000 }], idempotencyKey: key() });
    const detail = await sales.getSale(f.ctx.owner, sale.saleId);
    await expect(sales.voidPayment(f.ctx.sales, detail.payments[0].payment.id, "Bounced")).rejects.toThrow(/permission/i);
    await sales.voidPayment(f.ctx.manager, detail.payments[0].payment.id, "Entered on the wrong sale");
    const after = (await sales.getSale(f.ctx.owner, sale.saleId)).sale;
    expect(after).toMatchObject({ paidCents: 0, balanceDueCents: 100000, paymentStatus: "unpaid" });
  });
});

describe("refunds and cancellation", () => {
  it("refunds a returned item: restocks it, reverses its cost and reduces the sale value", async () => {
    const frame = await stockProduct(f, { price: 1120, cost: 500, qty: 3 });
    const sale = await sales.checkout(f.ctx.sales, { branchId: f.main.id, items: [{ variantId: frame.variantId, quantity: 2 }], payments: [{ method: "cash", amountCents: 224000 }], idempotencyKey: key() });
    const line = (await sales.getSale(f.ctx.owner, sale.saleId)).items[0];
    await expect(sales.refundSale(f.ctx.sales, { saleId: sale.saleId, items: [{ saleItemId: line.id, quantity: 1, restock: true }], method: "cash", reason: "x", idempotencyKey: key() })).rejects.toThrow(/permission/i);
    const r = await sales.refundSale(f.ctx.manager, { saleId: sale.saleId, items: [{ saleItemId: line.id, quantity: 1, restock: true }], method: "cash", reason: "Changed mind", idempotencyKey: key() });
    expect(r.number).toMatch(/^RF-/);
    const s = await sales.getSale(f.ctx.owner, sale.saleId);
    expect(s.sale).toMatchObject({ refundedCents: 112000, refundedCashCents: 112000, balanceDueCents: 0 });
    expect(s.refunds[0].refund).toMatchObject({ amountCents: 112000, taxCents: 12000, costReversalCents: 50000, affectsRevenue: true });
    expect((await balance(frame.variantId, f.main.locationId)).onHand).toBe(2);
    // Can't return more than was sold.
    await expect(
      sales.refundSale(f.ctx.manager, { saleId: sale.saleId, items: [{ saleItemId: line.id, quantity: 2, restock: true }], method: "cash", reason: "again", idempotencyKey: key() }),
    ).rejects.toThrow(/can still be returned/i);
  });

  it("records damaged returns without restocking and caps cash refunds at what was collected", async () => {
    const frame = await stockProduct(f, { price: 2000, qty: 2 });
    const c = await customer(f);
    const sale = await sales.checkout(f.ctx.sales, { branchId: f.main.id, customerId: c.id, items: [{ variantId: frame.variantId, quantity: 1 }], payments: [{ method: "cash", amountCents: 50000 }], idempotencyKey: key() });
    const line = (await sales.getSale(f.ctx.owner, sale.saleId)).items[0];
    await expect(
      sales.refundSale(f.ctx.manager, { saleId: sale.saleId, items: [{ saleItemId: line.id, quantity: 1, restock: false }], method: "cash", reason: "Broken", idempotencyKey: key() }),
    ).rejects.toThrow(/has been collected/i);
    // Credit the unpaid part to the balance instead.
    await sales.refundSale(f.ctx.manager, { saleId: sale.saleId, items: [], amountCents: 150000, method: "balance_adjustment", reason: "Broken — balance waived", idempotencyKey: key() });
    const s = (await sales.getSale(f.ctx.owner, sale.saleId)).sale;
    expect(s.balanceDueCents).toBe(0);
    expect(s.refundedCashCents).toBe(0);
    expect((await balance(frame.variantId, f.main.locationId)).onHand).toBe(1);
  });

  it("cancels an unpaid POS sale and returns the stock", async () => {
    const frame = await stockProduct(f, { qty: 2 });
    const c = await customer(f);
    const sale = await sales.checkout(f.ctx.sales, { branchId: f.main.id, customerId: c.id, items: [{ variantId: frame.variantId, quantity: 1 }], payments: [], idempotencyKey: key() });
    expect((await balance(frame.variantId, f.main.locationId)).onHand).toBe(1);
    await sales.cancelSale(f.ctx.manager, sale.saleId, "Rang up by mistake");
    const s = (await sales.getSale(f.ctx.owner, sale.saleId)).sale;
    expect(s).toMatchObject({ status: "cancelled", balanceDueCents: 0 });
    expect((await balance(frame.variantId, f.main.locationId)).onHand).toBe(2);
    await expect(sales.cancelSale(f.ctx.manager, sale.saleId, "again")).rejects.toThrow(/already cancelled/i);
  });

  it("won't cancel a sale that has money collected", async () => {
    const frame = await stockProduct(f, { qty: 2 });
    const sale = await sales.checkout(f.ctx.sales, { branchId: f.main.id, items: [{ variantId: frame.variantId, quantity: 1 }], payments: [{ method: "cash", amountCents: 100000 }], idempotencyKey: key() });
    await expect(sales.cancelSale(f.ctx.manager, sale.saleId, "oops")).rejects.toThrow(/refund/i);
  });

  it("keeps stored totals equal to the sum of payments and refunds", async () => {
    const res = await getDb().execute<{ n: number }>(sql`
      select count(*)::int as n from sales s where s.business_id = ${f.businessId}
      and (s.paid_cents <> (select coalesce(sum(amount_cents),0) from payments p where p.sale_id = s.id and p.status = 'completed')
        or s.balance_due_cents <> case when s.status = 'cancelled' then 0 else s.total_cents - s.paid_cents - (s.refunded_cents - s.refunded_cash_cents) end)`);
    expect(Number(res.rows[0].n)).toBe(0);
  });
});
