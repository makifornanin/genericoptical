import { chromium } from "@playwright/test";
const BASE = "https://optical-management-dashboard.vercel.app";
const OUT = process.argv[2];
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
await page.goto(`${BASE}/login`);
await page.getByLabel("Email").fill("owner@lensmere.example");
await page.getByLabel("Password").fill("Lensmere-demo-2026");
await page.getByRole("button", { name: "Sign in", exact: true }).click();
await page.waitForURL(/\/app(\/|$|\?)/, { timeout: 60000 });
for (const view of ["overview", "mapping", "log", "endpoints"]) {
  await page.goto(`${BASE}/app/settings?tab=integrations&ghl=${view}`, { waitUntil: "networkidle", timeout: 90000 });
  const text = (await page.locator("main").innerText()).replace(/\n{2,}/g, "\n");
  console.log(`\n===== ${view} =====\n${text.slice(0, 3500)}`);
  await page.screenshot({ path: `${OUT}/ghl-${view}.png`, fullPage: true });
}
await browser.close();
