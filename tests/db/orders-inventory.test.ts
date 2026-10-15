import { and, eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import { getDb } from "@/server/db";
import { inventoryBalances, productVariants, stockMovements, stockReservations } from "@/server/db/schema";
import * as inventory from "@/server/services/inventory";
import * as purchasing from "@/server/services/purchasing";
import * as sales from "@/server/services/sales";
import { createBusiness, customer, key, lensProduct, stockProduct, type Fixture } from "./fixtures";

let f: Fixture;
beforeAll(async () => {
  f = await createBusiness("Ops");
});

async function bal(variantId: string, locationId: string) {
  const [b] = await getDb()
    .select()
    .from(inventoryBalances)
    .where(and(eq(inventoryBalances.variantId, variantId), eq(inventoryBalances.locationId, locationId)));
  return b ? { onHand: b.onHand, reserved: b.reserved, available: b.onHand - b.reserved } : { onHand: 0, reserved: 0, available: 0 };
}

describe("customer orders: reservation, fulfilment and consumption", () => {
  it("reserves stock at confirmation, keeps it unsellable, and consumes it only at handover", async () => {
    const frame = await stockProduct(f, { price: 3000, qty: 1 });
    const lens = await lensProduct(f, 2000, 800);
    const c = await customer(f);
    const order = await sales.createOrder(f.ctx.sales, {
      branchId: f.main.id,
      customerId: c.id,
      items: [
        { variantId: frame.variantId, quantity: 1 },
        { variantId: lens.variantId, quantity: 1 },
      ],
      deposit: { method: "cash", amountCents: 250000 },
      dueOn: null,
      idempotencyKey: key(),
    });
    let s = await sales.getSale(f.ctx.owner, order.saleId);
    expect(s.sale).toMatchObject({ status: "open", fulfillmentStatus: "new", paidCents: 250000, balanceDueCents: 250000, paymentStatus: "partially_paid" });
    expect(await bal(frame.variantId, f.main.locationId)).toMatchObject({ onHand: 1, reserved: 0 });

    await sales.transitionOrder(f.ctx.sales, order.saleId, "confirmed");
    expect(await bal(frame.variantId, f.main.locationId)).toMatchObject({ onHand: 1, reserved: 1, available: 0 });

    // The reserved frame can't be sold at the counter.
    await expect(
      sales.checkout(f.ctx.sales, { branchId: f.main.id, items: [{ variantId: frame.variantId, quantity: 1 }], payments: [{ method: "cash", amountCents: 300000 }], idempotencyKey: key() }),
    ).rejects.toThrow(/not enough stock/i);
    // …nor written off.
    await expect(
      inventory.adjustStock(f.ctx.inventory, { variantId: frame.variantId, locationId: f.main.locationId, mode: "damage", quantity: 1, reason: "Scratched", idempotencyKey: key() }),
    ).rejects.toThrow(/reserved/i);

    await expect(sales.transitionOrder(f.ctx.sales, order.saleId, "completed")).rejects.toThrow(/can't move/i);
    for (const stage of ["processing", "awaiting_lab", "ready_for_pickup"] as const) await sales.transitionOrder(f.ctx.sales, order.saleId, stage);
    s = await sales.getSale(f.ctx.owner, order.saleId);
    expect(s.sale.status).toBe("open");
    expect(s.sale.completedAt).toBeNull();
    expect(s.history.some((h) => /messaging not configured/i.test(h.summary))).toBe(true);

    // Paid ≠ fulfilled: settle the balance while still not handed over.
    await sales.recordPayment(f.ctx.sales, { saleId: order.saleId, method: "card", amountCents: 250000, reference: `A-${key()}`, idempotencyKey: key() });
    s = await sales.getSale(f.ctx.owner, order.saleId);
    expect(s.sale).toMatchObject({ paymentStatus: "paid", fulfillmentStatus: "ready_for_pickup", status: "open" });

    await sales.transitionOrder(f.ctx.sales, order.saleId, "completed");
    s = await sales.getSale(f.ctx.owner, order.saleId);
    expect(s.sale.status).toBe("completed");
    expect(s.sale.completedAt).not.toBeNull();
    expect(await bal(frame.variantId, f.main.locationId)).toMatchObject({ onHand: 0, reserved: 0 });
    const res = await getDb().select().from(stockReservations).where(eq(stockReservations.saleId, order.saleId));
    expect(res.map((r) => r.status)).toEqual(["consumed"]);
    const moves = await getDb().select().from(stockMovements).where(eq(stockMovements.referenceId, order.saleId));
    expect(moves).toHaveLength(1);
    expect(moves[0]).toMatchObject({ type: "order_consumption", quantity: -1 });
  });

  it("fails confirmation when stock isn't available", async () => {
    const frame = await stockProduct(f, { qty: 0 });
    const c = await customer(f);
    const order = await sales.createOrder(f.ctx.sales, { branchId: f.main.id, customerId: c.id, items: [{ variantId: frame.variantId, quantity: 1 }], idempotencyKey: key() });
    await expect(sales.transitionOrder(f.ctx.sales, order.saleId, "confirmed")).rejects.toThrow(/not enough stock/i);
    expect((await sales.getSale(f.ctx.owner, order.saleId)).sale.fulfillmentStatus).toBe("new");
  });

  it("requires the deposit to be refunded before cancelling, then releases the reservation", async () => {
    const frame = await stockProduct(f, { price: 2000, qty: 2 });
    const c = await customer(f);
    const order = await sales.createOrder(f.ctx.sales, {
      branchId: f.main.id,
      customerId: c.id,
      items: [{ variantId: frame.variantId, quantity: 1 }],
      deposit: { method: "cash", amountCents: 100000 },
      confirm: true,
      idempotencyKey: key(),
    });
    expect(await bal(frame.variantId, f.main.locationId)).toMatchObject({ reserved: 1 });
    await expect(sales.transitionOrder(f.ctx.sales, order.saleId, "cancelled")).rejects.toThrow(/permission/i);
    await expect(sales.transitionOrder(f.ctx.manager, order.saleId, "cancelled", "Changed mind")).rejects.toThrow(/refund/i);
    await sales.refundSale(f.ctx.manager, { saleId: order.saleId, items: [], amountCents: 100000, method: "cash", reason: "Deposit returned", idempotencyKey: key() });
    const mid = (await sales.getSale(f.ctx.owner, order.saleId)).sale;
    // A deposit return doesn't change the order's value: the full total is owed again.
    expect(mid).toMatchObject({ refundedCents: 0, refundedCashCents: 100000, balanceDueCents: 200000 });
    await sales.transitionOrder(f.ctx.manager, order.saleId, "cancelled", "Changed mind");
    expect(await bal(frame.variantId, f.main.locationId)).toMatchObject({ onHand: 2, reserved: 0 });
    expect((await sales.getSale(f.ctx.owner, order.saleId)).sale).toMatchObject({ status: "cancelled", balanceDueCents: 0 });
  });

  it("only lets line items change while an order is New", async () => {
    const frame = await stockProduct(f, { price: 1000, qty: 3 });
    const c = await customer(f);
    const order = await sales.createOrder(f.ctx.sales, { branchId: f.main.id, customerId: c.id, items: [{ variantId: frame.variantId, quantity: 1 }], idempotencyKey: key() });
    await sales.updateOrder(f.ctx.sales, order.saleId, { items: [{ variantId: frame.variantId, quantity: 2 }] });
    expect((await sales.getSale(f.ctx.owner, order.saleId)).sale.totalCents).toBe(200000);
    await sales.transitionOrder(f.ctx.sales, order.saleId, "confirmed");
    await expect(sales.updateOrder(f.ctx.sales, order.saleId, { items: [{ variantId: frame.variantId, quantity: 1 }] })).rejects.toThrow(/only be changed/i);
    await sales.updateOrder(f.ctx.sales, order.saleId, { labReference: "LAB-7" });
    expect((await sales.getSale(f.ctx.owner, order.saleId)).sale.labReference).toBe("LAB-7");
  });
});

describe("inventory operations", () => {
  it("adjusts with a reason and movement record; never goes negative", async () => {
    const frame = await stockProduct(f, { qty: 3 });
    await inventory.adjustStock(f.ctx.inventory, { variantId: frame.variantId, locationId: f.main.locationId, mode: "add", quantity: 2, reason: "Found in back room", idempotencyKey: key() });
    await inventory.adjustStock(f.ctx.inventory, { variantId: frame.variantId, locationId: f.main.locationId, mode: "damage", quantity: 1, reason: "Cracked lens", idempotencyKey: key() });
    expect((await bal(frame.variantId, f.main.locationId)).onHand).toBe(4);
    await inventory.adjustStock(f.ctx.inventory, { variantId: frame.variantId, locationId: f.main.locationId, mode: "set", quantity: 6, reason: "Cycle count", idempotencyKey: key() });
    expect((await bal(frame.variantId, f.main.locationId)).onHand).toBe(6);
    await expect(
      inventory.adjustStock(f.ctx.inventory, { variantId: frame.variantId, locationId: f.main.locationId, mode: "remove", quantity: 7, reason: "Too many", idempotencyKey: key() }),
    ).rejects.toThrow(/stock|free/i);
    const moves = await getDb().select().from(stockMovements).where(eq(stockMovements.variantId, frame.variantId));
    expect(moves.map((m) => m.type).sort()).toEqual(["adjustment", "count", "damage", "opening"]);
    expect(moves.every((m) => m.reason)).toBe(true);
    // Sales staff can't adjust stock.
    await expect(
      inventory.adjustStock(f.ctx.sales, { variantId: frame.variantId, locationId: f.main.locationId, mode: "add", quantity: 1, reason: "x", idempotencyKey: key() }),
    ).rejects.toThrow(/permission/i);
  });

  it("an adjustment retried with the same key applies once", async () => {
    const frame = await stockProduct(f, { qty: 1 });
    const input = { variantId: frame.variantId, locationId: f.main.locationId, mode: "add" as const, quantity: 5, reason: "Delivery", idempotencyKey: key() };
    await inventory.adjustStock(f.ctx.inventory, input);
    await inventory.adjustStock(f.ctx.inventory, input);
    expect((await bal(frame.variantId, f.main.locationId)).onHand).toBe(6);
  });

  it("transfers between branches with paired movements", async () => {
    const frame = await stockProduct(f, { qty: 5 });
    await inventory.transferStock(f.ctx.inventory, { variantId: frame.variantId, fromLocationId: f.main.locationId, toLocationId: f.second.locationId, quantity: 2, reason: "Rebalance", idempotencyKey: key() });
    expect((await bal(frame.variantId, f.main.locationId)).onHand).toBe(3);
    expect((await bal(frame.variantId, f.second.locationId)).onHand).toBe(2);
    await expect(
      inventory.transferStock(f.ctx.inventory, { variantId: frame.variantId, fromLocationId: f.second.locationId, toLocationId: f.main.locationId, quantity: 3, reason: "Too many", idempotencyKey: key() }),
    ).rejects.toThrow(/available/i);
  });

  it("refuses to track inventory for services and made-to-order items", async () => {
    const lens = await lensProduct(f);
    await expect(
      inventory.adjustStock(f.ctx.inventory, { variantId: lens.variantId, locationId: f.main.locationId, mode: "add", quantity: 1, reason: "x", idempotencyKey: key() }),
    ).rejects.toThrow(/only stocked items/i);
  });

  it("reports low stock from real balances", async () => {
    const frame = await stockProduct(f, { qty: 2, reorderPoint: 2, name: "Low Frame" });
    const alerts = await inventory.lowStockAlerts(f.ctx.owner, { locationId: f.main.locationId });
    expect(alerts.some((a) => a.variantId === frame.variantId && a.available === 2)).toBe(true);
  });
});

describe("purchasing and receiving", () => {
  it("creates → confirms → partially receives → fully receives, updating stock, cost and status", async () => {
    const frame = await stockProduct(f, { qty: 2, cost: 400 });
    const po = await purchasing.savePurchaseOrder(f.ctx.inventory, null, {
      supplierId: f.supplierId,
      locationId: f.main.locationId,
      items: [{ variantId: frame.variantId, quantity: 6, unitCostCents: 52000 }],
    });
    const detail = await purchasing.getPurchaseOrder(f.ctx.owner, po!.purchaseOrderId);
    const itemId = detail.items[0].item.id;
    await expect(
      purchasing.receivePurchaseOrder(f.ctx.inventory, { purchaseOrderId: po!.purchaseOrderId, items: [{ itemId, quantity: 1 }], idempotencyKey: key() }),
    ).rejects.toThrow(/confirm/i);
    await expect(purchasing.confirmPurchaseOrder(f.ctx.inventory, po!.purchaseOrderId)).rejects.toThrow(/permission/i);
    await purchasing.confirmPurchaseOrder(f.ctx.manager, po!.purchaseOrderId);

    const receiveKey = key();
    await purchasing.receivePurchaseOrder(f.ctx.inventory, { purchaseOrderId: po!.purchaseOrderId, items: [{ itemId, quantity: 4 }], idempotencyKey: receiveKey });
    // Retry of the same delivery is ignored.
    const replay = await purchasing.receivePurchaseOrder(f.ctx.inventory, { purchaseOrderId: po!.purchaseOrderId, items: [{ itemId, quantity: 4 }], idempotencyKey: receiveKey });
    expect(replay.replayed).toBe(true);
    let after = await purchasing.getPurchaseOrder(f.ctx.owner, po!.purchaseOrderId);
    expect(after.po.status).toBe("partially_received");
    expect((await bal(frame.variantId, f.main.locationId)).onHand).toBe(6);
    // Weighted average cost: (2 × 400 + 4 × 520) / 6 = 480.
    const [v] = await getDb().select().from(productVariants).where(eq(productVariants.id, frame.variantId));
    expect(v.costCents).toBe(48000);

    await expect(
      purchasing.receivePurchaseOrder(f.ctx.inventory, { purchaseOrderId: po!.purchaseOrderId, items: [{ itemId, quantity: 3 }], idempotencyKey: key() }),
    ).rejects.toThrow(/more unit/i);
    await purchasing.receivePurchaseOrder(f.ctx.inventory, { purchaseOrderId: po!.purchaseOrderId, items: [{ itemId, quantity: 2 }], idempotencyKey: key() });
    after = await purchasing.getPurchaseOrder(f.ctx.owner, po!.purchaseOrderId);
    expect(after.po.status).toBe("received");
    expect(after.receipts).toHaveLength(2);
    expect((await bal(frame.variantId, f.main.locationId)).onHand).toBe(8);
    const moves = await purchasing.poMovements(f.ctx.owner, po!.purchaseOrderId);
    expect(moves.map((m) => m.movement.quantity)).toEqual([4, 2]);
  });

  it("only allows stocked items on purchase orders and only drafts to be edited", async () => {
    const lens = await lensProduct(f);
    await expect(
      purchasing.savePurchaseOrder(f.ctx.inventory, null, { supplierId: f.supplierId, locationId: f.main.locationId, items: [{ variantId: lens.variantId, quantity: 1, unitCostCents: 100 }] }),
    ).rejects.toThrow(/only stocked items/i);
    const frame = await stockProduct(f, { qty: 0 });
    const po = await purchasing.savePurchaseOrder(f.ctx.inventory, null, { supplierId: f.supplierId, locationId: f.main.locationId, items: [{ variantId: frame.variantId, quantity: 2, unitCostCents: 100 }] });
    await purchasing.confirmPurchaseOrder(f.ctx.manager, po!.purchaseOrderId);
    await expect(
      purchasing.savePurchaseOrder(f.ctx.inventory, po!.purchaseOrderId, { supplierId: f.supplierId, locationId: f.main.locationId, items: [{ variantId: frame.variantId, quantity: 3, unitCostCents: 100 }] }),
    ).rejects.toThrow(/draft/i);
  });
});
