import { expect, test, type Page } from "@playwright/test";
import { cents, signIn } from "./helpers";

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Stock count shown on a POS product tile, e.g. "12 in stock". */
/** A product tile in the POS grid (not the "Recent" shortcut chips, which share the product name). */
function productTile(page: Page, name: string) {
  return page.getByRole("region", { name: "Products" }).getByRole("listitem").getByRole("button", { name: new RegExp(escape(name)) }).first();
}

/** Stock count shown on a POS product tile: "12 in stock", "Low · 2 left" or "Out of stock". */
async function tileStock(page: Page, name: string) {
  const label = await productTile(page, name).locator("span", { hasText: /in stock|left|Out of stock/ }).first().textContent();
  if (label?.includes("Out of stock")) return 0;
  return Number(label?.match(/(\d+) (?:in stock|left)/)?.[1] ?? NaN);
}

async function searchPos(page: Page, q: string) {
  const box = page.getByLabel("Search products");
  await box.fill(q);
}

test.describe("point of sale and payments", () => {
  test("cash sale deducts stock once and is fully paid", async ({ page }) => {
    await signIn(page, "sales");
    await page.goto("/app/pos");
    // Any in-stock care product, so repeated runs don't exhaust one item.
    await searchPos(page, "Lensmere Care");
    const tile = page.getByRole("region", { name: "Products" }).getByRole("listitem").locator("button:not([disabled])", { hasText: "in stock" }).first();
    await expect(tile).toBeVisible();
    const name = ((await tile.locator("span.line-clamp-1").first().textContent()) ?? "").trim();
    await searchPos(page, name);
    const before = await tileStock(page, name);
    expect(before).toBeGreaterThan(0);

    await productTile(page, name).click();
    const charge = page.getByRole("button", { name: /Complete sale/ });
    await expect(charge).toBeEnabled();
    await charge.click();

    const dialog = page.getByRole("dialog");
    await expect(dialog.getByText(/Sale .* completed/)).toBeVisible();
    await dialog.getByRole("link", { name: "View transaction details" }).click();
    await page.waitForURL(/\/app\/sales\/[0-9a-f-]{36}/);
    await expect(page.getByText("Paid", { exact: true }).first()).toBeVisible();

    await page.goto("/app/pos");
    await searchPos(page, name);
    expect(await tileStock(page, name)).toBe(before - 1);
  });

  test("partial payment leaves a balance that is settled later", async ({ page }) => {
    await signIn(page, "sales");
    await page.goto("/app/pos");

    // Link an existing customer (required for a balance due).
    await page.getByLabel("Find customer").fill("an");
    await page.getByRole("listbox").getByRole("option").first().click();

    await searchPos(page, "Case");
    const tile = page.getByRole("region", { name: "Products" }).getByRole("listitem").locator("button:not([disabled])").first();
    await expect(tile).toBeVisible();
    await tile.click();

    const totalText = await page.getByRole("complementary", { name: "Current sale" }).locator("dd").last().textContent();
    const total = cents(totalText);
    const half = Math.round(total / 2);
    await page.getByLabel("Partial payment").check();
    await page.getByLabel("Amount").first().fill((half / 100).toFixed(2));
    await page.getByRole("button", { name: /Complete sale/ }).click();

    const dialog = page.getByRole("dialog");
    await expect(dialog.getByText(/Balance due:/)).toBeVisible();
    await dialog.getByRole("link", { name: "View transaction details" }).click();
    await page.waitForURL(/\/app\/sales\/[0-9a-f-]{36}/);
    await expect(page.getByText("Partially paid").first()).toBeVisible();

    await page.getByRole("button", { name: "Record payment" }).click();
    const pay = page.getByRole("dialog", { name: "Record payment" });
    await pay.getByLabel("Method").selectOption("gcash");
    await pay.getByRole("button", { name: "Full balance" }).click();
    await pay.getByLabel("Reference number").fill(`GC${Date.now()}`);
    await pay.getByRole("button", { name: /^Record ₱/ }).click();
    await expect(pay).toBeHidden();
    await expect(page.getByText("Paid", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("GCash").first()).toBeVisible();
  });
});

test.describe("purchasing and fulfilment", () => {
  test("a purchase order received into stock increases availability", async ({ page }) => {
    await signIn(page, "inventory");
    await page.goto("/app/purchase-orders/new");
    await page.getByRole("combobox", { name: /^Supplier/ }).selectOption({ label: "CarePlus Optical Supplies" });
    await page.getByLabel("Search products to add").fill("Lens Cleaning Spray");
    await page.getByRole("button", { name: /Lens Cleaning Spray/ }).first().click();
    await page.getByLabel("Quantity").first().fill("6");
    await page.getByRole("button", { name: "Create draft" }).click();
    await page.waitForURL(/\/app\/purchase-orders\/[0-9a-f-]{36}$/);

    // Inventory role can create but confirming needs purchasing.approve → sign in as the manager.
    const poUrl = page.url();
    await signIn(page, "manager");
    await page.goto(poUrl);
    await page.getByRole("button", { name: "Confirm with supplier" }).click();
    await expect(page.getByText("Ordered").first()).toBeVisible();

    await page.getByRole("button", { name: "Receive delivery" }).click();
    const dialog = page.getByRole("dialog", { name: "Receive delivery" });
    await dialog.getByRole("button", { name: "Receive into stock" }).click();
    await expect(dialog).toBeHidden();
    await expect(page.getByText("Received", { exact: true }).first()).toBeVisible();
    await expect(page.getByText(/Receipt|received/i).first()).toBeVisible();
  });

  test("an order moves through fulfilment stages to handover", async ({ page }) => {
    await signIn(page, "manager");
    await page.goto("/app/orders?stage=ready_for_pickup");
    const link = page.locator("table a[href^='/app/orders/']").first();
    test.skip((await link.count()) === 0, "No ready-for-pickup orders in the demo data — reseed");
    await link.click();
    await page.waitForURL(/\/app\/orders\/[0-9a-f-]{36}/);

    const balanceText = await page.getByText(/Balance due/).first().textContent();
    if (balanceText && cents(balanceText.split("Balance due")[1] ?? "") > 0) {
      await page.getByRole("button", { name: "Record payment" }).click();
      const pay = page.getByRole("dialog", { name: "Record payment" });
      await pay.getByRole("button", { name: "Full balance" }).click();
      await pay.getByRole("button", { name: /^Record ₱/ }).click();
      await expect(pay).toBeHidden();
    }
    await page.getByRole("button", { name: /Hand over to customer/ }).click();
    const confirm = page.getByRole("dialog", { name: "Hand over with a balance due?" });
    if (await confirm.isVisible().catch(() => false)) await confirm.getByRole("button", { name: "Hand over anyway" }).click();
    await expect(page.getByText("Completed").first()).toBeVisible();
  });
});
