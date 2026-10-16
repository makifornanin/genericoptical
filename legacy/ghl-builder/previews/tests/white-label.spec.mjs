/*
 * White-label: the same blocks and scripts with a different OC_CONFIG (previews/examples/alt-config.js)
 * produce a different business site — name, colours, navigation, branches, services, options.
 */
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { expect, test } from "@playwright/test";
import { blockGhl, ROOT, watchConsole } from "./helpers.mjs";

// One worker builds the alternate site once, then the tests read it.
test.describe.configure({ mode: "serial" });
test.beforeAll(() => {
  execFileSync(process.execPath, [join(ROOT, "previews", "build.mjs"), "--config=previews/examples/alt-config.js", "--out=previews/site-alt"]);
});
test.beforeEach(async ({ page }) => blockGhl(page));

test("brand, colours, navigation and footer follow the config", async ({ page }) => {
  const problems = watchConsole(page);
  await page.goto("site-alt/index.html");
  await expect(page.locator(".oc-brand__name")).toHaveText("Northlight Eyecare");
  await expect(page.locator("h1")).toHaveText("Eye care that fits your life.");
  await expect(page.locator(".oc-brand__mark")).toHaveText("N");
  await expect(page.locator(".oc-promo")).toBeHidden();
  await expect(page.locator(".oc-nav a")).toHaveText(["Eyewear", "Eye care", "Our story", "Contact"]);
  await expect(page.locator(".oc-header__cta")).toHaveText("Book a visit");
  const bg = await page.locator(".oc-header__cta").evaluate((el) => getComputedStyle(el).backgroundColor);
  expect(bg).toBe("rgb(34, 50, 79)");
  const accent = await page.locator(".oc-footer .oc-btn--accent").evaluate((el) => getComputedStyle(el).backgroundColor);
  expect(accent).toBe("rgb(240, 179, 106)");
  await expect(page.locator(".oc-footer__social a")).toHaveText(/Instagram/);
  await expect(page.locator(".oc-footer__copy")).toContainText("Northlight Eyecare LLC (sample)");
  await expect(page).toHaveTitle(/Northlight Eyecare/);
  expect(problems).toEqual([]);
});

test("content sections adapt: one branch, featured services only, no testimonials, prices hidden", async ({ page }) => {
  await page.goto("site-alt/index.html");
  await expect(page.locator(".oc-branch-card")).toHaveCount(1);
  await expect(page.locator("[data-oc-branches-title]")).toHaveText("Visit us.");
  await expect(page.locator(".oc-service-rows > li")).toHaveCount(2);
  await expect(page.locator("[data-oc-render='testimonials']")).toBeHidden();
  await expect(page.locator(".oc-stats dt")).toHaveText(["Branch", "Frames & eyewear", "Eye exam"]);
  await expect(page.locator(".oc-stats dd").last()).toHaveText("60 min");
  await expect(page.locator(".oc-product-card__price").first()).toHaveText("");
  await page.goto("site-alt/services.html");
  await expect(page.locator(".oc-price-list > li")).toHaveCount(2); // lens replacement is disabled
  await page.goto("site-alt/eyewear.html");
  await expect(page.locator(".oc-pill")).toHaveText([/Everything/, /Frames/, /Sunglasses/, /Contact lenses/]);
});

test("booking with a single branch skips the branch step and renumbers the steps", async ({ page }) => {
  await page.goto("site-alt/book.html");
  await expect(page.locator('[data-oc-step="branch"]')).toBeHidden();
  await expect(page.locator('[data-oc-step="service"] [data-oc-step-num]')).toHaveText("1");
  await expect(page.locator('[data-oc-step="time"] [data-oc-step-num]')).toHaveText("2");
  await expect(page.locator("[data-oc-hours]")).toContainText("Closed");
  await expect(page.locator("[data-oc-phone]")).toHaveText("+1 (555) 010-2200");
});
