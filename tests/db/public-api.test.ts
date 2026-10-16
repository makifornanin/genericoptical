import { and, eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import { POST as inquiryPOST } from "@/app/api/public/v1/inquiries/route";
import { GET as productGET } from "@/app/api/public/v1/products/[slug]/route";
import { GET as productsGET } from "@/app/api/public/v1/products/route";
import { GET as siteGET } from "@/app/api/public/v1/site/route";
import { getDb } from "@/server/db";
import { apiKeys, ghlCalendars, leadActivities, leads, products } from "@/server/db/schema";
import { createSiteKey, PublicApiError, rateLimit, revokeSiteKey } from "@/server/services/public-api";
import { createBusiness, lensProduct, serviceProduct, stockProduct, type Fixture } from "./fixtures";

const BASE = "http://dash.test/api/public/v1";
const get = (path: string, key: string | null) => new Request(`${BASE}${path}`, { headers: key ? { authorization: `Bearer ${key}` } : {} });
const post = (body: unknown, key: string, ip?: string) =>
  new Request(`${BASE}/inquiries`, {
    method: "POST",
    headers: { authorization: `Bearer ${key}`, "content-type": "application/json", ...(ip ? { "x-client-ip": ip } : {}) },
    body: JSON.stringify(body),
  });
const slugCtx = (slug: string) => ({ params: Promise.resolve({ slug }) }) as RouteContext<"/api/public/v1/products/[slug]">;

/** "Show in online store" for one product. */
async function publish(f: Fixture, productId: string) {
  await getDb().update(products).set({ showOnWebsite: true }).where(and(eq(products.businessId, f.businessId), eq(products.id, productId)));
}

let a: Fixture;
let b: Fixture;
let keyA: string;
let keyB: string;
const ids: Record<string, string> = {};

beforeAll(async () => {
  a = await createBusiness("PubA");
  b = await createBusiness("PubB");
  keyA = (await createSiteKey(a.businessId, "Website A")).key;
  keyB = (await createSiteKey(b.businessId, "Website B")).key;
  const plenty = await stockProduct(a, { name: "Arden 101", qty: 10, reorderPoint: 2, price: 2950, cost: 1200 });
  const low = await stockProduct(a, { name: "Kiyo Round", qty: 2, reorderPoint: 2 });
  const none = await stockProduct(a, { name: "Mara Cat-eye", qty: 0 });
  const dupe = await stockProduct(a, { name: "Arden 101", qty: 4 }); // same name → arden-101-2
  const hidden = await stockProduct(a, { name: "Unpublished Frame", qty: 5 });
  const lens = await lensProduct(a);
  const exam = await serviceProduct(a);
  const other = await stockProduct(b, { name: "Other Business Frame", qty: 5 });
  for (const [k, p] of Object.entries({ plenty, low, none, dupe, lens, exam })) {
    await publish(a, p.productId);
    ids[k] = p.productId;
  }
  ids.hidden = hidden.productId;
  await publish(b, other.productId);
  ids.other = other.productId;
});

describe("site keys", () => {
  it("rejects missing, unknown and revoked keys, and enforces scopes", async () => {
    expect((await siteGET(get("/site", null))).status).toBe(401);
    expect((await siteGET(get("/site", "ocsk_not-a-real-key"))).status).toBe(401);
    expect((await siteGET(get("/site", "Basic abc"))).status).toBe(401);

    const readOnly = await createSiteKey(a.businessId, "Site only", ["site:read"]);
    expect((await siteGET(get("/site", readOnly.key))).status).toBe(200);
    expect((await productsGET(get("/products", readOnly.key))).status).toBe(403);
    expect((await inquiryPOST(post({ fullName: "X Y", email: "x@example.com" }, readOnly.key))).status).toBe(403);

    await revokeSiteKey(a.ctx.owner, readOnly.id);
    expect((await siteGET(get("/site", readOnly.key))).status).toBe(401);
    // Only the hash is stored.
    const [row] = await getDb().select().from(apiKeys).where(eq(apiKeys.id, readOnly.id));
    expect(row.keyHash).not.toContain(readOnly.key);
    expect(row.keyHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("only owners/managers with integrations.manage can revoke, and only their own business's keys", async () => {
    const k = await createSiteKey(a.businessId, "Temp");
    await expect(revokeSiteKey(a.ctx.sales, k.id)).rejects.toThrow();
    await expect(revokeSiteKey(b.ctx.owner, k.id)).rejects.toThrow(/not found/i);
    await revokeSiteKey(a.ctx.owner, k.id);
  });
});

describe("GET /site", () => {
  it("returns public business data, branches, services and booking state with cache headers", async () => {
    await getDb().insert(ghlCalendars).values({ businessId: a.businessId, ghlCalendarId: "cal_exam_main", name: "Exam (Main)", branchId: a.main.id, appointmentTypeId: a.examTypeId, isActive: true });
    const res = await siteGET(get("/site", keyA));
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("private, max-age=0, s-maxage=30, stale-while-revalidate=60");
    expect(res.headers.get("access-control-allow-origin")).toBeNull();
    const body = await res.json();
    expect(body.business.name).toBe("Test Optical PubA");
    expect(body.branches.map((x: { name: string }) => x.name)).toEqual(["PubA MAIN", "PubA SECOND"]);
    const exam = body.services.find((s: { code: string }) => s.code === "eye_exam");
    expect(exam.calendars).toEqual([{ branchId: a.main.id, calendarId: "cal_exam_main" }]);
    expect(body.booking.ghlConnected).toBe(false);
    // Lens and service products are the price list, not the catalogue.
    expect(body.inBranchServices.map((s: { id: string }) => s.id).sort()).toEqual([ids.lens, ids.exam].sort());
    expect(body.categories).toEqual([{ slug: "frames", name: "Frames", kind: "frames", productCount: 4 }]);
    const text = JSON.stringify(body);
    expect(text).not.toMatch(/passwordHash|costCents|onHand|PubB/);
  });
});

describe("GET /products", () => {
  it("lists only this business's published catalogue with coarse availability and stable slugs", async () => {
    const res = await productsGET(get("/products", keyA));
    expect(res.status).toBe(200);
    const { products } = await res.json();
    const byId = Object.fromEntries(products.map((p: { id: string }) => [p.id, p]));
    expect(Object.keys(byId).sort()).toEqual([ids.plenty, ids.low, ids.none, ids.dupe].sort());
    expect(byId[ids.plenty].availability).toBe("in_stock");
    expect(byId[ids.low].availability).toBe("low_stock");
    expect(byId[ids.none].availability).toBe("out_of_stock");
    expect(byId[ids.plenty].slug).toBe("arden-101");
    expect(byId[ids.dupe].slug).toBe("arden-101-2");
    expect(byId[ids.plenty].priceFromCents).toBe(295000);
    expect(byId[ids.hidden]).toBeUndefined();
    expect(JSON.stringify(products)).not.toMatch(/costCents|cost|onHand|reserved|supplier/i);
  });

  it("filters by category and search text", async () => {
    const q = await (await productsGET(get("/products?q=kiyo", keyA))).json();
    expect(q.products.map((p: { name: string }) => p.name)).toEqual(["Kiyo Round"]);
    const none = await (await productsGET(get("/products?category=sunglasses", keyA))).json();
    expect(none.products).toEqual([]);
  });

  it("isolates businesses: B's key never sees A's products", async () => {
    const { products } = await (await productsGET(get("/products", keyB))).json();
    expect(products.map((p: { id: string }) => p.id)).toEqual([ids.other]);
    expect((await productGET(get("/products/arden-101", keyB), slugCtx("arden-101"))).status).toBe(404);
    expect((await productGET(get(`/products/${ids.other}`, keyA), slugCtx(ids.other))).status).toBe(404);
  });

  it("reflects stock and publishing changes on the next request", async () => {
    const before = await (await productsGET(get("/products", keyA))).json();
    expect(before.products.some((p: { id: string }) => p.id === ids.hidden)).toBe(false);
    await publish(a, ids.hidden);
    const after = await (await productsGET(get("/products", keyA))).json();
    expect(after.products.find((p: { id: string }) => p.id === ids.hidden)?.availability).toBe("in_stock");
  });
});

describe("GET /products/:slug", () => {
  it("returns variants with per-branch availability, never exact counts", async () => {
    const res = await productGET(get("/products/arden-101", keyA), slugCtx("arden-101"));
    expect(res.status).toBe(200);
    const { product } = await res.json();
    expect(product.id).toBe(ids.plenty);
    expect(product.variants).toHaveLength(1);
    expect(product.variants[0].branches).toEqual([
      { branchId: a.main.id, branchName: "PubA MAIN", availability: "in_stock" },
      { branchId: a.second.id, branchName: "PubA SECOND", availability: "out_of_stock" },
    ]);
    expect(product.related.length).toBeGreaterThan(0);
    expect(product.related.every((r: { category: { slug: string } }) => r.category.slug === "frames")).toBe(true);
    expect(JSON.stringify(product)).not.toMatch(/"(onHand|available|costCents|quantity)"/);
  });

  it("404s for unpublished, service and unknown products", async () => {
    expect((await productGET(get("/products/x", keyA), slugCtx("no-such-thing"))).status).toBe(404);
    expect((await productGET(get("/products/x", keyA), slugCtx(ids.exam))).status).toBe(404);
  });
});

describe("POST /inquiries", () => {
  it("creates one website lead per person, records the source page and ignores honeypot spam", async () => {
    const body = { fullName: "Web Visitor", email: "visitor@example.com", interest: "frames", kind: "product_inquiry", productName: "Arden 101", sourcePage: "/eyewear/arden-101" };
    const first = await inquiryPOST(post(body, keyA, "203.0.113.5"));
    expect(first.status).toBe(201);
    expect(await first.json()).toEqual({ ok: true });
    const again = await inquiryPOST(post({ ...body, email: "VISITOR@example.com", message: "Any in tortoise?" }, keyA, "203.0.113.5"));
    expect(again.status).toBe(201);
    const rows = await getDb().select().from(leads).where(and(eq(leads.businessId, a.businessId), eq(leads.email, "visitor@example.com")));
    expect(rows).toHaveLength(1);
    expect(rows[0].source).toBe("website");
    const acts = await getDb().select().from(leadActivities).where(eq(leadActivities.leadId, rows[0].id));
    expect(acts.some((x) => (x.metadata as { sourcePage?: string } | null)?.sourcePage === "/eyewear/arden-101")).toBe(true);

    const spam = await inquiryPOST(post({ fullName: "Bot", email: "bot@example.com", website: "http://spam" }, keyA));
    expect(spam.status).toBe(201);
    expect(await getDb().select().from(leads).where(and(eq(leads.businessId, a.businessId), eq(leads.email, "bot@example.com")))).toHaveLength(0);
    // Leads land in the key's business only.
    expect(await getDb().select().from(leads).where(and(eq(leads.businessId, b.businessId), eq(leads.email, "visitor@example.com")))).toHaveLength(0);
  });

  it("validates input and rejects another business's branch", async () => {
    const bad = await inquiryPOST(post({ fullName: "", email: "nope" }, keyA));
    expect(bad.status).toBe(400);
    expect((await bad.json()).fieldErrors.fullName).toBeTruthy();
    expect((await inquiryPOST(post({ fullName: "A B", email: "ab@example.com", preferredBranchId: b.main.id }, keyA))).status).toBe(400);
    expect((await inquiryPOST(post({ fullName: "A B", email: "ab@example.com", sourcePage: "javascript:alert(1)" }, keyA))).status).toBe(400);
  });

  it("rate-limits by visitor IP with Retry-After", async () => {
    const ip = "198.51.100.77";
    const statuses: number[] = [];
    for (let i = 0; i < 9; i++) statuses.push((await inquiryPOST(post({ fullName: "Rate Test", email: `rate${i}@example.com` }, keyA, ip))).status);
    expect(statuses.slice(0, 8).every((s) => s === 201)).toBe(true);
    const res = await inquiryPOST(post({ fullName: "Rate Test", email: "rate9@example.com" }, keyA, ip));
    expect(res.status).toBe(429);
    expect(Number(res.headers.get("retry-after"))).toBeGreaterThan(0);
    // A different visitor is unaffected.
    expect((await inquiryPOST(post({ fullName: "Other Visitor", email: "other@example.com" }, keyA, "198.51.100.78"))).status).toBe(201);
  });
});

describe("rateLimit", () => {
  it("counts durably per bucket and window, and is safe under concurrency", async () => {
    const bucket = `test:${crypto.randomUUID()}`;
    const results = await Promise.allSettled(Array.from({ length: 12 }, () => rateLimit(bucket, 10, 60)));
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(10);
    const rejected = results.filter((r): r is PromiseRejectedResult => r.status === "rejected");
    expect(rejected).toHaveLength(2);
    expect(rejected.every((r) => r.reason instanceof PublicApiError && r.reason.status === 429)).toBe(true);
  });
});
