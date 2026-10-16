import { expect, test } from "@playwright/test";
import { asVisitor, FIXTURE, inquiries, uniqueName, waitForInquiry } from "./helpers";

test.describe("contact form", () => {
  test("sends a contact inquiry to the dashboard through /api/inquiry", async ({ page, request }) => {
    const ip = await asVisitor(page);
    const name = uniqueName("Ana Contact");
    await page.goto("/contact", { waitUntil: "networkidle" });
    const form = page.getByRole("form", { name: "Website inquiry form" });
    await form.getByLabel("Full name").fill(name);
    await form.getByLabel("Mobile number").fill("+63 917 555 0101");
    await form.getByLabel("I'm interested in").selectOption({ label: "Contact lenses" });
    await form.getByLabel("Preferred branch").selectOption({ label: "Quezon City" });
    await form.getByLabel("Message").fill("Do you stock daily toric lenses?");
    await form.getByLabel("Send me occasional offers and eye-care reminders").check();
    await form.getByRole("button", { name: "Send message" }).click();

    const done = page.locator("[data-inquiry-sent]");
    await expect(done).toBeVisible();
    await expect(done).toBeFocused();
    await expect(done.locator(".oc-form-done__title")).toHaveText(`Thanks, ${name.split(" ")[0]}.`);
    await expect(done.locator(".oc-form-done__body")).toHaveText("We've received your message and will reply usually within one business day. If it's urgent, call us on +63 2 8000 0100.");

    const logged = await waitForInquiry(request, (i) => i.body.fullName === name);
    expect(logged.body).toMatchObject({
      kind: "contact",
      interest: "contact_lenses",
      email: null,
      phone: "+63 917 555 0101",
      message: "Do you stock daily toric lenses?",
      marketingConsent: true,
      smsConsent: false,
      productName: null,
      sourcePage: "/contact",
    });
    expect(logged.clientIp).toBe(ip);
  });

  test("a dashboard rate limit shows a friendly message with the phone number", async ({ page }) => {
    await asVisitor(page);
    await page.goto("/contact", { waitUntil: "networkidle" });
    const form = page.getByRole("form", { name: "Website inquiry form" });
    await form.getByLabel("Full name").fill("RATE-LIMIT-ME test");
    await form.getByLabel("Email").fill("limit@example.com");
    await form.getByRole("button", { name: "Send message" }).click();
    const alert = form.getByRole("alert");
    await expect(alert).toContainText("You've sent several messages in a short time");
    await expect(alert.getByRole("link", { name: "+63 2 8000 0100" })).toHaveAttribute("href", "tel:+63280000100");
  });

  test("an unreachable dashboard shows 'please call us'", async ({ page }) => {
    await asVisitor(page);
    await page.route("**/api/inquiry", (route) => route.fulfill({ status: 502, contentType: "application/json", body: JSON.stringify({ ok: false, code: "unavailable" }) }));
    await page.goto("/contact", { waitUntil: "networkidle" });
    const form = page.getByRole("form", { name: "Website inquiry form" });
    await form.getByLabel("Full name").fill("Down test");
    await form.getByLabel("Email").fill("down@example.com");
    await form.getByRole("button", { name: "Send message" }).click();
    await expect(form.getByRole("alert")).toContainText("We couldn't send your message right now — please call us on +63 2 8000 0100.");
  });

  test("direct contact details and branches", async ({ page }) => {
    await page.goto("/contact");
    await expect(page.getByRole("link", { name: "+63 2 8000 0100" }).first()).toHaveAttribute("href", "tel:+63280000100");
    await expect(page.getByRole("link", { name: "hello@lensmere.example" }).first()).toHaveAttribute("href", "mailto:hello@lensmere.example");
    await expect(page.locator(".oc-contact-branch")).toHaveCount(3);
    await expect(page.locator(".oc-contact-branch").first()).toContainText("Mon – Sat 10am – 7pm · Sun 11am – 5pm");
  });
});

test.describe("POST /api/inquiry", () => {
  const valid = {
    fullName: "Api Test",
    email: "api@example.com",
    phone: null,
    interest: "other",
    preferredBranchId: null,
    message: null,
    smsConsent: false,
    marketingConsent: false,
    kind: "contact",
    productName: null,
    sourcePage: "/contact",
    website: "",
  };

  test("rejects invalid input with field errors (not forwarded)", async ({ request }) => {
    const before = (await inquiries(request)).length;
    const res = await request.post("/api/inquiry", {
      headers: { "x-forwarded-for": "198.51.100.10" },
      data: { ...valid, fullName: "", email: "not-an-email", interest: "x" },
    });
    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.fieldErrors).toMatchObject({ fullName: "Please enter your name.", email: "Please enter a valid email address." });
    expect(body.fieldErrors.interest).toBeTruthy();
    expect(JSON.stringify(body)).not.toMatch(/test-key|Bearer/);
    expect((await inquiries(request)).length).toBe(before);
  });

  test("requires an email or a phone number", async ({ request }) => {
    const res = await request.post("/api/inquiry", { headers: { "x-forwarded-for": "198.51.100.11" }, data: { ...valid, email: "", phone: "" } });
    expect(res.status()).toBe(400);
    expect((await res.json()).fieldErrors.email).toBe("Please give us an email address or a mobile number.");
  });

  test("honeypot: answers 201 but forwards nothing", async ({ request }) => {
    const name = uniqueName("Bot");
    const res = await request.post("/api/inquiry", { headers: { "x-forwarded-for": "198.51.100.12" }, data: { ...valid, fullName: name, website: "https://spam.example" } });
    expect(res.status()).toBe(201);
    expect(await res.json()).toEqual({ ok: true });
    const log = await (await request.get(`${FIXTURE}/__inquiries`)).json();
    expect(log.some((i: { body: { fullName: string } }) => i.body.fullName === name)).toBe(false);
  });

  test("per-IP limit: the 6th request in a minute gets 429", async ({ request }) => {
    const headers = { "x-forwarded-for": "198.51.100.77" };
    const statuses: number[] = [];
    for (let i = 0; i < 6; i++) {
      // Invalid bodies are enough to count against the limit (and nothing is forwarded).
      statuses.push((await request.post("/api/inquiry", { headers, data: { ...valid, fullName: "" } })).status());
    }
    expect(statuses.slice(0, 5)).toEqual([400, 400, 400, 400, 400]);
    expect(statuses[5]).toBe(429);
    const res = await request.post("/api/inquiry", { headers, data: valid });
    expect(res.status()).toBe(429);
    expect(res.headers()["retry-after"]).toMatch(/^\d+$/);
    expect((await res.json()).code).toBe("rate_limited");
  });

  test("rejects cross-origin browser posts and oversized bodies", async ({ request }) => {
    const cross = await request.post("/api/inquiry", { headers: { origin: "https://evil.example", "x-forwarded-for": "198.51.100.13" }, data: valid });
    expect(cross.status()).toBe(403);
    const big = await request.post("/api/inquiry", { headers: { "x-forwarded-for": "198.51.100.14" }, data: { ...valid, message: "x".repeat(20_000) } });
    expect(big.status()).toBe(413);
    const notJson = await request.post("/api/inquiry", { headers: { "content-type": "application/json", "x-forwarded-for": "198.51.100.15" }, data: "{nope" });
    expect(notJson.status()).toBe(400);
  });
});
