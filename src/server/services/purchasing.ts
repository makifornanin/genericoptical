import { and, asc, desc, eq, inArray, isNull, sql, type SQL } from "drizzle-orm";
import { formatMoney } from "@/lib/money";
import { purchaseOrderInput, receiveInput, supplierInput } from "@/lib/schemas";
import { getDb } from "@/server/db";
import {
  auditLogs,
  businessMemberships,
  inventoryLocations,
  products,
  productVariants,
  purchaseOrderItems,
  purchaseOrderReceipts,
  purchaseOrders,
  stockMovements,
  suppliers,
  users,
} from "@/server/db/schema";
import { audit, db, diff, invalid, isUniqueViolation, likePattern, mapDbError, nextNumber, notFound, now, pageOf, paging, requirePermission, type Ctx, ref } from "./core";
import { lockBalances, receiveUnits } from "./inventory";

// ─── Suppliers ───────────────────────────────────────────────────────────────

export async function listSuppliers(ctx: Ctx, f: { q?: string; includeArchived?: boolean; page?: number; pageSize?: number } = {}) {
  requirePermission(ctx, "suppliers.view");
  const { page, pageSize, offset } = paging({ ...f, pageSize: f.pageSize ?? 50 });
  const conds: SQL[] = [eq(suppliers.businessId, ctx.businessId)];
  if (!f.includeArchived) conds.push(isNull(suppliers.archivedAt));
  if (f.q) conds.push(sql`(${suppliers.name} ilike ${likePattern(f.q)} or ${suppliers.code} ilike ${likePattern(f.q)} or coalesce(${suppliers.contactName}, '') ilike ${likePattern(f.q)})`);
  const where = and(...conds);
  const rows = await db()
    .select({
      supplier: suppliers,
      productCount: sql<number>`(select count(*)::int from products p where p.supplier_id = ${ref(suppliers.id)} and p.archived_at is null)`,
      openPoCount: sql<number>`(select count(*)::int from purchase_orders po where po.supplier_id = ${ref(suppliers.id)} and po.status in ('draft','ordered','partially_received'))`,
      spendCents: sql<number>`(select coalesce(sum(poi.quantity_received * poi.unit_cost_cents), 0)::bigint from purchase_order_items poi join purchase_orders po on po.id = poi.purchase_order_id where po.supplier_id = ${ref(suppliers.id)})`,
    })
    .from(suppliers)
    .where(where)
    .orderBy(asc(suppliers.name))
    .limit(pageSize)
    .offset(offset);
  const [{ count }] = await db().select({ count: sql<number>`count(*)::int` }).from(suppliers).where(where);
  return pageOf(
    rows.map((r) => ({ ...r.supplier, productCount: Number(r.productCount), openPoCount: Number(r.openPoCount), spendCents: Number(r.spendCents) })),
    Number(count),
    page,
    pageSize,
  );
}

export async function getSupplier(ctx: Ctx, supplierId: string) {
  requirePermission(ctx, "suppliers.view");
  const [s] = await db()
    .select()
    .from(suppliers)
    .where(and(eq(suppliers.businessId, ctx.businessId), eq(suppliers.id, supplierId)))
    .limit(1);
  if (!s) throw notFound("Supplier");
  const pos = await db()
    .select({
      id: purchaseOrders.id,
      number: purchaseOrders.number,
      status: purchaseOrders.status,
      subtotalCents: purchaseOrders.subtotalCents,
      orderedAt: purchaseOrders.orderedAt,
      createdAt: purchaseOrders.createdAt,
      receivedAt: purchaseOrders.receivedAt,
      receivedValueCents: sql<number>`(select coalesce(sum(quantity_received * unit_cost_cents), 0)::bigint from purchase_order_items i where i.purchase_order_id = ${ref(purchaseOrders.id)})`,
    })
    .from(purchaseOrders)
    .where(and(eq(purchaseOrders.businessId, ctx.businessId), eq(purchaseOrders.supplierId, supplierId)))
    .orderBy(desc(purchaseOrders.createdAt))
    .limit(100);
  const productRows = await db()
    .select({ id: products.id, name: products.name, brand: products.brand, productType: products.productType })
    .from(products)
    .where(and(eq(products.businessId, ctx.businessId), eq(products.supplierId, supplierId), isNull(products.archivedAt)))
    .orderBy(asc(products.name))
    .limit(200);
  return { supplier: s, purchaseOrders: pos.map((p) => ({ ...p, receivedValueCents: Number(p.receivedValueCents) })), products: productRows };
}

export async function saveSupplier(ctx: Ctx, supplierId: string | null, raw: unknown) {
  requirePermission(ctx, "suppliers.manage");
  const input = supplierInput.parse(raw);
  try {
    if (!supplierId) {
      const [row] = await db()
        .insert(suppliers)
        .values({ ...input, code: input.code.toUpperCase(), businessId: ctx.businessId })
        .returning();
      await audit(db(), ctx, { action: "supplier.created", entityType: "supplier", entityId: row.id, summary: `Added supplier ${row.name}` });
      return row;
    }
    const [existing] = await db()
      .select()
      .from(suppliers)
      .where(and(eq(suppliers.businessId, ctx.businessId), eq(suppliers.id, supplierId)))
      .limit(1);
    if (!existing) throw notFound("Supplier");
    const patch = { ...input, code: input.code.toUpperCase() };
    const [row] = await db()
      .update(suppliers)
      .set({ ...patch, updatedAt: now(ctx) })
      .where(eq(suppliers.id, supplierId))
      .returning();
    await audit(db(), ctx, {
      action: "supplier.updated",
      entityType: "supplier",
      entityId: row.id,
      summary: `Updated supplier ${row.name}`,
      changes: diff(existing as unknown as Record<string, unknown>, patch),
    });
    return row;
  } catch (error) {
    mapDbError(error);
  }
}

export async function setSupplierArchived(ctx: Ctx, supplierId: string, archived: boolean) {
  requirePermission(ctx, "suppliers.manage");
  const [s] = await db()
    .update(suppliers)
    .set({ archivedAt: archived ? now(ctx) : null, isActive: !archived, updatedAt: now(ctx) })
    .where(and(eq(suppliers.businessId, ctx.businessId), eq(suppliers.id, supplierId)))
    .returning();
  if (!s) throw notFound("Supplier");
  await audit(db(), ctx, { action: archived ? "supplier.archived" : "supplier.restored", entityType: "supplier", entityId: s.id, summary: `${archived ? "Archived" : "Restored"} supplier ${s.name}` });
  return s;
}

// ─── Purchase orders ─────────────────────────────────────────────────────────

export const PO_STATUS_LABELS: Record<string, string> = {
  draft: "Draft",
  ordered: "Ordered",
  partially_received: "Partially received",
  received: "Received",
  cancelled: "Cancelled",
};

export async function listPurchaseOrders(ctx: Ctx, f: { q?: string; status?: string | null; supplierId?: string | null; page?: number; pageSize?: number }) {
  requirePermission(ctx, "purchasing.view");
  const { page, pageSize, offset } = paging(f);
  const conds: SQL[] = [eq(purchaseOrders.businessId, ctx.businessId)];
  if (f.status === "open") conds.push(inArray(purchaseOrders.status, ["draft", "ordered", "partially_received"]));
  else if (f.status) conds.push(sql`${purchaseOrders.status} = ${f.status}`);
  if (f.supplierId) conds.push(eq(purchaseOrders.supplierId, f.supplierId));
  if (f.q) conds.push(sql`(${purchaseOrders.number} ilike ${likePattern(f.q)} or ${suppliers.name} ilike ${likePattern(f.q)})`);
  const where = and(...conds);
  const rows = await db()
    .select({
      id: purchaseOrders.id,
      number: purchaseOrders.number,
      status: purchaseOrders.status,
      subtotalCents: purchaseOrders.subtotalCents,
      expectedOn: purchaseOrders.expectedOn,
      orderedAt: purchaseOrders.orderedAt,
      createdAt: purchaseOrders.createdAt,
      receivedAt: purchaseOrders.receivedAt,
      supplierId: suppliers.id,
      supplierName: suppliers.name,
      locationName: inventoryLocations.name,
      units: sql<{ ordered: number; received: number }>`(select json_build_object('ordered', coalesce(sum(quantity_ordered),0)::int, 'received', coalesce(sum(quantity_received),0)::int) from purchase_order_items i where i.purchase_order_id = ${ref(purchaseOrders.id)})`,
    })
    .from(purchaseOrders)
    .innerJoin(suppliers, eq(suppliers.id, purchaseOrders.supplierId))
    .innerJoin(inventoryLocations, eq(inventoryLocations.id, purchaseOrders.locationId))
    .where(where)
    .orderBy(desc(purchaseOrders.createdAt))
    .limit(pageSize)
    .offset(offset);
  const [{ count }] = await db()
    .select({ count: sql<number>`count(*)::int` })
    .from(purchaseOrders)
    .innerJoin(suppliers, eq(suppliers.id, purchaseOrders.supplierId))
    .where(where);
  return pageOf(rows, Number(count), page, pageSize);
}

export async function getPurchaseOrder(ctx: Ctx, id: string) {
  requirePermission(ctx, "purchasing.view");
  const [po] = await db()
    .select({ po: purchaseOrders, supplier: suppliers, locationName: inventoryLocations.name })
    .from(purchaseOrders)
    .innerJoin(suppliers, eq(suppliers.id, purchaseOrders.supplierId))
    .innerJoin(inventoryLocations, eq(inventoryLocations.id, purchaseOrders.locationId))
    .where(and(eq(purchaseOrders.businessId, ctx.businessId), eq(purchaseOrders.id, id)))
    .limit(1);
  if (!po) throw notFound("Purchase order");
  const [items, receipts, history] = await Promise.all([
    db()
      .select({
        item: purchaseOrderItems,
        sku: productVariants.sku,
        label: productVariants.label,
        productName: products.name,
        productId: products.id,
      })
      .from(purchaseOrderItems)
      .innerJoin(productVariants, eq(productVariants.id, purchaseOrderItems.variantId))
      .innerJoin(products, eq(products.id, productVariants.productId))
      .where(and(eq(purchaseOrderItems.businessId, ctx.businessId), eq(purchaseOrderItems.purchaseOrderId, id)))
      .orderBy(asc(products.name)),
    db()
      .select({
        receipt: purchaseOrderReceipts,
        receivedByName: users.name,
        units: sql<number>`(select coalesce(sum(quantity), 0)::int from stock_movements m where m.reference_type = 'purchase_order_receipt' and m.reference_id = ${ref(purchaseOrderReceipts.id)})`,
      })
      .from(purchaseOrderReceipts)
      .leftJoin(businessMemberships, eq(businessMemberships.id, purchaseOrderReceipts.receivedByMembershipId))
      .leftJoin(users, eq(users.id, businessMemberships.userId))
      .where(and(eq(purchaseOrderReceipts.businessId, ctx.businessId), eq(purchaseOrderReceipts.purchaseOrderId, id)))
      .orderBy(asc(purchaseOrderReceipts.receivedAt)),
    db()
      .select()
      .from(auditLogs)
      .where(and(eq(auditLogs.businessId, ctx.businessId), eq(auditLogs.entityType, "purchase_order"), eq(auditLogs.entityId, id)))
      .orderBy(asc(auditLogs.createdAt)),
  ]);
  return { ...po, items, receipts: receipts.map((r) => ({ ...r, units: Number(r.units) })), history };
}

async function validatePoRefs(tx: Parameters<Parameters<ReturnType<typeof getDb>["transaction"]>[0]>[0], ctx: Ctx, input: { supplierId: string; locationId: string; items: { variantId: string }[] }) {
  const [sup] = await tx
    .select({ id: suppliers.id, name: suppliers.name, archivedAt: suppliers.archivedAt })
    .from(suppliers)
    .where(and(eq(suppliers.businessId, ctx.businessId), eq(suppliers.id, input.supplierId)))
    .limit(1);
  if (!sup || sup.archivedAt) throw invalid("Choose an active supplier.");
  const [loc] = await tx
    .select({ id: inventoryLocations.id })
    .from(inventoryLocations)
    .where(and(eq(inventoryLocations.businessId, ctx.businessId), eq(inventoryLocations.id, input.locationId)))
    .limit(1);
  if (!loc) throw invalid("Choose a receiving location.");
  const variants = await tx
    .select({ id: productVariants.id, type: products.productType, sku: productVariants.sku })
    .from(productVariants)
    .innerJoin(products, eq(products.id, productVariants.productId))
    .where(and(eq(productVariants.businessId, ctx.businessId), inArray(productVariants.id, input.items.map((i) => i.variantId))));
  if (variants.length !== input.items.length) throw invalid("One of the items doesn't exist.");
  const untracked = variants.filter((v) => v.type !== "stock");
  if (untracked.length) throw invalid(`Only stocked items can be purchased into inventory (${untracked.map((v) => v.sku).join(", ")}).`);
  return sup;
}

export async function savePurchaseOrder(ctx: Ctx, id: string | null, raw: unknown) {
  requirePermission(ctx, "purchasing.manage");
  const input = purchaseOrderInput.parse(raw);
  const subtotal = input.items.reduce((s, i) => s + i.quantity * i.unitCostCents, 0);
  try {
    return await getDb().transaction(async (tx) => {
      const sup = await validatePoRefs(tx, ctx, input);
      const at = now(ctx);
      let poId = id;
      let number: string;
      if (!poId) {
        number = await nextNumber(tx, ctx.businessId, "purchase_order", "PO-", 5);
        const [po] = await tx
          .insert(purchaseOrders)
          .values({
            businessId: ctx.businessId,
            number,
            supplierId: input.supplierId,
            locationId: input.locationId,
            expectedOn: input.expectedOn,
            notes: input.notes,
            subtotalCents: subtotal,
            createdByMembershipId: ctx.membershipId,
            createdAt: at,
            updatedAt: at,
          })
          .returning({ id: purchaseOrders.id });
        poId = po.id;
      } else {
        const [po] = await tx
          .select()
          .from(purchaseOrders)
          .where(and(eq(purchaseOrders.businessId, ctx.businessId), eq(purchaseOrders.id, poId)))
          .for("update");
        if (!po) throw notFound("Purchase order");
        if (po.status !== "draft") throw invalid("Only draft purchase orders can be edited.");
        number = po.number;
        await tx
          .update(purchaseOrders)
          .set({ supplierId: input.supplierId, locationId: input.locationId, expectedOn: input.expectedOn, notes: input.notes, subtotalCents: subtotal, updatedAt: at })
          .where(eq(purchaseOrders.id, poId));
        await tx.delete(purchaseOrderItems).where(eq(purchaseOrderItems.purchaseOrderId, poId));
      }
      await tx.insert(purchaseOrderItems).values(
        input.items.map((i) => ({ businessId: ctx.businessId, purchaseOrderId: poId!, variantId: i.variantId, quantityOrdered: i.quantity, unitCostCents: i.unitCostCents })),
      );
      await audit(tx, ctx, {
        action: id ? "purchase_order.updated" : "purchase_order.created",
        entityType: "purchase_order",
        entityId: poId,
        summary: `${id ? "Updated" : "Created"} ${number} for ${sup.name} · ${input.items.length} line(s) · ${formatMoney(subtotal)}`,
      });
      return { purchaseOrderId: poId!, number };
    });
  } catch (error) {
    mapDbError(error);
  }
}

/** Confirms a draft with the supplier (status → ordered). */
export async function confirmPurchaseOrder(ctx: Ctx, id: string) {
  requirePermission(ctx, "purchasing.approve");
  try {
    return await getDb().transaction(async (tx) => {
      const [po] = await tx.select().from(purchaseOrders).where(and(eq(purchaseOrders.businessId, ctx.businessId), eq(purchaseOrders.id, id))).for("update");
      if (!po) throw notFound("Purchase order");
      if (po.status !== "draft") throw invalid("This purchase order has already been sent.");
      const at = now(ctx);
      await tx
        .update(purchaseOrders)
        .set({ status: "ordered", orderedAt: at, approvedByMembershipId: ctx.membershipId, updatedAt: at })
        .where(eq(purchaseOrders.id, id));
      await audit(tx, ctx, { action: "purchase_order.confirmed", entityType: "purchase_order", entityId: id, summary: `Confirmed ${po.number} with supplier` });
      return { purchaseOrderId: id };
    });
  } catch (error) {
    mapDbError(error);
  }
}

export async function cancelPurchaseOrder(ctx: Ctx, id: string, reason: string) {
  requirePermission(ctx, "purchasing.manage");
  try {
    return await getDb().transaction(async (tx) => {
      const [po] = await tx.select().from(purchaseOrders).where(and(eq(purchaseOrders.businessId, ctx.businessId), eq(purchaseOrders.id, id))).for("update");
      if (!po) throw notFound("Purchase order");
      if (po.status === "cancelled" || po.status === "received") throw invalid("This purchase order is already closed.");
      if (po.status === "partially_received") throw invalid("Stock has already been received on this order. Close it as received instead.");
      const at = now(ctx);
      await tx.update(purchaseOrders).set({ status: "cancelled", cancelledAt: at, updatedAt: at }).where(eq(purchaseOrders.id, id));
      await audit(tx, ctx, { action: "purchase_order.cancelled", entityType: "purchase_order", entityId: id, summary: `Cancelled ${po.number}${reason ? `: ${reason}` : ""}` });
      return { purchaseOrderId: id };
    });
  } catch (error) {
    mapDbError(error);
  }
}

/** Closes a partially received PO when the supplier won't ship the remainder. */
export async function closePurchaseOrder(ctx: Ctx, id: string, reason: string) {
  requirePermission(ctx, "purchasing.manage");
  try {
    return await getDb().transaction(async (tx) => {
      const [po] = await tx.select().from(purchaseOrders).where(and(eq(purchaseOrders.businessId, ctx.businessId), eq(purchaseOrders.id, id))).for("update");
      if (!po) throw notFound("Purchase order");
      if (po.status !== "partially_received") throw invalid("Only partially received orders can be closed short.");
      const at = now(ctx);
      await tx.update(purchaseOrders).set({ status: "received", receivedAt: at, updatedAt: at }).where(eq(purchaseOrders.id, id));
      await audit(tx, ctx, { action: "purchase_order.closed", entityType: "purchase_order", entityId: id, summary: `Closed ${po.number} short${reason ? `: ${reason}` : ""}` });
      return { purchaseOrderId: id };
    });
  } catch (error) {
    mapDbError(error);
  }
}

/**
 * Records a delivery. Every received line increases on-hand through a `receipt` stock movement,
 * updates weighted-average cost, and advances the PO status — in one transaction. Retrying with the
 * same idempotency key returns the original receipt instead of receiving twice.
 */
export async function receivePurchaseOrder(ctx: Ctx, raw: unknown) {
  requirePermission(ctx, "inventory.receive");
  const input = receiveInput.parse(raw);
  const lines = input.items.filter((i) => i.quantity > 0);
  if (!lines.length) throw invalid("Enter the quantity received for at least one line.");
  const lookup = async () => {
    const [r] = await db()
      .select({ receiptId: purchaseOrderReceipts.id })
      .from(purchaseOrderReceipts)
      .where(and(eq(purchaseOrderReceipts.businessId, ctx.businessId), eq(purchaseOrderReceipts.idempotencyKey, input.idempotencyKey)))
      .limit(1);
    return r ?? null;
  };
  const prior = await lookup();
  if (prior) return { ...prior, replayed: true };
  try {
    return await getDb().transaction(async (tx) => {
      const [po] = await tx
        .select()
        .from(purchaseOrders)
        .where(and(eq(purchaseOrders.businessId, ctx.businessId), eq(purchaseOrders.id, input.purchaseOrderId)))
        .for("update");
      if (!po) throw notFound("Purchase order");
      if (po.status === "draft") throw invalid("Confirm this purchase order with the supplier before receiving stock.");
      if (po.status === "received" || po.status === "cancelled") throw invalid("This purchase order is closed.");
      const items = await tx
        .select()
        .from(purchaseOrderItems)
        .where(and(eq(purchaseOrderItems.businessId, ctx.businessId), eq(purchaseOrderItems.purchaseOrderId, po.id)))
        .for("update");
      const byId = new Map(items.map((i) => [i.id, i]));
      if (lines.some((l) => !byId.has(l.itemId))) throw invalid("A received line isn't on this purchase order.");
      if (new Set(lines.map((l) => l.itemId)).size !== lines.length) throw invalid("Each line can only appear once per delivery.");
      const at = now(ctx);
      const [receipt] = await tx
        .insert(purchaseOrderReceipts)
        .values({
          businessId: ctx.businessId,
          purchaseOrderId: po.id,
          receivedAt: at,
          receivedByMembershipId: ctx.membershipId,
          notes: input.notes,
          idempotencyKey: input.idempotencyKey,
          createdAt: at,
        })
        .returning({ id: purchaseOrderReceipts.id });
      const balances = await lockBalances(
        tx,
        ctx,
        po.locationId,
        lines.map((l) => byId.get(l.itemId)!.variantId),
      );
      let units = 0;
      for (const line of lines) {
        const item = byId.get(line.itemId);
        if (!item) throw invalid("A received line isn't on this purchase order.");
        const remaining = item.quantityOrdered - item.quantityReceived;
        if (line.quantity > remaining) throw invalid(`Only ${remaining} more unit(s) are expected for one of the lines.`);
        await tx
          .update(purchaseOrderItems)
          .set({ quantityReceived: item.quantityReceived + line.quantity })
          .where(eq(purchaseOrderItems.id, item.id));
        await receiveUnits(tx, ctx, balances, {
          variantId: item.variantId,
          locationId: po.locationId,
          quantity: line.quantity,
          unitCostCents: item.unitCostCents,
          reason: `Received on ${po.number}`,
          referenceType: "purchase_order_receipt",
          referenceId: receipt.id,
          referenceLineId: item.id,
          idempotencyKey: `po-receipt:${receipt.id}:${item.id}`,
        });
        item.quantityReceived += line.quantity;
        units += line.quantity;
      }
      const complete = items.every((i) => i.quantityReceived >= i.quantityOrdered);
      await tx
        .update(purchaseOrders)
        .set({ status: complete ? "received" : "partially_received", receivedAt: complete ? at : null, updatedAt: at })
        .where(eq(purchaseOrders.id, po.id));
      await audit(tx, ctx, {
        action: "purchase_order.received",
        entityType: "purchase_order",
        entityId: po.id,
        summary: `Received ${units} unit(s) on ${po.number}${complete ? " · fully received" : " · partially received"}`,
      });
      return { receiptId: receipt.id, replayed: false, complete };
    });
  } catch (error) {
    if (isUniqueViolation(error, "purchase_order_receipts_idempotency_key")) {
      const again = await lookup();
      if (again) return { ...again, replayed: true };
    }
    mapDbError(error);
  }
}

/** Movements created by a PO's receipts (receiving history). */
export async function poMovements(ctx: Ctx, purchaseOrderId: string) {
  requirePermission(ctx, "purchasing.view");
  return db()
    .select({ movement: stockMovements, sku: productVariants.sku })
    .from(stockMovements)
    .innerJoin(purchaseOrderReceipts, eq(purchaseOrderReceipts.id, stockMovements.referenceId))
    .innerJoin(productVariants, eq(productVariants.id, stockMovements.variantId))
    .where(and(eq(stockMovements.businessId, ctx.businessId), eq(purchaseOrderReceipts.purchaseOrderId, purchaseOrderId)))
    .orderBy(asc(stockMovements.createdAt));
}
