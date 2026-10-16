import { chromium } from "@playwright/test";
const BASE = process.argv[3] ?? "http://localhost:3000";
const OUT = process.argv[2];
const browser = await chromium.launch();
async function login(page) {
  await page.goto(`${BASE}/login`);
  await page.getByLabel("Email").fill("sales@lensmere.example");
  await page.getByLabel("Password").fill("Lensmere-demo-2026");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.waitForURL(/\/app(\/|$|\?)/, { timeout: 90000 });
}
for (const [name, w, h] of [["desktop", 1440, 900], ["tablet", 820, 1180], ["mobile", 390, 844]]) {
  const page = await browser.newPage({ viewport: { width: w, height: h } });
  await login(page);
  await page.goto(`${BASE}/app/pos`, { waitUntil: "networkidle", timeout: 120000 });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${OUT}/pos-${name}-0.png` });
  // Add a single-option product and a multi-option product.
  const tiles = page.locator("button[data-tile]");
  await tiles.nth(0).click();
  const dlg = page.getByRole("dialog");
  if (await dlg.count()) { await dlg.locator("button:not([disabled])").filter({ hasText: /in stock|Low/ }).first().click().catch(() => {}); await page.keyboard.press("Escape").catch(() => {}); }
  await page.getByRole("tab", { name: /Cleaning|Care|Cases/ }).first().click().catch(() => {});
  await tiles.nth(0).click().catch(() => {});
  await page.waitForTimeout(1200);
  if (name === "mobile") { await page.screenshot({ path: `${OUT}/pos-${name}-1.png` }); await page.getByRole("button", { name: /Review sale/ }).click(); await page.waitForTimeout(600); }
  await page.screenshot({ path: `${OUT}/pos-${name}-2.png` });
  await page.getByRole("button", { name: /^Charge/ }).click();
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${OUT}/pos-${name}-3.png` });
  await page.close();
}
await browser.close();
