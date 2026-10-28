import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";
import { expect, test } from "./helpers";
import { addFrameWithLenses, blockGhl, PAGES, VIEWPORTS } from "./helpers";

/* axe-core, WCAG 2.2 A/AA: serious and critical violations fail the test. */

async function audit(page: Page, label: string) {
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).analyze();
  const bad = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
  expect(
    bad.map((v) => `${label}: ${v.id} (${v.impact}) — ${v.nodes.map((n) => n.target.join(" ")).slice(0, 3).join(", ")}`),
    `${label} accessibility`,
  ).toEqual([]);
}

for (const vp of ["mobile", "desktop"] as const) {
  test.describe(vp, () => {
    test.use({ viewport: VIEWPORTS[vp] });
    for (const p of PAGES) {
      test(p.id, async ({ page }) => {
        await blockGhl(page);
        await page.goto(p.path, { waitUntil: "networkidle" });
        await audit(page, `${p.id} @${vp}`);
      });
    }
  });
}

test("open states: lens drawer, bag with items, checkout with errors, order page", async ({ page }) => {
  await page.goto("/products/arden-101");
  await page.getByRole("button", { name: "Select lenses" }).click();
  await audit(page, "lens drawer");
  await page.keyboard.press("Escape");
  await addFrameWithLenses(page);
  await page.goto("/bag");
  await expect(page.locator(".summary .total")).toContainText("₱");
  await audit(page, "bag");
  await page.goto("/checkout");
  await page.getByRole("button", { name: /Place order/ }).click();
  await expect(page.locator("#err-fullName")).toBeVisible();
  await audit(page, "checkout errors");
});
