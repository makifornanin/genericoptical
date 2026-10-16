import { expect, test } from "@playwright/test";

const grid = ".oc-product-grid--catalogue";

test.describe("eyewear catalogue", () => {
  test("lists every published product with category counts and availability", async ({ page }) => {
    await page.goto("/eyewear", { waitUntil: "networkidle" });
    await expect(page.locator(`${grid} > li`)).toHaveCount(37);
    await expect(page.getByRole("status").filter({ hasText: "Showing" })).toHaveText("Showing 37 products");
    const pills = page.getByRole("group", { name: "Filter by category" }).getByRole("button");
    await expect(pills).toHaveText(["Everything37", "Frames20", "Sunglasses7", "Contact lenses5", "Cleaning & care3", "Cases1", "Accessories1"]);
    await expect(pills.first()).toHaveAttribute("aria-pressed", "true");

    const arden = page.locator(".oc-product-card", { hasText: "Arden 101" });
    await expect(arden).toHaveAttribute("href", "/eyewear/arden-101");
    await expect(arden.locator(".oc-product-card__price")).toHaveText("from ₱2,950.00");
    await expect(arden.locator(".oc-product-card__foot")).toContainText("4 options");
    await expect(arden.locator(".oc-tag--pos")).toHaveText("In stock");
    await expect(page.locator(".oc-product-card", { hasText: "Kiyo Titan" }).locator(".oc-tag--warn")).toHaveText("Low stock");
    await expect(page.locator(".oc-product-card", { hasText: "Solenne Muse" }).locator(".oc-tag")).toHaveText("Out of stock — ask us");
    await expect(page.locator(".oc-product-card", { hasText: "AquaSoft Toric" }).locator(".oc-tag")).toHaveText("Made to order");
    await expect(page.locator(".oc-catalogue__note")).toContainText("Prices include VAT where applicable.");
  });

  test("category filter updates the grid, the status line and the URL", async ({ page }) => {
    await page.goto("/eyewear", { waitUntil: "networkidle" });
    await page.getByRole("button", { name: /^Sunglasses/ }).click();
    await expect(page.getByRole("button", { name: /^Sunglasses/ })).toHaveAttribute("aria-pressed", "true");
    await expect(page.locator(`${grid} > li`)).toHaveCount(7);
    await expect(page.getByText("Showing 7 sunglasses")).toBeVisible();
    await expect(page).toHaveURL(/\/eyewear\?category=sunglasses$/);
    const scrollY = await page.evaluate(() => window.scrollY);
    expect(scrollY).toBeLessThan(400);
  });

  test("search matches name, brand, category and description and is kept in the URL", async ({ page }) => {
    await page.goto("/eyewear", { waitUntil: "networkidle" });
    const search = page.getByRole("searchbox", { name: "Search eyewear" });
    await search.fill("tortoise");
    await expect(page.getByText(/results? for “tortoise”/)).toBeVisible();
    await expect(page).toHaveURL(/q=tortoise/);
    const names = await page.locator(`${grid} .oc-product-card__name`).allInnerTexts();
    expect(names.length).toBeGreaterThan(3);
    expect(names).toContain("Arden 101");

    await search.fill("kiyo");
    await expect(page.locator(`${grid} > li`)).toHaveCount(4);
    // Category name + description: the five lens products (and the lens solution, whose
    // description mentions contact lenses).
    await search.fill("contact lenses");
    await expect(page.getByText(/results? for “contact lenses”/)).toBeVisible();
    const lensNames = await page.locator(`${grid} .oc-product-card__name`).allInnerTexts();
    expect(lensNames.filter((n) => /AquaSoft (Daily|Monthly|Toric)|ClearDay (Bi-weekly|Silicone)/.test(n))).toHaveLength(5);
  });

  test("deep link arrives pre-filtered, even without JavaScript", async ({ browser }) => {
    const context = await browser.newContext({ javaScriptEnabled: false });
    const page = await context.newPage();
    await page.goto("/eyewear?category=frames&q=arden");
    await expect(page.locator(`${grid} > li`)).toHaveCount(4);
    await expect(page.getByRole("button", { name: /^Frames/ })).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByRole("searchbox", { name: "Search eyewear" })).toHaveValue("arden");
    await context.close();
  });

  test("empty state and Clear filters", async ({ page }) => {
    await page.goto("/eyewear?q=nothing-matches-this", { waitUntil: "networkidle" });
    await expect(page.locator(grid)).toBeHidden();
    const empty = page.locator(".oc-empty");
    await expect(empty).toBeVisible();
    await expect(empty).toContainText("Nothing matches that search");
    await expect(page.getByText("0 results for “nothing-matches-this”")).toBeVisible();
    await empty.getByRole("button", { name: "Clear filters" }).click();
    await expect(page.locator(`${grid} > li`)).toHaveCount(37);
    await expect(page.getByRole("searchbox", { name: "Search eyewear" })).toBeFocused();
    await expect(page).toHaveURL(/\/eyewear$/);
  });
});
