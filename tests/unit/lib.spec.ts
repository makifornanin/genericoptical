import { expect, test } from "@playwright/test";
import { addLine, cartItems, lineTotal, parseStoredBag, type BagLine } from "../../src/lib/bag";
import { colourGroups, colourKeyOf, productHref } from "../../src/lib/catalog";
import { normalizeDashboardUrl } from "../../src/lib/dashboard-url";
import { checkDemoCard, formatCardNumber, formatExpiry } from "../../src/lib/demo-card";
import { applyFilters, filtersToQuery, parseFilters } from "../../src/lib/filters";
import { groupedHours, money, openStatus } from "../../src/lib/format";
import { lensCopy, rxProblems, SPH_VALUES } from "../../src/lib/lens";
import { contrast, themeStyle } from "../../src/lib/theme";

/* Pure helpers (no browser). */

const line = (o: Partial<BagLine> = {}): BagLine => ({ id: "1", slug: "arden-101", name: "Arden 101", categoryKind: "frames", variantId: "v1", variantLabel: "52 · Black", colourKey: "black", quantity: 1, unitPriceCents: 295000, lens: null, prescription: null, eye: null, ...o });

test("money: whole pesos without decimals, centavos when present", () => {
  expect(money(295000)).toBe("₱2,950");
  expect(money(61607)).toBe("₱616.07");
  expect(money(null)).toBe("");
});

test("demo card: Luhn, test cards only, expiry and code", () => {
  const now = new Date(2026, 9, 20);
  expect(checkDemoCard({ number: "4242 4242 4242 4242", expiry: "12 / 30", cvc: "123" }, now)).toEqual({ ok: true, brand: "Visa", last4: "4242" });
  expect(checkDemoCard({ number: "4242 4242 4242 4241", expiry: "12 / 30", cvc: "123" }, now)).toMatchObject({ ok: false, field: "number" });
  expect(checkDemoCard({ number: "4111 1111 1111 1111", expiry: "12 / 30", cvc: "123" }, now)).toMatchObject({ ok: false, message: expect.stringContaining("real cards") });
  expect(checkDemoCard({ number: "4000 0000 0000 0002", expiry: "12 / 30", cvc: "123" }, now)).toMatchObject({ ok: false, message: expect.stringContaining("declined") });
  expect(checkDemoCard({ number: "4242424242424242", expiry: "09 / 26", cvc: "123" }, now)).toMatchObject({ ok: false, field: "expiry" });
  expect(checkDemoCard({ number: "4242424242424242", expiry: "12 / 30", cvc: "1" }, now)).toMatchObject({ ok: false, field: "cvc" });
  expect(formatCardNumber("4242424242424242")).toBe("4242 4242 4242 4242");
  expect(formatExpiry("1230")).toBe("12 / 30");
});

test("prescription checks", () => {
  expect(rxProblems({ mode: "send_later" }, false)).toEqual([]);
  const rx = { mode: "enter" as const, od: { sph: "-2.00", cyl: "-0.50", axis: null, add: null }, os: { sph: "-2.00", cyl: null, axis: null, add: null } };
  expect(rxProblems(rx, false).join(" ")).toMatch(/axis for your right eye/);
  expect(rxProblems({ ...rx, od: { ...rx.od, axis: "181" } }, false).join(" ")).toMatch(/0 to 180/);
  expect(rxProblems({ ...rx, od: { ...rx.od, axis: "90" } }, true).join(" ")).toMatch(/reading addition/);
  expect(SPH_VALUES).toContain("0.00");
  expect(SPH_VALUES).toContain("-2.25");
  expect(lensCopy({ variantId: "x", name: "Single Vision Blue-light Filter (pair)", description: null, priceCents: 1, type: "single_vision", features: ["blue_light"] }).title).toBe("Blue-light filter");
});

test("bag: merging, totals, stored data is validated", () => {
  let lines = addLine([], line());
  lines = addLine(lines, line({ id: "2", quantity: 2 }));
  expect(lines).toHaveLength(1);
  expect(lines[0].quantity).toBe(3);
  const withLens = addLine(lines, line({ id: "3", lens: { variantId: "l1", name: "SV", title: "Single vision · Standard", type: "single_vision", priceCents: 150000 } }));
  expect(withLens).toHaveLength(2);
  expect(lineTotal(withLens[1])).toBe(445000);
  expect(cartItems(withLens)[1]).toEqual({ variantId: "v1", quantity: 1, lensVariantId: "l1" });
  expect(parseStoredBag("not json")).toEqual([]);
  expect(parseStoredBag(JSON.stringify([{ nope: 1 }, line({ quantity: 99 })]))[0].quantity).toBe(10);
});

test("filters: parse, apply, serialise", () => {
  const f = parseFilters({ shape: "round,evil<script>", sort: "price-asc" });
  expect(f).toEqual({ shape: ["round"], material: [], colour: [], sort: "price-asc" });
  expect(filtersToQuery(f)).toBe("?shape=round&sort=price-asc");
  const p = (slug: string, shape: string, price: number, colours: string[] = []) => ({ id: slug, slug, name: slug, brand: null, category: { slug: "frames", name: "Frames", kind: "frames" }, description: null, imageUrl: null, priceFromCents: price, priceToCents: price, variantCount: 1, colours, filters: { shape }, availability: "in_stock" as const, updatedAt: null });
  const out = applyFilters([p("a", "round", 300, ["Gold"]), p("b", "square", 100), p("c", "round", 200, ["Black"])], { ...f, colour: ["gold"] });
  expect(out.map((x) => x.slug)).toEqual(["a"]);
});

test("catalogue helpers", () => {
  expect(colourKeyOf({ options: { color: "Tortoise" } })).toBe("tortoise");
  expect(colourKeyOf({ options: { tint: "green" } })).toBe("green");
  expect(productHref("arden-101", "black")).toBe("/products/arden-101?colour=black");
  const groups = colourGroups({ variants: [{ id: "1", label: "52 · Black", options: { color: "Black" }, priceCents: 1, sku: null, availability: "in_stock", branches: [] }, { id: "2", label: "54 · Black", options: { color: "Black" }, priceCents: 1, sku: null, availability: "in_stock", branches: [] }] });
  expect(groups).toHaveLength(1);
  expect(groups[0].variants).toHaveLength(2);
});

test("hours and open status", () => {
  const hours = { mon: { open: "10:00", close: "19:00" }, tue: { open: "10:00", close: "19:00" }, wed: { open: "10:00", close: "19:00" }, thu: { open: "10:00", close: "19:00" }, fri: { open: "10:00", close: "19:00" }, sat: { open: "10:00", close: "19:00" }, sun: null };
  expect(groupedHours(hours)).toEqual([
    { days: "Mon – Sat", time: "10am – 7pm" },
    { days: "Sun", time: "Closed" },
  ]);
  expect(openStatus(hours, "Asia/Manila", new Date("2026-10-19T05:00:00Z"))?.label).toBe("Open now · until 7pm"); // Mon 1pm Manila
  expect(openStatus(hours, "Asia/Manila", new Date("2026-10-18T05:00:00Z"))?.label).toBe("Closed · opens tomorrow 10am"); // Sunday
});

test("theme colours only apply with enough contrast", () => {
  expect(contrast("#1F2B22", "#ffffff")).toBeGreaterThan(10);
  expect(themeStyle("#1F2B22", "#B5E14A")).toMatchObject({ "--theme-brand": "#1F2B22", "--theme-brand-ink": "#ffffff", "--theme-accent-ink": "#121212" });
  expect(themeStyle("not-a-colour", null)).toEqual({});
});

test("dashboard URL normalisation", () => {
  expect(normalizeDashboardUrl("https://dash.example.com/")).toBe("https://dash.example.com");
  expect(normalizeDashboardUrl("https://dash.example.com/api/public/v1")).toBe("https://dash.example.com");
});
