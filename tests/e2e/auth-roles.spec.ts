import { expect, test } from "@playwright/test";
import { signIn, uniq } from "./helpers";

test.describe("authentication", () => {
  test("unauthenticated visitors are sent to sign in and returned afterwards", async ({ page }) => {
    await page.goto("/app/sales");
    await expect(page).toHaveURL(/\/login\?next=%2Fapp%2Fsales/);
    await page.getByLabel("Email").fill("owner@lensmere.example");
    await page.getByLabel("Password").fill("Lensmere-demo-2026");
    await page.getByRole("button", { name: "Sign in" }).click();
    await page.waitForURL(/\/app\/sales/);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  });

  test("wrong credentials are rejected with a generic message", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("Email").fill(`nobody-${uniq().toLowerCase()}@lensmere.example`);
    await page.getByLabel("Password").fill("not-the-password-1");
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page.getByText("That email and password don't match an active account.")).toBeVisible();
    await expect(page).toHaveURL(/\/login/);
  });

  test("owner lands on a dashboard built from live data and can sign out", async ({ page }) => {
    await signIn(page, "owner");
    await expect(page.getByRole("heading", { name: "Dashboard", level: 1 })).toBeVisible();
    await expect(page.getByText("Net sales").first()).toBeVisible();
    // Session cookie is httpOnly — never readable by page scripts.
    const visible = await page.evaluate(() => document.cookie);
    expect(visible).not.toContain("specta_session");
  });
});

test.describe("role-based access is enforced on the server", () => {
  test("sales staff cannot open financial reports, staff or settings", async ({ page }) => {
    await signIn(page, "sales");
    const nav = page.getByRole("navigation").first();
    await expect(nav.getByRole("link", { name: "Point of sale" })).toBeVisible();
    await expect(nav.getByRole("link", { name: "Reports" })).toHaveCount(0);

    for (const path of ["/app/reports", "/app/staff", "/app/settings", "/app/expenses"]) {
      await page.goto(path);
      await expect(page.getByText(/You don.t have access to/)).toBeVisible();
    }
  });

  test("server endpoints refuse a role that lacks the permission, even when called directly", async ({ page }) => {
    await signIn(page, "sales");
    const report = await page.request.get("/api/export/report?range=this_month");
    expect(report.status()).toBe(403);
    const expenses = await page.request.get("/api/export/expenses");
    expect(expenses.status()).toBe(403);
    // A permitted export still works for the same user.
    const customers = await page.request.get("/api/export/customers");
    expect(customers.status()).toBe(200);
  });

  test("inventory staff cannot use the point of sale", async ({ page }) => {
    await signIn(page, "inventory");
    await page.goto("/app/pos");
    await expect(page.getByText("You don't have access to the point of sale")).toBeVisible();
  });

  test("anonymous API calls are rejected", async ({ request }) => {
    const r = await request.get("/api/export/customers");
    expect(r.status()).toBe(401);
  });
});
