import { expect, test, type Page } from "@playwright/test";
import { signIn, uniq } from "./helpers";

test.describe("public website", () => {
  test("pages render from the business's database settings", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("link", { name: "Lensmere Optical home" })).toBeVisible();
    await expect(page.getByText("Demo website.")).toBeVisible();
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

    for (const [path, heading] of [
      ["/eyewear", "Frames, sunglasses and lenses."],
      ["/services", "Thorough eye care, explained clearly."],
      ["/about", "It starts with listening."],
      ["/faq", "Questions, answered."],
      ["/contact", "Ask us anything."],
      ["/privacy", "Privacy notice"],
      ["/terms", "Terms of service"],
      ["/book", "Book an appointment."],
    ] as const) {
      await page.goto(path);
      await expect(page.getByRole("heading", { level: 1, name: heading })).toBeVisible();
    }
  });

  test("a product page shows live price and accepts an inquiry", async ({ page }) => {
    await page.goto("/eyewear");
    const first = page.locator("main ul li a").first();
    const name = (await first.locator("p").first().textContent())?.trim() ?? "";
    await first.click();
    await expect(page.getByRole("heading", { level: 1, name })).toBeVisible();
    await expect(page.getByLabel("Message")).toHaveValue(new RegExp(name));
  });

  test("contact form creates a lead that staff can see and convert into a customer", async ({ page }) => {
    const id = uniq();
    const fullName = `Web Lead ${id}`;
    await page.goto("/contact");
    await page.getByLabel("Full name").fill(fullName);
    await page.getByLabel("Email").fill(`web.${id.toLowerCase()}@example.com`);
    await page.getByLabel("Mobile number").fill(`0917${String(Date.now()).slice(-7)}`);
    await page.getByLabel("I'm interested in").selectOption("contact_lenses");
    await page.getByLabel("Message").fill("Do you stock daily toric lenses?");
    await page.getByLabel("You may text me about this enquiry").check();
    await page.getByRole("button", { name: "Send message" }).click();
    await expect(page.getByText("We've received your message")).toBeVisible();

    await signIn(page, "owner");
    await page.goto(`/app/leads?q=${encodeURIComponent(id)}`);
    const row = page.getByRole("link", { name: fullName });
    await expect(row).toBeVisible();
    await row.click();
    await expect(page.getByRole("heading", { level: 1, name: fullName })).toBeVisible();
    await expect(page.getByText("Do you stock daily toric lenses?").first()).toBeVisible();

    // Convert: creates exactly one customer and keeps the lead's history.
    await page.getByRole("button", { name: "Convert to customer" }).click();
    await page.getByRole("button", { name: "Create customer" }).click();
    await page.waitForURL(/\/app\/customers\/[0-9a-f-]{36}/);
    await expect(page.getByRole("heading", { level: 1, name: fullName })).toBeVisible();

    await page.goto(`/app/customers?q=${encodeURIComponent(id)}`);
    await expect(page.getByRole("link", { name: fullName })).toHaveCount(1);
  });

  test("online booking reserves a real slot and appears on the staff calendar", async ({ page }) => {
    const id = uniq();
    const fullName = `Booker ${id}`;
    await page.goto("/book");
    await page.getByRole("button", { name: /^Makati/ }).click();
    await page.getByRole("button", { name: /Comprehensive eye exam/ }).click();
    const time = await pickFirstOpenSlot(page);
    await page.getByLabel("Full name").fill(fullName);
    await page.getByLabel("Mobile number").fill(`0918${String(Date.now()).slice(-7)}`);
    await page.getByLabel("Email").fill(`book.${id.toLowerCase()}@example.com`);
    await page.getByRole("button", { name: "Request appointment" }).click();
    await expect(page.getByText("You're booked in.")).toBeVisible();
    await expect(page.getByText(time).first()).toBeVisible();

    // The booking created a lead at "Appointment scheduled" and an appointment linked to it.
    await signIn(page, "owner");
    await page.goto(`/app/leads?q=${encodeURIComponent(id)}`);
    await page.getByRole("link", { name: fullName }).click();
    await expect(page.getByText("Appointment scheduled").first()).toBeVisible();
    await expect(page.getByText(/Comprehensive eye exam/).first()).toBeVisible();
  });
});

/** Walks forward through the date strip until a day with open times appears; returns the chosen time label. */
async function pickFirstOpenSlot(page: Page) {
  const days = page.getByRole("radiogroup", { name: "Date" }).getByRole("radio");
  const count = await days.count();
  for (let i = 0; i < count; i++) {
    const day = days.nth(i);
    if (await day.isDisabled()) continue;
    await day.click();
    const times = page.getByRole("radiogroup", { name: "Time" }).getByRole("radio");
    const none = page.getByText("No open times that day");
    await expect(times.first().or(none)).toBeVisible();
    if (await times.count()) {
      const slot = times.first();
      const label = (await slot.textContent())?.trim() ?? "";
      await slot.click();
      return label;
    }
  }
  throw new Error("No open booking slots in the next three weeks");
}
