import type { sellableVariants } from "@/server/services/catalog";
import type { PosItem } from "./terminal";

/** The fields the POS terminal needs from a sellable variant (no costs reach the browser). */
export function toPosItem(i: Awaited<ReturnType<typeof sellableVariants>>[number]): PosItem {
  return {
    variantId: i.variantId,
    productId: i.productId,
    productName: i.productName,
    brand: i.brand,
    label: i.label,
    sku: i.sku,
    barcode: i.barcode,
    priceCents: i.priceCents,
    productType: i.productType,
    taxExempt: i.taxExempt,
    imageUrl: i.imageUrl,
    categoryId: i.categoryId,
    available: i.available,
    reorderPoint: i.reorderPoint,
  };
}
