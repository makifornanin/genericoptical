import { formatInZone, relativeTime } from "./dates";
import { formatMoney } from "./money";

export type BizFormat = { currency: string; locale: string; timezone: string };

/** Formatting bound to a business's currency, locale and time zone. */
export function formatter(b: BizFormat) {
  return {
    money: (cents: number | null | undefined) => formatMoney(cents, b.currency, b.locale),
    compact: (cents: number | null | undefined) => formatMoney(cents, b.currency, b.locale, { compact: true }),
    date: (d: Date | string | null | undefined, pattern = "MMM d, yyyy") => formatInZone(d, b.timezone, pattern),
    dateTime: (d: Date | string | null | undefined) => formatInZone(d, b.timezone, "MMM d, yyyy · h:mm a"),
    time: (d: Date | string | null | undefined) => formatInZone(d, b.timezone, "h:mm a"),
    relative: (d: Date | string) => relativeTime(d),
    number: (n: number) => n.toLocaleString(b.locale),
    pct: (n: number | null | undefined) => (n === null || n === undefined ? "—" : `${n.toLocaleString(b.locale, { maximumFractionDigits: 1 })}%`),
    moneyMeta: { currency: b.currency, locale: b.locale },
  };
}

export const SALE_STATUS_TONE = {
  paid: "positive",
  partially_paid: "warning",
  unpaid: "negative",
} as const;

export const PAYMENT_STATUS_LABEL: Record<string, string> = { paid: "Paid", partially_paid: "Partially paid", unpaid: "Unpaid" };
