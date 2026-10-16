import { expect, test } from "@playwright/test";

test.describe("SEO, structured data and legal pages", () => {
  test("titles and descriptions", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveTitle("Lensmere Optical — Eye care & eyewear");
    await page.goto("/services");
    await expect(page).toHaveTitle("Services · Lensmere Optical");
    await expect(page.locator('meta[name="description"]')).toHaveAttribute("content", /Eye examinations/);
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", "http://localhost:3200/services");
    await page.goto("/faq");
    await expect(page).toHaveTitle("Frequently asked questions · Lensmere Optical");
  });

  test("FAQ page: accordions and FAQPage JSON-LD matching the visible questions", async ({ page }) => {
    await page.goto("/faq");
    const details = page.locator(".oc-faq__list details");
    await expect(details).toHaveCount(6);
    await expect(details.first()).toHaveAttribute("open", "");
    const raw = await page.locator('script[type="application/ld+json"]#oc-faq-jsonld').textContent();
    const data = JSON.parse(raw ?? "{}");
    expect(data["@type"]).toBe("FAQPage");
    expect(data.mainEntity).toHaveLength(6);
    const firstQuestion = await details.first().locator("summary").innerText();
    expect(firstQuestion).toContain(data.mainEntity[0].name);
    expect(data.mainEntity[0].acceptedAnswer.text.length).toBeGreaterThan(10);
  });

  test("legal pages show the draft notice and business details", async ({ page }) => {
    await page.goto("/privacy");
    await expect(page.locator("[data-legal-draft]")).toContainText("Draft — needs legal review.");
    await expect(page.getByText("Lensmere Optical Co. (demo) (“we”)")).toBeVisible();
    await expect(page.getByRole("link", { name: "privacy@lensmere.example" })).toHaveAttribute("href", "mailto:privacy@lensmere.example");
    await page.goto("/terms");
    await expect(page.locator("[data-legal-draft]")).toContainText("Draft — needs legal review.");
    await expect(page.locator("#prices")).toContainText("Prices on this website are in PHP and include VAT where applicable.");
  });

  test("demo business: robots.txt disallows everything and pages carry noindex", async ({ page, request }) => {
    const robots = await (await request.get("/robots.txt")).text();
    expect(robots).toMatch(/Disallow: \//);
    await page.goto("/");
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
  });

  test("sitemap lists pages and product URLs from the API", async ({ request }) => {
    const xml = await (await request.get("/sitemap.xml")).text();
    expect(xml).toContain("<loc>http://localhost:3200/eyewear</loc>");
    expect(xml).toContain("<loc>http://localhost:3200/eyewear/arden-101</loc>");
    expect(xml).not.toContain("thank-you");
    expect((xml.match(/<url>/g) ?? []).length).toBe(9 + 37);
  });

  test("confirmation pages are noindex", async ({ page }) => {
    for (const path of ["/booking-confirmed", "/thank-you"]) {
      await page.goto(path);
      await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
    }
    await page.goto("/booking-confirmed");
    await expect(page.getByText("an eye exam takes about 45 minutes")).toBeVisible();
  });

  test("security headers", async ({ request }) => {
    const res = await request.get("/");
    const h = res.headers();
    expect(h["x-powered-by"]).toBeUndefined();
    expect(h["x-content-type-options"]).toBe("nosniff");
    expect(h["referrer-policy"]).toBe("strict-origin-when-cross-origin");
    expect(h["x-frame-options"]).toBe("DENY");
    expect(h["permissions-policy"]).toContain("camera=()");
    const csp = h["content-security-policy"];
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("frame-src https://*.leadconnectorhq.com https://*.msgsndr.com");
    expect(csp).toContain("script-src 'self' 'unsafe-inline' https://link.msgsndr.com");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("http://localhost:3299");
  });
});
