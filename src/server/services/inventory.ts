import { randomUUID } from "node:crypto";
import { and, asc, desc, eq, gte, inArray, lt, sql, type SQL } from "drizzle-orm";
import { adjustmentInput, transferInput } from "@/lib/schemas";
import type { Executor, Tx } from "@/server/db";
import {
  inventoryBalances,
  inventoryLocations,
  products,
  productVariants,
  stockMovements,
  stockReservations,
} from "@/server/db/schema";
import {
  AppError,
  audit,
  db,
  inTx,
  invalid,
  isUniqueViolation,
  likePattern,
  now,
  pageOf,
  paging,
  requirePermission,
  type Ctx,
} from "./core";

type MovementType = (typeof stockMovements.$inferInsert)["type"];

export type BalanceRow = { variantId: string; locationId: string; onHand: number; reserved: number };

/**
 * Locks (and creates if missing) the balance rows for the given variants at one location,
 * always in variant-id order so concurrent transactions can't deadlock each other.
 */
export async function lockBalances(tx: Tx, ctx: Ctx, locationId: string, variantIds: string[]): Promise<Map<string, BalanceRow>> {
  const ids = [...new Set(variantIds)].sort();
  if (ids.length === 0) return new Map();
  await tx
    .insert(inventoryBalances)
    .values(ids.map((variantId) => ({ businessId: ctx.businessId, variantId, locationId })))
    .onConflictDoNothing();
  const rows = await tx
    .select({
      variantId: inventoryBalances.variantId,
      locationId: inventoryBalances.locationId,
      onHand: inventoryBalances.onHand,
      reserved: inventoryBalances.reserved,
    })
    .from(inventoryBalances)
    .where(
      and(
        eq(inventoryBalances.businessId, ctx.businessId),
        eq(inventoryBalances.locationId, locationId),
        inArray(inventoryBalances.variantId, ids),
      ),
    )
    .orderBy(asc(inventoryBalances.variantId))
    .for("update");
  return new Map(rows.map((r) => [r.variantId, r]));
}

type MovementInput = {
  variantId: string;
  locationId: string;
  type: MovementType;
  /** Signed change to on-hand. */
  quantity: number;
  /** Also change reserved by this amount (negative when consuming a reservation). */
  reservedDelta?: number;
  unitCostCents?: number;
  reason?: string | null;
  referenceType?: string | null;
  referenceId?: string | null;
  referenceLineId?: string | null;
  idempotencyKey?: string | null;
};

/**
 * Applies one stock movement to a balance row that the caller has already locked with
 * `lockBalances`. Writes the movement record and the new balance together. The database
 * CHECK (on_hand >= 0, reserved <= on_hand) is the final guard against overselling.
 */
export async function applyMovement(tx: Tx, ctx: Ctx, balances: Map<string, BalanceRow>, m: MovementInput) {
  const bal = balances.get(m.variantId);
  if (!bal || bal.locationId !== m.locationId) throw new Error("Balance row must be locked before applying a movement.");
  if (m.quantity === 0) return bal;
  const reservedDelta = m.reservedDelta ?? 0;
  const onHand = bal.onHand + m.quantity;
  const reserved = bal.reserved + reservedDelta;
  if (onHand < 0 || reserved < 0 || reserved > onHand) {
    throw new AppError("Not enough stock available for this change.", "conflict");
  }
  if (m.idempotencyKey) {
    const [existing] = await tx
      .select({ id: stockMovements.id })
      .from(stockMovements)
      .where(and(eq(stockMovements.businessId, ctx.businessId), eq(stockMovements.idempotencyKey, m.idempotencyKey)))
      .limit(1);
    if (existing) return bal; // Already applied — retried request; never deduct twice.
  }
  await tx
    .update(inventoryBalances)
    .set({ onHand, reserved, updatedAt: now(ctx) })
    .where(and(eq(inventoryBalances.variantId, m.variantId), eq(inventoryBalances.locationId, m.locationId)));
  await tx.insert(stockMovements).values({
    businessId: ctx.businessId,
    variantId: m.variantId,
    locationId: m.locationId,
    type: m.type,
    quantity: m.quantity,
    onHandAfter: onHand,
    unitCostCents: m.unitCostCents ?? 0,
    reason: m.reason ?? null,
    referenceType: m.referenceType ?? null,
    referenceId: m.referenceId ?? null,
    referenceLineId: m.referenceLineId ?? null,
    idempotencyKey: m.idempotencyKey ?? null,
    actorMembershipId: ctx.membershipId,
    createdAt: now(ctx),
  });
  bal.onHand = onHand;
  bal.reserved = reserved;
  return bal;
}

/** Changes only the reserved count (reservations don't move physical stock). */
export async function applyReservationDelta(tx: Tx, ctx: Ctx, balances: Map<string, BalanceRow>, variantId: string, delta: number) {
  const bal = balances.get(variantId);
  if (!bal) throw new Error("Balance row must be locked first.");
  const reserved = bal.reserved + delta;
  if (reserved < 0 || reserved > bal.onHand) throw new AppError("Not enough available stock to reserve.", "conflict");
  await tx
    .update(inventoryBalances)
    .set({ reserved, updatedAt: now(ctx) })
    .where(and(eq(inventoryBalances.variantId, variantId), eq(inventoryBalances.locationId, bal.locationId)));
  bal.reserved = reserved;
}

/**
 * Adds received units and blends the variant's moving weighted-average cost.
 * Locks the variant row so concurrent receipts compute cost serially.
 */
export async function receiveUnits(
  tx: Tx,
  ctx: Ctx,
  balances: Map<string, BalanceRow>,
  m: Omit<MovementInput, "type" | "quantity" | "unitCostCents"> & { quantity: number; unitCostCents: number; type?: MovementType },
) {
  if (m.quantity <= 0) throw invalid("Received quantity must be positive.");
  const [variant] = await tx
    .select({ id: productVariants.id, costCents: productVariants.costCents })
    .from(productVariants)
    .where(and(eq(productVariants.businessId, ctx.businessId), eq(productVariants.id, m.variantId)))
    .for("update");
  if (!variant) throw invalid("Unknown product variant.");
  const [{ total }] = await tx
    .select({ total: sql<number>`coalesce(sum(${inventoryBalances.onHand}), 0)::int` })
    .from(inventoryBalances)
    .where(and(eq(inventoryBalances.businessId, ctx.businessId), eq(inventoryBalances.variantId, m.variantId)));
  const existing = Math.max(0, Number(total));
  const blended = existing + m.quantity > 0 ? Math.round((existing * variant.costCents + m.quantity * m.unitCostCents) / (existing + m.quantity)) : m.unitCostCents;
  await tx.update(productVariants).set({ costCents: blended, updatedAt: now(ctx) }).where(eq(productVariants.id, m.variantId));
  return applyMovement(tx, ctx, balances, { ...m, type: m.type ?? "receipt" });
}

// ─── Locations ───────────────────────────────────────────────────────────────

export async function listLocations(ctx: Ctx, ex: Executor = db()) {
  return ex
    .select()
    .from(inventoryLocations)
    .where(eq(inventoryLocations.businessId, ctx.businessId))
    .orderBy(asc(inventoryLocations.name));
}

export async function locationForBranch(ex: Executor, ctx: Ctx, branchId: string) {
  const [loc] = await ex
    .select()
    .from(inventoryLocations)
    .where(and(eq(inventoryLocations.businessId, ctx.businessId), eq(inventoryLocations.branchId, branchId), eq(inventoryLocations.isActive, true)))
    .limit(1);
  if (!loc) throw invalid("This branch has no active stock location.");
  return loc;
}

async function assertLocation(ex: Executor, ctx: Ctx, locationId: string) {
  const [loc] = await ex
    .select()
    .from(inventoryLocations)
    .where(and(eq(inventoryLocations.businessId, ctx.businessId), eq(inventoryLocations.id, locationId)))
    .limit(1);
  if (!loc) throw invalid("Unknown stock location.");
  return loc;
}

async function assertTrackedVariant(ex: Executor, ctx: Ctx, variantId: string) {
  const [row] = await ex
    .select({ id: productVariants.id, sku: productVariants.sku, name: products.name, label: productVariants.label, productType: products.productType, costCents: productVariants.costCents })
    .from(productVariants)
    .innerJoin(products, eq(products.id, productVariants.productId))
    .where(and(eq(productVariants.businessId, ctx.businessId), eq(productVariants.id, variantId)))
    .limit(1);
  if (!row) throw invalid("Unknown product.");
  if (row.productType !== "stock") throw invalid("Only stocked items have inventory. Services and made-to-order items aren't tracked.");
  return row;
}

// ─── Manual operations ───────────────────────────────────────────────────────

export async function adjustStock(ctx: Ctx, raw: unknown) {
  requirePermission(ctx, "inventory.adjust");
  const input = adjustmentInput.parse(raw);
  return inTx(async (tx) => {
    const variant = await assertTrackedVariant(tx, ctx, input.variantId);
    const location = await assertLocation(tx, ctx, input.locationId);
    const balances = await lockBalances(tx, ctx, input.locationId, [input.variantId]);
    const bal = balances.get(input.variantId)!;
    let delta: number;
    let type: MovementType;
    switch (input.mode) {
      case "add":
        delta = input.quantity;
        type = "adjustment";
        break;
      case "remove":
        delta = -input.quantity;
        type = "adjustment";
        break;
      case "damage":
        delta = -input.quantity;
        type = "damage";
        break;
      case "set":
        delta = input.quantity - bal.onHand;
        type = "count";
        break;
    }
    if (delta === 0) throw invalid(input.mode === "set" ? "The counted quantity matches the current stock." : "Enter a quantity above zero.");
    if (delta < 0 && bal.onHand + delta < bal.reserved) {
      throw new AppError(
        `Only ${bal.onHand - bal.reserved} unit(s) are free; ${bal.reserved} are reserved for customer orders. Release reservations first.`,
        "conflict",
      );
    }
    try {
      await applyMovement(tx, ctx, balances, {
        variantId: input.variantId,
        locationId: input.locationId,
        type,
        quantity: delta,
        unitCostCents: variant.costCents,
        reason: input.reason,
        referenceType: "adjustment",
        idempotencyKey: `adj:${input.idempotencyKey}`,
      });
    } catch (error) {
      if (isUniqueViolation(error, "stock_movements_idempotency_key")) return { onHand: bal.onHand };
      throw error;
    }
    const verb = type === "damage" ? "Recorded damage of" : type === "count" ? "Counted" : delta > 0 ? "Added" : "Removed";
    await audit(tx, ctx, {
      action: `inventory.${type}`,
      entityType: "product_variant",
      entityId: input.variantId,
      summary: `${verb} ${Math.abs(delta)} × ${variant.name} (${variant.sku}) at ${location.name}: ${input.reason}`,
      changes: { quantity: delta, onHandAfter: bal.onHand },
    });
    return { onHand: bal.onHand };
  });
}

export async function transferStock(ctx: Ctx, raw: unknown) {
  requirePermission(ctx, "inventory.transfer");
  const input = transferInput.parse(raw);
  return inTx(async (tx) => {
    const variant = await assertTrackedVariant(tx, ctx, input.variantId);
    const from = await assertLocation(tx, ctx, input.fromLocationId);
    const to = await assertLocation(tx, ctx, input.toLocationId);
    // Lock both locations in a fixed order (by location id) to avoid deadlocks.
    const [first, second] = [from.id, to.id].sort();
    const lockA = await lockBalances(tx, ctx, first, [input.variantId]);
    const lockB = await lockBalances(tx, ctx, second, [input.variantId]);
    const fromBal = first === from.id ? lockA : lockB;
    const toBal = first === to.id ? lockA : lockB;
    const src = fromBal.get(input.variantId)!;
    if (src.onHand - src.reserved < input.quantity) {
      throw new AppError(`Only ${src.onHand - src.reserved} unit(s) are available to transfer from ${from.name}.`, "conflict");
    }
    const referenceId = randomUUID();
    await applyMovement(tx, ctx, fromBal, {
      variantId: input.variantId,
      locationId: from.id,
      type: "transfer_out",
      quantity: -input.quantity,
      unitCostCents: variant.costCents,
      reason: input.reason,
      referenceType: "transfer",
      referenceId,
      idempotencyKey: `xfer:${input.idempotencyKey}:out`,
    });
    await applyMovement(tx, ctx, toBal, {
      variantId: input.variantId,
      locationId: to.id,
      type: "transfer_in",
      quantity: input.quantity,
      unitCostCents: variant.costCents,
      reason: input.reason,
      referenceType: "transfer",
      referenceId,
      idempotencyKey: `xfer:${input.idempotencyKey}:in`,
    });
    await audit(tx, ctx, {
      action: "inventory.transfer",
      entityType: "product_variant",
      entityId: input.variantId,
      summary: `Transferred ${input.quantity} × ${variant.name} (${variant.sku}) from ${from.name} to ${to.name}`,
    });
    return { referenceId };
  });
}

// ─── Queries ─────────────────────────────────────────────────────────────────

export type StockFilter = {
  q?: string;
  locationId?: string | null;
  status?: "all" | "low" | "out" | "in";
  categoryId?: string | null;
  page?: number;
  pageSize?: number;
  sort?: string;
  dir?: "asc" | "desc";
};

/** Stock levels per variant (summed across locations unless one is chosen). */
export async function listStock(ctx: Ctx, f: StockFilter) {
  requirePermission(ctx, "inventory.view");
  const { page, pageSize, offset } = paging(f);
  const locFilter = f.locationId ? sql`and b.location_id = ${f.locationId}` : sql``;
  const conds: SQL[] = [
    sql`v.business_id = ${ctx.businessId}`,
    sql`p.product_type = 'stock'`,
    sql`v.archived_at is null`,
    sql`p.archived_at is null`,
  ];
  if (f.q) conds.push(sql`(p.name ilike ${likePattern(f.q)} or v.sku ilike ${likePattern(f.q)} or coalesce(p.brand,'') ilike ${likePattern(f.q)} or v.label ilike ${likePattern(f.q)})`);
  if (f.categoryId) conds.push(sql`p.category_id = ${f.categoryId}`);
  const statusCond =
    f.status === "out"
      ? sql`where available <= 0`
      : f.status === "low"
        ? sql`where available > 0 and available <= reorder_point`
        : f.status === "in"
          ? sql`where available > reorder_point`
          : sql``;
  const sortCol =
    {
      name: sql`product_name`,
      sku: sql`sku`,
      on_hand: sql`on_hand`,
      available: sql`available`,
      value: sql`stock_value`,
      reorder: sql`reorder_point`,
    }[f.sort ?? "name"] ?? sql`product_name`;
  const dir = f.dir === "desc" ? sql`desc` : sql`asc`;

  const base = sql`
    with s as (
      select v.id as variant_id, p.id as product_id, p.name as product_name, p.brand, v.sku, v.label,
             c.name as category_name, v.reorder_point, v.cost_cents, v.price_cents,
             coalesce(sum(b.on_hand), 0)::int as on_hand,
             coalesce(sum(b.reserved), 0)::int as reserved,
             (coalesce(sum(b.on_hand), 0) - coalesce(sum(b.reserved), 0))::int as available,
             (coalesce(sum(b.on_hand), 0) * v.cost_cents)::bigint as stock_value
      from product_variants v
      join products p on p.id = v.product_id
      join product_categories c on c.id = p.category_id
      left join inventory_balances b on b.variant_id = v.id ${locFilter}
      where ${sql.join(conds, sql` and `)}
      group by v.id, p.id, c.name
    )`;
  const rows = await db().execute<{
    variant_id: string;
    product_id: string;
    product_name: string;
    brand: string | null;
    sku: string;
    label: string;
    category_name: string;
    reorder_point: number;
    cost_cents: number;
    price_cents: number;
    on_hand: number;
    reserved: number;
    available: number;
    stock_value: number;
  }>(sql`${base} select * from s ${statusCond} order by ${sortCol} ${dir}, sku asc limit ${pageSize} offset ${offset}`);
  const [{ count }] = (await db().execute<{ count: number }>(sql`${base} select count(*)::int as count from s ${statusCond}`)).rows;
  return pageOf(
    rows.rows.map((r) => ({
      variantId: r.variant_id,
      productId: r.product_id,
      productName: r.product_name,
      brand: r.brand,
      sku: r.sku,
      label: r.label,
      categoryName: r.category_name,
      reorderPoint: Number(r.reorder_point),
      costCents: Number(r.cost_cents),
      priceCents: Number(r.price_cents),
      onHand: Number(r.on_hand),
      reserved: Number(r.reserved),
      available: Number(r.available),
      stockValueCents: Number(r.stock_value),
    })),
    Number(count),
    page,
    pageSize,
  );
}

/**
 * Totals for the inventory header and dashboard. Low/out counts are evaluated per
 * variant × location, because each branch must hold its own reorder point.
 */
export async function stockSummary(ctx: Ctx, locationId?: string | null) {
  const locFilter = locationId ? sql`and l.id = ${locationId}` : sql``;
  const res = await db().execute<{ units: number; value: number; low: number; out: number; tracked: number; pairs: number }>(sql`
    with pairs as (
      select v.id as variant_id, l.id as location_id, v.reorder_point, v.cost_cents,
             coalesce(b.on_hand, 0) as on_hand, coalesce(b.reserved, 0) as reserved
      from product_variants v
      join products p on p.id = v.product_id
      cross join inventory_locations l
      left join inventory_balances b on b.variant_id = v.id and b.location_id = l.id
      where v.business_id = ${ctx.businessId} and l.business_id = ${ctx.businessId}
        and l.is_active and p.product_type = 'stock' and v.is_active and p.is_active
        and v.archived_at is null and p.archived_at is null ${locFilter}
    )
    select coalesce(sum(on_hand), 0)::int as units,
           coalesce(sum(on_hand * cost_cents), 0)::bigint as value,
           count(*) filter (where on_hand - reserved > 0 and on_hand - reserved <= reorder_point)::int as low,
           count(*) filter (where on_hand - reserved <= 0)::int as out,
           count(distinct variant_id)::int as tracked,
           count(*)::int as pairs
    from pairs`);
  const r = res.rows[0];
  return { units: Number(r.units), valueCents: Number(r.value), low: Number(r.low), out: Number(r.out), tracked: Number(r.tracked), healthy: Number(r.pairs) - Number(r.low) - Number(r.out) };
}

/** Variant × location pairs at or below their reorder point (inventory alerts). */
export async function lowStockAlerts(ctx: Ctx, opts: { locationId?: string | null; limit?: number } = {}) {
  const locFilter = opts.locationId ? sql`and l.id = ${opts.locationId}` : sql``;
  const res = await db().execute<{
    variant_id: string;
    product_id: string;
    product_name: string;
    sku: string;
    label: string;
    location_name: string;
    location_id: string;
    available: number;
    reorder_point: number;
    reorder_qty: number;
  }>(sql`
    select v.id as variant_id, p.id as product_id, p.name as product_name, v.sku, v.label, l.name as location_name, l.id as location_id,
           (coalesce(b.on_hand, 0) - coalesce(b.reserved, 0))::int as available, v.reorder_point, v.reorder_qty
    from product_variants v
    join products p on p.id = v.product_id
    cross join inventory_locations l
    left join inventory_balances b on b.variant_id = v.id and b.location_id = l.id
    where v.business_id = ${ctx.businessId} and l.business_id = ${ctx.businessId} and l.is_active
      and p.product_type = 'stock' and v.is_active and p.is_active and v.archived_at is null and p.archived_at is null
      and (coalesce(b.on_hand, 0) - coalesce(b.reserved, 0)) <= v.reorder_point ${locFilter}
    order by (coalesce(b.on_hand, 0) - coalesce(b.reserved, 0)) asc, p.name asc
    limit ${opts.limit ?? 50}`);
  return res.rows.map((r) => ({
    variantId: r.variant_id,
    productId: r.product_id,
    productName: r.product_name,
    sku: r.sku,
    label: r.label,
    locationName: r.location_name,
    locationId: r.location_id,
    available: Number(r.available),
    reorderPoint: Number(r.reorder_point),
    reorderQty: Number(r.reorder_qty),
  }));
}

export async function variantBalances(ctx: Ctx, variantId: string, ex: Executor = db()) {
  const rows = await ex
    .select({
      locationId: inventoryLocations.id,
      locationName: inventoryLocations.name,
      onHand: sql<number>`coalesce(${inventoryBalances.onHand}, 0)::int`,
      reserved: sql<number>`coalesce(${inventoryBalances.reserved}, 0)::int`,
    })
    .from(inventoryLocations)
    .leftJoin(
      inventoryBalances,
      and(eq(inventoryBalances.locationId, inventoryLocations.id), eq(inventoryBalances.variantId, variantId)),
    )
    .where(and(eq(inventoryLocations.businessId, ctx.businessId), eq(inventoryLocations.isActive, true)))
    .orderBy(asc(inventoryLocations.name));
  return rows.map((r) => ({ ...r, onHand: Number(r.onHand), reserved: Number(r.reserved), available: Number(r.onHand) - Number(r.reserved) }));
}

export type MovementFilter = {
  variantId?: string | null;
  productId?: string | null;
  locationId?: string | null;
  type?: string | null;
  from?: Date;
  to?: Date;
  q?: string;
  page?: number;
  pageSize?: number;
};

export async function listMovements(ctx: Ctx, f: MovementFilter) {
  requirePermission(ctx, "inventory.view");
  const { page, pageSize, offset } = paging(f);
  const conds: SQL[] = [eq(stockMovements.businessId, ctx.businessId)];
  if (f.variantId) conds.push(eq(stockMovements.variantId, f.variantId));
  if (f.productId) conds.push(eq(productVariants.productId, f.productId));
  if (f.locationId) conds.push(eq(stockMovements.locationId, f.locationId));
  if (f.type) conds.push(sql`${stockMovements.type} = ${f.type}`);
  if (f.from) conds.push(gte(stockMovements.createdAt, f.from));
  if (f.to) conds.push(lt(stockMovements.createdAt, f.to));
  if (f.q) conds.push(sql`(${products.name} ilike ${likePattern(f.q)} or ${productVariants.sku} ilike ${likePattern(f.q)} or coalesce(${stockMovements.reason}, '') ilike ${likePattern(f.q)})`);
  const where = and(...conds);
  const rows = await db()
    .select({
      id: stockMovements.id,
      createdAt: stockMovements.createdAt,
      type: stockMovements.type,
      quantity: stockMovements.quantity,
      onHandAfter: stockMovements.onHandAfter,
      unitCostCents: stockMovements.unitCostCents,
      reason: stockMovements.reason,
      referenceType: stockMovements.referenceType,
      referenceId: stockMovements.referenceId,
      variantId: stockMovements.variantId,
      sku: productVariants.sku,
      label: productVariants.label,
      productId: products.id,
      productName: products.name,
      locationName: inventoryLocations.name,
      actorMembershipId: stockMovements.actorMembershipId,
    })
    .from(stockMovements)
    .innerJoin(productVariants, eq(productVariants.id, stockMovements.variantId))
    .innerJoin(products, eq(products.id, productVariants.productId))
    .innerJoin(inventoryLocations, eq(inventoryLocations.id, stockMovements.locationId))
    .where(where)
    .orderBy(desc(stockMovements.createdAt), desc(stockMovements.id))
    .limit(pageSize)
    .offset(offset);
  const [{ count }] = await db()
    .select({ count: sql<number>`count(*)::int` })
    .from(stockMovements)
    .innerJoin(productVariants, eq(productVariants.id, stockMovements.variantId))
    .innerJoin(products, eq(products.id, productVariants.productId))
    .where(where);
  return pageOf(rows, Number(count), page, pageSize);
}

export async function activeReservations(ctx: Ctx, variantId: string) {
  return db()
    .select()
    .from(stockReservations)
    .where(and(eq(stockReservations.businessId, ctx.businessId), eq(stockReservations.variantId, variantId), eq(stockReservations.status, "active")));
}

export const MOVEMENT_LABELS: Record<string, string> = {
  opening: "Opening stock",
  receipt: "Received",
  adjustment: "Adjustment",
  sale: "Sale",
  sale_return: "Customer return",
  order_consumption: "Order handed over",
  transfer_out: "Transfer out",
  transfer_in: "Transfer in",
  damage: "Damaged",
  count: "Stock count",
};

