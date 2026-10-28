/**
 * Regression tests for the Phase 2 bug audit (docs/BUG_AUDIT.md). Each test is named after its finding id
 * and fails on the code before the fix.
 */
import { randomUUID } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { resolveRange } from "@/lib/dates";
import { resolvePermissions } from "@/lib/permissions";
import { hashPassword } from "@/server/auth/password";
import { getDb } from "@/server/db";
import {
  appointmentTypes,
  businesses,
  businessMemberships,
  customers as customersTable,
  inventoryBalances,
  leadActivities,
  leads as leadsTable,
  loginAttempts,
  payments,
  productVariants,
  purchaseOrderReceipts,
  refunds,
  saleItems,
  stockMovements,
  users,
} from "@/server/db/schema";
import * as auth from "@/server/services/auth";
import * as catalog from "@/server/services/catalog";
import type { Ctx } from "@/server/services/core";
import { requestHash } from "@/server/services/core";
import * as customers from "@/server/services/customers";
import * as expenses from "@/server/services/expenses";
import * as inventory from "@/server/services/inventory";
import * as leads from "@/server/services/leads";
import * as purchasing from "@/server/services/purchasing";
import * as appointments from "@/server/services/appointments";
import * as reports from "@/server/services/reports";
import * as sales from "@/server/services/sales";
import * as staff from "@/server/services/staff";
import { createBusiness, customer, futureDay, key, lensProduct, serviceProduct, stockProduct, type Fixture } from "./fixtures";

const PASSWORD = "Correct-Horse-Battery-9";

let f: Fixture;
beforeAll(async () => {
  f = await createBusiness("Regress");
});

async function onHand(variantId: string, locationId: string) {
  const [b] = await getDb()
    .select()
    .from(inventoryBalances)
    .where(and(eq(inventoryBalances.variantId, variantId), eq(inventoryBalances.locationId, locationId)));
  return b?.onHand ?? 0;
}

/** A user who belongs to `fx` with a real password (fixtures use a placeholder hash). */
async function realUser(fx: Fixture, role: "owner" | "manager" | "sales", label = "user") {
  const db = getDb();
  const [u] = await db
    .insert(users)
    .values({ email: `${label}-${randomUUID().slice(0, 8)}@test.example`, name: `Real ${label}`, passwordHash: await hashPassword(PASSWORD) })
    .returning();
  const [m] = await db.insert(businessMemberships).values({ businessId: fx.businessId, userId: u.id, role, defaultBranchId: fx.main.id }).returning();
  const ctx: Ctx = { userId: u.id, membershipId: m.id, businessId: fx.businessId, role, permissions: resolvePermissions(role, {}), actorLabel: u.name, branchId: fx.main.id };
  return { user: u, membership: m, ctx };
}

const staffInput = (u: { name: string; email: string }, role: string, extra: Record<string, unknown> = {}) => ({ name: u.name, email: u.email, role, ...extra });

// ─── Staff & accounts ────────────────────────────────────────────────────────

describe("B1: cross-business account takeover", () => {
  it("an owner can't attach, rename or reset an account that belongs to another business", async () => {
    const other = await createBusiness("Victim");
    const victim = await realUser(other, "owner", "victim");
    // Attach by email → refused (previously reused the global user and later let A reset its password).
    await expect(staff.createStaff(f.ctx.owner, staffInput(victim.user, "sales"), "Temporary-Pass-123")).rejects.toThrow(/already belongs to an existing account/i);

    // Even if the account is shared (legitimately on both), business A can't change its sign-in details.
    const [shared] = await getDb().insert(businessMemberships).values({ businessId: f.businessId, userId: victim.user.id, role: "sales" }).returning();
    await expect(staff.updateStaff(f.ctx.owner, shared.id, staffInput({ name: "Hijacked", email: victim.user.email }, "sales"))).rejects.toThrow(/another business/i);
    await expect(staff.updateStaff(f.ctx.owner, shared.id, staffInput({ name: victim.user.name, email: "attacker@test.example" }, "sales"))).rejects.toThrow(/another business/i);
    await expect(staff.setTemporaryPassword(f.ctx.owner, shared.id, "Attacker-Chosen-1")).rejects.toThrow(/another business/i);

    const [after] = await getDb().select().from(users).where(eq(users.id, victim.user.id));
    expect(after.passwordHash).toBe(victim.user.passwordHash);
    expect(after.email).toBe(victim.user.email);
    await expect(auth.authenticate(victim.user.email, PASSWORD)).resolves.toBeTruthy();
  });
});

describe("B3: staff admins can't escalate", () => {
  it("a non-owner with staff.manage can't change their own access or hand out owner-only or unheld permissions", async () => {
    const admin = await realUser(f, "manager", "admin");
    const ctx: Ctx = { ...admin.ctx, permissions: resolvePermissions("manager", { grant: ["staff.manage"] }) };
    await getDb().update(businessMemberships).set({ permissionOverrides: { grant: ["staff.manage"], revoke: [] } }).where(eq(businessMemberships.id, admin.membership.id));
    await expect(staff.updateStaff(ctx, admin.membership.id, staffInput(admin.user, "manager", { grant: ["staff.manage", "settings.manage"] }))).rejects.toThrow(/your own role/i);
    await expect(
      staff.createStaff(ctx, { name: "Sidekick", email: `side-${randomUUID().slice(0, 6)}@test.example`, role: "sales", grant: ["integrations.manage"] }, "Temporary-Pass-123"),
    ).rejects.toThrow(/don't have yourself|only an owner/i);
    await expect(staff.createStaff(ctx, { name: "Boss", email: `boss-${randomUUID().slice(0, 6)}@test.example`, role: "owner" }, "Temporary-Pass-123")).rejects.toThrow(/only owners/i);
    // Ordinary staff management still works.
    await expect(staff.createStaff(ctx, { name: "New Sales", email: `ns-${randomUUID().slice(0, 6)}@test.example`, role: "sales" }, "Temporary-Pass-123")).resolves.toBeTruthy();
  });
});

describe("B10: last owner", () => {
  it("two concurrent demotions can't leave a business without an active owner", async () => {
    const fx = await createBusiness("Owners");
    const second = await realUser(fx, "owner", "owner2");
    const [first] = await getDb().select({ name: users.name, email: users.email }).from(users).where(eq(users.id, fx.ctx.owner.userId!));
    const results = await Promise.allSettled([
      staff.updateStaff(fx.ctx.owner, second.membership.id, staffInput(second.user, "manager")),
      staff.updateStaff(second.ctx, fx.membership.owner, staffInput(first, "manager")),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const [{ n }] = await getDb()
      .select({ n: sql<number>`count(*)::int` })
      .from(businessMemberships)
      .where(and(eq(businessMemberships.businessId, fx.businessId), eq(businessMemberships.role, "owner"), eq(businessMemberships.isActive, true)));
    expect(n).toBe(1);
  });
});

describe("B4/B14: sign-in throttle and password reset", () => {
  it("B4: parallel wrong guesses are counted atomically — no more than the limit get a password check", async () => {
    const fx = await createBusiness("Login");
    const u = await realUser(fx, "sales", "throttle");
    const attempts = await Promise.allSettled(Array.from({ length: 16 }, () => auth.authenticate(u.user.email, "wrong-password", { ip: `198.51.100.${Math.floor(Math.random() * 200)}` })));
    expect(attempts.every((a) => a.status === "rejected")).toBe(true);
    const [{ n }] = await getDb().select({ n: sql<number>`count(*)::int` }).from(loginAttempts).where(sql`lower(${loginAttempts.email}) = ${u.user.email}`);
    expect(n).toBe(8); // MAX_FAILED_ATTEMPTS; the other 8 were refused before checking the password
    await expect(auth.authenticate(u.user.email, PASSWORD)).rejects.toThrow(/too many/i);
  });

  it("B14: a reset lifts the lockout and retires older reset links", async () => {
    const fx = await createBusiness("Reset");
    const u = await realUser(fx, "sales", "reset");
    await getDb()
      .insert(loginAttempts)
      .values(Array.from({ length: 8 }, () => ({ email: u.user.email, ip: "203.0.113.1", succeeded: false })));
    await expect(auth.authenticate(u.user.email, PASSWORD)).rejects.toThrow(/too many/i);
    const older = await auth.createPasswordReset(u.user.email);
    const newer = await auth.createPasswordReset(u.user.email);
    await auth.resetPassword(newer!.token, "Brand-New-Password-7");
    await expect(auth.authenticate(u.user.email, "Brand-New-Password-7")).resolves.toBeTruthy();
    await expect(auth.resetPassword(older!.token, "Someone-Elses-Pass-8")).rejects.toThrow(/expired or was already used/i);
  });
});

describe("B17: demo accounts keep their published password", () => {
  const before = process.env.DEMO_MODE;
  afterAll(() => {
    process.env.DEMO_MODE = before;
  });

  it("in demo mode, staff passwords and emails of demo businesses can't be changed", async () => {
    const fx = await createBusiness("Demo");
    await getDb().update(businesses).set({ isDemo: true }).where(eq(businesses.id, fx.businessId));
    const u = await realUser(fx, "sales", "demo");
    process.env.DEMO_MODE = "true";
    await expect(staff.setTemporaryPassword(fx.ctx.owner, u.membership.id, "Locked-Out-Demo-1")).rejects.toThrow(/demo/i);
    await expect(staff.updateStaff(fx.ctx.owner, u.membership.id, staffInput({ name: u.user.name, email: "taken@test.example" }, "sales"))).rejects.toThrow(/demo/i);
    await expect(auth.changePassword(u.ctx, PASSWORD, "Locked-Out-Demo-2")).rejects.toThrow(/demo/i);
    process.env.DEMO_MODE = before;
  });
});

// ─── POS, payments and refunds ───────────────────────────────────────────────

describe("A1: voiding a payment", () => {
  it("two concurrent voids of the same payment reduce the paid amount once", async () => {
    const frame = await stockProduct(f, { price: 2000, qty: 2 });
    const c = await customer(f);
    const order = await sales.createOrder(f.ctx.sales, {
      branchId: f.main.id,
      customerId: c.id,
      items: [{ variantId: frame.variantId, quantity: 1 }],
      deposit: { method: "cash", amountCents: 100000 },
      idempotencyKey: key(),
    });
    const p = await sales.recordPayment(f.ctx.sales, { saleId: order.saleId, method: "cash", amountCents: 50000, idempotencyKey: key() });
    const results = await Promise.allSettled([sales.voidPayment(f.ctx.manager, p.paymentId, "Entered twice"), sales.voidPayment(f.ctx.manager, p.paymentId, "Entered twice")]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const detail = await sales.getSale(f.ctx.owner, order.saleId);
    expect(detail.sale.paidCents).toBe(100000);
    expect(detail.sale.balanceDueCents).toBe(100000);
  });
});

describe("A2/A6: idempotency keys are bound to the request", () => {
  it("A2: reusing a key with different details is rejected instead of returning the old sale", async () => {
    const frame = await stockProduct(f, { qty: 5 });
    const idempotencyKey = key();
    const base = { branchId: f.main.id, payments: [{ method: "cash" as const, amountCents: 100000 }], idempotencyKey };
    await sales.checkout(f.ctx.sales, { ...base, items: [{ variantId: frame.variantId, quantity: 1 }] });
    await expect(sales.checkout(f.ctx.sales, { ...base, items: [{ variantId: frame.variantId, quantity: 2 }], payments: [{ method: "cash", amountCents: 200000 }] })).rejects.toThrow(
      /different details/i,
    );
    expect(await onHand(frame.variantId, f.main.locationId)).toBe(4);
  });

  it("A2: the request fingerprint ignores the key and property order", () => {
    expect(requestHash({ a: 1, b: { c: 2, d: [1, 2] }, idempotencyKey: "x" })).toBe(requestHash({ idempotencyKey: "y", b: { d: [1, 2], c: 2 }, a: 1 }));
    expect(requestHash({ a: 1 })).not.toBe(requestHash({ a: 2 }));
  });

  it("A6: concurrent duplicates of a payment, refund or receipt are applied once", async () => {
    const frame = await stockProduct(f, { price: 1000, qty: 3 });
    const c = await customer(f);
    const order = await sales.createOrder(f.ctx.sales, { branchId: f.main.id, customerId: c.id, items: [{ variantId: frame.variantId, quantity: 1 }], idempotencyKey: key() });
    const pay = { saleId: order.saleId, method: "cash" as const, amountCents: 40000, idempotencyKey: key() };
    const paid = await Promise.all([sales.recordPayment(f.ctx.sales, pay), sales.recordPayment(f.ctx.sales, pay), sales.recordPayment(f.ctx.sales, pay)]);
    expect(new Set(paid.map((p) => p.paymentId)).size).toBe(1);
    expect(await getDb().select().from(payments).where(eq(payments.saleId, order.saleId))).toHaveLength(1);

    const refund = { saleId: order.saleId, amountCents: 10000, method: "cash" as const, reason: "Deposit reduced", idempotencyKey: key() };
    const refunded = await Promise.all([sales.refundSale(f.ctx.manager, refund), sales.refundSale(f.ctx.manager, refund)]);
    expect(refunded[0].refundId).toBe(refunded[1].refundId);
    expect(await getDb().select().from(refunds).where(eq(refunds.saleId, order.saleId))).toHaveLength(1);

    const po = await purchasing.savePurchaseOrder(f.ctx.inventory, null, { supplierId: f.supplierId, locationId: f.main.locationId, items: [{ variantId: frame.variantId, quantity: 4, unitCostCents: 30000 }] });
    await purchasing.confirmPurchaseOrder(f.ctx.manager, po!.purchaseOrderId);
    const detail = await purchasing.getPurchaseOrder(f.ctx.owner, po!.purchaseOrderId);
    const receive = { purchaseOrderId: po!.purchaseOrderId, items: [{ itemId: detail.items[0].item.id, quantity: 4 }], idempotencyKey: key() };
    const before = await onHand(frame.variantId, f.main.locationId);
    await Promise.all([purchasing.receivePurchaseOrder(f.ctx.inventory, receive), purchasing.receivePurchaseOrder(f.ctx.inventory, receive)]);
    expect(await onHand(frame.variantId, f.main.locationId)).toBe(before + 4);
    expect(await getDb().select().from(purchaseOrderReceipts).where(eq(purchaseOrderReceipts.purchaseOrderId, po!.purchaseOrderId))).toHaveLength(1);
  });
});

describe("A3: order handover cost", () => {
  it("records cost of goods at the cost when the frame leaves stock, not when the order was taken", async () => {
    const frame = await stockProduct(f, { price: 1000, cost: 400, qty: 2 });
    const c = await customer(f);
    const order = await sales.createOrder(f.ctx.sales, {
      branchId: f.main.id,
      customerId: c.id,
      items: [{ variantId: frame.variantId, quantity: 1 }],
      deposit: { method: "cash", amountCents: 100000 },
      idempotencyKey: key(),
    });
    await sales.transitionOrder(f.ctx.sales, order.saleId, "confirmed");
    // The average cost changes while the order is at the lab.
    await getDb().update(productVariants).set({ costCents: 55000 }).where(eq(productVariants.id, frame.variantId));
    for (const stage of ["processing", "ready_for_pickup", "completed"] as const) await sales.transitionOrder(f.ctx.sales, order.saleId, stage);
    const detail = await sales.getSale(f.ctx.owner, order.saleId);
    expect(detail.sale.costCents).toBe(55000);
    const [line] = await getDb().select().from(saleItems).where(eq(saleItems.saleId, order.saleId));
    expect(line.unitCostCents).toBe(55000);
  });
});

describe("A5/A7: tax on refunds", () => {
  it("A5: a typed amount on a returned taxable line refunds that line's tax ratio, not the whole sale's", async () => {
    const frame = await stockProduct(f, { price: 1120, qty: 2 });
    const exam = await serviceProduct(f, 500, true);
    const sale = await sales.checkout(f.ctx.sales, {
      branchId: f.main.id,
      items: [
        { variantId: frame.variantId, quantity: 1 },
        { variantId: exam.variantId, quantity: 1 },
      ],
      payments: [{ method: "cash", amountCents: 162000 }],
      idempotencyKey: key(),
    });
    const detail = await sales.getSale(f.ctx.owner, sale.saleId);
    const frameLine = detail.items.find((i) => i.variantId === frame.variantId)!;
    const r = await sales.refundSale(f.ctx.manager, {
      saleId: sale.saleId,
      items: [{ saleItemId: frameLine.id, quantity: 1, restock: true }],
      amountCents: 50000,
      method: "cash",
      reason: "Partial goodwill on return",
      idempotencyKey: key(),
    });
    const [row] = await getDb().select().from(refunds).where(eq(refunds.id, r.refundId));
    // 500.00 × 12/112 = 53.57 (the whole-sale ratio would give 37.04).
    expect(row.taxCents).toBe(5357);
  });

  it("A7: repeated amount-only refunds never return more tax than was collected", async () => {
    const frame = await stockProduct(f, { price: 1120, qty: 1 });
    const sale = await sales.checkout(f.ctx.sales, { branchId: f.main.id, items: [{ variantId: frame.variantId, quantity: 1 }], payments: [{ method: "cash", amountCents: 112000 }], idempotencyKey: key() });
    for (const amountCents of [37333, 37333, 37334]) {
      await sales.refundSale(f.ctx.manager, { saleId: sale.saleId, amountCents, method: "cash", reason: "Instalment refund", idempotencyKey: key() });
    }
    const rows = await getDb().select().from(refunds).where(eq(refunds.saleId, sale.saleId));
    expect(rows.reduce((s, r) => s + r.taxCents, 0)).toBe(12000);
  });
});

describe("A15: editing an order", () => {
  it("keeps the order discount when items change", async () => {
    const frame = await stockProduct(f, { price: 1000, qty: 2 });
    const exam = await serviceProduct(f, 500, true);
    const c = await customer(f);
    const order = await sales.createOrder(f.ctx.sales, {
      branchId: f.main.id,
      customerId: c.id,
      items: [{ variantId: frame.variantId, quantity: 1 }],
      orderDiscount: { type: "amount", valueCents: 10000 },
      idempotencyKey: key(),
    });
    await sales.updateOrder(f.ctx.sales, order.saleId, {
      items: [
        { variantId: frame.variantId, quantity: 1 },
        { variantId: exam.variantId, quantity: 1 },
      ],
    });
    const detail = await sales.getSale(f.ctx.owner, order.saleId);
    expect(detail.sale.totalCents).toBe(140000);
    expect(detail.sale.discountCents).toBe(10000);
  });
});

describe("A16: returning a free item", () => {
  it("puts a zero-priced line back on the shelf without paying anything back", async () => {
    const frame = await stockProduct(f, { price: 1000, qty: 2 });
    const freeCase = await stockProduct(f, { price: 0, cost: 50, qty: 3, name: "Complimentary case" });
    const sale = await sales.checkout(f.ctx.sales, {
      branchId: f.main.id,
      items: [
        { variantId: frame.variantId, quantity: 1 },
        { variantId: freeCase.variantId, quantity: 1 },
      ],
      payments: [{ method: "cash", amountCents: 100000 }],
      idempotencyKey: key(),
    });
    const line = (await sales.getSale(f.ctx.owner, sale.saleId)).items.find((i) => i.variantId === freeCase.variantId)!;
    const r = await sales.refundSale(f.ctx.manager, { saleId: sale.saleId, items: [{ saleItemId: line.id, quantity: 1, restock: true }], method: "cash", reason: "Case returned unused", idempotencyKey: key() });
    const [row] = await getDb().select().from(refunds).where(eq(refunds.id, r.refundId));
    expect(row.amountCents).toBe(0);
    expect(await onHand(freeCase.variantId, f.main.locationId)).toBe(3);
    // An amount-only refund of zero is still refused.
    await expect(sales.refundSale(f.ctx.manager, { saleId: sale.saleId, method: "cash", reason: "Nothing", idempotencyKey: key() })).rejects.toThrow(/choose items|greater than zero/i);
  });
});

describe("A17: very large totals", () => {
  it("refuses totals beyond the safe range instead of storing a rounded number", async () => {
    const lens = await lensProduct(f);
    const c = await customer(f);
    await expect(
      sales.createOrder(f.ctx.sales, {
        branchId: f.main.id,
        customerId: c.id,
        items: [{ variantId: lens.variantId, quantity: 100_000, unitPriceCents: 900_000_000_000 }],
        idempotencyKey: key(),
      }),
    ).rejects.toThrow(/too large/i);
  });
});

// ─── Inventory and catalogue ─────────────────────────────────────────────────

describe("A8/M1: stock adjustment replays", () => {
  it("M1: replaying a removal after the shelf is empty returns the original result instead of 'not enough stock'", async () => {
    const frame = await stockProduct(f, { qty: 3 });
    const input = { variantId: frame.variantId, locationId: f.main.locationId, mode: "remove" as const, quantity: 3, reason: "Shrinkage", idempotencyKey: key() };
    await inventory.adjustStock(f.ctx.inventory, input);
    await expect(inventory.adjustStock(f.ctx.inventory, input)).resolves.toMatchObject({ replayed: true });
    expect(await onHand(frame.variantId, f.main.locationId)).toBe(0);
  });

  it("A8: a repeated 'set count to 7' and a repeated transfer each apply once", async () => {
    const frame = await stockProduct(f, { qty: 10 });
    const set = { variantId: frame.variantId, locationId: f.main.locationId, mode: "set" as const, quantity: 7, reason: "Cycle count", idempotencyKey: key() };
    await inventory.adjustStock(f.ctx.inventory, set);
    await expect(inventory.adjustStock(f.ctx.inventory, set)).resolves.toMatchObject({ replayed: true });
    const move = { variantId: frame.variantId, fromLocationId: f.main.locationId, toLocationId: f.second.locationId, quantity: 2, reason: "Rebalance", idempotencyKey: key() };
    await inventory.transferStock(f.ctx.inventory, move);
    await inventory.transferStock(f.ctx.inventory, move);
    expect(await onHand(frame.variantId, f.main.locationId)).toBe(5);
    expect(await onHand(frame.variantId, f.second.locationId)).toBe(2);
    const moves = await getDb().select().from(stockMovements).where(eq(stockMovements.variantId, frame.variantId));
    expect(moves.filter((m) => m.type === "transfer_out")).toHaveLength(1);
  });
});

describe("A9: opening stock on new products", () => {
  it("needs receiving permission, a location of this business and whole positive quantities", async () => {
    const product = () => ({
      name: `Opening ${randomUUID().slice(0, 4)}`,
      categoryId: f.category.frames,
      productType: "stock" as const,
      variants: [{ sku: `OP-${randomUUID().slice(0, 6)}`, priceCents: 10000, costCents: 4000 }],
    });
    const noReceive: Ctx = { ...f.ctx.manager, permissions: new Set([...f.ctx.manager.permissions].filter((p) => p !== "inventory.receive")) };
    await expect(catalog.createProduct(noReceive, product(), [{ variantIndex: 0, locationId: f.main.locationId, quantity: 5 }])).rejects.toThrow(/permission/i);
    const other = await createBusiness("Elsewhere");
    await expect(catalog.createProduct(f.ctx.owner, product(), [{ variantIndex: 0, locationId: other.main.locationId, quantity: 5 }])).rejects.toThrow();
    await expect(catalog.createProduct(f.ctx.owner, product(), [{ variantIndex: 0, locationId: f.main.locationId, quantity: -5 }])).rejects.toThrow();
    // Without opening stock, products.manage alone is enough.
    await expect(catalog.createProduct(noReceive, product())).resolves.toBeTruthy();
  });
});

describe("A10: product type and purchase orders", () => {
  it("a product on an open purchase order can't change type, and a non-stock product can't be received", async () => {
    const frame = await stockProduct(f, { qty: 0 });
    const po = await purchasing.savePurchaseOrder(f.ctx.inventory, null, { supplierId: f.supplierId, locationId: f.main.locationId, items: [{ variantId: frame.variantId, quantity: 2, unitCostCents: 30000 }] });
    await purchasing.confirmPurchaseOrder(f.ctx.manager, po!.purchaseOrderId);
    await expect(
      catalog.updateProduct(f.ctx.owner, frame.productId, {
        name: "Now a service",
        categoryId: f.category.frames,
        productType: "service",
        variants: [{ id: frame.variantId, sku: frame.sku, priceCents: 100000 }],
      }),
    ).rejects.toThrow(/open purchase order/i);
    // Even if the type changed some other way, receiving re-checks it.
    await getDb().execute(sql`update products set product_type = 'service' where id = ${frame.productId}`);
    const detail = await purchasing.getPurchaseOrder(f.ctx.owner, po!.purchaseOrderId);
    await expect(purchasing.receivePurchaseOrder(f.ctx.inventory, { purchaseOrderId: po!.purchaseOrderId, items: [{ itemId: detail.items[0].item.id, quantity: 2 }], idempotencyKey: key() })).rejects.toThrow();
    expect(await onHand(frame.variantId, f.main.locationId)).toBe(0);
  });
});

describe("A4/A12: product CSV import", () => {
  it("leaves fields alone when a column is missing or blank, and validates every row before writing", async () => {
    const frame = await stockProduct(f, { price: 1500, reorderPoint: 4 });
    const [before] = await getDb().select().from(productVariants).where(eq(productVariants.id, frame.variantId));
    // Only some columns present; price blank → unchanged (previously became 0.00 and reorder points were wiped).
    await catalog.importProducts(f.ctx.owner, [{ sku: frame.sku, product_name: `Frame ${frame.sku}`, category: "Frames", price: "", barcode: "4800000000017" }]);
    const [after] = await getDb().select().from(productVariants).where(eq(productVariants.id, frame.variantId));
    expect(after.priceCents).toBe(before.priceCents);
    expect(after.reorderPoint).toBe(4);
    expect(after.barcode).toBe("4800000000017");

    const newSku = `NEW-${randomUUID().slice(0, 6)}`;
    await expect(catalog.importProducts(f.ctx.owner, [{ sku: newSku, product_name: "No price", category: "Frames" }])).rejects.toThrow(/price is required/i);
    await expect(
      catalog.importProducts(f.ctx.owner, [
        { sku: newSku, product_name: "Twice", category: "Frames", price: "10" },
        { sku: newSku.toLowerCase(), product_name: "Twice", category: "Frames", price: "12" },
      ]),
    ).rejects.toThrow(/already appears on row 2/i);
    await expect(catalog.importProducts(f.ctx.owner, [{ sku: newSku, product_name: "Bad", category: "Frames", price: "12", reorder_point: "lots" }])).rejects.toThrow(/whole number/i);
    // Nothing from the failed files was written.
    expect(await getDb().select().from(productVariants).where(eq(productVariants.sku, newSku.toUpperCase()))).toHaveLength(0);
    // A formula-guarded cell from our own export is restored.
    await catalog.importProducts(f.ctx.owner, [{ sku: newSku, product_name: "'=Guarded", category: "Frames", price: "12.50" }]);
    const [created] = await getDb().select().from(productVariants).where(eq(productVariants.sku, newSku.toUpperCase()));
    expect(created.priceCents).toBe(1250);
  });
});

// ─── Reports ─────────────────────────────────────────────────────────────────

describe("A13: report breakdowns", () => {
  it("category, product and staff breakdowns subtract returns, so they agree with net sales", async () => {
    const fx = await createBusiness("Breakdown");
    const frame = await stockProduct(fx, { price: 1120, qty: 5 });
    const sale = await sales.checkout(fx.ctx.sales, { branchId: fx.main.id, items: [{ variantId: frame.variantId, quantity: 2 }], payments: [{ method: "cash", amountCents: 224000 }], idempotencyKey: key() });
    const line = (await sales.getSale(fx.ctx.owner, sale.saleId)).items[0];
    await sales.refundSale(fx.ctx.manager, { saleId: sale.saleId, items: [{ saleItemId: line.id, quantity: 1, restock: true }], method: "cash", reason: "Returned", idempotencyKey: key() });
    const range = resolveRange("7d", "Asia/Manila");
    const [cats, top, byStaff, fin] = await Promise.all([
      reports.salesByCategory(fx.ctx.owner, range),
      reports.topProducts(fx.ctx.owner, range),
      reports.salesByStaff(fx.ctx.owner, range),
      reports.financialReport(fx.ctx.owner, range),
    ]);
    // One frame kept: 1,120 incl. VAT → 1,000 net.
    expect(fin.current.netSalesCents).toBe(100000);
    expect(cats.reduce((s, c) => s + c.netCents, 0)).toBe(100000);
    expect(top[0]).toMatchObject({ quantity: 1, netCents: 100000 });
    expect(byStaff.reduce((s, r) => s + r.netCents, 0)).toBe(100000);
  });

  it("the dashboard hides product revenue from staff without analytics access", async () => {
    const fx = await createBusiness("Gating");
    const frame = await stockProduct(fx, { qty: 2 });
    await sales.checkout(fx.ctx.sales, { branchId: fx.main.id, items: [{ variantId: frame.variantId, quantity: 1 }], payments: [{ method: "cash", amountCents: 100000 }], idempotencyKey: key() });
    const range = resolveRange("7d", "Asia/Manila");
    const forSales = await reports.dashboard(fx.ctx.sales, range);
    expect(forSales.topProducts?.[0]?.quantity).toBe(1);
    expect(forSales.topProducts?.[0]?.netCents).toBeNull();
    const forOwner = await reports.dashboard(fx.ctx.owner, range);
    expect(forOwner.topProducts?.[0]?.netCents).toBeGreaterThan(0);
  });
});

// ─── CRM, appointments and filters ───────────────────────────────────────────

describe("B6: public forms", () => {
  it("a phone number needs real digits, and a repeat submission never switches consent on", async () => {
    await expect(leads.capturePublicLead(f.businessId, { fullName: "No Digits", phone: "((((((", interest: "other" }, { ip: "192.0.2.10" })).rejects.toThrow();
    const phone = `+63 917 555 ${Math.floor(Math.random() * 9000 + 1000)}`;
    await leads.capturePublicLead(f.businessId, { fullName: "Consent Check", phone }, { ip: "192.0.2.11" });
    await leads.capturePublicLead(f.businessId, { fullName: "Consent Check", phone, smsConsent: true, marketingConsent: true }, { ip: "192.0.2.12" });
    const [lead] = await getDb().select().from(leadsTable).where(and(eq(leadsTable.businessId, f.businessId), eq(leadsTable.phone, phone)));
    expect(lead.smsConsent).toBe(false);
    expect(lead.marketingConsent).toBe(false);
    const acts = await getDb().select().from(leadActivities).where(eq(leadActivities.leadId, lead.id));
    expect(acts.some((a) => (a.metadata as { consentRequested?: { sms?: boolean } } | null)?.consentRequested?.sms === true)).toBe(true);
  });
});

describe("B13: inactive appointment types", () => {
  it("can't be booked online and offer no slots", async () => {
    const [type] = await getDb()
      .insert(appointmentTypes)
      .values({ businessId: f.businessId, code: `old-${randomUUID().slice(0, 4)}`, name: "Retired service", durationMinutes: 30, isPublic: true, isActive: false })
      .returning();
    const date = futureDay(2);
    expect(await appointments.availableSlots(f.businessId, { branchId: f.main.id, appointmentTypeId: type.id, date })).toEqual([]);
    await expect(
      appointments.requestPublicAppointment(f.businessId, { fullName: "Web Booker", phone: "+63 917 222 3344", branchId: f.main.id, appointmentTypeId: type.id, date, time: "10:00" }, { ip: "192.0.2.20" }),
    ).rejects.toThrow(/can't be booked online/i);
  });
});

describe("B15: prescriptions", () => {
  it("an edit can't move a prescription to another patient", async () => {
    const a = await customer(f, "Rx Owner");
    const b = await customer(f, "Rx Other");
    const rx = await customers.savePrescription(f.ctx.owner, null, { customerId: a.id, examinedOn: "2026-01-10", odSphere: -1.25, osSphere: -1.5 });
    await expect(customers.savePrescription(f.ctx.owner, rx!.prescriptionId, { customerId: b.id, examinedOn: "2026-01-10", odSphere: -1.25, osSphere: -1.5 })).rejects.toThrow(/not found|prescription/i);
    expect(await customers.listPrescriptions(f.ctx.owner, b.id)).toHaveLength(0);
    expect(await customers.listPrescriptions(f.ctx.owner, a.id)).toHaveLength(1);
  });
});

describe("B16: malformed filters", () => {
  it("are ignored instead of failing the page", async () => {
    await expect(leads.listLeads(f.ctx.owner, { stage: "bogus" as never, assigned: "not-a-uuid", page: Number.NaN, pageSize: Number.POSITIVE_INFINITY })).resolves.toBeTruthy();
    await expect(expenses.listExpenses(f.ctx.owner, { categoryId: "x' or 1=1" } as never)).resolves.toBeTruthy();
    await expect(staff.listActivity(f.ctx.owner, { actor: "nope" })).resolves.toBeTruthy();
  });
});

describe("B18: converting a lead whose GHL contact already belongs to a customer", () => {
  it("creates the customer without the contact id instead of failing", async () => {
    const holder = await customer(f, "Ghl Holder");
    const contactId = `ghl-${randomUUID().slice(0, 8)}`;
    await getDb().update(customersTable).set({ externalGhlContactId: contactId }).where(eq(customersTable.id, holder.id));
    const lead = await leads.createLead(f.ctx.manager, { firstName: "Second", lastName: "Person", email: `second-${randomUUID().slice(0, 6)}@test.example` });
    await getDb().update(leadsTable).set({ externalGhlContactId: contactId }).where(eq(leadsTable.id, lead!.id));
    const res = await leads.convertLead(f.ctx.manager, lead!.id);
    expect(res!.customerId).not.toBe(holder.id);
    const [created] = await getDb().select().from(customersTable).where(eq(customersTable.id, res!.customerId));
    expect(created.externalGhlContactId).toBeNull();
  });
});
