import { expect, test } from "./helpers";
import { addFrameWithLenses, addSimple } from "./helpers";

test.describe("collections", () => {
  test("glasses: shape filter narrows the grid and is kept in the URL", async ({ page }) => {
    await page.goto("/glasses");
    await expect(page.locator(".result-count")).toHaveText("20 frames");
    await page.getByRole("button", { name: /Frame shape/ }).click();
    await page.getByRole("checkbox", { name: /Round/ }).check();
    await expect(page).toHaveURL(/shape=round/);
    await expect(page.locator(".result-count")).toHaveText("4 frames");
    await page.keyboard.press("Escape");
    // A shared link arrives already filtered (server render, no JavaScript needed for the result).
    await page.goto("/glasses?shape=round&material=metal");
    await expect(page.locator(".result-count")).toHaveText("1 frame");
    await expect(page.locator(".tile").first()).toContainText("Halden Wire");
    await page.getByRole("button", { name: "Clear all" }).click();
    await expect(page.locator(".result-count")).toHaveText("20 frames");
  });

  test("colour filter and sorting", async ({ page }) => {
    await page.goto("/glasses?colour=gold&sort=price-asc");
    const prices = await page.locator(".tile__price").allTextContents();
    const values = prices.map((p) => Number(p.replace(/[^\d]/g, "")));
    expect(values.length).toBeGreaterThan(2);
    expect([...values].sort((a, b) => a - b)).toEqual(values);
    await expect(page.locator(".active-filters")).toContainText("Gold");
    await expect(page.locator(".tile", { hasText: "Arden 101" })).toHaveCount(0); // black/tortoise only
  });

  test("accessories collection groups cleaning, cases and accessories", async ({ page }) => {
    await page.goto("/accessories");
    await expect(page.locator(".result-count")).toHaveText("12 products");
    await expect(page.locator(".tile", { hasText: "Hard Shell Case" })).toBeVisible();
    await expect(page.locator(".tile", { hasText: "Microfiber Cloth" })).toBeVisible();
  });
});

test.describe("product pages", () => {
  test("colour switch changes the images and keeps the page", async ({ page }) => {
    await page.goto("/products/arden-101?colour=black");
    await expect(page.getByText("Colour Black")).toBeVisible();
    const firstSrc = await page.locator(".gallery img").first().getAttribute("src");
    await page.getByRole("link", { name: "Tortoise", exact: true }).click();
    await expect(page).toHaveURL(/colour=tortoise/);
    await expect(page.getByText("Colour Tortoise")).toBeVisible();
    await expect.poll(() => page.locator(".gallery img").first().getAttribute("src")).not.toBe(firstSrc);
  });

  test("size chips and per-branch availability", async ({ page }) => {
    await page.goto("/products/arden-101");
    await page.getByRole("radio", { name: "54 mm" }).click();
    await expect(page.getByText("Size 54 mm lens width")).toBeVisible();
    await expect(page.locator(".branch-stock li")).toHaveCount(3);
  });

  test("sunglasses go straight into the bag, quantities merge", async ({ page }) => {
    await addSimple(page, "solenne-riviera");
    await addSimple(page, "solenne-riviera");
    await page.goto("/bag");
    await expect(page.locator(".bag-line")).toHaveCount(1);
    await expect(page.locator(".bag-line output")).toHaveText("2");
    await expect(page.getByRole("link", { name: /Bag, 2 items/ })).toBeVisible();
  });

  test("contact lenses: a power per eye adds one line per eye", async ({ page }) => {
    await page.goto("/products/aquasoft-daily-30-pack");
    await page.getByLabel("Same power for both eyes").uncheck();
    await page.getByLabel("Right eye (OD): power").selectOption({ label: "-2.00" });
    await page.getByLabel("Left eye (OS): power").selectOption({ label: "-3.00" });
    await page.getByRole("button", { name: "Add to bag" }).click();
    await page.getByRole("dialog", { name: "Added to your bag" }).getByRole("button", { name: "Close" }).click();
    await page.goto("/bag");
    await expect(page.locator(".bag-line")).toHaveCount(2);
    await expect(page.locator(".bag-line").first()).toContainText("Right eye · Power -2.00");
    await expect(page.locator(".bag-line").nth(1)).toContainText("Left eye · Power -3.00");
  });
});

test.describe("lens flow", () => {
  test("prescription values are checked before the frame goes into the bag", async ({ page }) => {
    await page.goto("/products/mesa-classic");
    await page.getByRole("button", { name: "Select lenses" }).click();
    const d = page.getByRole("dialog");
    await expect(d.getByRole("button", { name: "Next", exact: true })).toBeDisabled();
    await d.getByRole("radio", { name: /Progressive/ }).click();
    await d.getByRole("button", { name: "Next", exact: true }).click();
    await d.getByRole("radio", { name: /Enter it now/ }).click();
    await d.getByLabel("Right (OD) cylinder (CYL)").selectOption("-1.00");
    await d.getByRole("button", { name: "Next", exact: true }).click();
    await expect(d.getByRole("alert")).toContainText("axis");
    await expect(d.getByRole("alert")).toContainText("reading addition");
    await d.getByLabel("Right (OD) axis").fill("180");
    await d.getByLabel("Right (OD) addition (ADD)").selectOption("+2.00");
    await d.getByLabel("Left (OS) addition (ADD)").selectOption("+2.00");
    await d.getByRole("button", { name: "Next", exact: true }).click();
    await expect(d.getByRole("heading", { name: "Review" })).toBeVisible();
    await expect(d).toContainText("Progressive lenses");
    await d.getByRole("button", { name: "Add to bag" }).click();
    await page.goto("/bag");
    await expect(page.locator(".bag-line")).toContainText("Prescription: Enter it now");
  });

  test("frame only skips the lens steps and the back button returns", async ({ page }) => {
    await page.goto("/products/halden-wire");
    await page.getByRole("button", { name: "Select lenses" }).click();
    const d = page.getByRole("dialog");
    await d.getByRole("radio", { name: /Frame only/ }).click();
    await d.getByRole("button", { name: "Next", exact: true }).click();
    await expect(d.getByRole("heading", { name: "Review" })).toBeVisible();
    await expect(d).toContainText("Non-prescription demo lenses");
    await d.getByRole("button", { name: "Back" }).click();
    await expect(d.getByRole("heading", { name: "Choose your glasses" })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(d).toBeHidden();
  });
});

test.describe("bag", () => {
  test("persists across reloads, re-prices from the dashboard, quantity and remove", async ({ page }) => {
    await addFrameWithLenses(page);
    await page.goto("/bag");
    const line = page.locator(".bag-line");
    await expect(line).toContainText("Arden 101");
    await expect(line).toContainText("Lenses: Single vision · Standard");
    await expect(page.locator(".summary .total")).toContainText("₱4,450");
    await page.reload();
    await expect(line).toHaveCount(1);
    await line.getByRole("button", { name: "More" }).click();
    await expect(page.locator(".summary .total")).toContainText("₱8,900");
    await line.getByRole("button", { name: "Remove" }).click();
    await expect(page.getByRole("heading", { name: "Your bag is empty" })).toBeVisible();
  });
});
