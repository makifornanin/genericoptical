import { DAY_KEYS, type DayKey, type WeeklyHours } from "./api-types";

/* Formatting helpers shared by Server and Client Components (no secrets, no server APIs). */

export interface MoneyFormat {
  currency: string;
  locale: string;
}

export const DEFAULT_MONEY: MoneyFormat = { currency: "PHP", locale: "en-PH" };

/** "₱2,950" for whole amounts, "₱2,950.50" otherwise. */
export function money(cents: number | null | undefined, fmt: MoneyFormat = DEFAULT_MONEY): string {
  if (typeof cents !== "number" || !Number.isFinite(cents)) return "";
  const amount = cents / 100;
  const whole = Number.isInteger(amount);
  try {
    return new Intl.NumberFormat(fmt.locale, { style: "currency", currency: fmt.currency, minimumFractionDigits: whole ? 0 : 2, maximumFractionDigits: 2 }).format(amount);
  } catch {
    return `${fmt.currency} ${whole ? amount.toFixed(0) : amount.toFixed(2)}`;
  }
}

/** Service price label: null = on request, 0 = free. */
export function servicePrice(cents: number | null, fmt: MoneyFormat, fromPrice = false): string {
  if (cents === null) return "Price on request";
  if (cents === 0) return "Free";
  return (fromPrice ? "From " : "") + money(cents, fmt);
}

export function telHref(phone: string | null | undefined): string {
  return `tel:${String(phone ?? "").replace(/[^\d+]/g, "")}`;
}

export const plural = (n: number, [one, many]: [string, string]) => `${n} ${n === 1 ? one : many}`;

/* ── Dates ───────────────────────────────────────────────────────────────────────────────────── */

/** "Tue 28 Oct" for a yyyy-MM-dd day (no time zone shift). */
export function shortDay(day: string, locale = "en-PH"): string {
  const [y, m, d] = day.split("-").map(Number);
  if (!y || !m || !d) return day;
  return new Intl.DateTimeFormat(locale, { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(Date.UTC(y, m - 1, d)));
}

/** "28 Oct, 3:42 pm" in the business time zone. */
export function dateTime(iso: string, timeZone: string, locale = "en-PH"): string {
  try {
    return new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone }).format(new Date(iso));
  } catch {
    return iso;
  }
}

/* ── Opening hours ───────────────────────────────────────────────────────────────────────────── */

const DAY_SHORT: Record<DayKey, string> = { mon: "Mon", tue: "Tue", wed: "Wed", thu: "Thu", fri: "Fri", sat: "Sat", sun: "Sun" };
const DAY_LONG: Record<DayKey, string> = { mon: "Monday", tue: "Tuesday", wed: "Wednesday", thu: "Thursday", fri: "Friday", sat: "Saturday", sun: "Sunday" };

export function to12h(hm: string): string {
  const [h = 0, m = 0] = hm.split(":").map(Number);
  const suffix = h >= 12 ? "pm" : "am";
  const hour = h % 12 || 12;
  return m ? `${hour}:${String(m).padStart(2, "0")}${suffix}` : `${hour}${suffix}`;
}

/** [{days: "Mon – Sat", time: "10am – 7pm"}], grouping consecutive days with identical hours. */
export function groupedHours(hours: WeeklyHours): { days: string; time: string }[] {
  const groups: { start: DayKey; end: DayKey; time: string }[] = [];
  for (const d of DAY_KEYS) {
    const h = hours[d];
    const time = h ? `${to12h(h.open)} – ${to12h(h.close)}` : "Closed";
    const last = groups[groups.length - 1];
    if (last && last.time === time) last.end = d;
    else groups.push({ start: d, end: d, time });
  }
  return groups.map((g) => ({ days: g.start === g.end ? DAY_SHORT[g.start] : `${DAY_SHORT[g.start]} – ${DAY_SHORT[g.end]}`, time: g.time }));
}

function nowIn(timeZone: string, at: Date): { day: DayKey; hm: string } {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone, weekday: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(at);
  const pick = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return { day: pick("weekday").toLowerCase().slice(0, 3) as DayKey, hm: `${pick("hour")}:${pick("minute")}` };
}

/** "Open now · until 7pm" / "Closed · opens 10am today" in the business time zone, or null. */
export function openStatus(hours: WeeklyHours, timeZone: string, at: Date): { open: boolean; label: string } | null {
  try {
    const now = nowIn(timeZone, at);
    const today = hours[now.day];
    if (today && now.hm >= today.open && now.hm < today.close) return { open: true, label: `Open now · until ${to12h(today.close)}` };
    if (today && now.hm < today.open) return { open: false, label: `Closed · opens ${to12h(today.open)} today` };
    const idx = DAY_KEYS.indexOf(now.day);
    if (idx < 0) return null;
    for (let i = 1; i <= 7; i++) {
      const d = DAY_KEYS[(idx + i) % 7];
      const h = hours[d];
      if (h) return { open: false, label: `Closed · opens ${i === 1 ? "tomorrow" : DAY_LONG[d]} ${to12h(h.open)}` };
    }
  } catch {
    /* invalid time zone: no badge */
  }
  return null;
}
