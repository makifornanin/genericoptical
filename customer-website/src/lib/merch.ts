import type { ProductSummary } from "./api-types";
import { renderedColours } from "./media";

/*
 * Which products the home page and empty states show. The API has no "featured" or sales-rank data,
 * so nothing here claims bestsellers: picks favour variety (different shapes and materials) among
 * products that are in stock and have photography.
 */

const inStock = (p: ProductSummary) => p.availability !== "out_of_stock";

/** Up to `n` products with distinct shape/material pairs, photographed ones first. */
export function varied(products: ProductSummary[], n: number): ProductSummary[] {
  const pool = [...products].sort((a, b) => Number(renderedColours(b.slug).length > 0) - Number(renderedColours(a.slug).length > 0) || Number(inStock(b)) - Number(inStock(a)));
  const picked: ProductSummary[] = [];
  const seen = new Set<string>();
  for (const p of pool) {
    const key = `${p.filters.shape ?? ""}|${p.filters.material ?? ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    picked.push(p);
    if (picked.length === n) return picked;
  }
  for (const p of pool) {
    if (picked.length === n) break;
    if (!picked.includes(p)) picked.push(p);
  }
  return picked;
}

/** One representative product per shape, with how many products have that shape. */
export function byShape(products: ProductSummary[], shapes: string[]): { shape: string; product: ProductSummary; count: number }[] {
  return shapes
    .map((shape) => {
      const matching = products.filter((p) => p.filters.shape === shape);
      const product = matching.find((p) => renderedColours(p.slug).length) ?? matching[0];
      return product ? { shape, product, count: matching.length } : null;
    })
    .filter((x): x is { shape: string; product: ProductSummary; count: number } => x !== null);
}

export const minPrice = (products: ProductSummary[]) => {
  const prices = products.map((p) => p.priceFromCents).filter((x): x is number => typeof x === "number");
  return prices.length ? Math.min(...prices) : null;
};
