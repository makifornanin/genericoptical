import { expect, test } from "./helpers";
import { addFrameWithLenses, addSimple, asVisitor, fillContact, fixtureOrders, payWithDemoCard, resetFixture } from "./helpers";

// The fixture keeps one order log, so these run one after another.
test.describe.configure({ mode: "serial" });

test.beforeEach(async ({ request, page }) => {
  await resetFixture(request);
  await asVisitor(page);
});

test("demo card: the order reaches the dashboard with the card's last four digits only", async ({ page, request }) => {
  await addFrameWithLenses(page);
  await page.goto("/checkout");
  await fillContact(page, "Andrea Santos");
  await expect(page.getByRole("radio", { name: /Makati/ })).toBeChecked();
  await payWithDemoCard(page);
  await page.getByRole("button", { name: /Place order · ₱4,450/ }).click();
  await page.waitForURL(/\/order\/ORD-\d+\?t=.+&placed=1/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Thank you, Andrea. Your order is in.");
  await expect(page.locator(".tracker")).toContainText("Confirmed");
  await expect(page.getByText("Paid ₱4,450 online with the demo card.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Cancel order" })).toHaveCount(0); // paid orders can't be cancelled online
  // The bag is empty after ordering.
  await expect(page.getByRole("link", { name: "Bag", exact: true })).toBeVisible();

  const order = (await fixtureOrders(request)).find((o) => o.customer.fullName === "Andrea Santos")!;
  expect(order.payment).toMatchObject({ option: "demo_card", cardLast4: "4242", cardBrand: "Visa" });
  expect(order.payment.reference).toMatch(/^DEMO-[A-F0-9]{12}$/);
  expect(order.items).toEqual([expect.objectContaining({ quantity: 1, lensVariantId: expect.any(String), prescription: { mode: "send_later" } })]);
  expect(order.clientIp).toMatch(/^198\.51\.100\./);
  expect(JSON.stringify(order.raw)).not.toMatch(/4242 ?4242 ?4242|cvc|expiry/i);
});

test("pay at pickup, then cancel from the order page", async ({ page }) => {
  await addSimple(page, "hard-shell-case");
  await page.goto("/checkout");
  await fillContact(page, "Bea Cruz");
  await page.getByText("Pay at pickup", { exact: true }).click();
  await page.getByRole("button", { name: /Place order/ }).click();
  await page.waitForURL(/\/order\/ORD-/);
  await expect(page.getByText(/To pay at pickup: ₱350/)).toBeVisible();
  await page.getByRole("button", { name: "Cancel order" }).click();
  await page.getByRole("button", { name: "Yes, cancel order" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toContainText("is cancelled");
});

test("the declined test card and real cards are refused in the browser; nothing is sent", async ({ page, request }) => {
  await addSimple(page, "microfiber-cloth");
  await page.goto("/checkout");
  await fillContact(page, "Declined Card");
  await payWithDemoCard(page, "4000 0000 0000 0002");
  await page.getByRole("button", { name: /Place order/ }).click();
  await expect(page.locator("#err-number")).toContainText("Card declined");
  await payWithDemoCard(page, "4111 1111 1111 1111");
  await page.getByRole("button", { name: /Place order/ }).click();
  await expect(page.locator("#err-number")).toContainText("doesn't take real cards");
  expect((await fixtureOrders(request)).filter((o) => o.customer.fullName === "Declined Card")).toEqual([]);
});

test("field errors are shown next to the fields", async ({ page }) => {
  await addSimple(page, "microfiber-cloth");
  await page.goto("/checkout");
  await page.getByRole("button", { name: /Place order/ }).click();
  await expect(page.locator("#err-fullName")).toBeVisible();
  await expect(page.locator("#err-email")).toBeVisible();
  await expect(page.locator("#err-phone")).toBeVisible();
  await expect(page.getByLabel("Full name")).toHaveAttribute("aria-invalid", "true");
});

test("contact lenses need the prescription confirmation", async ({ page, request }) => {
  await page.goto("/products/clearday-bi-weekly-6-pack");
  await page.getByRole("button", { name: "Add to bag" }).click();
  await page.goto("/checkout");
  await fillContact(page);
  await page.getByText("Pay at pickup", { exact: true }).click();
  const email = await page.getByLabel("Email", { exact: true }).inputValue();
  await page.getByRole("button", { name: /Place order/ }).click();
  await expect(page.locator("#err-contactRx")).toBeVisible();
  await page.getByLabel(/I have a current contact lens prescription/).check();
  await page.getByRole("button", { name: /Place order/ }).click();
  await page.waitForURL(/\/order\/ORD-/);
  const order = (await fixtureOrders(request)).find((o) => o.customer.email === email)!;
  expect(order.raw.contactLensRxConfirmed).toBe(true);
});

test("a price change or a sell-out is reported and nothing is ordered", async ({ page, request }) => {
  await addSimple(page, "microfiber-cloth");
  await page.goto("/checkout");
  await fillContact(page, "PRICE-CHANGE Test");
  await page.getByText("Pay at pickup", { exact: true }).click();
  await page.getByRole("button", { name: /Place order/ }).click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText("Prices changed");
  await page.getByLabel("Full name").fill("SOLD-OUT Test");
  await page.getByRole("button", { name: /Place order/ }).click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText("sold out");
  expect((await fixtureOrders(request)).filter((o) => /PRICE-CHANGE|SOLD-OUT/.test(o.customer.fullName))).toEqual([]);
});

test("find my order with number and email", async ({ page, request }) => {
  await addSimple(page, "retainer-cord");
  await page.goto("/checkout");
  await fillContact(page, "Carlo Reyes");
  const email = await page.getByLabel("Email", { exact: true }).inputValue();
  await page.getByText("Pay at pickup", { exact: true }).click();
  await page.getByRole("button", { name: /Place order/ }).click();
  await page.waitForURL(/\/order\/ORD-/);
  const order = (await fixtureOrders(request)).find((o) => o.customer.email === email)!;
  await page.goto("/order");
  await page.getByLabel("Order number").fill(order.number.toLowerCase());
  await page.getByLabel("Email used at checkout").fill("wrong@example.com");
  await page.getByRole("button", { name: "Find my order" }).click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText("couldn't find");
  await page.getByLabel("Email used at checkout").fill(email);
  await page.getByRole("button", { name: "Find my order" }).click();
  await page.waitForURL(new RegExp(`/order/${order.number}\\?t=`));
  await expect(page.getByRole("heading", { level: 1 })).toContainText(order.number);
  // A wrong token reveals nothing.
  await page.goto(`/order/${order.number}?t=wrong`);
  await expect(page.getByRole("heading", { name: "We couldn't find that order" })).toBeVisible();
});
