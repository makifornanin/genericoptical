import { and, asc, desc, eq, inArray, isNotNull, isNull, ne, sql, type SQL } from "drizzle-orm";
import { productInput, CATEGORY_KINDS, type ProductInput } from "@/lib/schemas";
import { getDb, type Executor } from "@/server/db";
import {
  inventoryBalances,
  productCategories,
  products,
  productVariants,
  saleItems,
  suppliers,
} from "@/server/db/schema";
import { audit, conflict, db, diff, invalid, likePattern, mapDbError, notFound, now, pageOf, paging, requirePermission, can, type Ctx, ref } from "./core";
import { lockBalances, receiveUnits } from "./inventory";

// ─── Categories ──────────────────────────────────────────────────────────────

export async function listCategories(ctx: Ctx, ex: Executor = db()) {
  return ex
    .select()
    .from(productCategories)
    .where(eq(productCategories.businessId, ctx.businessId))
    .orderBy(asc(productCategories.sortOrder), asc(productCategories.name));
}

export async function createCategory(ctx: Ctx, input: { name: string; kind: string }) {
  requirePermission(ctx, "products.manage");
  const name = input.name?.trim();
  if (!name) throw invalid("Name is required.");
  if (!CATEGORY_KINDS.includes(input.kind as never)) throw invalid("Choose a category type.");
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
  try {
    const [row] = await db()
      .insert(productCategories)
      .values({ businessId: ctx.businessId, name, slug, kind: input.kind as (typeof CATEGORY_KINDS)[number] })
      .returning();
    await audit(db(), ctx, { action: "category.created", entityType: "product_category", entityId: row.id, summary: `Created category ${name}` });
    return row;
  } catch (error) {
    mapDbError(error);
  }
}

// ─── Products ────────────────────────────────────────────────────────────────

export type ProductFilter = {
  q?: string;
  categoryId?: string | null;
  supplierId?: string | null;
  type?: string | null;
  status?: "active" | "inactive" | "archived" | "all";
  page?: number;
  pageSize?: number;
  sort?: string;
  dir?: "asc" | "desc";
};

export async function listProducts(ctx: Ctx, f: ProductFilter) {
  requirePermission(ctx, "products.view");
  const { page, pageSize, offset } = paging(f);
  const conds: SQL[] = [eq(products.businessId, ctx.businessId)];
  const status = f.status ?? "active";
  if (status === "active") conds.push(isNull(products.archivedAt), eq(products.isActive, true));
  if (status === "inactive") conds.push(isNull(products.archivedAt), eq(products.isActive, false));
  if (status === "archived") conds.push(isNotNull(products.archivedAt));
  if (f.categoryId) conds.push(eq(products.categoryId, f.categoryId));
  if (f.supplierId) conds.push(eq(products.supplierId, f.supplierId));
  if (f.type) conds.push(sql`${products.productType} = ${f.type}`);
  if (f.q) {
    const p = likePattern(f.q);
    conds.push(
      sql`(${products.name} ilike ${p} or coalesce(${products.brand}, '') ilike ${p} or exists (select 1 from product_variants pv where pv.product_id = ${ref(products.id)} and (pv.sku ilike ${p} or coalesce(pv.barcode, '') ilike ${p})))`,
    );
  }
  const where = and(...conds);
  const stats = sql`(select json_build_object(
      'variants', count(*)::int,
      'minPrice', min(pv.price_cents),
      'maxPrice', max(pv.price_cents),
      'avgCost', coalesce(round(avg(pv.cost_cents)), 0)::bigint,
      'onHand', coalesce(sum((select coalesce(sum(b.on_hand), 0) from inventory_balances b where b.variant_id = pv.id)), 0)::int,
      'available', coalesce(sum((select coalesce(sum(b.on_hand - b.reserved), 0) from inventory_balances b where b.variant_id = pv.id)), 0)::int,
      'skus', string_agg(pv.sku, ', ' order by pv.sort_order)
    ) from product_variants pv where pv.product_id = ${ref(products.id)} and pv.archived_at is null)`;
  const sortCol =
    { name: products.name, brand: products.brand, updated: products.updatedAt, created: products.createdAt }[f.sort ?? "name"] ?? products.name;
  const rows = await db()
    .select({
      id: products.id,
      name: products.name,
      brand: products.brand,
      productType: products.productType,
      isActive: products.isActive,
      archivedAt: products.archivedAt,
      imageUrl: products.imageUrl,
      showOnWebsite: products.showOnWebsite,
      categoryName: productCategories.name,
      categoryKind: productCategories.kind,
      supplierName: suppliers.name,
      updatedAt: products.updatedAt,
      stats: sql<{ variants: number; minPrice: number | null; maxPrice: number | null; avgCost: number; onHand: number; available: number; skus: string | null }>`${stats}`,
    })
    .from(products)
    .innerJoin(productCategories, eq(productCategories.id, products.categoryId))
    .leftJoin(suppliers, eq(suppliers.id, products.supplierId))
    .where(where)
    .orderBy(f.dir === "desc" ? desc(sortCol) : asc(sortCol), asc(products.id))
    .limit(pageSize)
    .offset(offset);
  const [{ count }] = await db().select({ count: sql<number>`count(*)::int` }).from(products).where(where);
  const hideCost = !can(ctx, "products.costs");
  return pageOf(
    rows.map((r) => ({ ...r, stats: hideCost ? { ...r.stats, avgCost: null } : r.stats })),
    Number(count),
    page,
    pageSize,
  );
}

export async function getProduct(ctx: Ctx, productId: string) {
  requirePermission(ctx, "products.view");
  const [product] = await db()
    .select({ product: products, categoryName: productCategories.name, categoryKind: productCategories.kind, supplierName: suppliers.name })
    .from(products)
    .innerJoin(productCategories, eq(productCategories.id, products.categoryId))
    .leftJoin(suppliers, eq(suppliers.id, products.supplierId))
    .where(and(eq(products.businessId, ctx.businessId), eq(products.id, productId)))
    .limit(1);
  if (!product) throw notFound("Product");
  const variants = await db()
    .select({
      variant: productVariants,
      onHand: sql<number>`coalesce((select sum(on_hand) from inventory_balances b where b.variant_id = ${ref(productVariants.id)}), 0)::int`,
      reserved: sql<number>`coalesce((select sum(reserved) from inventory_balances b where b.variant_id = ${ref(productVariants.id)}), 0)::int`,
      sold: sql<number>`coalesce((select sum(si.quantity - si.refunded_quantity) from sale_items si join sales s on s.id = si.sale_id where si.variant_id = ${ref(productVariants.id)} and s.status = 'completed'), 0)::int`,
    })
    .from(productVariants)
    .where(and(eq(productVariants.businessId, ctx.businessId), eq(productVariants.productId, productId)))
    .orderBy(asc(productVariants.sortOrder), asc(productVariants.sku));
  const hideCost = !can(ctx, "products.costs");
  return {
    ...product,
    variants: variants.map((v) => ({
      ...v.variant,
      costCents: hideCost ? null : v.variant.costCents,
      onHand: Number(v.onHand),
      reserved: Number(v.reserved),
      available: Number(v.onHand) - Number(v.reserved),
      sold: Number(v.sold),
    })),
  };
}

async function assertRefs(ex: Executor, ctx: Ctx, input: { categoryId: string; supplierId: string | null }) {
  const [cat] = await ex
    .select({ id: productCategories.id, kind: productCategories.kind })
    .from(productCategories)
    .where(and(eq(productCategories.businessId, ctx.businessId), eq(productCategories.id, input.categoryId)))
    .limit(1);
  if (!cat) throw invalid("Choose a category.", { categoryId: ["Choose a category."] });
  if (input.supplierId) {
    const [sup] = await ex
      .select({ id: suppliers.id })
      .from(suppliers)
      .where(and(eq(suppliers.businessId, ctx.businessId), eq(suppliers.id, input.supplierId)))
      .limit(1);
    if (!sup) throw invalid("Choose a supplier.", { supplierId: ["Unknown supplier."] });
  }
  return cat;
}

function checkVariantDupes(variants: { sku: string; barcode?: string | null }[]) {
  const skus = new Set<string>();
  const codes = new Set<string>();
  for (const v of variants) {
    const s = v.sku.toUpperCase();
    if (skus.has(s)) throw invalid(`SKU ${v.sku} appears twice.`);
    skus.add(s);
    if (v.barcode) {
      if (codes.has(v.barcode)) throw invalid(`Barcode ${v.barcode} appears twice.`);
      codes.add(v.barcode);
    }
  }
}

export type OpeningStock = { variantIndex: number; locationId: string; quantity: number }[];

export async function createProduct(ctx: Ctx, raw: ProductInput, opening: OpeningStock = []) {
  requirePermission(ctx, "products.manage");
  const input = productInput.parse(raw);
  checkVariantDupes(input.variants);
  if (input.productType !== "stock" && opening.length) throw invalid("Only stocked items can have opening stock.");
  try {
    return await getDb().transaction(async (tx) => {
      await assertRefs(tx, ctx, input);
      const at = now(ctx);
      const [product] = await tx
        .insert(products)
        .values({
          businessId: ctx.businessId,
          categoryId: input.categoryId,
          supplierId: input.supplierId,
          name: input.name,
          brand: input.brand,
          description: input.description,
          imageUrl: input.imageUrl,
          productType: input.productType,
          taxExempt: input.taxExempt,
          showOnWebsite: input.showOnWebsite,
          isActive: input.isActive,
          attributes: input.attributes,
          createdAt: at,
          updatedAt: at,
        })
        .returning();
      const variants = await tx
        .insert(productVariants)
        .values(
          input.variants.map((v, i) => ({
            businessId: ctx.businessId,
            productId: product.id,
            sku: v.sku.toUpperCase(),
            barcode: v.barcode,
            label: v.label || "Default",
            options: v.options,
            priceCents: v.priceCents,
            costCents: v.costCents,
            reorderPoint: input.productType === "stock" ? v.reorderPoint : 0,
            reorderQty: input.productType === "stock" ? v.reorderQty : 0,
            isActive: v.isActive,
            sortOrder: i,
            createdAt: at,
            updatedAt: at,
          })),
        )
        .returning();

      // Opening stock is recorded as a movement like any other receipt — never a silent number.
      for (const o of opening.filter((o) => o.quantity > 0)) {
        const variant = variants[o.variantIndex];
        if (!variant) throw invalid("Opening stock refers to an unknown variant.");
        const balances = await lockBalances(tx, ctx, o.locationId, [variant.id]);
        await receiveUnits(tx, ctx, balances, {
          type: "opening",
          variantId: variant.id,
          locationId: o.locationId,
          quantity: o.quantity,
          unitCostCents: input.variants[o.variantIndex].costCents,
          reason: "Opening stock",
          referenceType: "product",
          referenceId: product.id,
        });
      }
      await audit(tx, ctx, {
        action: "product.created",
        entityType: "product",
        entityId: product.id,
        summary: `Created product ${product.name} (${variants.map((v) => v.sku).join(", ")})`,
      });
      return { productId: product.id, variantIds: variants.map((v) => v.id) };
    });
  } catch (error) {
    mapDbError(error);
  }
}

export async function updateProduct(ctx: Ctx, productId: string, raw: ProductInput) {
  requirePermission(ctx, "products.manage");
  const input = productInput.parse(raw);
  checkVariantDupes(input.variants);
  try {
    return await getDb().transaction(async (tx) => {
      const [existing] = await tx
        .select()
        .from(products)
        .where(and(eq(products.businessId, ctx.businessId), eq(products.id, productId)))
        .for("update");
      if (!existing) throw notFound("Product");
      if (existing.archivedAt) throw invalid("Restore this product before editing it.");
      await assertRefs(tx, ctx, input);
      if (input.productType !== existing.productType) {
        const [{ moved }] = await tx
          .select({ moved: sql<number>`count(*)::int` })
          .from(inventoryBalances)
          .innerJoin(productVariants, eq(productVariants.id, inventoryBalances.variantId))
          .where(and(eq(productVariants.productId, productId), ne(inventoryBalances.onHand, 0)));
        if (Number(moved) > 0) throw conflict("This product has stock on hand. Bring stock to zero before changing its type.");
      }
      const at = now(ctx);
      const patch = {
        categoryId: input.categoryId,
        supplierId: input.supplierId,
        name: input.name,
        brand: input.brand,
        description: input.description,
        imageUrl: input.imageUrl,
        productType: input.productType,
        taxExempt: input.taxExempt,
        showOnWebsite: input.showOnWebsite,
        isActive: input.isActive,
        attributes: input.attributes,
      };
      const changes = diff(existing as unknown as Record<string, unknown>, patch);
      await tx.update(products).set({ ...patch, updatedAt: at }).where(eq(products.id, productId));

      const current = await tx
        .select()
        .from(productVariants)
        .where(and(eq(productVariants.businessId, ctx.businessId), eq(productVariants.productId, productId)));
      const currentById = new Map(current.map((v) => [v.id, v]));
      const keep = new Set<string>();
      const hideCost = !can(ctx, "products.costs");
      for (let i = 0; i < input.variants.length; i++) {
        const v = input.variants[i];
        const values = {
          sku: v.sku.toUpperCase(),
          barcode: v.barcode,
          label: v.label || "Default",
          options: v.options,
          priceCents: v.priceCents,
          reorderPoint: input.productType === "stock" ? v.reorderPoint : 0,
          reorderQty: input.productType === "stock" ? v.reorderQty : 0,
          isActive: v.isActive,
          sortOrder: i,
          updatedAt: at,
        };
        if (v.id && currentById.has(v.id)) {
          keep.add(v.id);
          // Cost of stocked items is maintained by receipts (weighted average); only editable when no stock exists.
          const cur = currentById.get(v.id)!;
          const costPatch = !hideCost && input.productType !== "stock" ? { costCents: v.costCents } : {};
          if (!hideCost && input.productType === "stock" && v.costCents !== cur.costCents) {
            const [{ units }] = await tx
              .select({ units: sql<number>`coalesce(sum(on_hand), 0)::int` })
              .from(inventoryBalances)
              .where(eq(inventoryBalances.variantId, v.id));
            if (Number(units) === 0) Object.assign(costPatch, { costCents: v.costCents });
          }
          await tx.update(productVariants).set({ ...values, ...costPatch, archivedAt: null }).where(eq(productVariants.id, v.id));
        } else {
          const [created] = await tx
            .insert(productVariants)
            .values({ ...values, businessId: ctx.businessId, productId, costCents: hideCost ? 0 : v.costCents, createdAt: at })
            .returning({ id: productVariants.id });
          keep.add(created.id);
        }
      }
      // Removed variants are archived, never deleted (they may appear on past sales).
      const removed = current.filter((v) => !keep.has(v.id) && !v.archivedAt);
      for (const v of removed) {
        const [{ units }] = await tx
          .select({ units: sql<number>`coalesce(sum(on_hand), 0)::int` })
          .from(inventoryBalances)
          .where(eq(inventoryBalances.variantId, v.id));
        if (Number(units) > 0) throw conflict(`Variant ${v.sku} still has ${units} unit(s) in stock. Adjust it to zero before removing it.`);
        await tx.update(productVariants).set({ archivedAt: at, isActive: false, updatedAt: at }).where(eq(productVariants.id, v.id));
      }
      await audit(tx, ctx, {
        action: "product.updated",
        entityType: "product",
        entityId: productId,
        summary: `Updated product ${input.name}${removed.length ? ` · archived ${removed.map((v) => v.sku).join(", ")}` : ""}`,
        changes,
      });
      return { productId };
    });
  } catch (error) {
    mapDbError(error);
  }
}

export async function setProductArchived(ctx: Ctx, productId: string, archived: boolean) {
  requirePermission(ctx, "products.manage");
  try {
    return await getDb().transaction(async (tx) => {
      const [p] = await tx
        .select()
        .from(products)
        .where(and(eq(products.businessId, ctx.businessId), eq(products.id, productId)))
        .for("update");
      if (!p) throw notFound("Product");
      if (archived) {
        const [{ units, reserved }] = await tx
          .select({ units: sql<number>`coalesce(sum(b.on_hand), 0)::int`, reserved: sql<number>`coalesce(sum(b.reserved), 0)::int` })
          .from(inventoryBalances)
          .innerJoin(productVariants, eq(productVariants.id, inventoryBalances.variantId))
          .where(eq(productVariants.productId, productId));
        if (Number(reserved) > 0) throw conflict("This product is reserved for open customer orders.");
        if (Number(units) > 0) throw conflict(`This product still has ${units} unit(s) in stock. Adjust stock to zero (e.g. record damage or return to supplier) before archiving.`);
      }
      const at = now(ctx);
      await tx.update(products).set({ archivedAt: archived ? at : null, isActive: !archived, updatedAt: at }).where(eq(products.id, productId));
      await audit(tx, ctx, {
        action: archived ? "product.archived" : "product.restored",
        entityType: "product",
        entityId: productId,
        summary: `${archived ? "Archived" : "Restored"} product ${p.name}`,
      });
      return { productId };
    });
  } catch (error) {
    mapDbError(error);
  }
}

/** Sellable variants for the POS and order forms (active only), with availability at a location. */
export async function sellableVariants(ctx: Ctx, opts: { locationId: string; q?: string; categoryId?: string | null; limit?: number }) {
  requirePermission(ctx, "products.view");
  const conds: SQL[] = [
    eq(productVariants.businessId, ctx.businessId),
    eq(productVariants.isActive, true),
    isNull(productVariants.archivedAt),
    eq(products.isActive, true),
    isNull(products.archivedAt),
  ];
  if (opts.categoryId) conds.push(eq(products.categoryId, opts.categoryId));
  if (opts.q) {
    const p = likePattern(opts.q);
    conds.push(sql`(${products.name} ilike ${p} or ${productVariants.sku} ilike ${p} or coalesce(${productVariants.barcode}, '') = ${opts.q.trim()} or coalesce(${products.brand}, '') ilike ${p} or ${productVariants.label} ilike ${p})`);
  }
  const rows = await db()
    .select({
      variantId: productVariants.id,
      productId: products.id,
      productName: products.name,
      brand: products.brand,
      label: productVariants.label,
      sku: productVariants.sku,
      barcode: productVariants.barcode,
      priceCents: productVariants.priceCents,
      costCents: productVariants.costCents,
      productType: products.productType,
      taxExempt: products.taxExempt,
      imageUrl: products.imageUrl,
      categoryId: products.categoryId,
      categoryName: productCategories.name,
      categoryKind: productCategories.kind,
      onHand: sql<number>`coalesce(${inventoryBalances.onHand}, 0)::int`,
      reserved: sql<number>`coalesce(${inventoryBalances.reserved}, 0)::int`,
    })
    .from(productVariants)
    .innerJoin(products, eq(products.id, productVariants.productId))
    .innerJoin(productCategories, eq(productCategories.id, products.categoryId))
    .leftJoin(inventoryBalances, and(eq(inventoryBalances.variantId, productVariants.id), eq(inventoryBalances.locationId, opts.locationId)))
    .where(and(...conds))
    .orderBy(asc(productCategories.sortOrder), asc(products.name), asc(productVariants.sortOrder))
    .limit(opts.limit ?? 400);
  const hideCost = !can(ctx, "products.costs");
  return rows.map((r) => ({
    ...r,
    costCents: hideCost ? null : r.costCents,
    onHand: Number(r.onHand),
    reserved: Number(r.reserved),
    available: Number(r.onHand) - Number(r.reserved),
  }));
}

/** Stocked variants for purchase orders, with available units per location. */
export async function purchasableVariants(ctx: Ctx) {
  requirePermission(ctx, "purchasing.view");
  const rows = await db().execute<{
    variant_id: string;
    product_name: string;
    label: string;
    sku: string;
    cost_cents: number;
    supplier_id: string | null;
    reorder_point: number;
    by_location: Record<string, number> | null;
  }>(sql`
    select v.id as variant_id, p.name as product_name, v.label, v.sku, v.cost_cents, p.supplier_id, v.reorder_point,
           (select json_object_agg(b.location_id, b.on_hand - b.reserved) from inventory_balances b where b.variant_id = v.id) as by_location
    from product_variants v join products p on p.id = v.product_id
    where v.business_id = ${ctx.businessId} and p.product_type = 'stock' and v.is_active and p.is_active and v.archived_at is null and p.archived_at is null
    order by p.name, v.sort_order`);
  return rows.rows.map((r) => ({
    variantId: r.variant_id,
    productName: r.product_name,
    label: r.label,
    sku: r.sku,
    costCents: Number(r.cost_cents),
    supplierId: r.supplier_id,
    reorderPoint: Number(r.reorder_point),
    byLocation: r.by_location ?? {},
  }));
}

/** Top sellers by units for a range (used by the dashboard and product page). */
export async function variantSalesCount(ctx: Ctx, variantIds: string[]) {
  if (!variantIds.length) return new Map<string, number>();
  const rows = await db()
    .select({ variantId: saleItems.variantId, qty: sql<number>`sum(${saleItems.quantity} - ${saleItems.refundedQuantity})::int` })
    .from(saleItems)
    .where(and(eq(saleItems.businessId, ctx.businessId), inArray(saleItems.variantId, variantIds)))
    .groupBy(saleItems.variantId);
  return new Map(rows.map((r) => [r.variantId, Number(r.qty)]));
}

// ─── CSV import / export ─────────────────────────────────────────────────────

export const PRODUCT_CSV_COLUMNS = [
  "product_name",
  "brand",
  "category",
  "type",
  "supplier_code",
  "sku",
  "barcode",
  "variant_label",
  "price",
  "cost",
  "reorder_point",
  "reorder_qty",
  "tax_exempt",
  "active",
  "description",
] as const;

export async function exportProductsCsvRows(ctx: Ctx) {
  requirePermission(ctx, "products.view");
  const showCost = can(ctx, "products.costs");
  const rows = await db()
    .select({
      name: products.name,
      brand: products.brand,
      category: productCategories.name,
      type: products.productType,
      supplierCode: suppliers.code,
      sku: productVariants.sku,
      barcode: productVariants.barcode,
      label: productVariants.label,
      price: productVariants.priceCents,
      cost: productVariants.costCents,
      reorderPoint: productVariants.reorderPoint,
      reorderQty: productVariants.reorderQty,
      taxExempt: products.taxExempt,
      active: sql<boolean>`${products.isActive} and ${productVariants.isActive}`,
      description: products.description,
    })
    .from(productVariants)
    .innerJoin(products, eq(products.id, productVariants.productId))
    .innerJoin(productCategories, eq(productCategories.id, products.categoryId))
    .leftJoin(suppliers, eq(suppliers.id, products.supplierId))
    .where(and(eq(productVariants.businessId, ctx.businessId), isNull(productVariants.archivedAt), isNull(products.archivedAt)))
    .orderBy(asc(products.name), asc(productVariants.sortOrder));
  return rows.map((r) => [
    r.name,
    r.brand ?? "",
    r.category,
    r.type,
    r.supplierCode ?? "",
    r.sku,
    r.barcode ?? "",
    r.label,
    (r.price / 100).toFixed(2),
    showCost ? (r.cost / 100).toFixed(2) : "",
    String(r.reorderPoint),
    String(r.reorderQty),
    r.taxExempt ? "yes" : "no",
    r.active ? "yes" : "no",
    r.description ?? "",
  ]);
}

/**
 * Imports products from parsed CSV records. Rows sharing a product_name + brand become variants
 * of one product. Existing SKUs are updated (price, label, reorder levels); new SKUs are created.
 * Quantities are never imported — stock must be received so every unit has a movement record.
 */
export async function importProducts(ctx: Ctx, records: Record<string, string>[]) {
  requirePermission(ctx, "products.manage");
  if (records.length === 0) throw invalid("The file has no rows.");
  if (records.length > 2000) throw invalid("Import up to 2,000 rows at a time.");
  const cats = await listCategories(ctx);
  const sups = await db().select().from(suppliers).where(eq(suppliers.businessId, ctx.businessId));
  const catByName = new Map(cats.map((c) => [c.name.toLowerCase(), c]));
  const supByCode = new Map(sups.map((s) => [s.code.toLowerCase(), s]));
  const errors: string[] = [];
  const groups = new Map<string, { rows: { rowNo: number; r: Record<string, string> }[] }>();
  records.forEach((r, i) => {
    const key = `${(r.product_name ?? "").trim().toLowerCase()}|${(r.brand ?? "").trim().toLowerCase()}`;
    if (!r.product_name?.trim()) errors.push(`Row ${i + 2}: product_name is required.`);
    if (!r.sku?.trim()) errors.push(`Row ${i + 2}: sku is required.`);
    if (!catByName.has((r.category ?? "").trim().toLowerCase())) errors.push(`Row ${i + 2}: unknown category "${r.category ?? ""}".`);
    if (r.supplier_code?.trim() && !supByCode.has(r.supplier_code.trim().toLowerCase())) errors.push(`Row ${i + 2}: unknown supplier code "${r.supplier_code}".`);
    if (Number.isNaN(Number(r.price))) errors.push(`Row ${i + 2}: price must be a number.`);
    const g = groups.get(key) ?? { rows: [] };
    g.rows.push({ rowNo: i + 2, r });
    groups.set(key, g);
  });
  if (errors.length) throw invalid(`Fix these rows and try again: ${errors.slice(0, 10).join(" ")}${errors.length > 10 ? ` (+${errors.length - 10} more)` : ""}`);

  const skus = records.map((r) => r.sku.trim().toUpperCase());
  const existing = await db()
    .select({ id: productVariants.id, sku: productVariants.sku, productId: productVariants.productId })
    .from(productVariants)
    .where(and(eq(productVariants.businessId, ctx.businessId), inArray(productVariants.sku, skus)));
  const existingBySku = new Map(existing.map((e) => [e.sku, e]));
  let created = 0;
  let updated = 0;
  const toCents = (v: string | undefined) => Math.round(Number(v || 0) * 100);
  const yes = (v: string | undefined, d: boolean) => (v === undefined || v === "" ? d : /^(y|yes|true|1)$/i.test(v.trim()));

  try {
    await getDb().transaction(async (tx) => {
      for (const { rows } of groups.values()) {
        const first = rows[0].r;
        const newRows = rows.filter(({ r }) => !existingBySku.has(r.sku.trim().toUpperCase()));
        for (const { r } of rows) {
          const e = existingBySku.get(r.sku.trim().toUpperCase());
          if (!e) continue;
          await tx
            .update(productVariants)
            .set({
              priceCents: toCents(r.price),
              label: r.variant_label?.trim() || "Default",
              barcode: r.barcode?.trim() || null,
              reorderPoint: Number(r.reorder_point || 0),
              reorderQty: Number(r.reorder_qty || 0),
              isActive: yes(r.active, true),
              updatedAt: now(ctx),
            })
            .where(eq(productVariants.id, e.id));
          updated++;
        }
        if (!newRows.length) continue;
        const productId = existingBySku.get(rows.find(({ r }) => existingBySku.has(r.sku.trim().toUpperCase()))?.r.sku.trim().toUpperCase() ?? "")?.productId;
        let pid = productId;
        if (!pid) {
          const cat = catByName.get(first.category.trim().toLowerCase())!;
          const type = ["stock", "service", "made_to_order"].includes(first.type?.trim()) ? (first.type.trim() as "stock") : cat.kind === "services" ? "service" : "stock";
          const [p] = await tx
            .insert(products)
            .values({
              businessId: ctx.businessId,
              categoryId: cat.id,
              supplierId: first.supplier_code?.trim() ? supByCode.get(first.supplier_code.trim().toLowerCase())!.id : null,
              name: first.product_name.trim(),
              brand: first.brand?.trim() || null,
              description: first.description?.trim() || null,
              productType: type,
              taxExempt: yes(first.tax_exempt, false),
              isActive: yes(first.active, true),
            })
            .returning({ id: products.id });
          pid = p.id;
        }
        await tx.insert(productVariants).values(
          newRows.map(({ r }, i) => ({
            businessId: ctx.businessId,
            productId: pid!,
            sku: r.sku.trim().toUpperCase(),
            barcode: r.barcode?.trim() || null,
            label: r.variant_label?.trim() || "Default",
            priceCents: toCents(r.price),
            costCents: toCents(r.cost),
            reorderPoint: Number(r.reorder_point || 0),
            reorderQty: Number(r.reorder_qty || 0),
            isActive: yes(r.active, true),
            sortOrder: i,
          })),
        );
        created += newRows.length;
      }
      await audit(tx, ctx, {
        action: "product.imported",
        entityType: "product",
        summary: `Imported products from CSV: ${created} new variant(s), ${updated} updated`,
      });
    });
  } catch (error) {
    mapDbError(error);
  }
  return { created, updated };
}
