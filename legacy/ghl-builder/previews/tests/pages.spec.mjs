import { existsSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "@playwright/test";
import { blockGhl, PAGES, ROOT, url, VIEWPORTS, watchConsole } from "./helpers.mjs";

for (const [vpName, viewport] of Object.entries(VIEWPORTS)) {
  test.describe(`${vpName} ${viewport.width}px`, () => {
    test.use({ viewport });
    for (const page of PAGES) {
      test(`${page.name} renders cleanly`, async ({ page: p }) => {
        await blockGhl(p);
        const problems = watchConsole(p);
        await p.goto(url(page), { waitUntil: "networkidle" });

        // Every block renderer ran (no unrendered [data-oc-render] left).
        const pending = await p.locator("[data-oc-render]:not([data-oc-done='1'])").count();
        expect(pending, "unrendered blocks").toBe(0);

        // No horizontal overflow at this width.
        const overflow = await p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
        expect(overflow, "horizontal overflow (px)").toBeLessThanOrEqual(0);

        // One h1 per page.
        await expect(p.locator("h1")).toHaveCount(1);

        // Images loaded.
        const broken = await p.evaluate(() => [...document.images].filter((i) => i.complete && i.naturalWidth === 0).map((i) => i.src));
        expect(broken, "broken images").toEqual([]);

        // Visitors never see raw merge tags or template braces.
        const text = await p.locator("body").innerText();
        expect(text).not.toMatch(/\{\{|\}\}|undefined|NaN/);

        // Internal links resolve to preview pages (or in-page anchors / tel / mailto).
        const hrefs = await p.$$eval("a[href]", (as) => as.map((a) => a.getAttribute("href")));
        for (const h of hrefs) {
          if (/^(https?:|tel:|mailto:|#)/.test(h)) continue;
          const file = h.split(/[?#]/)[0];
          expect(existsSync(join(ROOT, "previews", "site", file)), `link target ${h}`).toBe(true);
        }

        // Touch targets in the header are at least 40px tall on phones.
        if (vpName === "mobile") {
          const box = await p.locator("[data-oc-menu-toggle]").boundingBox();
          expect(box.height).toBeGreaterThanOrEqual(40);
        }

        expect(problems, "console errors").toEqual([]);
      });
    }
  });
}
