import { DAY_KEYS, type Availability, type BranchAvailability, type DayKey, type WeeklyHours } from "./api-types";

/* Formatting helpers shared by Server and Client Components (no secrets, no server APIs). */

export interface MoneyFormat {
  currency: string;
  locale: string;
}

export function money(cents: number | null | undefined, fmt: MoneyFormat): string {
  if (typeof cents !== "number" || !Number.isFinite(cents)) return "";
  const amount = cents / 100;
  try {
    return new Intl.NumberFormat(fmt.locale, { style: "currency", currency: fmt.currency }).format(amount);
  } catch {
    return `${fmt.currency} ${amount.toFixed(2)}`;
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

/* ── Opening hours (ported from scripts/oc-site.js) ─────────────────────────────────────────── */

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

/* ── Availability ──────────────────────────────────────────────────────────────────────────── */

export const AVAILABILITY_LABEL: Record<Availability, string> = {
  in_stock: "In stock",
  low_stock: "Low stock",
  out_of_stock: "Out of stock — ask us",
  made_to_order: "Made to order",
  service: "",
};

/** Existing tag styles: --pos for in stock, --warn for low stock, plain for the rest. */
export function availabilityTagClass(a: Availability | BranchAvailability): string {
  if (a === "in_stock") return "oc-tag oc-tag--pos";
  if (a === "low_stock") return "oc-tag oc-tag--warn";
  return "oc-tag";
}
