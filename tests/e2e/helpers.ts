import { expect, type APIRequestContext, type Page } from "@playwright/test";

export const FIXTURE = "http://localhost:3299";
export const SITE_KEY = "test-key";
export const REVALIDATE_SECRET = "test-secret";

export interface PageSpec {
  id: string;
  path: string;
  name: string;
}

/** Every route, with the id used for screenshots (matches the GHL-version screenshot names). */
export const PAGES: PageSpec[] = [
  { id: "home", path: "/", name: "Home" },
  { id: "eyewear", path: "/eyewear", name: "Eyewear" },
  { id: "product-detail", path: "/eyewear/arden-101", name: "Product" },
  { id: "services", path: "/services", name: "Services" },
  { id: "booking", path: "/book", name: "Book" },
  { id: "contact", path: "/contact", name: "Contact" },
  { id: "about", path: "/about", name: "About" },
  { id: "faq", path: "/faq", name: "FAQ" },
  { id: "privacy", path: "/privacy", name: "Privacy" },
  { id: "terms", path: "/terms", name: "Terms" },
  { id: "booking-confirmed", path: "/booking-confirmed", name: "Booking confirmed" },
  { id: "thank-you", path: "/thank-you", name: "Thank you" },
];

export const VIEWPORTS = {
  mobile: { width: 390, height: 844 },
  tablet: { width: 768, height: 1024 },
  desktop: { width: 1280, height: 900 },
  wide: { width: 1920, height: 1080 },
};

/** Never let a test reach GoHighLevel: stub the official widget URLs and the embed script. */
export async function blockGhl(page: Page) {
  await page.route(/leadconnectorhq\.com|msgsndr\.com|gohighlevel\.com/, (route) => {
    const isScript = route.request().resourceType() === "script";
    return route.fulfill({
      status: 200,
      contentType: isScript ? "text/javascript" : "text/html",
      body: isScript ? "/* stub */" : "<!doctype html><title>stub</title><p>GHL booking widget (stub)</p>",
    });
  });
}

/** Console errors (incl. CSP violations, hydration errors) and uncaught page errors. */
export function watchConsole(page: Page): string[] {
  const problems: string[] = [];
  page.on("console", (m) => {
    if (m.type() === "error") problems.push(`console: ${m.text()}`);
  });
  page.on("pageerror", (e) => problems.push(`pageerror: ${e.message}`));
  return problems;
}

let ipCounter = Math.floor(Math.random() * 200);
/** A distinct visitor IP per test, so the site's own per-IP limit (5/min) isn't shared between tests. */
export async function asVisitor(page: Page): Promise<string> {
  ipCounter = (ipCounter + 1) % 250;
  const ip = `203.0.113.${ipCounter + 1}`;
  await page.setExtraHTTPHeaders({ "x-forwarded-for": `${ip}, 10.0.0.1` });
  return ip;
}

export interface LoggedInquiry {
  receivedAt: string;
  clientIp: string | null;
  body: Record<string, unknown>;
}

export async function inquiries(request: APIRequestContext): Promise<LoggedInquiry[]> {
  const res = await request.get(`${FIXTURE}/__inquiries`);
  expect(res.ok()).toBe(true);
  return (await res.json()) as LoggedInquiry[];
}

/** Wait until the fixture API has recorded an inquiry matching `match`. */
export async function waitForInquiry(request: APIRequestContext, match: (i: LoggedInquiry) => boolean): Promise<LoggedInquiry> {
  let found: LoggedInquiry | undefined;
  await expect
    .poll(async () => {
      found = (await inquiries(request)).find(match);
      return Boolean(found);
    })
    .toBe(true);
  return found as LoggedInquiry;
}

export async function setFixtureMode(request: APIRequestContext, mode: "ok" | "down") {
  const res = await request.post(`${FIXTURE}/__control`, { data: { mode } });
  expect(res.ok()).toBe(true);
}

export async function revalidate(request: APIRequestContext, tags: string[] = ["site", "catalog"]) {
  const res = await request.post("/api/revalidate", { headers: { Authorization: `Bearer ${REVALIDATE_SECRET}` }, data: { tags } });
  expect(res.status()).toBe(200);
}

export function uniqueName(prefix: string): string {
  return `${prefix} ${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`;
}
