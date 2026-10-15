import { expect, test, type Page } from "@playwright/test";
import { cents, signIn, uniq } from "./helpers";

/**
 * The five connected workflows from the brief, each driven entirely through the UI and checked
 * against what other modules show afterwards.
 */

/** A weekday at least a week ahead (yyyy-MM-dd), so appointment slots are open. */
function nextWeekday(dow = 2) {
  const d = new Date(Date.now() + 8 * 86_400_000);
  while (d.getDay() !== dow) d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
}

async function grossSalesToday(page: Page) {
  await page.goto("/app/reports?range=today");
  const cell = page.getByRole("row", { name: /^Gross sales/ }).getByRole("cell").nth(1);
  return cents(await cell.textContent());
}

async function variantRow(page: Page, productUrl: string, sku: string) {
  await page.goto(productUrl);
  const row = page.getByRole("row", { name: new RegExp(sku) }).first();
  await expect(row).toBeVisible();
  // Columns for a manager: Variant, SKU, Price, Cost, On hand, Reserved, Available, …
  return { onHand: Number(await row.getByRole("cell").nth(4).textContent()), row };
}

/** Searches the POS and adds the first in-stock match, so repeated runs don't depend on one product's stock. */
async function addFirstInStock(page: Page, query: string) {
  await page.getByLabel("Search products").fill(query);
  const tile = page.getByRole("region", { name: "Products" }).getByRole("listitem").locator("button:not([disabled])").first();
  await expect(tile).toBeVisible();
  await tile.click();
}

async function saleTotal(page: Page) {
  return cents(await page.getByRole("complementary", { name: "Current sale" }).locator("dd").last().textContent());
}

const peso = (c: number) => (c / 100).toFixed(2);

async function pickCustomer(page: Page) {
  await page.getByLabel("Find customer").fill("an");
  const option = page.getByRole("listbox").getByRole("option").first();
  const name = ((await option.locator("span").first().textContent()) ?? "").trim();
  await option.click();
  return name;
}

test("Workflow A — lead to customer: form → CRM → stage → appointment → conversion, history kept", async ({ page }) => {
  const id = uniq();
  const fullName = `Flow Lead ${id}`;
  await page.goto("/contact");
  await page.getByLabel("Full name").fill(fullName);
  await page.getByLabel("Mobile number").fill(`0919${String(Date.now()).slice(-7)}`);
  await page.getByLabel("Message").fill("Looking for an eye exam and new frames.");
  await page.getByRole("button", { name: "Send message" }).click();
  await expect(page.getByText("We've received your message")).toBeVisible();

  await signIn(page, "manager");
  await page.goto(`/app/leads?q=${id}`);
  await page.getByRole("link", { name: fullName }).click();
  await page.waitForURL(/\/app\/leads\/[0-9a-f-]{36}/);
  const leadUrl = page.url();

  // Staff updates the stage.
  await page.getByRole("button", { name: "Move stage" }).click();
  await page.getByRole("menuitem", { name: "Contacted" }).click();
  await expect(page.getByText(/New lead → Contacted/).first()).toBeVisible();

  // The lead books an appointment (staff-side, from the lead).
  await page.getByRole("link", { name: "Book appointment" }).click();
  const dialog = page.getByRole("dialog", { name: "New appointment" });
  await expect(dialog.getByText(`Booking for lead ${fullName}`)).toBeVisible();
  await dialog.getByLabel("Branch").selectOption({ label: "Makati" });
  await dialog.getByLabel("Appointment type").selectOption({ label: "Frame & lens consultation · 30 min" });
  await dialog.getByLabel("Date").fill(nextWeekday());
  await dialog.getByRole("button", { name: /^\d{2}:\d{2}$/ }).first().click();
  await dialog.getByRole("button", { name: "Book appointment" }).click();
  await expect(dialog).toBeHidden();

  await page.goto(leadUrl);
  await expect(page.getByText("Appointment scheduled").first()).toBeVisible();

  // Convert; the customer keeps the appointment and the lead keeps its timeline.
  await page.getByRole("button", { name: "Convert to customer" }).click();
  await page.getByRole("button", { name: /Create customer|Create a new customer anyway/ }).click();
  await page.waitForURL(/\/app\/customers\/[0-9a-f-]{36}/);
  await expect(page.getByRole("heading", { level: 1, name: fullName })).toBeVisible();
  await expect(page.getByText(/Frame & lens consultation|Scheduled/).first()).toBeVisible();

  await page.goto(leadUrl);
  await expect(page.getByText(/Converted to customer/)).toBeVisible();
  await expect(page.getByText("Looking for an eye exam and new frames.").first()).toBeVisible();
});

test("Workflows B + E — new product → purchase order → receive → POS sale → stock, history and reports", async ({ page }) => {
  const id = uniq();
  const sku = `E2E-${id}`;
  const name = `Flow Frame ${id}`;
  await signIn(page, "manager");

  // B1–2: add a product (no opening stock).
  await page.goto("/app/products/new");
  await page.getByLabel("Product name").fill(name);
  await page.getByRole("combobox", { name: /^Category/ }).selectOption({ label: "Frames" });
  await page.getByLabel("Preferred supplier").selectOption({ label: "CarePlus Optical Supplies" });
  await page.getByLabel("SKU").first().fill(sku);
  await page.getByLabel("Price").first().fill("1500");
  await page.getByLabel("Cost").first().fill("600");
  await page.getByRole("button", { name: "Create product" }).click();
  await page.waitForURL(/\/app\/products\/[0-9a-f-]{36}$/);
  const productUrl = page.url();
  expect((await variantRow(page, productUrl, sku)).onHand).toBe(0);

  // E1–7: purchase order → confirm → receive.
  await page.goto("/app/purchase-orders/new");
  await page.getByRole("combobox", { name: /^Supplier/ }).selectOption({ label: "CarePlus Optical Supplies" });
  await page.getByLabel("Deliver to").selectOption({ label: "Makati stockroom" });
  await page.getByLabel("Search products to add").fill(sku);
  await page.getByRole("button", { name: new RegExp(sku) }).first().click();
  await page.getByLabel("Quantity").first().fill("5");
  await page.getByRole("button", { name: "Create draft" }).click();
  await page.waitForURL(/\/app\/purchase-orders\/[0-9a-f-]{36}$/);
  await page.getByRole("button", { name: "Confirm with supplier" }).click();
  await expect(page.getByText("Ordered").first()).toBeVisible();
  await page.getByRole("button", { name: "Receive delivery" }).click();
  const receive = page.getByRole("dialog", { name: "Receive delivery" });
  await receive.getByRole("button", { name: "Receive into stock" }).click();
  await expect(receive).toBeHidden(); // closes only after the server confirms the receipt
  await expect(page.getByRole("button", { name: "Receive delivery" })).toHaveCount(0); // fully received

  const received = await variantRow(page, productUrl, sku);
  expect(received.onHand).toBe(5);
  await expect(page.getByRole("cell", { name: "Received", exact: true }).first()).toBeVisible(); // movement history

  // B5–8: available in POS, sold to a customer, stock decreases.
  const grossBefore = await grossSalesToday(page);
  await page.goto("/app/pos");
  await page.getByLabel("Branch").selectOption({ label: "Makati" });
  await page.waitForURL(/branch=/);
  await page.getByLabel("Search products").fill(sku);
  const tile = page.getByRole("button", { name: new RegExp(name) });
  await expect(tile).toContainText("5 in stock");
  const customerName = await pickCustomer(page);
  await tile.click();
  await page.getByRole("button", { name: /Complete sale · ₱1,500\.00/ }).click();
  const done = page.getByRole("dialog");
  const title = (await done.getByText(/Sale .* completed/).textContent()) ?? "";
  const saleNumber = title.replace(/^Sale\s+/, "").replace(/\s+completed$/, "");
  await done.getByRole("link", { name: "View transaction details" }).click();
  await page.waitForURL(/\/app\/sales\/[0-9a-f-]{36}/);

  // B9: the sale appears in the customer's history.
  await page.getByRole("link", { name: customerName }).first().click();
  await page.waitForURL(/\/app\/customers\/[0-9a-f-]{36}/);
  await expect(page.getByText(saleNumber).first()).toBeVisible();

  // B7–8: stock decreased by exactly one, with a Sale movement.
  expect((await variantRow(page, productUrl, sku)).onHand).toBe(4);
  await expect(page.getByRole("cell", { name: "Sale", exact: true }).first()).toBeVisible();

  // B10: today's gross sales went up by exactly the sale amount.
  expect((await grossSalesToday(page)) - grossBefore).toBe(150000);
});

test("Workflow C — customer order: create with deposit → reserve → lab → ready → pay → hand over", async ({ page }) => {
  await signIn(page, "manager");
  await page.goto("/app/orders/new");
  await page.getByLabel("Branch").selectOption({ label: "Makati" });
  await pickCustomer(page);
  const search = page.getByLabel("Search products to add");
  await search.fill("Case");
  await page.locator("button:not([disabled])", { hasText: /Case/ }).first().click();
  await search.fill("Single Vision 1.56");
  await page.getByRole("button", { name: /Single Vision 1\.56/ }).first().click();
  await page.getByRole("button", { name: "50%" }).click();
  await page.getByRole("button", { name: "Create order" }).click();
  await page.waitForURL(/\/app\/orders\/[0-9a-f-]{36}/);

  // Confirmed at creation: the stocked case is reserved, not yet deducted.
  await expect(page.getByText(/reserved 1 unit/).first()).toBeVisible();
  await expect(page.getByText("Partially paid").first()).toBeVisible();

  await page.getByRole("button", { name: /Start processing/ }).click();
  await expect(page.getByText(/→ Processing/).first()).toBeVisible();
  await page.getByRole("button", { name: /Sent to lab \/ supplier/ }).click();
  await expect(page.getByText(/→ Awaiting/).first()).toBeVisible();
  await page.getByRole("button", { name: /Mark ready for pickup/ }).click();
  // Messaging isn't configured in the demo, and the history says so instead of pretending.
  await expect(page.getByText(/no customer message sent \(messaging not configured\)/).first()).toBeVisible();

  await page.getByRole("button", { name: "Record payment" }).click();
  const pay = page.getByRole("dialog", { name: "Record payment" });
  await pay.getByRole("button", { name: "Full balance" }).click();
  await pay.getByRole("button", { name: /^Record ₱/ }).click();
  await expect(pay).toBeHidden();
  await expect(page.getByText("Paid", { exact: true }).first()).toBeVisible();

  await page.getByRole("button", { name: /Hand over to customer/ }).click();
  await expect(page.getByText(/→ Completed/).first()).toBeVisible();
});

test("Workflow D — payment tracking: partial → second payment → paid, reflected in the payments ledger", async ({ page }) => {
  await signIn(page, "manager");
  await page.goto("/app/pos");
  await page.getByLabel("Branch").selectOption({ label: "Makati" });
  await page.waitForURL(/branch=/);
  await pickCustomer(page);
  await addFirstInStock(page, "Case");
  const total = await saleTotal(page);
  const first = Math.round(total / 3 / 100) * 100;
  await page.getByLabel("Partial payment").check();
  await page.getByLabel("Amount").first().fill(peso(first));
  await page.getByRole("button", { name: /Complete sale/ }).click();
  const done = page.getByRole("dialog");
  const balance = total - first;
  await expect(done.getByText(`Balance due: ₱${(balance / 100).toLocaleString("en-PH", { minimumFractionDigits: 2 })}`)).toBeVisible();
  await done.getByRole("link", { name: "View transaction details" }).click();
  await page.waitForURL(/\/app\/sales\/[0-9a-f-]{36}/);
  const saleUrl = page.url();

  const pay = async (amount: string, method: string, reference: string | null) => {
    await page.getByRole("button", { name: "Record payment" }).click();
    const d = page.getByRole("dialog", { name: "Record payment" });
    await d.getByLabel("Method").selectOption(method);
    await d.getByLabel("Amount").fill(amount);
    if (reference) await d.getByLabel("Reference number").fill(reference);
    await d.getByRole("button", { name: /^Record ₱/ }).click();
    await expect(d).toBeHidden();
  };
  const second = Math.round(balance / 2 / 100) * 100;
  await pay(peso(second), "maya", `MY${Date.now()}`);
  await expect(page.getByText("Partially paid").first()).toBeVisible();
  await pay(peso(balance - second), "cash", null);
  await expect(page.getByText("Paid", { exact: true }).first()).toBeVisible();

  // Three payments recorded against the sale, visible in the ledger.
  await page.goto(saleUrl);
  for (const method of ["Cash", "Maya"]) await expect(page.getByText(method).first()).toBeVisible();
  await page.goto("/app/payments");
  await expect(page.getByRole("cell", { name: "Maya" }).first()).toBeVisible();
});
