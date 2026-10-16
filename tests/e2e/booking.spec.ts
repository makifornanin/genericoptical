import { expect, test } from "@playwright/test";
import { asVisitor, blockGhl, uniqueName, waitForInquiry, watchConsole } from "./helpers";

const WIDGET = "https://api.leadconnectorhq.com/widget/booking/FixtureEyeExamMKT01";

test.describe("booking", () => {
  test("a branch with a GoHighLevel calendar shows the official booking widget", async ({ page }) => {
    await blockGhl(page);
    const problems = watchConsole(page);
    const scripts: string[] = [];
    page.on("request", (r) => {
      if (r.resourceType() === "script" && r.url().includes("msgsndr.com")) scripts.push(r.url());
    });
    await page.goto("/book", { waitUntil: "networkidle" });
    // Defaults: first branch (Makati) and first service (eye exam) — the mapped calendar.
    await expect(page.getByRole("button", { name: /^Makati/ })).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByRole("button", { name: /^Comprehensive eye exam/ })).toHaveAttribute("aria-pressed", "true");
    const iframe = page.locator("[data-booking-widget] iframe");
    await expect(iframe).toHaveAttribute("src", WIDGET);
    await expect(iframe).toHaveAttribute("title", "Book an appointment — Comprehensive eye exam · Makati");
    await expect(page.locator("[data-booking-request]")).toHaveCount(0);
    expect(scripts).toEqual(["https://link.msgsndr.com/js/form_embed.js"]);
    await expect(page).toHaveURL(/branch=mkt/);
    await expect(page).toHaveURL(/service=eye_exam/);
    // Aside: hours and phone of the chosen branch.
    await expect(page.locator(".oc-booking-aside")).toContainText("Opening hours · Makati");
    await expect(page.locator(".oc-booking-aside__phone")).toHaveText("+63 2 8000 0101");
    expect(problems).toEqual([]);
  });

  test("deep link to a branch without a calendar shows the setup state and a request form", async ({ page }) => {
    await blockGhl(page);
    await page.goto("/book?branch=QC&service=eye_exam", { waitUntil: "networkidle" });
    await expect(page.getByRole("button", { name: /^Quezon City/ })).toHaveAttribute("aria-pressed", "true");
    await expect(page.locator("[data-booking-widget]")).toHaveCount(0);
    await expect(page.getByRole("status").filter({ hasText: "Comprehensive eye exam" })).toContainText("Online booking for our Quezon City branch isn't connected yet.");
    await expect(page.getByRole("heading", { name: "Request an appointment" })).toBeVisible();
    await expect(page.locator("[data-booking-request]")).toContainText("your appointment isn't booked until we confirm it");
    await expect(page.getByLabel("Preferred branch")).toHaveValue(/.+/);

    // Switching to Makati brings the widget back, and the URL follows.
    await page.getByRole("button", { name: /^Makati/ }).click();
    await expect(page.locator("[data-booking-widget] iframe")).toHaveAttribute("src", WIDGET);
    await expect(page).toHaveURL(/branch=mkt/);

    // A service without any calendar shows the request form everywhere.
    await page.getByRole("button", { name: /^Contact lens consultation/ }).click();
    await expect(page.locator("[data-booking-widget]")).toHaveCount(0);
    await expect(page).toHaveURL(/service=contact_lens_consultation/);
  });

  test("an appointment request creates a lead (not a booking)", async ({ page, request }) => {
    await blockGhl(page);
    const ip = await asVisitor(page);
    const name = uniqueName("Rosa Request");
    await page.goto("/book?branch=psg&service=contact_lens_consultation", { waitUntil: "networkidle" });
    const form = page.getByRole("form", { name: /Request an appointment/ });
    await expect(form.getByLabel("I'm interested in")).toHaveValue("contact_lenses");
    await form.getByLabel("Full name").fill(name);
    await form.getByLabel("Email").fill("rosa@example.com");
    await form.getByLabel("Message").fill("Weekday mornings work best.");
    await form.getByRole("button", { name: "Send request" }).click();
    await expect(page.locator("[data-inquiry-sent]")).toContainText("We'll call you to confirm a time — your appointment isn't booked until we do.");

    const logged = await waitForInquiry(request, (i) => i.body.fullName === name);
    expect(logged.body).toMatchObject({
      kind: "appointment_request",
      interest: "contact_lenses",
      sourcePage: "/book",
      message: "Appointment request: Contact lens consultation · Pasig.\n\nWeekday mornings work best.",
    });
    expect(typeof logged.body.preferredBranchId).toBe("string");
    expect(logged.clientIp).toBe(ip);
  });

  test("unknown deep-link values fall back to the defaults", async ({ page }) => {
    await blockGhl(page);
    await page.goto("/book?branch=nowhere&service=nothing", { waitUntil: "networkidle" });
    await expect(page.getByRole("button", { name: /^Makati/ })).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByRole("button", { name: /^Comprehensive eye exam/ })).toHaveAttribute("aria-pressed", "true");
  });
});
