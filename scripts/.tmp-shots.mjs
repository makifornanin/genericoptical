import { chromium } from "@playwright/test";
const [out, ...targets] = process.argv.slice(2);
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36", locale: "en-US" });
for (const t of targets) {
  const [name, url, scrolls = "3"] = t.split("|");
  const page = await ctx.newPage();
  try {
    const res = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45000 });
    await page.waitForTimeout(3500);
    const title = await page.title();
    console.log(`${name}: HTTP ${res?.status()} · ${title.slice(0, 80)} · ${page.url().slice(0, 90)}`);
    for (let i = 0; i < Number(scrolls); i++) {
      await page.screenshot({ path: `${out}/${name}-${i}.png` });
      await page.mouse.wheel(0, 850);
      await page.waitForTimeout(1200);
    }
  } catch (e) {
    console.log(`${name}: FAILED ${String(e).slice(0, 120)}`);
  }
  await page.close();
}
await browser.close();
