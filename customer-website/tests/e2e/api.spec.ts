import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "./helpers";
import { FIXTURE, resetFixture } from "./helpers";

/* This site's own API routes: origin checks, size limits, validation and the demo-card rule. */

const products = async () => JSON.parse(readFileSync(join(process.cwd(), "tests", "fixtures", "data", "products.json"), "utf8")) as { slug: string; variants: { id: string; priceCents: number }[] }[];

test.describe.configure({ mode: "serial" });

test("checkout refuses other origins, oversized bodies and unapproved demo cards", async ({ request }) => {
  await resetFixture(request);
  const cloth = (await products()).find((p) => p.slug === "microfiber-cloth")!;
  const branch = (await (await request.get(`${FIXTURE}/api/public/v1/site`, { headers: { Authorization: "Bearer test-key" } })).json()).branches[0].id as string;
  const order = {
    idempotencyKey: `test-${Date.now()}`,
    branchId: branch,
    customer: { fullName: "Api Test", email: "api@example.com", phone: "0917 000 0000" },
    items: [{ variantId: cloth.variants[0].id, quantity: 1 }],
    payment: { option: "demo_card", cardBrand: "Visa", cardLast4: "1111" },
    expectedTotalCents: cloth.variants[0].priceCents,
  };
  const foreign = await request.post("/api/checkout", { data: order, headers: { Origin: "https://evil.example" } });
  expect(foreign.status()).toBe(403);
  const big = await request.post("/api/checkout", { data: { ...order, note: "x".repeat(40_000) } });
  expect(big.status()).toBe(413);
  const declined = await request.post("/api/checkout", { data: order });
  expect(declined.status()).toBe(402);
  const ok = await request.post("/api/checkout", { data: { ...order, payment: { option: "demo_card", cardBrand: "Visa", cardLast4: "4242" } } });
  expect(ok.status()).toBe(201);
  const body = await ok.json();
  expect(body.number).toMatch(/^ORD-/);
  expect(body.token).toBeTruthy();
  // Retrying the same checkout returns the same order.
  const again = await request.post("/api/checkout", { data: { ...order, payment: { option: "demo_card", cardBrand: "Visa", cardLast4: "4242" } } });
  expect((await again.json()).number).toBe(body.number);
  const log = (await (await request.get(`${FIXTURE}/__orders`)).json()) as { idempotencyKey: string }[];
  expect(log.filter((o) => o.idempotencyKey === order.idempotencyKey)).toHaveLength(1);
});

test("cart quote validates its input", async ({ request }) => {
  expect((await request.post("/api/cart/quote", { data: { items: [] } })).status()).toBe(400);
  expect((await request.post("/api/cart/quote", { data: { items: [{ variantId: "not-a-uuid", quantity: 1 }] } })).status()).toBe(400);
  expect((await request.post("/api/cart/quote", { data: "nope", headers: { "Content-Type": "application/json" } })).status()).toBe(400);
});

test("order cancel and lookup need the right details", async ({ request }) => {
  expect((await request.post("/api/orders/ORD-000001/cancel", { data: { token: "x" } })).status()).toBe(404);
  expect((await request.post("/api/orders/lookup", { data: { number: "ORD-000001", email: "a@b.c" } })).status()).toBe(404);
  expect((await request.post("/api/orders/lookup", { data: {} })).status()).toBe(400);
});

test("health and revalidate", async ({ request }) => {
  expect(await (await request.get("/api/health")).json()).toEqual({ status: "ok", api: "ok" });
  expect((await request.post("/api/revalidate", { data: { tags: ["site"] } })).status()).toBe(401);
  expect((await request.post("/api/revalidate", { headers: { Authorization: "Bearer test-secret" }, data: { tags: ["nope"] } })).status()).toBe(400);
  expect(await (await request.post("/api/revalidate", { headers: { Authorization: "Bearer test-secret" }, data: { tags: ["catalog"] } })).json()).toEqual({ revalidated: ["catalog"] });
});

test("inquiry: honeypot is dropped silently, valid messages reach the dashboard", async ({ request }) => {
  await request.post(`${FIXTURE}/__inquiries/reset`);
  const ip = { "x-forwarded-for": "203.0.113.77" };
  const spam = await request.post("/api/inquiry", { headers: ip, data: { fullName: "Bot", email: "b@example.com", interest: "other", kind: "contact", website: "http://spam" } });
  expect(spam.status()).toBe(201);
  const real = await request.post("/api/inquiry", { headers: ip, data: { fullName: "Real Person", email: "r@example.com", interest: "frames", kind: "product_inquiry", productName: "Arden 101 (52 · Black)", sourcePage: "/contact", website: "" } });
  expect(real.status(), await real.text()).toBe(201);
  const log = await (await request.get(`${FIXTURE}/__inquiries`)).json();
  expect(log).toHaveLength(1);
  expect(log[0].body).toMatchObject({ fullName: "Real Person", kind: "product_inquiry" });
  expect(log[0].clientIp).toBe("203.0.113.77");
});
