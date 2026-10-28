import { expect, test } from "@playwright/test";
import { signIn } from "./helpers";

/**
 * The customer website moved to GoHighLevel (archived in customer-website-reference/). This deployment
 * serves the dashboard and the integration endpoints only.
 */
test.describe("dashboard-only deployment", () => {
  test("the root opens the dashboard: sign-in when signed out, the overview when signed in", async ({ page }) => {
    await page.context().clearCookies();
    await page.goto("/");
    await page.waitForURL(/\/login/);
    await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible();
    await signIn(page, "manager");
    await page.goto("/");
    await page.waitForURL(/\/app(\/|$|\?)/);
  });

  test("old public pages are gone (or redirect to the GHL site when PUBLIC_WEBSITE_URL is set) and nothing is indexed", async ({ request }) => {
    for (const path of ["/book", "/contact", "/eyewear", "/services", "/about", "/faq", "/privacy", "/terms", "/sitemap.xml"]) {
      const res = await request.get(path, { maxRedirects: 0 });
      expect([404, 307, 308], `${path} → ${res.status()}`).toContain(res.status());
      if (res.status() !== 404) expect(res.headers().location ?? "").not.toMatch(/^\//);
    }
    const robots = await request.get("/robots.txt");
    expect(robots.status()).toBe(200);
    expect(await robots.text()).toMatch(/Disallow: \/\s*$/m);
    // The archived website source is never served by the app.
    expect((await request.get("/customer-website-reference/README.md")).status()).toBe(404);
  });

  test("integration and health endpoints are still served", async ({ request }) => {
    const health = await request.get("/api/health");
    expect(health.status()).toBe(200);
    // Unsigned marketplace webhooks are refused, not 404.
    const webhook = await request.post("/api/integrations/ghl/webhooks", { data: { type: "ContactCreate", locationId: "x" } });
    expect(webhook.status()).toBe(401);
    // The sync worker endpoint needs the cron secret (503 when none is configured, 401 when it's wrong).
    expect([401, 503]).toContain((await request.post("/api/integrations/ghl/process")).status());
  });
});
