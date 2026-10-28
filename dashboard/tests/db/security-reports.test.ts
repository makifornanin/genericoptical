import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import { resolveRange } from "@/lib/dates";
import { hashPassword } from "@/server/auth/password";
import { getDb } from "@/server/db";
import { saleItems, users } from "@/server/db/schema";
import * as auth from "@/server/services/auth";
import * as catalog from "@/server/services/catalog";
import * as customers from "@/server/services/customers";
import * as expenses from "@/server/services/expenses";
import * as inventory from "@/server/services/inventory";
import * as leads from "@/server/services/leads";
import * as reports from "@/server/services/reports";
import * as sales from "@/server/services/sales";
import * as staff from "@/server/services/staff";
import { createBusiness, customer, key, serviceProduct, stockProduct, type Fixture } from "./fixtures";

let a: Fixture;
let b: Fixture;
beforeAll(async () => {
  a = await createBusiness("Alpha");
  b = await createBusiness("Beta");
});

describe("tenant isolation", () => {
  it("never returns another business's records", async () => {
    const cA = await customer(a, "Alice Alpha");
    const frameA = await stockProduct(a, { qty: 3 });
    const saleA = await sales.checkout(a.ctx.sales, { branchId: a.main.id, items: [{ variantId: frameA.variantId, quantity: 1 }], payments: [{ method: "cash", amountCents: 100000 }], idempotencyKey: key() });
    await expect(customers.getCustomer(b.ctx.owner, cA.id)).rejects.toThrow(/not found/i);
    await expect(sales.getSale(b.ctx.owner, saleA.saleId)).rejects.toThrow(/not found/i);
    await expect(catalog.getProduct(b.ctx.owner, frameA.productId)).rejects.toThrow(/not found/i);
    expect((await customers.listCustomers(b.ctx.owner, { q: "Alice" })).rows).toHaveLength(0);
    expect((await sales.listSales(b.ctx.owner, {})).rows.find((r) => r.id === saleA.saleId)).toBeUndefined();
  });

  it("rejects writes that reference another business's records", async () => {
    const frameA = await stockProduct(a, { qty: 3 });
    const cA = await customer(a);
    // Selling business A's frame from business B.
    await expect(
      sales.checkout(b.ctx.sales, { branchId: b.main.id, items: [{ variantId: frameA.variantId, quantity: 1 }], payments: [{ method: "cash", amountCents: 100000 }], idempotencyKey: key() }),
    ).rejects.toThrow(/no longer exists/i);
    // Attaching business A's customer to a business B sale.
    const frameB = await stockProduct(b, { qty: 3 });
    await expect(
      sales.checkout(b.ctx.sales, { branchId: b.main.id, customerId: cA.id, items: [{ variantId: frameB.variantId, quantity: 1 }], payments: [{ method: "cash", amountCents: 100000 }], idempotencyKey: key() }),
    ).rejects.toThrow(/active customer/i);
    // Using business A's branch.
    await expect(
      sales.checkout(b.ctx.sales, { branchId: a.main.id, items: [{ variantId: frameB.variantId, quantity: 1 }], payments: [{ method: "cash", amountCents: 100000 }], idempotencyKey: key() }),
    ).rejects.toThrow(/active branch/i);
    // Moving stock into business A's location.
    await expect(
      inventory.adjustStock(b.ctx.inventory, { variantId: frameB.variantId, locationId: a.main.locationId, mode: "add", quantity: 1, reason: "x", idempotencyKey: key() }),
    ).rejects.toThrow(/unknown stock location/i);
  });

  it("composite foreign keys stop cross-tenant rows even if application checks were bypassed", async () => {
    const frameA = await stockProduct(a, { qty: 3 });
    const frameB = await stockProduct(b, { qty: 3 });
    const saleB = await sales.checkout(b.ctx.sales, { branchId: b.main.id, items: [{ variantId: frameB.variantId, quantity: 1 }], payments: [{ method: "cash", amountCents: 100000 }], idempotencyKey: key() });
    await expect(
      getDb().insert(saleItems).values({
        businessId: b.businessId,
        saleId: saleB.saleId,
        variantId: frameA.variantId, // belongs to business A
        productName: "x",
        sku: "x",
        productType: "stock",
        quantity: 1,
        unitPriceCents: 1,
        netCents: 1,
        lineTotalCents: 1,
      }),
    ).rejects.toThrow();
  });
});

describe("role-based permissions (server-side)", () => {
  it("enforces each role's limits", async () => {
    const frame = await stockProduct(a, { qty: 5 });
    await expect(
      sales.checkout(a.ctx.inventory, { branchId: a.main.id, items: [{ variantId: frame.variantId, quantity: 1 }], payments: [], idempotencyKey: key() }),
    ).rejects.toThrow(/permission/i);
    await expect(
      catalog.createProduct(a.ctx.sales, { name: "X", categoryId: a.category.frames, variants: [{ sku: `X-${key().slice(0, 6)}`, priceCents: 100 }] }),
    ).rejects.toThrow(/permission/i);
    await expect(expenses.listExpenses(a.ctx.sales, {})).rejects.toThrow(/permission/i);
    await expect(staff.listStaff(a.ctx.sales)).rejects.toThrow(/permission/i);
    await expect(reports.financialReport(a.ctx.sales, resolveRange("30d", "Asia/Manila"))).rejects.toThrow(/permission/i);
    await expect(leads.listLeads(a.ctx.inventory, {})).rejects.toThrow(/permission/i);
    // Practitioners can read customers but not edit them.
    const c = await customer(a);
    await expect(customers.getCustomer(a.ctx.practitioner, c.id)).resolves.toBeTruthy();
    await expect(customers.updateCustomer(a.ctx.practitioner, c.id, { firstName: "X", lastName: "Y" })).rejects.toThrow(/permission/i);
    // Cost prices are hidden from roles without products.costs.
    const product = await catalog.getProduct(a.ctx.sales, frame.productId);
    expect(product.variants[0].costCents).toBeNull();
  });

  it("applies per-member permission overrides and keeps at least one owner", async () => {
    await staff.updateStaff(a.ctx.owner, a.membership.sales, { name: "Alpha sales", email: (await emailOf(a.ctx.sales.userId!))!, role: "sales", grant: ["sales.refund"], revoke: ["customers.manage"], isActive: true });
    const { resolvePermissions } = await import("@/lib/permissions");
    const perms = resolvePermissions("sales", { grant: ["sales.refund"], revoke: ["customers.manage"] });
    expect(perms.has("sales.refund")).toBe(true);
    expect(perms.has("customers.manage")).toBe(false);
    await expect(
      staff.updateStaff(a.ctx.owner, a.membership.owner, { name: "Alpha owner", email: (await emailOf(a.ctx.owner.userId!))!, role: "manager", isActive: true }),
    ).rejects.toThrow(/at least one active owner/i);
    await expect(
      staff.updateStaff(a.ctx.manager, a.membership.sales, { name: "x", email: "x@test.example", role: "sales", isActive: true }),
    ).rejects.toThrow(/permission/i);
  });
});

async function emailOf(userId: string) {
  const [u] = await getDb().select({ email: users.email }).from(users).where(eq(users.id, userId));
  return u?.email;
}

describe("financial reports", () => {
  it("computes gross, discounts, refunds, net (ex-tax), COGS, profit, receivables and cash collected from records", async () => {
    const f = await createBusiness("Ledger");
    const frame = await stockProduct(f, { price: 1120, cost: 500, qty: 10 });
    const exam = await serviceProduct(f, 500, true);
    const c = await customer(f);
    // Sale 1: 2 frames + exam, fully paid. Gross 2,740; tax 240; net 2,500; COGS 1,000.
    const s1 = await sales.checkout(f.ctx.sales, {
      branchId: f.main.id,
      customerId: c.id,
      items: [
        { variantId: frame.variantId, quantity: 2 },
        { variantId: exam.variantId, quantity: 1 },
      ],
      payments: [{ method: "cash", amountCents: 274000 }],
      idempotencyKey: key(),
    });
    // Sale 2: 1 frame with 10% off (1,008), half paid → 504 receivable. Tax 108; net 900; COGS 500.
    await sales.checkout(f.ctx.sales, {
      branchId: f.main.id,
      customerId: c.id,
      items: [{ variantId: frame.variantId, quantity: 1 }],
      orderDiscount: { type: "percent", valueBps: 1000 },
      payments: [{ method: "gcash", amountCents: 50400, reference: `GC-${key()}` }],
      idempotencyKey: key(),
    });
    // Refund one frame from sale 1 (restocked): -1,120 incl. 120 tax; COGS reversal 500.
    const line = (await sales.getSale(f.ctx.owner, s1.saleId)).items.find((i) => i.variantId === frame.variantId)!;
    await sales.refundSale(f.ctx.manager, { saleId: s1.saleId, items: [{ saleItemId: line.id, quantity: 1, restock: true }], method: "cash", reason: "Return", idempotencyKey: key() });
    // An expense of 1,000.
    const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila" }).format(new Date());
    await expenses.saveExpense(f.ctx.owner, null, { categoryId: f.expenseCategoryId, amountCents: 100000, expenseDate: today, description: "Supplies" });

    const report = await reports.financialReport(f.ctx.owner, resolveRange("today", "Asia/Manila"));
    const r = report.current;
    expect(r.transactions).toBe(2);
    expect(r.grossSalesCents).toBe(274000 + 112000);
    expect(r.discountsCents).toBe(11200);
    expect(r.refundsCents).toBe(112000);
    expect(r.taxCents).toBe(24000 + 10800 - 12000);
    expect(r.netSalesCents).toBe(250000 + 90000 - 100000);
    expect(r.cogsCents).toBe(100000 + 50000 - 50000);
    expect(r.grossProfitCents).toBe(240000 - 100000);
    expect(r.expensesCents).toBe(100000);
    expect(r.operatingProfitCents).toBe(140000 - 100000);
    expect(r.collectedCents).toBe(274000 + 50400);
    expect(r.refundsPaidOutCents).toBe(112000);
    expect(r.netCollectedCents).toBe(274000 + 50400 - 112000);
    expect(report.outstanding.receivableCents).toBe(50400);
    expect(report.byMethod.find((m) => m.method === "gcash")!.totalCents).toBe(50400);

    // The dashboard bundle reports the same numbers.
    const dash = await reports.dashboard(f.ctx.owner, resolveRange("today", "Asia/Manila"));
    expect(dash.financials!.netSalesCents).toBe(r.netSalesCents);
    expect(dash.outstanding!.receivableCents).toBe(50400);
  });

  it("doesn't count open orders as revenue until they're handed over", async () => {
    const f = await createBusiness("Orders");
    const frame = await stockProduct(f, { price: 2240, cost: 900, qty: 2 });
    const c = await customer(f);
    const order = await sales.createOrder(f.ctx.sales, { branchId: f.main.id, customerId: c.id, items: [{ variantId: frame.variantId, quantity: 1 }], deposit: { method: "cash", amountCents: 100000 }, confirm: true, idempotencyKey: key() });
    let r = (await reports.financialReport(f.ctx.owner, resolveRange("today", "Asia/Manila"))).current;
    expect(r.netSalesCents).toBe(0);
    expect(r.depositsCents).toBe(100000);
    expect(r.collectedCents).toBe(100000);
    for (const s of ["processing", "ready_for_pickup", "completed"] as const) await sales.transitionOrder(f.ctx.sales, order.saleId, s);
    r = (await reports.financialReport(f.ctx.owner, resolveRange("today", "Asia/Manila"))).current;
    expect(r.netSalesCents).toBe(200000);
    expect(r.cogsCents).toBe(90000);
  });
});

describe("authentication", () => {
  it("signs in, resolves the session with role permissions, signs out", async () => {
    const f = await createBusiness("Auth");
    const email = await emailOf(f.ctx.manager.userId!);
    await getDb().update(users).set({ passwordHash: await hashPassword("correct-horse-1") }).where(eq(users.id, f.ctx.manager.userId!));
    await expect(auth.authenticate(email!, "wrong-password-1")).rejects.toThrow(/don't match/i);
    const session = await auth.authenticate(email!.toUpperCase(), "correct-horse-1");
    const info = await auth.resolveSession(session.token);
    expect(info!.ctx.role).toBe("manager");
    expect(info!.ctx.permissions.has("sales.refund")).toBe(true);
    expect(info!.ctx.permissions.has("settings.manage")).toBe(false);
    await auth.destroySession(session.token);
    expect(await auth.resolveSession(session.token)).toBeNull();
    expect(await auth.resolveSession("forged-token")).toBeNull();
  });

  it("throttles repeated failures and supports password reset", async () => {
    const f = await createBusiness("Reset");
    const email = (await emailOf(f.ctx.sales.userId!))!;
    for (let i = 0; i < 8; i++) await auth.authenticate(email, "nope-nope-1").catch(() => {});
    await expect(auth.authenticate(email, "nope-nope-1")).rejects.toThrow(/too many/i);
    expect(await auth.createPasswordReset("unknown@example.com")).toBeNull();
    const reset = await auth.createPasswordReset(email);
    await expect(auth.resetPassword(reset!.token, "short")).rejects.toThrow();
    await auth.resetPassword(reset!.token, "brand-new-pass-9");
    await expect(auth.resetPassword(reset!.token, "brand-new-pass-9")).rejects.toThrow(/expired|used/i);
  });

  it("changing a password keeps the current session and signs out other devices", async () => {
    const f = await createBusiness("Chg");
    const email = (await emailOf(f.ctx.manager.userId!))!;
    await getDb().update(users).set({ passwordHash: await hashPassword("first-pass-123") }).where(eq(users.id, f.ctx.manager.userId!));
    const here = await auth.authenticate(email, "first-pass-123");
    const elsewhere = await auth.authenticate(email, "first-pass-123");
    const current = await auth.resolveSession(here.token);
    await expect(auth.changePassword(current!.ctx, "wrong-pass-123", "second-pass-456", current!.sessionId)).rejects.toThrow(/incorrect/i);
    await expect(auth.changePassword(current!.ctx, "first-pass-123", "weak", current!.sessionId)).rejects.toThrow(/at least 10/i);
    await auth.changePassword(current!.ctx, "first-pass-123", "second-pass-456", current!.sessionId);
    expect(await auth.resolveSession(here.token)).not.toBeNull();
    expect(await auth.resolveSession(elsewhere.token)).toBeNull();
    await expect(auth.authenticate(email, "first-pass-123")).rejects.toThrow();
    expect((await auth.authenticate(email, "second-pass-456")).token).toBeTruthy();
  });

  it("deactivated staff lose access immediately", async () => {
    const f = await createBusiness("Deact");
    const email = (await emailOf(f.ctx.sales.userId!))!;
    await getDb().update(users).set({ passwordHash: await hashPassword("sales-pass-123") }).where(eq(users.id, f.ctx.sales.userId!));
    const s = await auth.authenticate(email, "sales-pass-123");
    await staff.updateStaff(f.ctx.owner, f.membership.sales, { name: "Gone", email, role: "sales", isActive: false });
    expect(await auth.resolveSession(s.token)).toBeNull();
    await expect(auth.authenticate(email, "sales-pass-123")).rejects.toThrow();
  });
});
