import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { blockGhl, PAGES, url, VIEWPORTS } from "./helpers.mjs";

// axe-core WCAG 2.2 A/AA checks on every page, phone and desktop. Serious/critical issues fail.
for (const vp of ["mobile", "desktop"]) {
  test.describe(`accessibility (${vp})`, () => {
    test.use({ viewport: VIEWPORTS[vp] });
    for (const page of PAGES) {
      test(page.name, async ({ page: p }) => {
        await blockGhl(p);
        await p.goto(url(page), { waitUntil: "networkidle" });
        const results = await new AxeBuilder({ page: p }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).analyze();
        const bad = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
        expect(bad.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).slice(0, 3).join(", ")}`)).toEqual([]);
      });
    }
  });
}
