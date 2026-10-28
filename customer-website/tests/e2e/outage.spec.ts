import { expect, test } from "./helpers";
import { FIXTURE } from "./helpers";

/*
 * Runs alone, after every other test (project "outage"): it switches the fixture dashboard off and
 * turns ordering off, which would disturb tests running in parallel.
 */

const revalidate = (request: import("@playwright/test").APIRequestContext) => request.post("/api/revalidate", { headers: { Authorization: "Bearer test-secret" }, data: { tags: ["site", "catalog"] } });

test.describe.configure({ mode: "serial" });

test("when ordering is switched off, products ask the branch instead and checkout is closed", async ({ page, request }) => {
  await request.post(`${FIXTURE}/__control`, { data: { ordering: false } });
  await revalidate(request);
  try {
    await page.goto("/products/hard-shell-case");
    await expect(page.getByRole("link", { name: /Ask about this item/ })).toBeVisible();
    await expect(page.getByRole("button", { name: "Add to bag" })).toHaveCount(0);
    await page.goto("/checkout");
    await expect(page.getByRole("heading", { name: "Online ordering is paused" })).toBeVisible();
  } finally {
    await request.post(`${FIXTURE}/__control`, { data: { ordering: true } });
    await revalidate(request);
  }
});

test("dashboard down: cached pages keep working, uncached ones say so, checkout fails gracefully", async ({ page, request }) => {
  // Warm the cache, then take the dashboard down.
  await page.goto("/glasses");
  await request.post(`${FIXTURE}/__control`, { data: { mode: "down" } });
  try {
    // The last good copy is served while the dashboard is down.
    const res = await page.goto("/glasses");
    expect(res?.status()).toBe(200);
    await expect(page.locator(".tile").first()).toBeVisible();
    // After an on-demand revalidation there is no good copy: friendly state, no crash.
    await revalidate(request);
    const after = await page.goto("/glasses");
    expect(after?.status()).toBe(200);
    await expect(page.getByRole("heading", { name: /isn't available right now/ })).toBeVisible();
    // The bag's live price check reports the problem instead of breaking.
    const quote = await request.post("/api/cart/quote", { data: { items: [{ variantId: "00000000-0000-4000-8000-000000000000", quantity: 1 }] } });
    expect(quote.status()).toBe(503);
    expect((await quote.json()).error).toMatch(/try again/i);
  } finally {
    await request.post(`${FIXTURE}/__control`, { data: { mode: "ok" } });
    await revalidate(request);
  }
  await expect.poll(async () => (await page.goto("/glasses"))?.status()).toBe(200);
  await expect(page.locator(".tile").first()).toBeVisible();
});
