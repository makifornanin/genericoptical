#!/usr/bin/env node
/*
 * Side-by-side comparison of the superseded GHL-builder version (screenshots/ghl-version/) with
 * this Next.js app (screenshots/{desktop,mobile}/) — run `npm run screenshots` first.
 *   → screenshots/compare/<page>-desktop.png and -mobile.png
 */
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const OLD = join(ROOT, "screenshots", "ghl-version");
const OUT = join(ROOT, "screenshots", "compare");
const IDS = ["home", "eyewear", "product-detail", "services", "booking", "contact", "about", "faq", "privacy", "terms", "booking-confirmed", "thank-you"];

mkdirSync(OUT, { recursive: true });
const data = (f) => `data:image/png;base64,${readFileSync(f).toString("base64")}`;
const browser = await chromium.launch();
const page = await browser.newPage({ deviceScaleFactor: 1 });

for (const id of IDS) {
  for (const [kind, colWidth] of [
    ["desktop", 720],
    ["mobile", 390],
  ]) {
    const a = join(OLD, kind, `${id}.png`);
    const b = join(ROOT, "screenshots", kind, `${id}.png`);
    if (!existsSync(a) || !existsSync(b)) continue;
    await page.setViewportSize({ width: colWidth * 2 + 72, height: 800 });
    await page.setContent(`<!doctype html><style>
      body{margin:0;padding:24px;background:#e9e9e4;font:600 14px/1.4 system-ui;color:#18191b}
      .row{display:grid;grid-template-columns:${colWidth}px ${colWidth}px;gap:24px;align-items:start}
      p{margin:0 0 8px} img{display:block;width:${colWidth}px;box-shadow:0 1px 0 #d5d5cf}
    </style><div class="row"><div><p>GHL-builder version (${kind})</p><img src="${data(a)}"></div>
    <div><p>Next.js app, fixture data (${kind})</p><img src="${data(b)}"></div></div>`);
    await page.evaluate(() => Promise.all([...document.images].map((i) => i.decode())));
    await page.screenshot({ path: join(OUT, `${id}-${kind}.png`), fullPage: true });
    console.log("saved", `screenshots/compare/${id}-${kind}.png`);
  }
}
await browser.close();
