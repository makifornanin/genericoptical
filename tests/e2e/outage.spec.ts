import { expect, test } from "@playwright/test";
import { blockGhl, revalidate, setFixtureMode, watchConsole } from "./helpers";

/*
 * Dashboard API outage. Runs in its own Playwright project after all other tests (it switches the
 * shared fixture API off), one test at a time.
 */
test.describe.configure({ mode: "serial" });

test.describe("API outage", () => {
  test.afterAll(async ({ request }) => {
    await setFixtureMode(request, "ok");
    await revalidate(request);
  });

  test("after an on-demand revalidation during an outage, pages show a friendly state and recover", async ({ page, request }) => {
    await setFixtureMode(request, "down");
    await revalidate(request);

    expect(await (await request.get("/api/health")).json()).toEqual({ status: "ok", api: "unreachable" });

    await blockGhl(page);
    const problems = watchConsole(page);
    const pages: [string, boolean][] = [
      ["/", true],
      ["/eyewear", true],
      ["/eyewear/arden-101", true],
      ["/services", true],
      ["/book", true],
      ["/about", true],
      ["/faq", true],
      ["/contact", false],
      ["/privacy", false],
    ];
    for (const [path, unavailableBlock] of pages) {
      const res = await page.goto(path, { waitUntil: "networkidle" });
      expect(res?.status(), path).toBe(200);
      await expect(page.locator("h1"), path).toHaveCount(1);
      await expect(page.locator(".oc-footer"), path).toBeVisible();
      if (unavailableBlock) await expect(page.locator("[data-api-state] .oc-empty").first(), path).toContainText("temporarily unavailable");
    }
    // Contact: the form still works client-side and a note explains the missing branch list.
    await page.goto("/contact");
    await expect(page.getByRole("form", { name: "Website inquiry form" })).toBeVisible();
    await expect(page.locator("[data-api-state]")).toContainText("temporarily unavailable");
    expect(problems).toEqual([]);

    // Recovery: API back + on-demand revalidation → real content again.
    await setFixtureMode(request, "ok");
    await revalidate(request);
    await page.goto("/eyewear", { waitUntil: "networkidle" });
    await expect(page.locator("[data-api-state]")).toHaveCount(0);
    await expect(page.locator(".oc-product-grid--catalogue > li")).toHaveCount(37);
    await page.goto("/");
    await expect(page.locator(".oc-brand__name")).toHaveText("Lensmere Optical");
  });

  test("when the 60-second refresh fails, the last good data keeps being served", async ({ page, request }) => {
    test.setTimeout(150_000);
    await blockGhl(page);
    // Fresh good data in the cache…
    await page.goto("/services", { waitUntil: "networkidle" });
    await page.goto("/eyewear", { waitUntil: "networkidle" });
    await expect(page.locator(".oc-svc-card, .oc-product-card").first()).toBeVisible();
    // …then the API goes down without any on-demand revalidation, and the data goes stale.
    await setFixtureMode(request, "down");
    await page.waitForTimeout(62_000);
    for (let i = 0; i < 2; i++) {
      // First visit: stale page + background refresh (which fails); second: the regenerated page.
      await page.goto("/services", { waitUntil: "networkidle" });
      await expect(page.locator(".oc-svc-card")).toHaveCount(3);
      await expect(page.locator("[data-api-state]")).toHaveCount(0);
      await page.goto("/eyewear", { waitUntil: "networkidle" });
      await expect(page.locator(".oc-product-grid--catalogue > li")).toHaveCount(37);
      await page.waitForTimeout(1_000);
    }
    await setFixtureMode(request, "ok");
  });
});
