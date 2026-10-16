import { expect, test } from "@playwright/test";
import { blockGhl, PAGES, VIEWPORTS, watchConsole } from "./helpers";

// Internal link targets already checked in this worker (status code), shared across tests.
const checked = new Map<string, number>();

for (const [vpName, viewport] of Object.entries(VIEWPORTS)) {
  test.describe(`${vpName} ${viewport.width}px`, () => {
    test.use({ viewport });
    for (const spec of PAGES) {
      test(`${spec.name} renders cleanly`, async ({ page, request }) => {
        await blockGhl(page);
        const problems = watchConsole(page);
        const response = await page.goto(spec.path, { waitUntil: "networkidle" });
        expect(response?.status(), "HTTP status").toBe(200);

        // Data loaded from the (fixture) API, not a fallback state.
        await expect(page.locator("[data-api-state]")).toHaveCount(0);

        // No horizontal overflow at this width.
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
        expect(overflow, "horizontal overflow (px)").toBeLessThanOrEqual(0);

        // Exactly one h1.
        await expect(page.locator("h1")).toHaveCount(1);

        // Every image loaded (lazy images are scrolled into view first).
        await page.evaluate(async () => {
          for (const img of Array.from(document.images)) img.loading = "eager";
          await Promise.all(
            Array.from(document.images).map((img) =>
              img.complete
                ? null
                : new Promise((done) => {
                    img.addEventListener("load", done, { once: true });
                    img.addEventListener("error", done, { once: true });
                  }),
            ),
          );
        });
        const broken = await page.evaluate(() => Array.from(document.images).filter((i) => !i.complete || i.naturalWidth === 0).map((i) => i.src));
        expect(broken, "broken images").toEqual([]);

        // Visitors never see template leftovers.
        const text = await page.locator("body").innerText();
        expect(text).not.toMatch(/\{\{|\}\}|undefined|NaN|\[object Object\]/);

        // Internal links resolve.
        const hrefs = await page.$$eval("a[href]", (as) => as.map((a) => a.getAttribute("href") ?? ""));
        const internal = [...new Set(hrefs.filter((h) => h.startsWith("/")).map((h) => h.split("#")[0]))].filter(Boolean);
        for (const href of internal) {
          if (!checked.has(href)) checked.set(href, (await request.get(href)).status());
          expect(checked.get(href), `link ${href}`).toBe(200);
        }
        // Every in-page anchor has a target.
        for (const h of hrefs.filter((x) => x.startsWith("#"))) {
          expect(await page.locator(h === "#" ? "body" : h).count(), `anchor ${h}`).toBeGreaterThan(0);
        }

        if (vpName === "mobile") {
          const box = await page.getByRole("button", { name: /open menu/i }).boundingBox();
          expect(box?.height ?? 0).toBeGreaterThanOrEqual(40);
        }

        expect(problems, "console errors").toEqual([]);
      });
    }
  });
}
