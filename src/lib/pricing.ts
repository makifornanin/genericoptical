import { allocate, percentOf, taxFor } from "./money";

/**
 * Pure pricing engine shared by the POS preview (client) and checkout (server).
 * The server always recomputes with this function from database prices; client totals are ignored.
 */

export type PricingLineInput = {
  key: string;
  quantity: number;
  unitPriceCents: number;
  /** Fixed discount for the whole line, in minor units. */
  lineDiscountCents?: number;
  taxExempt: boolean;
};

export type OrderDiscountInput = { type: "percent"; valueBps: number } | { type: "amount"; valueCents: number } | null;

export type PricedLine = {
  key: string;
  quantity: number;
  unitPriceCents: number;
  subtotalCents: number;
  discountCents: number;
  taxCents: number;
  netCents: number;
  lineTotalCents: number;
};

export type PricedSale = {
  lines: PricedLine[];
  subtotalCents: number;
  discountCents: number;
  orderDiscountCents: number;
  taxCents: number;
  netCents: number;
  totalCents: number;
};

export class PricingError extends Error {}

export function priceSale(
  lines: PricingLineInput[],
  tax: { rateBps: number; pricesIncludeTax: boolean },
  orderDiscount: OrderDiscountInput = null,
): PricedSale {
  if (lines.length === 0) throw new PricingError("Add at least one item.");

  const bases = lines.map((l) => {
    if (!Number.isInteger(l.quantity) || l.quantity <= 0) throw new PricingError("Quantities must be whole numbers above zero.");
    if (!Number.isInteger(l.unitPriceCents) || l.unitPriceCents < 0) throw new PricingError("Invalid unit price.");
    const subtotal = l.quantity * l.unitPriceCents;
    const lineDiscount = l.lineDiscountCents ?? 0;
    if (!Number.isInteger(lineDiscount) || lineDiscount < 0) throw new PricingError("Discounts can't be negative.");
    if (lineDiscount > subtotal) throw new PricingError("A line discount can't exceed the line amount.");
    return { subtotal, lineDiscount, base: subtotal - lineDiscount };
  });

  const baseTotal = bases.reduce((s, b) => s + b.base, 0);
  let orderDiscountCents = 0;
  if (orderDiscount) {
    if (orderDiscount.type === "percent") {
      if (orderDiscount.valueBps < 0 || orderDiscount.valueBps > 10000) throw new PricingError("Discount must be between 0% and 100%.");
      orderDiscountCents = percentOf(baseTotal, orderDiscount.valueBps);
    } else {
      if (!Number.isInteger(orderDiscount.valueCents) || orderDiscount.valueCents < 0) throw new PricingError("Invalid discount amount.");
      if (orderDiscount.valueCents > baseTotal) throw new PricingError("The discount can't exceed the order amount.");
      orderDiscountCents = orderDiscount.valueCents;
    }
  }
  const shares = allocate(
    orderDiscountCents,
    bases.map((b) => b.base),
  );

  const priced: PricedLine[] = lines.map((l, i) => {
    const discounted = bases[i].base - shares[i];
    const rate = l.taxExempt ? 0 : tax.rateBps;
    const taxCents = taxFor(discounted, rate, tax.pricesIncludeTax);
    const netCents = tax.pricesIncludeTax ? discounted - taxCents : discounted;
    const lineTotalCents = tax.pricesIncludeTax ? discounted : discounted + taxCents;
    return {
      key: l.key,
      quantity: l.quantity,
      unitPriceCents: l.unitPriceCents,
      subtotalCents: bases[i].subtotal,
      discountCents: bases[i].lineDiscount + shares[i],
      taxCents,
      netCents,
      lineTotalCents,
    };
  });

  const sum = (f: (l: PricedLine) => number) => priced.reduce((s, l) => s + f(l), 0);
  return {
    lines: priced,
    subtotalCents: sum((l) => l.subtotalCents),
    discountCents: sum((l) => l.discountCents),
    orderDiscountCents,
    taxCents: sum((l) => l.taxCents),
    netCents: sum((l) => l.netCents),
    totalCents: sum((l) => l.lineTotalCents),
  };
}

/** Payment status from the stored balance fields. */
export function derivePaymentStatus(s: { totalCents: number; paidCents: number; balanceDueCents: number }) {
  if (s.balanceDueCents <= 0 && (s.paidCents > 0 || s.totalCents === 0)) return "paid" as const;
  if (s.balanceDueCents <= 0) return "paid" as const;
  return s.paidCents > 0 ? ("partially_paid" as const) : ("unpaid" as const);
}

/** balance = total − paid − (refunds credited to the balance rather than paid out) */
export function computeBalance(s: { totalCents: number; paidCents: number; refundedCents: number; refundedCashCents: number }) {
  return s.totalCents - s.paidCents - (s.refundedCents - s.refundedCashCents);
}
