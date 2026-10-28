import { createHash } from "node:crypto";
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { getDb } from "@/server/db";
import { branches, businesses, ghlProductLinks, inventoryBalances, inventoryLocations, products, productVariants } from "@/server/db/schema";
import { env } from "@/server/env";
import { toMajor } from "../api";
import { apiFor } from "../connection";
import type { GhlSettings } from "../config";
import { enqueue, type Handler } from "../engine";
import { GhlNotFoundError } from "../errors";

/**
 * Products & inventory: the dashboard is the source of truth.
 *  - One GHL product per dashboard product; one GHL price per dashboard variant (the price is GHL's
 *    sellable/stock unit). Made-to-order lab lenses aren't published (they're priced per job).
 *  - Stock is published as an ABSOLUTE available quantity (on hand − reserved) from one stockroom,
 *    because GHL keeps a single quantity per price and has no increment endpoint. Sending the current
 *    value (not a delta) makes retries and duplicates harmless.
 *  - GHL-side edits are never pulled back into local stock; reconciliation reports differences.
 */

const hash = (v: unknown) => createHash("sha256").update(JSON.stringify(v)).digest("hex").slice(0, 32);

/** The stockroom whose availability is published: the configured one, else the first branch's. */
export async function publishedLocationId(businessId: string, settings: GhlSettings) {
  if (settings.inventoryLocationId) return settings.inventoryLocationId;
  const [row] = await getDb()
    .select({ id: inventoryLocations.id })
    .from(inventoryLocations)
    .innerJoin(branches, eq(branches.id, inventoryLocations.branchId))
    .where(and(eq(inventoryLocations.businessId, businessId), eq(branches.isActive, true)))
    .orderBy(asc(branches.sortOrder), asc(branches.name))
    .limit(1);
  return row?.id ?? null;
}

export async function availableAt(businessId: string, variantId: string, locationId: string | null) {
  if (!locationId) return 0;
  const [b] = await getDb()
    .select({ available: sql<number>`(${inventoryBalances.onHand} - ${inventoryBalances.reserved})::int` })
    .from(inventoryBalances)
    .where(and(eq(inventoryBalances.businessId, businessId), eq(inventoryBalances.variantId, variantId), eq(inventoryBalances.locationId, locationId)))
    .limit(1);
  return Math.max(0, Number(b?.available ?? 0));
}

function absoluteUrl(url: string | null) {
  if (!url) return undefined;
  if (/^https?:\/\//.test(url)) return url;
  return `${env().APP_URL.replace(/\/$/, "")}${url.startsWith("/") ? "" : "/"}${url}`;
}

export const productSync: Handler = async (event, env2) => {
  const businessId = env2.businessId;
  const [product] = await getDb().select().from(products).where(and(eq(products.businessId, businessId), eq(products.id, event.entityId!))).limit(1);
  if (!product) return { status: "skipped", note: "Product no longer exists" };
  if (product.productType === "made_to_order") return { status: "skipped", note: "Made-to-order items are priced per job and aren't published to GHL" };
  const { api, settings } = await apiFor(businessId);
  const [biz] = await getDb().select({ currency: businesses.currency }).from(businesses).where(eq(businesses.id, businessId)).limit(1);
  const variants = await getDb().select().from(productVariants).where(and(eq(productVariants.businessId, businessId), eq(productVariants.productId, product.id))).orderBy(asc(productVariants.sortOrder));
  const links = await getDb().select().from(ghlProductLinks).where(and(eq(ghlProductLinks.businessId, businessId), eq(ghlProductLinks.productId, product.id)));
  const linkByVariant = new Map(links.map((l) => [l.variantId, l]));
  const live = product.isActive && !product.archivedAt;
  const productBody = {
    name: product.name,
    productType: product.productType === "service" ? "SERVICE" : "PHYSICAL",
    description: product.description ?? undefined,
    image: absoluteUrl(product.imageUrl),
    availableInStore: live && product.showOnWebsite,
  };

  let ghlProductId = links.find((l) => l.ghlProductId)?.ghlProductId ?? null;
  if (ghlProductId) {
    try {
      await api.updateProduct(ghlProductId, productBody);
    } catch (error) {
      if (!(error instanceof GhlNotFoundError)) throw error;
      ghlProductId = null; // deleted in GHL → recreate; old price ids are gone too
      await getDb().update(ghlProductLinks).set({ ghlProductId: null, ghlPriceId: null, lastPushedHash: null }).where(and(eq(ghlProductLinks.businessId, businessId), eq(ghlProductLinks.productId, product.id)));
      linkByVariant.clear();
    }
  }
  if (!ghlProductId) {
    if (!live) return { status: "skipped", note: "Archived product that was never published" };
    const created = await api.createProduct(productBody);
    ghlProductId = created._id;
  }

  const locationId = await publishedLocationId(businessId, settings);
  const tracked = product.productType === "stock";
  let createdPrices = 0;
  let updatedPrices = 0;
  for (const v of variants) {
    const link = linkByVariant.get(v.id);
    const active = live && v.isActive && !v.archivedAt;
    const body = {
      name: v.label && v.label !== "Default" ? v.label : product.name,
      type: "one_time",
      currency: biz.currency,
      amount: toMajor(v.priceCents),
      sku: v.sku,
      trackInventory: tracked,
      allowOutOfStockPurchases: false,
    };
    const fingerprint = hash({ ...body, active });
    if (!link?.ghlPriceId) {
      if (!active) continue;
      const quantity = tracked ? await availableAt(businessId, v.id, locationId) : undefined;
      const price = await api.createPrice(ghlProductId, { ...body, ...(tracked ? { availableQuantity: quantity } : {}) });
      await getDb()
        .insert(ghlProductLinks)
        .values({ businessId, productId: product.id, variantId: v.id, ghlProductId, ghlPriceId: price._id, lastPushedHash: fingerprint, lastPushedQuantity: quantity ?? null, lastSyncedAt: new Date() })
        .onConflictDoUpdate({ target: [ghlProductLinks.businessId, ghlProductLinks.variantId], set: { ghlProductId, ghlPriceId: price._id, lastPushedHash: fingerprint, lastPushedQuantity: quantity ?? null, lastSyncedAt: new Date(), lastError: null, updatedAt: new Date() } });
      createdPrices++;
      continue;
    }
    if (link.lastPushedHash !== fingerprint || link.ghlProductId !== ghlProductId) {
      await api.updatePrice(ghlProductId, link.ghlPriceId, body);
      // Retired variants stay as prices (old GHL orders reference them) but can't be bought.
      if (!active && tracked) await api.updateInventory([{ priceId: link.ghlPriceId, availableQuantity: 0 }]);
      await getDb().update(ghlProductLinks).set({ ghlProductId, lastPushedHash: fingerprint, lastSyncedAt: new Date(), lastError: null, updatedAt: new Date() }).where(eq(ghlProductLinks.id, link.id));
      updatedPrices++;
    }
  }
  return { status: "synced", externalId: ghlProductId, result: { createdPrices, updatedPrices, availableInStore: productBody.availableInStore } };
};

/** inventory.push — publishes the variant's current available quantity (absolute value). */
export const inventoryPush: Handler = async (event, env2) => {
  const businessId = env2.businessId;
  const variantId = event.entityId!;
  const [row] = await getDb()
    .select({ link: ghlProductLinks, productId: productVariants.productId, productType: products.productType })
    .from(productVariants)
    .innerJoin(products, eq(products.id, productVariants.productId))
    .leftJoin(ghlProductLinks, and(eq(ghlProductLinks.businessId, businessId), eq(ghlProductLinks.variantId, productVariants.id)))
    .where(and(eq(productVariants.businessId, businessId), eq(productVariants.id, variantId)))
    .limit(1);
  if (!row) return { status: "skipped", note: "Variant no longer exists" };
  if (row.productType !== "stock") return { status: "skipped", note: "Not a stocked item" };
  const { api, settings } = await apiFor(businessId);
  if (!row.link?.ghlPriceId) {
    if (!settings.sync.products) return { status: "skipped", note: "Product isn't published to GHL (product sync is off)" };
    await enqueue(getDb(), { businessId, direction: "outbound", eventType: "product.sync", category: "products", entityType: "product", entityId: row.productId, coalesce: true });
    return { status: "skipped", note: "Product not in GHL yet — product sync queued; it publishes the quantity" };
  }
  const locationId = await publishedLocationId(businessId, settings);
  const quantity = await availableAt(businessId, variantId, locationId);
  await api.updateInventory([{ priceId: row.link.ghlPriceId, availableQuantity: quantity }]);
  await getDb().update(ghlProductLinks).set({ lastPushedQuantity: quantity, lastSyncedAt: new Date(), lastError: null, updatedAt: new Date() }).where(eq(ghlProductLinks.id, row.link.id));
  return { status: "synced", externalId: row.link.ghlPriceId, result: { availableQuantity: quantity } };
};

/** Queues product sync for every stocked/service product (first-time publish from Settings). */
export async function queueFullProductSync(businessId: string) {
  const rows = await getDb()
    .select({ id: products.id })
    .from(products)
    .where(and(eq(products.businessId, businessId), inArray(products.productType, ["stock", "service"]), sql`${products.archivedAt} is null`));
  let queued = 0;
  for (const r of rows) {
    const id = await enqueue(getDb(), { businessId, direction: "outbound", eventType: "product.sync", category: "products", entityType: "product", entityId: r.id, coalesce: true });
    if (id) queued++;
  }
  return queued;
}
