import { describe, expect, it } from "vitest";
import { allocate, centsToInput, formatMoney, parseMoney, taxFor } from "@/lib/money";
import { computeBalance, derivePaymentStatus, priceSale } from "@/lib/pricing";

describe("money", () => {
  it("parses user input into exact minor units", () => {
    expect(parseMoney("1,234.50")).toBe(123450);
    expect(parseMoney("₱ 99")).toBe(9900);
    expect(parseMoney("0.1")).toBe(10);
    expect(parseMoney("19.99")).toBe(1999);
    expect(parseMoney("1.005")).toBeNull();
    expect(parseMoney("abc")).toBeNull();
    expect(centsToInput(123405)).toBe("1234.05");
  });

  it("formats currency", () => {
    expect(formatMoney(123450, "PHP", "en-PH")).toBe("₱1,234.50");
  });

  it("computes inclusive and exclusive tax with half-up rounding", () => {
    expect(taxFor(112000, 1200, true)).toBe(12000);
    expect(taxFor(100000, 1200, false)).toBe(12000);
    expect(taxFor(10000, 1200, true)).toBe(1071); // 10000 × 12/112 = 1071.43
    expect(taxFor(5000, 0, true)).toBe(0);
  });

  it("allocates amounts that always sum exactly", () => {
    const parts = allocate(1000, [1, 1, 1]);
    expect(parts.reduce((a, b) => a + b, 0)).toBe(1000);
    expect(parts).toEqual([334, 333, 333]);
    expect(allocate(7, [0, 0])).toEqual([0, 0]);
  });
});

describe("pricing engine", () => {
  const tax = { rateBps: 1200, pricesIncludeTax: true };

  it("prices tax-inclusive lines with an order discount spread across lines", () => {
    const p = priceSale(
      [
        { key: "a", quantity: 2, unitPriceCents: 112000, taxExempt: false },
        { key: "b", quantity: 1, unitPriceCents: 50000, taxExempt: true },
      ],
      tax,
      { type: "percent", valueBps: 1000 },
    );
    expect(p.subtotalCents).toBe(274000);
    expect(p.orderDiscountCents).toBe(27400);
    expect(p.totalCents).toBe(274000 - 27400);
    expect(p.lines.reduce((s, l) => s + l.discountCents, 0)).toBe(27400);
    expect(p.lines[1].taxCents).toBe(0);
    expect(p.netCents + p.taxCents).toBe(p.totalCents);
  });

  it("adds tax on top when prices exclude tax", () => {
    const p = priceSale([{ key: "a", quantity: 1, unitPriceCents: 100000, taxExempt: false }], { rateBps: 1200, pricesIncludeTax: false });
    expect(p).toMatchObject({ netCents: 100000, taxCents: 12000, totalCents: 112000 });
  });

  it("rejects invalid input", () => {
    expect(() => priceSale([], tax)).toThrow();
    expect(() => priceSale([{ key: "a", quantity: 0, unitPriceCents: 100, taxExempt: false }], tax)).toThrow();
    expect(() => priceSale([{ key: "a", quantity: 1, unitPriceCents: 100, lineDiscountCents: 200, taxExempt: false }], tax)).toThrow();
    expect(() => priceSale([{ key: "a", quantity: 1, unitPriceCents: 100, taxExempt: false }], tax, { type: "amount", valueCents: 101 })).toThrow();
  });

  it("derives balances and payment status", () => {
    expect(computeBalance({ totalCents: 1000, paidCents: 1000, refundedCents: 300, refundedCashCents: 300 })).toBe(0);
    expect(computeBalance({ totalCents: 1000, paidCents: 500, refundedCents: 300, refundedCashCents: 0 })).toBe(200);
    // A deposit paid back on an open order: the full value is owed again.
    expect(computeBalance({ totalCents: 1000, paidCents: 500, refundedCents: 0, refundedCashCents: 500 })).toBe(1000);
    expect(derivePaymentStatus({ totalCents: 1000, paidCents: 0, balanceDueCents: 1000 })).toBe("unpaid");
    expect(derivePaymentStatus({ totalCents: 1000, paidCents: 400, balanceDueCents: 600 })).toBe("partially_paid");
    expect(derivePaymentStatus({ totalCents: 1000, paidCents: 1000, balanceDueCents: 0 })).toBe("paid");
  });
});
