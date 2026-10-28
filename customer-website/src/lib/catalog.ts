import type { CategoryRef, ProductDetail, ProductSummary, ProductVariant } from "./api-types";

/*
 * How the dashboard's categories map onto the store's collections, and the colour/size vocabulary
 * shared by tiles, filters and product pages. Client-safe (no server APIs, no secrets).
 */

export type CollectionKey = "glasses" | "sunglasses" | "contact-lenses" | "accessories";

export interface Collection {
  key: CollectionKey;
  title: string;
  path: string;
  /** Dashboard category kinds that belong to this collection. */
  kinds: string[];
  /** Plural noun for the count line: "20 frames". */
  noun: [string, string];
  filters: ("shape" | "material" | "colour")[];
}

export const COLLECTIONS: Record<CollectionKey, Collection> = {
  glasses: { key: "glasses", title: "Glasses", path: "/glasses", kinds: ["frames"], noun: ["frame", "frames"], filters: ["shape", "material", "colour"] },
  sunglasses: { key: "sunglasses", title: "Sunglasses", path: "/sunglasses", kinds: ["sunglasses"], noun: ["pair", "pairs"], filters: ["shape"] },
  "contact-lenses": { key: "contact-lenses", title: "Contact lenses", path: "/contact-lenses", kinds: ["contact_lenses"], noun: ["product", "products"], filters: [] },
  accessories: { key: "accessories", title: "Accessories & care", path: "/accessories", kinds: ["cleaning", "cases", "accessories"], noun: ["product", "products"], filters: [] },
};

export function collectionOf(category: CategoryRef): Collection | null {
  return Object.values(COLLECTIONS).find((c) => c.kinds.includes(category.kind)) ?? null;
}

export function inCollection(p: ProductSummary, c: Collection): boolean {
  return c.kinds.includes(p.category.kind);
}

export const isFrame = (c: CategoryRef) => c.kind === "frames";
export const isSunglasses = (c: CategoryRef) => c.kind === "sunglasses";
export const isContactLens = (c: CategoryRef) => c.kind === "contact_lenses";

/* ── Colours ─────────────────────────────────────────────────────────────────────────────────── */

/** A variant's colour key: the frame colour, or the lens tint for sunglasses ("tortoise", "green"). */
export function colourKeyOf(v: Pick<ProductVariant, "options">): string | null {
  const c = v.options.color ?? v.options.colour ?? v.options.tint;
  return c ? c.trim().toLowerCase() : null;
}

const COLOUR_NAMES: Record<string, string> = {
  black: "Black",
  tortoise: "Tortoise",
  crystal: "Crystal",
  gold: "Gold",
  silver: "Silver",
  green: "Green lens",
  smoke: "Smoke lens",
  brown: "Brown lens",
};
export const colourName = (key: string) => COLOUR_NAMES[key] ?? key.charAt(0).toUpperCase() + key.slice(1);

/** Swatch fill: a flat colour, or a small pattern for tortoiseshell. */
export const SWATCH: Record<string, string> = {
  black: "#141414",
  tortoise: "url(/media/swatches/tortoise.svg)",
  crystal: "#ebe8e1",
  gold: "#cba663",
  silver: "#c7c8ca",
  green: "#3e4b3b",
  smoke: "#47474a",
  brown: "#6b4426",
};

/** Colour keys in the order the variants list them, each with the variants of that colour. */
export function colourGroups(p: Pick<ProductDetail, "variants">): { key: string; variants: ProductVariant[] }[] {
  const groups = new Map<string, ProductVariant[]>();
  for (const v of p.variants) {
    const key = colourKeyOf(v) ?? "default";
    groups.set(key, [...(groups.get(key) ?? []), v]);
  }
  return [...groups.entries()].map(([key, variants]) => ({ key, variants }));
}

/** Colour keys for a summary (frames list their colours; other products have none). */
export const summaryColourKeys = (p: ProductSummary) => p.colours.map((c) => c.trim().toLowerCase());

/* ── Shapes & sizes ──────────────────────────────────────────────────────────────────────────── */

export const SHAPE_LABELS: Record<string, string> = {
  rectangle: "Rectangle",
  square: "Square",
  round: "Round",
  oval: "Oval",
  cateye: "Cat-eye",
  aviator: "Aviator",
  hexagon: "Hexagonal",
  browline: "Browline",
};
export const MATERIAL_LABELS: Record<string, string> = { acetate: "Acetate", metal: "Metal" };
export const label = (map: Record<string, string>, key: string | undefined) => (key ? (map[key] ?? key.charAt(0).toUpperCase() + key.slice(1)) : "");

/** "52" → "52 mm" lens width, the size the frame is sold in. */
export const sizeLabel = (size: string) => (/^\d+$/.test(size) ? `${size} mm` : size);

/* ── Links ───────────────────────────────────────────────────────────────────────────────────── */

export function productHref(slug: string, colourKey?: string | null): string {
  return colourKey && colourKey !== "default" ? `/products/${slug}?colour=${encodeURIComponent(colourKey)}` : `/products/${slug}`;
}
