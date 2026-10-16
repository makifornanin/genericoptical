import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { blockGhl, PAGES, VIEWPORTS } from "./helpers";

// axe-core WCAG 2.2 A/AA checks on every page, phone and desktop. Serious/critical issues fail.
for (const vp of ["mobile", "desktop"] as const) {
  test.describe(`accessibility (${vp})`, () => {
    test.use({ viewport: VIEWPORTS[vp] });
    for (const spec of PAGES) {
      test(spec.name, async ({ page }) => {
        await blockGhl(page);
        await page.goto(spec.path, { waitUntil: "networkidle" });
        const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).analyze();
        const bad = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
        expect(bad.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).slice(0, 3).join(", ")}`)).toEqual([]);
      });
    }
  });
}

test.describe("accessibility of interactive states", () => {
  test.use({ viewport: VIEWPORTS.mobile });

  test("open mobile menu", async ({ page }) => {
    await page.goto("/", { waitUntil: "networkidle" });
    await page.getByRole("button", { name: "Open menu" }).click();
    const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze();
    expect(results.violations.filter((v) => v.impact === "serious" || v.impact === "critical").map((v) => v.id)).toEqual([]);
  });

  test("product inquiry form open with validation errors", async ({ page }) => {
    await page.goto("/eyewear/arden-101", { waitUntil: "networkidle" });
    await page.getByRole("button", { name: "Ask about this" }).click();
    await page.getByRole("button", { name: "Send message" }).click();
    await expect(page.getByText("Please enter your name.")).toBeVisible();
    const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze();
    expect(results.violations.filter((v) => v.impact === "serious" || v.impact === "critical").map((v) => v.id)).toEqual([]);
  });

  test("booking request form (branch without online calendar)", async ({ page }) => {
    await page.goto("/book?branch=qc&service=eye_exam", { waitUntil: "networkidle" });
    const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze();
    expect(results.violations.filter((v) => v.impact === "serious" || v.impact === "critical").map((v) => v.id)).toEqual([]);
  });
});
