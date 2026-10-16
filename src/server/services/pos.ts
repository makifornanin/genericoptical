import { and, asc, desc, eq, gt, gte, inArray, isNull, lte, ne, sql } from "drizzle-orm";
import { HELD_CART_TTL_DAYS, heldCartInput } from "@/lib/schemas";
import { getDb } from "@/server/db";
import {
  branches,
  businessMemberships,
  customers,
  inventoryBalances,
  posHeldCarts,
  products,
  productVariants,
  saleItems,
  sales,
  users,
} from "@/server/db/schema";
import { audit, can, conflict, invalid, mapDbError, notFound, now, requirePermission, type Ctx } from "./core";
import { locationForBranch } from "./inventory";

/*
 * Point-of-sale helpers around checkout (which lives in sales.ts): held carts, counter insights and
 * the linked customer's context. Everything is scoped to ctx.businessId.
 */

const db = () => getDb();

async function activeBranchId(ctx: Ctx, branchId: string) {
  const [b] = await db()
    .select({ id: branches.id })
    .from(branches)
    .where(and(eq(branches.businessId, ctx.businessId), eq(branches.id, branchId), eq(branches.isActive, true)))
    .limit(1);
  if (!b) throw invalid("Choose an active branch.");
  return b.id;
}

const customerName = sql<string | null>`case when ${customers.id} is null then null else ${customers.firstName} || ' ' || ${customers.lastName} end`;

// ─── Held carts ──────────────────────────────────────────────────────────────

/**
 * Puts the current cart on hold. Holding does NOT reserve stock (no reservation rows, balances
 * untouched), so a held cart can never block another sale; it expires after HELD_CART_TTL_DAYS.
 */
export async function holdCart(ctx: Ctx, raw: unknown) {
  requirePermission(ctx, "pos.use");
  const input = heldCartInput.parse(raw);
  const branchId = await activeBranchId(ctx, input.branchId);
  const variantIds = [...new Set(input.lines.map((l) => l.variantId))];
  const found = await db()
    .select({ id: productVariants.id })
    .from(productVariants)
    .where(and(eq(productVariants.businessId, ctx.businessId), inArray(productVariants.id, variantIds)));
  if (found.length !== variantIds.length) throw invalid("One of the items no longer exists.");
  let label = input.label;
  if (input.customerId) {
    const [c] = await db()
      .select({ name: sql<string>`${customers.firstName} || ' ' || ${customers.lastName}` })
      .from(customers)
      .where(and(eq(customers.businessId, ctx.businessId), eq(customers.id, input.customerId), isNull(customers.archivedAt)))
      .limit(1);
    if (!c) throw invalid("Choose an active customer.");
    label ||= c.name;
  }
  const at = now(ctx);
  label ||= `Cart held ${at.toISOString().slice(11, 16)} UTC`;
  const itemCount = input.lines.reduce((n, l) => n + l.qty, 0);
  try {
    return await db().transaction(async (tx) => {
      const [row] = await tx
        .insert(posHeldCarts)
        .values({
          businessId: ctx.businessId,
          branchId,
          label,
          customerId: input.customerId,
          cart: { lines: input.lines, discount: input.discount, notes: input.notes },
          itemCount,
          estimatedTotalCents: input.estimatedTotalCents,
          heldByMembershipId: ctx.membershipId,
          createdAt: at,
          expiresAt: new Date(at.getTime() + HELD_CART_TTL_DAYS * 86_400_000),
        })
        .returning({ id: posHeldCarts.id });
      await audit(tx, ctx, { action: "pos.cart_held", entityType: "pos_held_cart", entityId: row.id, summary: `Held a cart (${itemCount} item${itemCount === 1 ? "" : "s"}): ${label}` });
      return { id: row.id, label };
    });
  } catch (error) {
    mapDbError(error);
  }
}

export async function listHeldCarts(ctx: Ctx, branchId: string) {
  requirePermission(ctx, "pos.use");
  const at = now(ctx);
  // Expired holds are closed lazily so they never linger in the list.
  await db()
    .update(posHeldCarts)
    .set({ status: "cancelled", closedAt: at })
    .where(and(eq(posHeldCarts.businessId, ctx.businessId), eq(posHeldCarts.status, "held"), lte(posHeldCarts.expiresAt, at)));
  return db()
    .select({
      id: posHeldCarts.id,
      label: posHeldCarts.label,
      itemCount: posHeldCarts.itemCount,
      estimatedTotalCents: posHeldCarts.estimatedTotalCents,
      customerId: posHeldCarts.customerId,
      customerName,
      heldBy: users.name,
      createdAt: posHeldCarts.createdAt,
      expiresAt: posHeldCarts.expiresAt,
    })
    .from(posHeldCarts)
    .leftJoin(customers, eq(customers.id, posHeldCarts.customerId))
    .leftJoin(businessMemberships, eq(businessMemberships.id, posHeldCarts.heldByMembershipId))
    .leftJoin(users, eq(users.id, businessMemberships.userId))
    .where(and(eq(posHeldCarts.businessId, ctx.businessId), eq(posHeldCarts.branchId, branchId), eq(posHeldCarts.status, "held"), gt(posHeldCarts.expiresAt, at)))
    .orderBy(desc(posHeldCarts.createdAt))
    .limit(50);
}

/** Takes a held cart back to the counter. Exactly-once: a second resume of the same cart is refused. */
export async function resumeHeldCart(ctx: Ctx, id: string) {
  requirePermission(ctx, "pos.use");
  try {
    return await db().transaction(async (tx) => {
      const [row] = await tx
        .select()
        .from(posHeldCarts)
        .where(and(eq(posHeldCarts.businessId, ctx.businessId), eq(posHeldCarts.id, id)))
        .for("update");
      if (!row) throw notFound("Held cart");
      if (row.status !== "held") throw conflict(`This cart was already ${row.status === "resumed" ? "resumed" : "cancelled"}.`);
      const at = now(ctx);
      if (row.expiresAt <= at) throw invalid("This held cart has expired.");
      await tx.update(posHeldCarts).set({ status: "resumed", closedAt: at, closedByMembershipId: ctx.membershipId }).where(eq(posHeldCarts.id, row.id));
      let customer: { id: string; name: string; code: string; phone: string | null } | null = null;
      if (row.customerId) {
        const [c] = await tx
          .select({ id: customers.id, firstName: customers.firstName, lastName: customers.lastName, code: customers.code, phone: customers.phone })
          .from(customers)
          .where(and(eq(customers.businessId, ctx.businessId), eq(customers.id, row.customerId), isNull(customers.archivedAt)))
          .limit(1);
        if (c) customer = { id: c.id, name: `${c.firstName} ${c.lastName}`, code: c.code, phone: c.phone };
      }
      await audit(tx, ctx, { action: "pos.cart_resumed", entityType: "pos_held_cart", entityId: row.id, summary: `Resumed held cart: ${row.label}` });
      return { id: row.id, branchId: row.branchId, label: row.label, cart: row.cart, customer };
    });
  } catch (error) {
    mapDbError(error);
  }
}

export async function cancelHeldCart(ctx: Ctx, id: string) {
  requirePermission(ctx, "pos.use");
  try {
    return await db().transaction(async (tx) => {
      const [row] = await tx
        .update(posHeldCarts)
        .set({ status: "cancelled", closedAt: now(ctx), closedByMembershipId: ctx.membershipId })
        .where(and(eq(posHeldCarts.businessId, ctx.businessId), eq(posHeldCarts.id, id), eq(posHeldCarts.status, "held")))
        .returning({ id: posHeldCarts.id, label: posHeldCarts.label });
      if (!row) throw conflict("This cart is no longer on hold.");
      await audit(tx, ctx, { action: "pos.cart_cancelled", entityType: "pos_held_cart", entityId: row.id, summary: `Discarded held cart: ${row.label}` });
      return row;
    });
  } catch (error) {
    mapDbError(error);
  }
}

// ─── Counter insights ────────────────────────────────────────────────────────

/** Branch insights computed from recorded sales and stock (no estimates, no AI). */
export async function posInsights(ctx: Ctx, branchId: string) {
  requirePermission(ctx, "pos.use");
  await activeBranchId(ctx, branchId);
  const location = await locationForBranch(db(), ctx, branchId);
  const at = now(ctx);
  const since30 = new Date(at.getTime() - 30 * 86_400_000);
  const since90 = new Date(at.getTime() - 90 * 86_400_000);
  const seeSales = can(ctx, "sales.view");
  const seeCustomers = can(ctx, "customers.view");
  const soldQty = sql<number>`sum(${saleItems.quantity} - ${saleItems.refundedQuantity})::int`;
  const available = sql<number>`(${inventoryBalances.onHand} - ${inventoryBalances.reserved})::int`;

  const [popular, lowStock, repeat, outstanding, outstandingTotals, recent] = await Promise.all([
    db()
      .select({ variantId: saleItems.variantId, productName: saleItems.productName, variantLabel: saleItems.variantLabel, quantity: soldQty })
      .from(saleItems)
      .innerJoin(sales, eq(sales.id, saleItems.saleId))
      .where(and(eq(sales.businessId, ctx.businessId), eq(sales.branchId, branchId), eq(sales.status, "completed"), gte(sales.completedAt, since30)))
      .groupBy(saleItems.variantId, saleItems.productName, saleItems.variantLabel)
      .having(sql`sum(${saleItems.quantity} - ${saleItems.refundedQuantity}) > 0`)
      .orderBy(desc(soldQty), asc(saleItems.productName))
      .limit(8),
    db()
      .select({ variantId: productVariants.id, productName: products.name, variantLabel: productVariants.label, sku: productVariants.sku, available, reorderPoint: productVariants.reorderPoint })
      .from(inventoryBalances)
      .innerJoin(productVariants, eq(productVariants.id, inventoryBalances.variantId))
      .innerJoin(products, eq(products.id, productVariants.productId))
      .where(
        and(
          eq(inventoryBalances.businessId, ctx.businessId),
          eq(inventoryBalances.locationId, location.id),
          eq(products.productType, "stock"),
          eq(products.isActive, true),
          isNull(products.archivedAt),
          eq(productVariants.isActive, true),
          isNull(productVariants.archivedAt),
          sql`${inventoryBalances.onHand} - ${inventoryBalances.reserved} <= greatest(${productVariants.reorderPoint}, 1)`,
        ),
      )
      .orderBy(asc(available), asc(products.name))
      .limit(10),
    seeCustomers && seeSales
      ? db()
          .select({ customerId: customers.id, name: sql<string>`${customers.firstName} || ' ' || ${customers.lastName}`, code: customers.code, visits: sql<number>`count(*)::int`, lastVisitAt: sql<Date>`max(${sales.completedAt})`, spentCents: sql<number>`sum(${sales.totalCents} - ${sales.refundedCents})::bigint` })
          .from(sales)
          .innerJoin(customers, eq(customers.id, sales.customerId))
          .where(and(eq(sales.businessId, ctx.businessId), eq(sales.branchId, branchId), eq(sales.status, "completed"), gte(sales.completedAt, since90)))
          .groupBy(customers.id, customers.firstName, customers.lastName, customers.code)
          .having(sql`count(*) >= 2`)
          .orderBy(desc(sql`count(*)`), desc(sql`max(${sales.completedAt})`))
          .limit(6)
      : Promise.resolve([]),
    seeSales
      ? db()
          .select({ saleId: sales.id, number: sales.number, customerName, balanceDueCents: sales.balanceDueCents, createdAt: sales.createdAt })
          .from(sales)
          .leftJoin(customers, eq(customers.id, sales.customerId))
          .where(and(eq(sales.businessId, ctx.businessId), eq(sales.branchId, branchId), ne(sales.status, "cancelled"), gt(sales.balanceDueCents, 0)))
          .orderBy(asc(sales.createdAt))
          .limit(8)
      : Promise.resolve([]),
    seeSales
      ? db()
          .select({ count: sql<number>`count(*)::int`, totalCents: sql<number>`coalesce(sum(${sales.balanceDueCents}), 0)::bigint` })
          .from(sales)
          .where(and(eq(sales.businessId, ctx.businessId), eq(sales.branchId, branchId), ne(sales.status, "cancelled"), gt(sales.balanceDueCents, 0)))
      : Promise.resolve([{ count: 0, totalCents: 0 }]),
    seeSales
      ? db()
          .select({ saleId: sales.id, number: sales.number, customerName, totalCents: sales.totalCents, paymentStatus: sales.paymentStatus, status: sales.status, createdAt: sales.createdAt })
          .from(sales)
          .leftJoin(customers, eq(customers.id, sales.customerId))
          .where(and(eq(sales.businessId, ctx.businessId), eq(sales.branchId, branchId)))
          .orderBy(desc(sales.createdAt))
          .limit(8)
      : Promise.resolve([]),
  ]);
  return {
    popular,
    lowStock,
    repeatCustomers: repeat.map((r) => ({ ...r, spentCents: Number(r.spentCents), lastVisitAt: new Date(r.lastVisitAt) })),
    outstanding: { count: outstandingTotals[0]?.count ?? 0, totalCents: Number(outstandingTotals[0]?.totalCents ?? 0), sales: outstanding },
    recent,
    visible: { sales: seeSales, customers: seeCustomers && seeSales },
  };
}

// ─── Linked customer ─────────────────────────────────────────────────────────

/** What the cashier should know about the linked customer: balances owed and recent purchases. */
export async function posCustomerContext(ctx: Ctx, customerId: string) {
  requirePermission(ctx, "pos.use");
  requirePermission(ctx, "customers.view");
  const [c] = await db()
    .select({ id: customers.id })
    .from(customers)
    .where(and(eq(customers.businessId, ctx.businessId), eq(customers.id, customerId)))
    .limit(1);
  if (!c) throw notFound("Customer");
  if (!can(ctx, "sales.view")) return { visits: null, lastPurchaseAt: null, outstanding: null, recentItems: [] };
  const [stats, owed, recentItems] = await Promise.all([
    db()
      .select({ visits: sql<number>`count(*)::int`, lastPurchaseAt: sql<Date | null>`max(${sales.completedAt})` })
      .from(sales)
      .where(and(eq(sales.businessId, ctx.businessId), eq(sales.customerId, customerId), eq(sales.status, "completed"))),
    db()
      .select({ count: sql<number>`count(*)::int`, totalCents: sql<number>`coalesce(sum(${sales.balanceDueCents}), 0)::bigint` })
      .from(sales)
      .where(and(eq(sales.businessId, ctx.businessId), eq(sales.customerId, customerId), ne(sales.status, "cancelled"), gt(sales.balanceDueCents, 0))),
    db()
      .select({ productName: saleItems.productName, variantLabel: saleItems.variantLabel, quantity: saleItems.quantity, saleNumber: sales.number, at: sales.createdAt })
      .from(saleItems)
      .innerJoin(sales, eq(sales.id, saleItems.saleId))
      .where(and(eq(sales.businessId, ctx.businessId), eq(sales.customerId, customerId), ne(sales.status, "cancelled")))
      .orderBy(desc(sales.createdAt), asc(saleItems.sortOrder))
      .limit(5),
  ]);
  return {
    visits: stats[0]?.visits ?? 0,
    lastPurchaseAt: stats[0]?.lastPurchaseAt ? new Date(stats[0].lastPurchaseAt) : null,
    outstanding: { count: owed[0]?.count ?? 0, totalCents: Number(owed[0]?.totalCents ?? 0) },
    recentItems,
  };
}
