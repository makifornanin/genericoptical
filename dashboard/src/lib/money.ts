/**
 * Money is always an integer number of minor units (e.g. centavos). Never use floats for
 * stored amounts; convert at the edges (form input, display) only.
 */

/** Parses user input such as "1,234.5" or "₱ 99" into minor units. Returns null when invalid. */
export function parseMoney(input: string | number | null | undefined): number | null {
  if (input === null || input === undefined) return null;
  if (typeof input === "number") {
    if (!Number.isFinite(input)) return null;
    return Math.round(input * 100);
  }
  const cleaned = input.replace(/[^0-9.\-]/g, "");
  if (!cleaned || cleaned === "-" || cleaned === ".") return null;
  if (!/^-?\d*(\.\d{0,2})?$/.test(cleaned)) return null;
  const negative = cleaned.startsWith("-");
  const [whole, frac = ""] = cleaned.replace("-", "").split(".");
  const cents = Number(whole || "0") * 100 + Number((frac + "00").slice(0, 2));
  if (!Number.isSafeInteger(cents)) return null;
  return negative ? -cents : cents;
}

/** Minor units → decimal string for inputs ("1234.50"). */
export function centsToInput(cents: number | null | undefined): string {
  if (cents === null || cents === undefined) return "";
  const negative = cents < 0;
  const abs = Math.abs(cents);
  return `${negative ? "-" : ""}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, "0")}`;
}

const formatters = new Map<string, Intl.NumberFormat>();

export function formatMoney(
  cents: number | null | undefined,
  currency = "PHP",
  locale = "en-PH",
  opts: { compact?: boolean; showSign?: boolean } = {},
): string {
  if (cents === null || cents === undefined) return "—";
  const key = `${locale}|${currency}|${opts.compact ? "c" : "f"}|${opts.showSign ? "s" : ""}`;
  let fmt = formatters.get(key);
  if (!fmt) {
    fmt = new Intl.NumberFormat(locale, {
      style: "currency",
      currency,
      notation: opts.compact ? "compact" : "standard",
      maximumFractionDigits: opts.compact ? 1 : 2,
      minimumFractionDigits: opts.compact ? 0 : 2,
      signDisplay: opts.showSign ? "exceptZero" : "auto",
    });
    formatters.set(key, fmt);
  }
  return fmt.format(cents / 100);
}

/** Round half away from zero to an integer (used for all tax/discount rounding). */
export function roundHalfUp(value: number): number {
  return value < 0 ? -Math.round(-value) : Math.round(value);
}

/** Percentage (basis points) of an amount, rounded to minor units. */
export function percentOf(cents: number, bps: number): number {
  return roundHalfUp((cents * bps) / 10000);
}

/**
 * Tax contained in / added to an amount.
 * - inclusive: the amount already contains tax → tax = amount × r / (1 + r)
 * - exclusive: tax is added on top → tax = amount × r
 */
export function taxFor(amountCents: number, rateBps: number, inclusive: boolean): number {
  if (rateBps <= 0 || amountCents <= 0) return 0;
  return inclusive ? roundHalfUp((amountCents * rateBps) / (10000 + rateBps)) : roundHalfUp((amountCents * rateBps) / 10000);
}

/**
 * Splits `total` across `weights` proportionally so the parts sum exactly to `total`
 * (largest-remainder method). Used to spread an order discount across lines.
 */
export function allocate(total: number, weights: number[]): number[] {
  const sum = weights.reduce((a, b) => a + b, 0);
  if (total === 0 || sum === 0) return weights.map(() => 0);
  const raw = weights.map((w) => (total * w) / sum);
  const floors = raw.map((r) => Math.floor(r));
  let remainder = total - floors.reduce((a, b) => a + b, 0);
  const order = raw.map((r, i) => ({ i, frac: r - Math.floor(r) })).sort((a, b) => b.frac - a.frac || a.i - b.i);
  for (const { i } of order) {
    if (remainder <= 0) break;
    floors[i] += 1;
    remainder -= 1;
  }
  return floors;
}

export function formatBps(bps: number): string {
  const pct = bps / 100;
  return `${Number.isInteger(pct) ? pct : pct.toFixed(2)}%`;
}
