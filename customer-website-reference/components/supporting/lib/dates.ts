import { TZDate } from "@date-fns/tz";
import { addDays, addMonths, differenceInCalendarDays, format, startOfDay, startOfMonth } from "date-fns";

export const RANGE_PRESETS = [
  { value: "today", label: "Today" },
  { value: "yesterday", label: "Yesterday" },
  { value: "7d", label: "Last 7 days" },
  { value: "30d", label: "Last 30 days" },
  { value: "this_month", label: "This month" },
  { value: "last_month", label: "Last month" },
  { value: "custom", label: "Custom range" },
] as const;
export type RangePreset = (typeof RANGE_PRESETS)[number]["value"];

export type ResolvedRange = {
  preset: RangePreset;
  label: string;
  /** Inclusive start instant (UTC). */
  from: Date;
  /** Exclusive end instant (UTC). */
  to: Date;
  /** Same-length period immediately before, for comparisons. */
  previous: { from: Date; to: Date };
  /** First and last calendar day (yyyy-MM-dd, business time zone), inclusive. */
  fromDay: string;
  toDay: string;
  bucket: "day" | "week" | "month";
  timezone: string;
};

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

export function zonedDay(day: string, timezone: string): TZDate {
  const [y, m, d] = day.split("-").map(Number);
  return new TZDate(y, m - 1, d, timezone);
}

export function dayKey(date: Date, timezone: string): string {
  return format(new TZDate(date, timezone), "yyyy-MM-dd");
}

export function resolveRange(
  preset: string | undefined,
  timezone: string,
  custom?: { from?: string; to?: string },
  now: Date = new Date(),
): ResolvedRange {
  const today = startOfDay(new TZDate(now, timezone));
  let p = (RANGE_PRESETS.some((r) => r.value === preset) ? preset : "30d") as RangePreset;
  let from: TZDate;
  let to: TZDate;
  switch (p) {
    case "today":
      from = today;
      to = addDays(today, 1);
      break;
    case "yesterday":
      from = addDays(today, -1);
      to = today;
      break;
    case "7d":
      from = addDays(today, -6);
      to = addDays(today, 1);
      break;
    case "this_month":
      from = startOfMonth(today);
      to = addDays(today, 1);
      break;
    case "last_month":
      from = startOfMonth(addMonths(today, -1));
      to = startOfMonth(today);
      break;
    case "custom": {
      if (custom?.from && custom?.to && DAY_RE.test(custom.from) && DAY_RE.test(custom.to)) {
        let a = zonedDay(custom.from, timezone);
        let b = zonedDay(custom.to, timezone);
        if (b < a) [a, b] = [b, a];
        // Cap custom ranges at ~3 years to keep queries bounded.
        if (differenceInCalendarDays(b, a) > 1100) a = addDays(b, -1100);
        from = a;
        to = addDays(b, 1);
        break;
      }
      p = "30d";
      from = addDays(today, -29);
      to = addDays(today, 1);
      break;
    }
    default:
      from = addDays(today, -29);
      to = addDays(today, 1);
  }

  const lengthDays = Math.max(1, differenceInCalendarDays(to, from));
  let previous: { from: Date; to: Date };
  if (p === "this_month" || p === "last_month") {
    const prevFrom = startOfMonth(addMonths(from, -1));
    const prevTo = p === "last_month" ? from : addDays(prevFrom, Math.min(lengthDays, differenceInCalendarDays(from, prevFrom)));
    previous = { from: prevFrom, to: prevTo };
  } else {
    previous = { from: addDays(from, -lengthDays), to: from };
  }

  const bucket = lengthDays <= 62 ? "day" : lengthDays <= 190 ? "week" : "month";
  const label =
    p === "custom" ? `${format(from, "MMM d, yyyy")} – ${format(addDays(to, -1), "MMM d, yyyy")}` : RANGE_PRESETS.find((r) => r.value === p)!.label;

  return {
    preset: p,
    label,
    from: new Date(from.getTime()),
    to: new Date(to.getTime()),
    previous: { from: new Date(previous.from.getTime()), to: new Date(previous.to.getTime()) },
    fromDay: format(from, "yyyy-MM-dd"),
    toDay: format(addDays(to, -1), "yyyy-MM-dd"),
    bucket,
    timezone,
  };
}

/** Every bucket key between from (inclusive) and to (exclusive), matching SQL bucketing in `bucketSql`. */
export function bucketKeys(range: ResolvedRange): string[] {
  const keys: string[] = [];
  let cursor: TZDate = new TZDate(range.from, range.timezone);
  const end = new TZDate(range.to, range.timezone);
  if (range.bucket === "month") cursor = startOfMonth(cursor);
  if (range.bucket === "week") cursor = startOfIsoWeek(cursor);
  while (cursor < end) {
    keys.push(format(cursor, "yyyy-MM-dd"));
    cursor = range.bucket === "day" ? addDays(cursor, 1) : range.bucket === "week" ? addDays(cursor, 7) : addMonths(cursor, 1);
  }
  return keys;
}

function startOfIsoWeek(d: TZDate): TZDate {
  const day = (d.getDay() + 6) % 7; // Monday = 0
  return startOfDay(addDays(d, -day));
}

export function bucketLabel(key: string, bucket: ResolvedRange["bucket"]): string {
  const [y, m, d] = key.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d, 12));
  if (bucket === "month") return date.toLocaleDateString("en-US", { month: "short", year: "2-digit", timeZone: "UTC" });
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

export function formatInZone(date: Date | string | null | undefined, timezone: string, pattern = "MMM d, yyyy"): string {
  if (!date) return "—";
  return format(new TZDate(new Date(date), timezone), pattern);
}

export function formatDateTime(date: Date | string | null | undefined, timezone: string): string {
  return formatInZone(date, timezone, "MMM d, yyyy · h:mm a");
}

const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
export function relativeTime(date: Date | string, now: Date = new Date()): string {
  const diff = (new Date(date).getTime() - now.getTime()) / 1000;
  const abs = Math.abs(diff);
  if (abs < 60) return "just now";
  if (abs < 3600) return rtf.format(Math.round(diff / 60), "minute");
  if (abs < 86400) return rtf.format(Math.round(diff / 3600), "hour");
  if (abs < 86400 * 30) return rtf.format(Math.round(diff / 86400), "day");
  if (abs < 86400 * 365) return rtf.format(Math.round(diff / (86400 * 30)), "month");
  return rtf.format(Math.round(diff / (86400 * 365)), "year");
}

/** Today's date (yyyy-MM-dd) in a time zone. */
export function todayIn(timezone: string, now: Date = new Date()): string {
  return dayKey(now, timezone);
}
