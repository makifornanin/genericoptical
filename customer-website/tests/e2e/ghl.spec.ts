import { addSimple, expect, test } from "./helpers";

/* The business's own GoHighLevel embeds (stubbed in tests): inquiry form, booking calendar, chat. */

const FORM_ID = "2f3PtQjuRm0033NMwe58";
const CALENDAR_ID = "dOUtJja6Y2Le44UeYpuE";
const CHAT_ID = "6ad705dce19e4c46e8007fb6";

test("contact page embeds the GoHighLevel inquiry form", async ({ page }) => {
  await page.goto("/contact?product=Arden%20101");
  const form = page.locator(`iframe#inline-${FORM_ID}`);
  await expect(form).toHaveAttribute("src", `https://api.multiplytalents.io/widget/form/${FORM_ID}`);
  await expect(form).toHaveAttribute("title", "General Inquiry");
  await expect(form).toHaveAttribute("data-form-id", FORM_ID);
  await expect(page.getByText("Mention the frame in your message")).toBeVisible();
  // GHL's sizing script is loaded from the account's domain.
  await expect(page.locator('script[src="https://api.multiplytalents.io/js/form_embed.js"]')).toHaveCount(1);
});

test("eye exam embeds the GoHighLevel booking calendar when the dashboard maps none", async ({ page }) => {
  await page.goto("/eye-exam");
  const calendar = page.locator("iframe#ghl-booking-calendar");
  await expect(calendar).toHaveAttribute("src", `https://api.multiplytalents.io/widget/booking/${CALENDAR_ID}`);
  await expect(calendar).toHaveAttribute("title", "Book an appointment");
  await expect(page.getByText("Pick a time in the calendar below.")).toBeVisible();
});

test("the chat widget loads on shop pages but never on checkout", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator(`script[data-widget-id="${CHAT_ID}"]`)).toHaveCount(1, { timeout: 15_000 });
  await addSimple(page, "microfiber-cloth");
  // A fresh load of the checkout: the widget script is never added there.
  await page.goto("/checkout");
  await expect(page.getByRole("heading", { name: /Checkout/i })).toBeVisible();
  await page.waitForTimeout(1500);
  await expect(page.locator(`script[data-widget-id="${CHAT_ID}"]`)).toHaveCount(0);
  await expect(page.locator("html")).toHaveAttribute("data-hide-chat", "");
});

test("security policy allows only the GoHighLevel origins the embeds need", async ({ request }) => {
  const csp = (await request.get("/contact")).headers()["content-security-policy"];
  expect(csp).toContain("frame-src https://*.leadconnectorhq.com https://*.msgsndr.com https://api.multiplytalents.io");
  expect(csp).toMatch(/script-src [^;]*https:\/\/api\.multiplytalents\.io https:\/\/\*\.leadconnectorhq\.com/);
  expect(csp).toMatch(/font-src 'self' https:\/\/\*\.leadconnectorhq\.com https:\/\/fonts\.bunny\.net/);
  expect(csp).not.toMatch(/script-src[^;]*\shttps:(\s|;)/);
});
