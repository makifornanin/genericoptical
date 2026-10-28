import { expect, test } from "./helpers";
import { blockGhl, PAGES, VIEWPORTS, watchConsole } from "./helpers";

/*
 * Every page at four widths: HTTP 200, no horizontal overflow, exactly one h1, every image that
 * should have loaded did, and no console errors (CSP violations and hydration errors included).
 */

for (const [vpName, viewport] of Object.entries(VIEWPORTS)) {
  test.describe(`${vpName} (${viewport.width}px)`, () => {
    test.use({ viewport });
    for (const p of PAGES) {
      test(`${p.id}`, async ({ page }) => {
        await blockGhl(page);
        const problems = watchConsole(page);
        const res = await page.goto(p.path, { waitUntil: "networkidle" });
        expect(res?.status(), `${p.path} status`).toBe(200);
        await expect(page.locator("h1")).toHaveCount(1);
        // Scroll through so lazy images load, then check none are broken.
        const height = await page.evaluate(() => document.documentElement.scrollHeight);
        for (let y = 0; y < height; y += viewport.height) {
          await page.evaluate((yy) => window.scrollTo(0, yy), y);
          await page.waitForTimeout(60);
        }
        await page.waitForLoadState("networkidle");
        const broken = await page.evaluate(() =>
          [...document.images].filter((img) => img.complete && img.currentSrc && img.naturalWidth === 0).map((img) => img.currentSrc),
        );
        expect(broken, "broken images").toEqual([]);
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
        expect(overflow, "horizontal overflow (px)").toBeLessThanOrEqual(1);
        expect(problems).toEqual([]);
      });
    }
  });
}

test("unknown product and unknown page show the not-found page", async ({ page }) => {
  const res = await page.goto("/products/no-such-frame");
  expect(res?.status()).toBe(404);
  await expect(page.getByRole("heading", { name: "We couldn't find that page" })).toBeVisible();
  expect((await page.goto("/nope"))?.status()).toBe(404);
});

test("header: mobile menu opens as a dialog, traps focus and closes with Escape", async ({ page }) => {
  await page.setViewportSize(VIEWPORTS.mobile);
  await page.goto("/");
  await page.getByRole("button", { name: "Menu" }).click();
  const menu = page.getByRole("dialog", { name: "Menu" });
  await expect(menu).toBeVisible();
  await expect(menu.getByRole("link", { name: "Glasses", exact: true })).toBeVisible();
  for (let i = 0; i < 20; i++) await page.keyboard.press("Tab");
  expect(await page.evaluate(() => Boolean(document.activeElement?.closest("[role=dialog]")))).toBe(true);
  await page.keyboard.press("Escape");
  await expect(menu).toBeHidden();
});

test("header search goes to results", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Search" }).click();
  await page.getByRole("searchbox").fill("tortoise round");
  await page.keyboard.press("Enter");
  await page.waitForURL(/\/search\?q=tortoise/);
  await expect(page.getByRole("heading", { level: 1 })).toContainText("tortoise round");
  await expect(page.locator(".tile").first()).toBeVisible();
});

test("demo store notice is visible and explains payments", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator(".topbar")).toContainText("card payments are simulated");
  await page.goto("/help#demo");
  await expect(page.locator("#demo")).toContainText("no money moves");
});
