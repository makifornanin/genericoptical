import { test as base, expect, type APIRequestContext, type Page } from "@playwright/test";

/** Every e2e test runs with GoHighLevel stubbed (see blockGhl), so no test depends on or reaches GHL. */
export const test = base.extend<{ ghlStub: void }>({
  ghlStub: [
    async ({ page }, use) => {
      await blockGhl(page);
      await use();
    },
    { auto: true },
  ],
});
export { expect };

export const FIXTURE = "http://localhost:3299";
export const SITE_KEY = "test-key";
export const REVALIDATE_SECRET = "test-secret";

/** Every public route (product pages use real catalogue slugs from the fixture snapshot). */
export const PAGES = [
  { id: "home", path: "/" },
  { id: "glasses", path: "/glasses" },
  { id: "sunglasses", path: "/sunglasses" },
  { id: "contact-lenses", path: "/contact-lenses" },
  { id: "accessories", path: "/accessories" },
  { id: "product-frame", path: "/products/arden-101" },
  { id: "product-sun", path: "/products/solenne-riviera" },
  { id: "product-contacts", path: "/products/aquasoft-daily-30-pack" },
  { id: "product-accessory", path: "/products/hard-shell-case" },
  { id: "bag", path: "/bag" },
  { id: "eye-exam", path: "/eye-exam" },
  { id: "stores", path: "/stores" },
  { id: "about", path: "/about" },
  { id: "help", path: "/help" },
  { id: "contact", path: "/contact" },
  { id: "order-lookup", path: "/order" },
  { id: "search", path: "/search?q=round" },
  { id: "privacy", path: "/privacy" },
  { id: "terms", path: "/terms" },
] as const;

export const VIEWPORTS = {
  mobile: { width: 390, height: 844 },
  tablet: { width: 768, height: 1024 },
  desktop: { width: 1280, height: 900 },
  wide: { width: 1440, height: 900 },
};

/**
 * Never let a test reach GoHighLevel: stub its widget URLs (including the account's white-label
 * domain), the embed script and the chat widget's assets.
 */
export async function blockGhl(page: Page) {
  await page.route(/leadconnectorhq\.com|msgsndr\.com|gohighlevel\.com|multiplytalents\.io|fonts\.bunny\.net/, (route) =>
    route.fulfill({ status: 200, contentType: route.request().resourceType() === "script" ? "text/javascript" : "text/html", body: route.request().resourceType() === "script" ? "/* stub */" : "<p>stub</p>" }),
  );
}

/** Console errors (incl. CSP violations and hydration errors) and uncaught page errors. */
export function watchConsole(page: Page): string[] {
  const problems: string[] = [];
  page.on("console", (m) => {
    if (m.type() === "error") problems.push(`console: ${m.text()}`);
  });
  page.on("pageerror", (e) => problems.push(`pageerror: ${e.message}`));
  return problems;
}

let ipCounter = Math.floor(Math.random() * 200);
/** A distinct visitor IP per test, so the site's per-IP limits aren't shared between tests. */
export async function asVisitor(page: Page): Promise<string> {
  ipCounter = (ipCounter + 1) % 250;
  const ip = `198.51.100.${ipCounter + 1}`;
  await page.setExtraHTTPHeaders({ "x-forwarded-for": ip });
  return ip;
}

export async function fixtureOrders(request: APIRequestContext) {
  return (await (await request.get(`${FIXTURE}/__orders`)).json()) as {
    number: string;
    idempotencyKey: string;
    branchId: string;
    customer: { fullName: string; email: string; phone: string };
    items: { variantId: string; quantity: number; lensVariantId?: string | null; prescription?: { mode: string; od?: { sph: string }; os?: { sph: string } } | null }[];
    payment: { option: string; reference?: string; cardLast4?: string; cardBrand?: string };
    raw: Record<string, unknown>;
    clientIp: string | null;
  }[];
}

export async function resetFixture(request: APIRequestContext) {
  await request.post(`${FIXTURE}/__control`, { data: { mode: "ok", ordering: true } });
}

/** Puts one frame with single-vision lenses (prescription sent later) in the bag via the UI. */
export async function addFrameWithLenses(page: Page, slug = "arden-101") {
  await page.goto(`/products/${slug}`);
  await page.getByRole("button", { name: "Select lenses" }).click();
  const drawer = page.getByRole("dialog");
  await drawer.getByRole("radio", { name: /Single vision/ }).click();
  await drawer.getByRole("button", { name: "Next", exact: true }).click();
  await drawer.getByRole("radio", { name: /Standard/ }).click();
  await drawer.getByRole("button", { name: "Next", exact: true }).click();
  await drawer.getByRole("radio", { name: /Send it later/ }).click();
  await drawer.getByRole("button", { name: "Next", exact: true }).click();
  await drawer.getByRole("button", { name: "Add to bag" }).click();
  await expect(page.getByRole("dialog", { name: "Added to your bag" })).toBeVisible();
  await page.getByRole("dialog", { name: "Added to your bag" }).getByRole("button", { name: "Close" }).click();
}

/** Adds a non-prescription item (sunglasses or an accessory) to the bag via the UI. */
export async function addSimple(page: Page, slug: string) {
  await page.goto(`/products/${slug}`);
  await page.getByRole("button", { name: "Add to bag" }).click();
  await expect(page.getByRole("dialog", { name: "Added to your bag" })).toBeVisible();
  await page.getByRole("dialog", { name: "Added to your bag" }).getByRole("button", { name: "Close" }).click();
}

export async function fillContact(page: Page, name = "Andrea Santos") {
  await page.getByLabel("Full name").fill(name);
  await page.getByLabel("Email", { exact: true }).fill(`andrea.${Date.now()}.${Math.floor(Math.random() * 1e6)}@example.com`);
  await page.getByLabel("Mobile number").fill("0917 555 0142");
}

export async function payWithDemoCard(page: Page, number = "4242 4242 4242 4242") {
  await page.getByLabel("Card number").fill(number);
  await page.getByLabel("Expiry").fill("12 / 30");
  await page.getByLabel("Security code").fill("123");
}
