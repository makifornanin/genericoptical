import type { ProductSummary } from "./api-types";
import { summaryColourKeys } from "./catalog";
import { renderedColours } from "./media";

/* Collection filtering and sorting, shared by the server render and the client view. */

export type SortKey = "recommended" | "price-asc" | "price-desc" | "name";
export interface Filters {
  shape: string[];
  material: string[];
  colour: string[];
  sort: SortKey;
}

const SORTS: SortKey[] = ["recommended", "price-asc", "price-desc", "name"];
const list = (v: string | string[] | undefined) => (Array.isArray(v) ? v : (v ?? "").split(",")).map((s) => s.trim().toLowerCase()).filter((s) => /^[a-z0-9-]{1,30}$/.test(s));

export function parseFilters(params: Record<string, string | string[] | undefined>): Filters {
  const sort = typeof params.sort === "string" && SORTS.includes(params.sort as SortKey) ? (params.sort as SortKey) : "recommended";
  return { shape: list(params.shape), material: list(params.material), colour: list(params.colour), sort };
}

export function filtersToQuery(f: Filters): string {
  const q = new URLSearchParams();
  if (f.shape.length) q.set("shape", f.shape.join(","));
  if (f.material.length) q.set("material", f.material.join(","));
  if (f.colour.length) q.set("colour", f.colour.join(","));
  if (f.sort !== "recommended") q.set("sort", f.sort);
  const s = q.toString();
  return s ? `?${s}` : "";
}

export function applyFilters(products: ProductSummary[], f: Filters): ProductSummary[] {
  const out = products.filter((p) => {
    if (f.shape.length && !f.shape.includes(p.filters.shape ?? "")) return false;
    if (f.material.length && !f.material.includes(p.filters.material ?? "")) return false;
    if (f.colour.length && !summaryColourKeys(p).some((c) => f.colour.includes(c))) return false;
    return true;
  });
  const price = (p: ProductSummary) => p.priceFromCents ?? Number.MAX_SAFE_INTEGER;
  if (f.sort === "price-asc") out.sort((a, b) => price(a) - price(b));
  if (f.sort === "price-desc") out.sort((a, b) => price(b) - price(a));
  if (f.sort === "name") out.sort((a, b) => a.name.localeCompare(b.name));
  // Recommended: in stock first, then products with their own three-angle photography.
  const photographed = (p: ProductSummary) => (renderedColours(p.slug).length ? 0 : 1);
  if (f.sort === "recommended") out.sort((a, b) => Number(a.availability === "out_of_stock") - Number(b.availability === "out_of_stock") || photographed(a) - photographed(b));
  return out;
}

/** Options for one facet with how many products each would show (given the other active filters). */
export function facetOptions(products: ProductSummary[], f: Filters, facet: "shape" | "material" | "colour"): { value: string; count: number }[] {
  const others = { ...f, [facet]: [] };
  const base = applyFilters(products, others);
  const counts = new Map<string, number>();
  for (const p of base) {
    const values = facet === "colour" ? summaryColourKeys(p) : [p.filters[facet]].filter(Boolean);
    for (const v of values as string[]) counts.set(v, (counts.get(v) ?? 0) + 1);
  }
  const all = new Set(products.flatMap((p) => (facet === "colour" ? summaryColourKeys(p) : [p.filters[facet]].filter(Boolean))) as string[]);
  return [...all].sort().map((value) => ({ value, count: counts.get(value) ?? 0 }));
}
