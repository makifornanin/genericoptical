#!/usr/bin/env node
/*
 * Side-by-side comparison of the original website screenshots (customer-website-reference/, in the
 * dashboard repository) with this rebuild (screenshots/desktop and /mobile) — preview tooling only.
 *   node previews/tools/compare.mjs [--reference=path/to/customer-website-reference/screenshots]
 *   → screenshots/compare/<page>-desktop.png and -mobile.png
 */
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const args = Object.fromEntries(process.argv.slice(2).map((a) => a.replace(/^--/, "").split("=")));
const REF = resolve(args.reference || join(ROOT, "..", "generic eye", "customer-website-reference", "screenshots"));
const OUT = join(ROOT, "screenshots", "compare");
// original screenshot name → this project's page id
const MAP = { home: "home", about: "about", products: "eyewear", "product-detail": "product-detail", services: "services", booking: "booking", contact: "contact", faq: "faq", privacy: "privacy", terms: "terms" };

if (!existsSync(REF)) {
  console.error(`Reference screenshots not found at ${REF} (pass --reference=…)`);
  process.exit(1);
}
mkdirSync(OUT, { recursive: true });
const data = (f) => `data:image/png;base64,${readFileSync(f).toString("base64")}`;
const browser = await chromium.launch();
const page = await browser.newPage({ deviceScaleFactor: 1 });

for (const [orig, id] of Object.entries(MAP)) {
  for (const [kind, colWidth] of [["desktop", 720], ["mobile", 390]]) {
    const a = join(REF, `${orig}-${kind}.png`);
    const b = join(ROOT, "screenshots", kind, `${id}.png`);
    if (!existsSync(a) || !existsSync(b)) continue;
    await page.setViewportSize({ width: colWidth * 2 + 72, height: 800 });
    await page.setContent(`<!doctype html><style>
      body{margin:0;padding:24px;background:#e9e9e4;font:600 14px/1.4 system-ui;color:#18191b}
      .row{display:grid;grid-template-columns:${colWidth}px ${colWidth}px;gap:24px;align-items:start}
      p{margin:0 0 8px} img{display:block;width:${colWidth}px;box-shadow:0 1px 0 #d5d5cf}
    </style><div class="row"><div><p>Original (Next.js public site, ${kind})</p><img src="${data(a)}"></div>
    <div><p>GHL-ready rebuild (${kind})</p><img src="${data(b)}"></div></div>`);
    await page.evaluate(() => Promise.all([...document.images].map((i) => i.decode())));
    await page.screenshot({ path: join(OUT, `${id}-${kind}.png`), fullPage: true });
    console.log("saved", `screenshots/compare/${id}-${kind}.png`);
  }
}
await browser.close();
