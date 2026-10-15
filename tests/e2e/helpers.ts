import { expect, type Page } from "@playwright/test";

export const DEMO_PASSWORD = "Lensmere-demo-2026";
export type DemoRole = "owner" | "manager" | "sales" | "inventory" | "optometrist";

export async function signIn(page: Page, role: DemoRole) {
  await page.context().clearCookies();
  await page.goto("/login");
  await page.getByLabel("Email").fill(`${role}@lensmere.example`);
  await page.getByLabel("Password").fill(DEMO_PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL(/\/app(\/|$|\?)/);
}

/** A short unique suffix so repeated runs never collide with earlier records. */
export function uniq() {
  return `${Date.now().toString(36)}${Math.floor(Math.random() * 1e4).toString(36)}`.toUpperCase();
}

/** Reads a money string like "₱1,234.50" as centavos. */
export function cents(text: string | null) {
  const n = Number((text ?? "").replace(/[^0-9.-]/g, ""));
  return Math.round(n * 100);
}

export async function expectToast(page: Page, text: string | RegExp) {
  await expect(page.locator("[data-sonner-toast]").filter({ hasText: text }).first()).toBeVisible();
}
