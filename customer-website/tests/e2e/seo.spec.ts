import { expect, test } from "./helpers";

test("demo business: robots.txt keeps search engines out and pages are noindex", async ({ request, page }) => {
  const robots = await (await request.get("/robots.txt")).text();
  expect(robots).toMatch(/Disallow: \//);
  await page.goto("/");
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
});

test("titles, canonical links and the sitemap", async ({ page, request }) => {
  await page.goto("/glasses");
  await expect(page).toHaveTitle("Glasses · Lensmere Optical");
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", /\/glasses$/);
  await page.goto("/products/arden-101");
  await expect(page).toHaveTitle("Arden 101 · Lensmere Optical");
  const sitemap = await (await request.get("/sitemap.xml")).text();
  expect(sitemap).toContain("/products/arden-101");
  expect(sitemap).toContain("/eye-exam");
});

test("help page publishes FAQ structured data", async ({ page }) => {
  await page.goto("/help");
  const data = JSON.parse((await page.locator('script[type="application/ld+json"]').textContent()) ?? "{}");
  expect(data["@type"]).toBe("FAQPage");
  expect(data.mainEntity.length).toBeGreaterThan(3);
});

test("security headers", async ({ request }) => {
  const res = await request.get("/");
  const h = res.headers();
  expect(h["content-security-policy"]).toContain("frame-ancestors 'none'");
  expect(h["x-content-type-options"]).toBe("nosniff");
  expect(h["x-frame-options"]).toBe("DENY");
  expect(h["x-powered-by"]).toBeUndefined();
});
