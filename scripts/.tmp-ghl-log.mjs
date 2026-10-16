import { chromium } from "@playwright/test";
const BASE = "https://optical-management-dashboard.vercel.app";
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1600, height: 1200 } });
await page.goto(`${BASE}/login`);
await page.getByLabel("Email").fill("owner@lensmere.example");
await page.getByLabel("Password").fill("Lensmere-demo-2026");
await page.getByRole("button", { name: "Sign in", exact: true }).click();
await page.waitForURL(/\/app(\/|$|\?)/, { timeout: 60000 });
if (process.argv.includes("--sync")) {
  await page.goto(`${BASE}/app/settings?tab=integrations&ghl=overview`, { waitUntil: "networkidle", timeout: 90000 });
  await page.getByRole("button", { name: "Sync now" }).click();
  const toast = page.locator("[data-sonner-toast]").first();
  await toast.waitFor({ timeout: 120000 });
  console.log("sync now:", (await toast.innerText()).replace(/\n/g, " "));
}
await page.goto(`${BASE}/app/settings?tab=integrations&ghl=log`, { waitUntil: "networkidle", timeout: 90000 });
const rows = await page.locator("table tbody tr").all();
console.log("=== SYNC LOG (latest first) ===");
for (const r of rows.slice(0, Number(process.argv[2] ?? 8))) console.log((await r.innerText()).replace(/\s*\n\s*/g, " | ").slice(0, 400));
await browser.close();
