import { describe, expect, it } from "vitest";
import { bucketKeys, resolveRange } from "@/lib/dates";

const TZ = "Asia/Manila";
// 03:30 on Oct 15 in Manila is 19:30 UTC on Oct 14, which tests day boundaries.
const NOW = new Date("2026-10-14T19:30:00Z");

describe("date ranges in the business time zone", () => {
  it("resolves presets to UTC instants for Manila calendar days", () => {
    const today = resolveRange("today", TZ, undefined, NOW);
    expect(today.from.toISOString()).toBe("2026-10-14T16:00:00.000Z");
    expect(today.to.toISOString()).toBe("2026-10-15T16:00:00.000Z");
    expect(today.fromDay).toBe("2026-10-15");
    const yesterday = resolveRange("yesterday", TZ, undefined, NOW);
    expect(yesterday.fromDay).toBe("2026-10-14");
    expect(yesterday.previous.to.toISOString()).toBe(yesterday.from.toISOString());
  });

  it("handles month presets and compares with the same span of the previous month", () => {
    const month = resolveRange("this_month", TZ, undefined, NOW);
    expect(month.fromDay).toBe("2026-10-01");
    expect(month.toDay).toBe("2026-10-15");
    expect(month.previous.from.toISOString()).toBe("2026-08-31T16:00:00.000Z");
    const last = resolveRange("last_month", TZ, undefined, NOW);
    expect(last.fromDay).toBe("2026-09-01");
    expect(last.toDay).toBe("2026-09-30");
  });

  it("supports custom ranges (swapping reversed dates) and falls back on invalid input", () => {
    const r = resolveRange("custom", TZ, { from: "2026-09-10", to: "2026-09-01" }, NOW);
    expect([r.fromDay, r.toDay]).toEqual(["2026-09-01", "2026-09-10"]);
    expect(resolveRange("custom", TZ, { from: "bad", to: "x" }, NOW).preset).toBe("30d");
    expect(resolveRange("nonsense", TZ, undefined, NOW).preset).toBe("30d");
  });

  it("produces one bucket per day, week or month", () => {
    expect(bucketKeys(resolveRange("7d", TZ, undefined, NOW))).toHaveLength(7);
    const long = resolveRange("custom", TZ, { from: "2026-01-01", to: "2026-09-30" }, NOW);
    expect(long.bucket).toBe("month");
    expect(bucketKeys(long)).toHaveLength(9);
  });
});
