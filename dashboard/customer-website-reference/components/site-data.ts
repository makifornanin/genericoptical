import "server-only";
import { and, asc, eq, isNull } from "drizzle-orm";
import { cache } from "react";
import { getDb } from "@/server/db";
import { productCategories, products, productVariants } from "@/server/db/schema";
import { appointmentTypesFor } from "@/server/services/appointments";
import { getSiteBusiness, listBranches } from "@/server/services/settings";

/** Everything the public website needs, read once per request. */
export const getSite = cache(async () => {
  const biz = await getSiteBusiness();
  if (!biz) return null;
  const [branches, types] = await Promise.all([listBranches(biz.id, { activeOnly: true }), appointmentTypesFor(getDb(), biz.id, true)]);
  return { biz, branches, types };
});

export const getShowcase = cache(async (businessId: string) => {
  const rows = await getDb()
    .select({
      id: products.id,
      name: products.name,
      brand: products.brand,
      description: products.description,
      imageUrl: products.imageUrl,
      category: productCategories.name,
      categoryKind: productCategories.kind,
      attributes: products.attributes,
      price: productVariants.priceCents,
      label: productVariants.label,
    })
    .from(products)
    .innerJoin(productCategories, eq(productCategories.id, products.categoryId))
    .innerJoin(productVariants, eq(productVariants.productId, products.id))
    .where(and(eq(products.businessId, businessId), eq(products.showOnWebsite, true), eq(products.isActive, true), isNull(products.archivedAt), eq(productVariants.isActive, true), isNull(productVariants.archivedAt)))
    .orderBy(asc(productCategories.sortOrder), asc(products.name), asc(productVariants.sortOrder));
  const map = new Map<string, { id: string; name: string; brand: string | null; description: string | null; imageUrl: string | null; category: string; categoryKind: string; shape?: string; minPrice: number; options: string[] }>();
  for (const r of rows) {
    const cur = map.get(r.id);
    if (cur) {
      cur.minPrice = Math.min(cur.minPrice, r.price);
      if (r.label !== "Default" && !cur.options.includes(r.label)) cur.options.push(r.label);
    } else map.set(r.id, { id: r.id, name: r.name, brand: r.brand, description: r.description, imageUrl: r.imageUrl, category: r.category, categoryKind: r.categoryKind, shape: r.attributes.shape, minPrice: r.price, options: r.label !== "Default" ? [r.label] : [] });
  }
  return [...map.values()];
});
