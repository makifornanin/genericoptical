import type { LensType, Prescription } from "./api-types";

/*
 * The shopping bag lives in the browser (localStorage). Prices stored here are for display only:
 * the bag and checkout always re-price from the dashboard before an order is placed.
 */

export const BAG_STORAGE_KEY = "lensmere.bag.v1";

export interface BagLens {
  variantId: string;
  name: string;
  title: string;
  type: LensType;
  priceCents: number;
}

export interface BagLine {
  id: string;
  slug: string;
  name: string;
  categoryKind: string;
  variantId: string;
  variantLabel: string;
  colourKey: string | null;
  quantity: number;
  unitPriceCents: number;
  lens: BagLens | null;
  prescription: Prescription | null;
  /** Contact lenses ordered per eye. */
  eye: "right" | "left" | null;
}

export const MAX_QTY = 10;

export function lineTotal(l: BagLine): number {
  return (l.unitPriceCents + (l.lens?.priceCents ?? 0)) * l.quantity;
}

export const bagCount = (lines: BagLine[]) => lines.reduce((n, l) => n + l.quantity, 0);
export const bagTotal = (lines: BagLine[]) => lines.reduce((n, l) => n + lineTotal(l), 0);

/** Adds a line, merging with an identical one (same item, no lenses, same eye). */
export function addLine(lines: BagLine[], line: BagLine): BagLine[] {
  if (!line.lens) {
    const same = lines.find((l) => l.variantId === line.variantId && !l.lens && l.eye === line.eye);
    if (same) return lines.map((l) => (l === same ? { ...l, quantity: Math.min(MAX_QTY, l.quantity + line.quantity) } : l));
  }
  return [...lines, line];
}

/** Lines as the dashboard's cart endpoints expect them. */
export function cartItems(lines: BagLine[]) {
  return lines.map((l) => ({ variantId: l.variantId, quantity: l.quantity, lensVariantId: l.lens?.variantId ?? null }));
}

/** Reads a stored bag defensively: anything malformed is dropped. */
export function parseStoredBag(raw: string | null): BagLine[] {
  if (!raw) return [];
  try {
    const data = JSON.parse(raw) as unknown;
    if (!Array.isArray(data)) return [];
    return data
      .filter((l): l is BagLine => Boolean(l) && typeof l === "object" && typeof (l as BagLine).variantId === "string" && typeof (l as BagLine).slug === "string")
      .map((l) => ({ ...l, quantity: Math.min(MAX_QTY, Math.max(1, Math.round(Number(l.quantity) || 1))), lens: l.lens ?? null, prescription: l.prescription ?? null, eye: l.eye ?? null }))
      .slice(0, 20);
  } catch {
    return [];
  }
}

export const newLineId = () => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`);
