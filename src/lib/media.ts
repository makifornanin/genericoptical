import manifest from "./media-manifest.json";

/*
 * Product and editorial imagery shipped with the site (public/media). Renders (tools/renders) are keyed
 * by the catalogue slug and colour and show the actual product from three angles. A product without a
 * render gets a stock photo picked by colour (tools/stock): one illustrative photo, flagged so the page
 * can say so. Client-safe.
 */

export type View = "front" | "angle" | "side" | "top" | "detail";

export interface ImageSet {
  src: string;
  srcSet: string;
  width: number;
  height: number;
  /** A stock photo standing in for the product (not a picture of this exact frame). */
  illustrative?: boolean;
}

type ProductEntry = { views: string[]; widths: number[]; ratio: [number, number] | null };
type EditorialEntry = { widths: number[]; ratio: [number, number] | null };
const PRODUCTS = manifest.products as unknown as Record<string, Record<string, ProductEntry>>;
const EDITORIAL = manifest.editorial as unknown as Record<string, EditorialEntry>;
const STOCK = ((manifest as { stock?: unknown }).stock ?? {}) as Record<string, EditorialEntry>;

/** Stock photos that suit each colour; other colours (and products without one) use all of them. */
const STOCK_BY_COLOUR: Record<string, string[]> = {
  black: ["black-cateye", "black-orange", "black-halfrim", "grey-square"],
  smoke: ["black-cateye", "black-halfrim", "grey-square"],
  tortoise: ["brown-round", "grey-square"],
  brown: ["brown-round", "grey-square"],
  crystal: ["clear-pink", "silver-hands"],
  gold: ["gold-round", "gold-newspaper", "metal-teal", "silver-hands"],
  silver: ["silver-hands", "metal-teal", "black-halfrim"],
};

/**
 * Hand-picked photos for the demo catalogue, so neighbouring tiles don't repeat. Used when the colour
 * asked for suits the photo; anything else gets a colour-matched pick.
 */
const STOCK_FOR: Record<string, string> = {
  "arden-everyday": "black-orange",
  "brio-flex-kids": "silver-hands",
  "brio-junior": "clear-pink",
  "halden-aviator-rx": "gold-round",
  "halden-oval": "gold-newspaper",
  "halden-sable": "grey-square",
  "kiyo-hex": "metal-teal",
  "kiyo-slim": "black-halfrim",
  "kiyo-titan": "grey-square",
  "mesa-cat-9": "black-cateye",
  "mesa-classic": "black-orange",
  "mesa-studio": "black-cateye",
  "solenne-atelier": "brown-round",
  "solenne-muse": "silver-hands",
  "vela-air": "clear-pink",
  "vela-square-pro": "black-halfrim",
  "brio-kids-sun": "metal-teal",
  "halden-pilot": "gold-round",
  "kiyo-sport-polarised": "black-halfrim",
  "mesa-cat-sun": "black-cateye",
  "mesa-coast": "grey-square",
  "solenne-riviera": "brown-round",
  "vela-drift": "black-orange",
  "microfiber-cloth": "silver-hands",
  "folding-case": "gold-newspaper",
  "hard-shell-case": "grey-square",
  "kids-case": "clear-pink",
  "beaded-eyewear-chain": "gold-round",
  "retainer-cord": "black-orange",
  "eyewear-repair-kit": "store-wall",
  "silicone-nose-pads-pair": "metal-teal",
};

/** The stand-in photo for a product colour: the same choice every time, varied between products. */
function stockImage(slug: string, colour: string | null | undefined): ImageSet | null {
  const all = Object.keys(STOCK);
  const pool = (STOCK_BY_COLOUR[colour ?? ""] ?? all).filter((n) => STOCK[n]);
  const names = pool.length ? pool : all;
  if (!names.length) return null;
  let hash = 0;
  for (const ch of `${slug}:${colour ?? ""}`) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  const chosen = STOCK_FOR[slug];
  const name = chosen && STOCK[chosen] && (!STOCK_BY_COLOUR[colour ?? ""] || names.includes(chosen)) ? chosen : names[hash % names.length];
  return { ...set((w) => `/media/stock/${name}-${w}.webp`, STOCK[name].widths, STOCK[name].ratio), illustrative: true };
}

function set(base: (w: number) => string, widths: number[], ratio: [number, number] | null): ImageSet {
  const largest = widths[widths.length - 1];
  const [rw, rh] = ratio ?? [4, 3];
  return {
    src: base(widths.length > 1 ? widths[widths.length - 2] : largest),
    srcSet: widths.map((w) => `${base(w)} ${w}w`).join(", "),
    width: largest,
    height: Math.round((largest * rh) / rw),
  };
}

/** Colour keys that have renders for this product, in manifest order. */
export function renderedColours(slug: string): string[] {
  return Object.keys(PRODUCTS[slug] ?? {});
}

/**
 * One rendered view of a product colour. Falls back to the product's first rendered colour; a product
 * with no render gets its stock photo for the front view (and nothing for the other views).
 */
export function productImage(slug: string, colour: string | null | undefined, view: View = "front"): ImageSet | null {
  const colours = PRODUCTS[slug];
  if (!colours) return view === "front" ? stockImage(slug, colour) : null;
  const key = colour && colours[colour] ? colour : Object.keys(colours)[0];
  const entry = colours[key];
  if (!entry || !entry.views.includes(view)) return null;
  return set((w) => `/media/products/${slug}/${key}-${view}-${w}.webp`, entry.widths, entry.ratio);
}

/** Every rendered view of a product colour (gallery order: front, angle, side…), or its one stock photo. */
export function productGallery(slug: string, colour: string | null | undefined): { view: View; image: ImageSet }[] {
  const colours = PRODUCTS[slug];
  if (!colours) {
    const stock = stockImage(slug, colour);
    return stock ? [{ view: "front", image: stock }] : [];
  }
  const key = colour && colours[colour] ? colour : Object.keys(colours)[0];
  const entry = colours[key];
  if (!entry) return [];
  return entry.views.map((view) => ({ view: view as View, image: set((w) => `/media/products/${slug}/${key}-${view}-${w}.webp`, entry.widths, entry.ratio) }));
}

/** An editorial image by name (public/media/editorial/<name>-<width>.webp), or null. */
export function editorialImage(name: string): ImageSet | null {
  const e = EDITORIAL[name];
  if (!e || !e.widths.length) return null;
  return set((w) => `/media/editorial/${name}-${w}.webp`, e.widths, e.ratio);
}
