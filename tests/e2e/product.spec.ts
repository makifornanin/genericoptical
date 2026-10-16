import { expect, test } from "@playwright/test";
import { asVisitor, uniqueName, waitForInquiry } from "./helpers";

test.describe("product detail", () => {
  test("variants update price, availability and branches", async ({ page }) => {
    await page.goto("/eyewear/arden-101", { waitUntil: "networkidle" });
    await expect(page).toHaveTitle("Arden 101 · Lensmere Optical");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Arden 101");
    const price = page.locator("[data-price]");
    await expect(price).toHaveText("from ₱2,950.00");
    const availability = page.locator("[data-availability]");
    await expect(availability).toContainText("In stock");
    await expect(availability).toContainText("choose one to see where it's available");

    const chips = page.getByRole("group", { name: /Available in/ }).getByRole("button");
    await expect(chips).toHaveCount(4);
    for (const chip of await chips.all()) await expect(chip).toHaveAttribute("aria-pressed", "false");

    await page.getByRole("button", { name: "52 · Black" }).click();
    await expect(page.getByRole("button", { name: "52 · Black" })).toHaveAttribute("aria-pressed", "true");
    await expect(price).toHaveText("₱2,950.00");
    await expect(availability.locator(".oc-tag--pos")).toHaveText("In stock");
    await expect(availability).toContainText("Available at: Makati, Quezon City (low stock)");

    await page.getByRole("button", { name: /54 · Black/ }).click();
    await expect(price).toHaveText("₱3,150.00");
    await expect(availability.locator(".oc-tag--warn")).toHaveText("Low stock");
    await expect(availability).toContainText("Available at: Makati (low stock)");

    await page.getByRole("button", { name: "52 · Tortoise" }).click();
    await expect(availability).toContainText("Out of stock — ask us");
    await expect(availability).toContainText("Not in stock at any branch right now");

    // No checkout anywhere: only "Ask about this" and booking.
    await expect(page.getByText("Online ordering isn't available yet — we'll reserve it for you to try in branch.")).toBeVisible();
    await expect(page.getByRole("button", { name: /buy|add to cart|checkout/i })).toHaveCount(0);
    await expect(page.getByRole("link", { name: /buy|add to cart|checkout/i })).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Book a fitting" })).toHaveAttribute("href", "/book?service=frame_lens_consultation");

    // Related products from the same category.
    await expect(page.getByRole("heading", { name: "More frames" })).toBeVisible();
    await expect(page.locator(".oc-related .oc-product-card")).toHaveCount(4);
  });

  test("made-to-order product and contact-lens booking button", async ({ page }) => {
    await page.goto("/eyewear/aquasoft-toric-monthly-6-pack", { waitUntil: "networkidle" });
    await expect(page.locator("[data-availability]")).toContainText("Made to order");
    await page.getByRole("button", { name: "Power -2.00" }).click();
    await expect(page.locator("[data-availability]")).toContainText("Made to order — we'll order it in for you.");
    await expect(page.getByRole("link", { name: "Book a lens consultation" })).toHaveAttribute("href", "/book?service=contact_lens_consultation");
  });

  test("unknown product is a 404", async ({ page }) => {
    const res = await page.goto("/eyewear/no-such-frame");
    expect(res?.status()).toBe(404);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("We couldn't find that page.");
  });

  test("Ask about this sends a product inquiry with the chosen variant", async ({ page, request }) => {
    const ip = await asVisitor(page);
    const name = uniqueName("Maria Product");
    await page.goto("/eyewear/arden-101", { waitUntil: "networkidle" });
    await page.getByRole("button", { name: "52 · Tortoise" }).click();
    const ask = page.getByRole("button", { name: "Ask about this" });
    await expect(ask).toHaveAttribute("aria-expanded", "false");
    await ask.click();
    await expect(ask).toHaveAttribute("aria-expanded", "true");
    const panel = page.locator("#oc-product-inquiry");
    await expect(panel.locator("[data-asking]")).toHaveText("Arden 101 (52 · Tortoise)");
    await expect(panel.getByLabel("Message")).toHaveValue("I'd like to know more about Arden 101 (52 · Tortoise).");
    await expect(panel.getByLabel("I'm interested in")).toHaveValue("frames");

    // Changing the variant while the form is open follows into the form.
    await page.getByRole("button", { name: "52 · Black" }).click();
    await expect(panel.getByLabel("Message")).toHaveValue("I'd like to know more about Arden 101 (52 · Black).");

    await panel.getByLabel("Full name").fill(name);
    await panel.getByLabel("Email").fill("maria@example.com");
    await panel.getByLabel("Preferred branch").selectOption({ label: "Pasig" });
    await panel.getByLabel("You may text me about this enquiry").check();
    await panel.getByRole("button", { name: "Send message" }).click();
    await expect(panel.getByRole("status")).toContainText(`Thanks, ${name.split(" ")[0]}.`);
    await expect(panel.getByRole("status")).toContainText("We've received your message");

    const logged = await waitForInquiry(request, (i) => i.body.fullName === name);
    expect(logged.body).toMatchObject({
      kind: "product_inquiry",
      productName: "Arden 101 (52 · Black)",
      interest: "frames",
      email: "maria@example.com",
      phone: null,
      smsConsent: true,
      marketingConsent: false,
      sourcePage: "/eyewear/arden-101",
      message: "I'd like to know more about Arden 101 (52 · Black).",
      website: "",
    });
    expect(typeof logged.body.preferredBranchId).toBe("string");
    expect(logged.clientIp).toBe(ip);

    await panel.getByRole("button", { name: "Send another message" }).click();
    await expect(panel.getByLabel("Full name")).toHaveValue("");
  });

  test("validation errors are shown and nothing is sent", async ({ page }) => {
    await asVisitor(page);
    let posted = false;
    page.on("request", (r) => {
      if (r.url().endsWith("/api/inquiry")) posted = true;
    });
    await page.goto("/eyewear/arden-101?ask=1", { waitUntil: "networkidle" });
    const panel = page.locator("#oc-product-inquiry");
    await expect(panel).toBeVisible();
    await panel.getByRole("button", { name: "Send message" }).click();
    await expect(panel.getByText("Please enter your name.")).toBeVisible();
    await expect(panel.getByText("Please give us an email address or a mobile number.")).toBeVisible();
    await expect(panel.getByLabel("Full name")).toBeFocused();
    await expect(panel.getByLabel("Full name")).toHaveAttribute("aria-invalid", "true");

    await panel.getByLabel("Full name").fill("Juan");
    await panel.getByLabel("Mobile number").fill("12");
    await panel.getByRole("button", { name: "Send message" }).click();
    await expect(panel.getByText("Please enter a mobile number with at least 7 digits.")).toBeVisible();
    expect(posted).toBe(false);
  });

  test("field errors from the dashboard are shown on the field", async ({ page }) => {
    await asVisitor(page);
    await page.goto("/eyewear/arden-101?ask=1", { waitUntil: "networkidle" });
    const panel = page.locator("#oc-product-inquiry");
    await panel.getByLabel("Full name").fill("SERVER-REJECT test");
    await panel.getByLabel("Mobile number").fill("+63 900 000 0000");
    await panel.getByRole("button", { name: "Send message" }).click();
    await expect(panel.getByRole("alert")).toHaveText("Please check the highlighted fields.");
    await expect(panel.getByText("This number was rejected by the dashboard.")).toBeVisible();
    await expect(panel.getByLabel("Mobile number")).toHaveAttribute("aria-invalid", "true");
  });
});
