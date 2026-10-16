import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import { GET as productGET } from "@/app/api/public/v1/feed/[business]/products/[slug]/route";
import { GET as productsGET, OPTIONS as productsOPTIONS } from "@/app/api/public/v1/feed/[business]/products/route";
import { GET as siteGET } from "@/app/api/public/v1/feed/[business]/site/route";
import { getDb } from "@/server/db";
import { businesses, products } from "@/server/db/schema";
import { updateCatalogueFeed } from "@/server/services/settings";
import { createBusiness, stockProduct, type Fixture } from "./fixtures";

const SITE = "https://www.example-optical.com";
let f: Fixture;
let slug: string;
let publishedId: string;
let hiddenId: string;

const req = (path: string, origin?: string, method = "GET") => new Request(`http://dash.test/api/public/v1/feed/${path}`, { method, headers: origin ? { origin } : {} });
const params = <T extends Record<string, string>>(p: T) => ({ params: Promise.resolve(p) }) as never;

beforeAll(async () => {
  f = await createBusiness("Feed");
  [{ slug }] = await getDb().select({ slug: businesses.slug }).from(businesses).where(eq(businesses.id, f.businessId));
  const a = await stockProduct(f, { name: "Feed Frame One", qty: 6, cost: 999 });
  const b = await stockProduct(f, { name: "Hidden Frame", qty: 6 });
  publishedId = a.productId;
  hiddenId = b.productId;
  await getDb().update(products).set({ showOnWebsite: true }).where(eq(products.id, publishedId));
});

describe("public catalogue feed", () => {
  it("is off by default and indistinguishable from an unknown business", async () => {
    expect((await siteGET(req(`${slug}/site`), params({ business: slug }))).status).toBe(404);
    expect((await productsGET(req(`${slug}/products`), params({ business: slug }))).status).toBe(404);
    expect((await siteGET(req("no-such-shop/site"), params({ business: "no-such-shop" }))).status).toBe(404);
  });

  it("only managers can switch it on, with valid origins only", async () => {
    await expect(updateCatalogueFeed(f.ctx.sales, { enabled: true, origins: [SITE] })).rejects.toThrow();
    await expect(updateCatalogueFeed(f.ctx.owner, { enabled: true, origins: ["https://www.example-optical.com/path"] })).rejects.toThrow();
    await expect(updateCatalogueFeed(f.ctx.owner, { enabled: true, origins: ["http://insecure.example.com"] })).rejects.toThrow();
    await updateCatalogueFeed(f.ctx.owner, { enabled: true, origins: [`${SITE}/`, "http://localhost:4300"] });
    const [biz] = await getDb().select({ settings: businesses.settings }).from(businesses).where(eq(businesses.id, f.businessId));
    expect(biz.settings.catalogueFeed).toEqual({ enabled: true, origins: [SITE, "http://localhost:4300"] });
    expect(biz.settings.maxStaffDiscountBps).toBe(2000); // other settings untouched
  });

  it("serves published data with CORS for listed origins only, CDN-cacheable", async () => {
    const res = await productsGET(req(`${slug}/products`, SITE), params({ business: slug }));
    expect(res.status).toBe(200);
    expect(res.headers.get("access-control-allow-origin")).toBe(SITE);
    expect(res.headers.get("cache-control")).toContain("public");
    expect(res.headers.get("vary")).toContain("Origin");
    const { products: list } = await res.json();
    expect(list.map((p: { id: string }) => p.id)).toEqual([publishedId]);
    expect(list.some((p: { id: string }) => p.id === hiddenId)).toBe(false);
    expect(JSON.stringify(list)).not.toMatch(/costCents|onHand|99900/);

    const other = await productsGET(req(`${slug}/products`, "https://evil.example.com"), params({ business: slug }));
    expect(other.status).toBe(200); // public data
    expect(other.headers.get("access-control-allow-origin")).toBeNull(); // but no browser embedding elsewhere

    const site = await (await siteGET(req(`${slug}/site`, SITE), params({ business: slug }))).json();
    expect(site.business.name).toBe("Test Optical Feed");
    const detail = await productGET(req(`${slug}/products/feed-frame-one`, SITE), params({ business: slug, slug: "feed-frame-one" }));
    expect(detail.status).toBe(200);
    expect((await detail.json()).product.variants[0].branches.length).toBeGreaterThan(0);
  });

  it("answers CORS preflight for allowed origins", async () => {
    const pre = await productsOPTIONS(req(`${slug}/products`, SITE, "OPTIONS"), params({ business: slug }));
    expect(pre.status).toBe(204);
    expect(pre.headers.get("access-control-allow-methods")).toContain("GET");
  });

  it("goes dark again when switched off", async () => {
    await updateCatalogueFeed(f.ctx.owner, { enabled: false, origins: [SITE] });
    expect((await productsGET(req(`${slug}/products`, SITE), params({ business: slug }))).status).toBe(404);
  });
});
