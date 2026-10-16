import { expect, test } from "@playwright/test";
import type { Service, WeeklyHours } from "../../src/lib/api-types";
import { bookingServiceFor, calendarFor, featuredProducts, findBranch } from "../../src/lib/catalog";
import { normalizeDashboardUrl } from "../../src/lib/dashboard-url";
import { groupedHours, money, openStatus, servicePrice } from "../../src/lib/format";
import { inkFor, themeStyle } from "../../src/lib/theme";

/* Unit tests for the pure helpers (no browser, no server). */

test.describe("normalizeDashboardUrl (DASHBOARD_API_URL)", () => {
  test("accepts the plain origin", () => {
    expect(normalizeDashboardUrl("https://dash.example")).toBe("https://dash.example");
    expect(normalizeDashboardUrl("https://dash.example/")).toBe("https://dash.example");
    expect(normalizeDashboardUrl("  http://localhost:3000  ")).toBe("http://localhost:3000");
  });

  test("strips a trailing /api/public/v1, with or without a slash", () => {
    expect(normalizeDashboardUrl("https://dash.example/api/public/v1")).toBe("https://dash.example");
    expect(normalizeDashboardUrl("https://dash.example/api/public/v1/")).toBe("https://dash.example");
    expect(normalizeDashboardUrl("http://localhost:3000/api/public/v1")).toBe("http://localhost:3000");
  });

  test("keeps a path prefix the dashboard is mounted under", () => {
    expect(normalizeDashboardUrl("https://example.com/dashboard/")).toBe("https://example.com/dashboard");
    expect(normalizeDashboardUrl("https://example.com/dashboard/api/public/v1")).toBe("https://example.com/dashboard");
  });

  test("rejects empty and non-http values", () => {
    expect(normalizeDashboardUrl("")).toBeNull();
    expect(normalizeDashboardUrl(undefined)).toBeNull();
    expect(normalizeDashboardUrl("not a url")).toBeNull();
    expect(normalizeDashboardUrl("ftp://dash.example")).toBeNull();
    expect(normalizeDashboardUrl("javascript:alert(1)")).toBeNull();
  });
});

test.describe("theme", () => {
  test("text colour is picked for contrast", () => {
    expect(inkFor("#1F2B22")).toBe("#ffffff");
    expect(inkFor("#B5E14A")).toBe("#18191b");
    expect(inkFor("nope")).toBeNull();
    expect(themeStyle("#1F2B22", "bad")).toEqual({ "--oc-theme-brand": "#1F2B22", "--oc-theme-brand-ink": "#ffffff" });
  });
});

const HOURS: WeeklyHours = {
  mon: { open: "10:00", close: "19:00" },
  tue: { open: "10:00", close: "19:00" },
  wed: { open: "10:00", close: "19:00" },
  thu: { open: "10:00", close: "19:00" },
  fri: { open: "10:00", close: "19:00" },
  sat: { open: "10:00", close: "19:00" },
  sun: null,
};

test.describe("hours and prices", () => {
  test("groups consecutive days", () => {
    expect(groupedHours(HOURS)).toEqual([
      { days: "Mon – Sat", time: "10am – 7pm" },
      { days: "Sun", time: "Closed" },
    ]);
  });

  test("open status in the business time zone", () => {
    // 2026-10-16 is a Friday. 04:00 UTC = 12:00 in Manila.
    expect(openStatus(HOURS, "Asia/Manila", new Date("2026-10-16T04:00:00Z"))).toEqual({ open: true, label: "Open now · until 7pm" });
    // 23:30 UTC Friday = 07:30 Saturday in Manila.
    expect(openStatus(HOURS, "Asia/Manila", new Date("2026-10-16T23:30:00Z"))).toEqual({ open: false, label: "Closed · opens 10am today" });
    // Saturday 20:00 Manila → closed Sunday → opens Monday.
    expect(openStatus(HOURS, "Asia/Manila", new Date("2026-10-17T12:00:00Z"))).toEqual({ open: false, label: "Closed · opens Monday 10am" });
    expect(openStatus(HOURS, "Not/AZone", new Date())).toBeNull();
  });

  test("money and service prices", () => {
    const fmt = { currency: "PHP", locale: "en-PH" };
    expect(money(295000, fmt)).toBe("₱2,950.00");
    expect(servicePrice(null, fmt)).toBe("Price on request");
    expect(servicePrice(0, fmt)).toBe("Free");
    expect(servicePrice(120000, fmt, true)).toBe("From ₱1,200.00");
  });
});

test.describe("catalogue mapping", () => {
  const svc = (code: string, calendars: Service["calendars"] = []): Service => ({ id: code, code, name: code, description: null, durationMinutes: 30, priceCents: null, calendars });
  const services = [svc("eye_exam", [{ branchId: "b1", calendarId: "cal123456" }]), svc("contact_lens_consultation"), svc("frame_lens_consultation")];

  test("booking button: frames → consultation, contact lenses → lens service, others none", () => {
    expect(bookingServiceFor({ slug: "frames", name: "Frames", kind: "frames" }, services)?.service.code).toBe("frame_lens_consultation");
    expect(bookingServiceFor({ slug: "sunglasses", name: "Sunglasses", kind: "sunglasses" }, services)?.service.code).toBe("frame_lens_consultation");
    expect(bookingServiceFor({ slug: "contact-lenses", name: "Contact lenses", kind: "contact_lenses" }, services)?.service.code).toBe("contact_lens_consultation");
    expect(bookingServiceFor({ slug: "cases", name: "Cases", kind: "accessories" }, services)).toBeNull();
    expect(bookingServiceFor({ slug: "frames", name: "Frames", kind: "frames" }, [svc("eye_exam")])?.service.code).toBe("eye_exam");
  });

  test("calendar lookup and branch deep links", () => {
    const branch = { id: "b1", code: "MKT", name: "Makati", address: [], phone: null, email: null, mapUrl: null, imageUrl: null, hours: HOURS };
    expect(calendarFor(services[0], branch)).toBe("cal123456");
    expect(calendarFor(services[1], branch)).toBeNull();
    expect(findBranch([branch], "mkt")?.id).toBe("b1");
    expect(findBranch([branch], "b1")?.id).toBe("b1");
    expect(findBranch([branch], "nope")).toBeNull();
  });

  test("featured = first 8 frames then sunglasses", () => {
    const p = (slug: string, kind: string) => ({
      id: slug,
      slug,
      name: slug,
      brand: null,
      category: { slug: kind, name: kind, kind },
      description: null,
      imageUrl: null,
      priceFromCents: 1,
      priceToCents: 1,
      variantCount: 1,
      availability: "in_stock" as const,
      updatedAt: null,
    });
    const list = [p("s1", "sunglasses"), p("a1", "accessories"), ...Array.from({ length: 7 }, (_, i) => p(`f${i}`, "frames"))];
    expect(featuredProducts(list).map((x) => x.slug)).toEqual(["f0", "f1", "f2", "f3", "f4", "f5", "f6", "s1"]);
  });
});
