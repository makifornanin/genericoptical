import { beforeAll, describe, expect, it } from "vitest";
import * as catalog from "@/server/services/catalog";
import * as customers from "@/server/services/customers";
import * as purchasing from "@/server/services/purchasing";
import * as sales from "@/server/services/sales";
import { createBusiness, customer, key, stockProduct, type Fixture } from "./fixtures";

/**
 * Regression tests for subquery aggregates in single-table queries, where an unqualified outer
 * column would silently bind to the subquery's own table and return wrong numbers.
 */
let f: Fixture;
beforeAll(async () => {
  f = await createBusiness("Agg");
});

describe("list aggregates", () => {
  it("counts a supplier's products, open POs and spend correctly", async () => {
    const p1 = await stockProduct(f, { qty: 0 });
    await stockProduct(f, { qty: 0 });
    const po = await purchasing.savePurchaseOrder(f.ctx.inventory, null, { supplierId: f.supplierId, locationId: f.main.locationId, items: [{ variantId: p1.variantId, quantity: 4, unitCostCents: 25000 }] });
    await purchasing.confirmPurchaseOrder(f.ctx.manager, po!.purchaseOrderId);
    const detail = await purchasing.getPurchaseOrder(f.ctx.owner, po!.purchaseOrderId);
    await purchasing.receivePurchaseOrder(f.ctx.inventory, { purchaseOrderId: po!.purchaseOrderId, items: [{ itemId: detail.items[0].item.id, quantity: 2 }], idempotencyKey: key() });
    const list = await purchasing.listSuppliers(f.ctx.owner);
    const row = list.rows.find((s) => s.id === f.supplierId)!;
    expect(row.productCount).toBe(2);
    expect(row.openPoCount).toBe(1);
    expect(row.spendCents).toBe(50000);
    const sup = await purchasing.getSupplier(f.ctx.owner, f.supplierId);
    expect(sup.purchaseOrders[0].receivedValueCents).toBe(50000);
  });

  it("finds products by SKU and reports correct totals", async () => {
    const p = await stockProduct(f, { qty: 3, name: "Searchable Frame" });
    const bySku = await catalog.listProducts(f.ctx.owner, { q: p.sku });
    expect(bySku.total).toBe(1);
    expect(bySku.rows[0].id).toBe(p.productId);
    expect(bySku.rows[0].stats.onHand).toBe(3);
  });

  it("summarises a customer's purchases", async () => {
    const c = await customer(f);
    const frame = await stockProduct(f, { price: 1500, qty: 5 });
    await sales.checkout(f.ctx.sales, { branchId: f.main.id, customerId: c.id, items: [{ variantId: frame.variantId, quantity: 2 }], payments: [{ method: "cash", amountCents: 200000 }], idempotencyKey: key() });
    const profile = await customers.getCustomer(f.ctx.owner, c.id);
    expect(profile.stats).toMatchObject({ lifetimeCents: 300000, balanceCents: 100000, visits: 1 });
    expect(profile.sales[0].items).toContain("×2");
    const list = await customers.listCustomers(f.ctx.owner, { withBalance: true });
    expect(list.rows.map((r) => r.id)).toContain(c.id);
    expect(list.rows.find((r) => r.id === c.id)!.stats.balanceCents).toBe(100000);
  });
});
