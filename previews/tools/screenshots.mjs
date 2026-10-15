#!/usr/bin/env node
/*
 * Full-page screenshots of every preview page at four widths, plus key interaction states and the
 * white-label example (preview tooling only). Needs the preview server (node serve.mjs) running or
 * starts nothing itself — run `npm run screenshots` from previews/ (it builds first).
 *   → screenshots/{mobile,tablet,desktop,wide}/<page>.png, screenshots/states/*.png,
 *     screenshots/white-label/*.png
 * GHL requests are stubbed: native forms/calendars appear as their labelled placeholders.
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const BASE = process.env.PREVIEW_URL || "http://localhost:4310/previews/";
const OUT = join(ROOT, "screenshots");
const pages = JSON.parse(readFileSync(join(ROOT, "pages", "pages.json"), "utf8")).pages;
const SIZES = { mobile: [390, 844], tablet: [768, 1024], desktop: [1440, 900], wide: [1920, 1080] };

execFileSync(process.execPath, [join(ROOT, "previews", "build.mjs"), "--config=previews/examples/alt-config.js", "--out=previews/site-alt"], { stdio: "ignore" });

const browser = await chromium.launch();
async function shoot(size, path, file, prepare) {
  const ctx = await browser.newContext({ viewport: { width: size[0], height: size[1] }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  await page.route(/leadconnectorhq\.com|msgsndr\.com/, (r) => r.fulfill({ status: 200, body: "" }));
  await page.goto(BASE + path, { waitUntil: "networkidle" });
  await page.evaluate(() => document.fonts.ready);
  if (prepare) await prepare(page);
  await page.waitForTimeout(250);
  mkdirSync(dirname(file), { recursive: true });
  await page.screenshot({ path: file, fullPage: true });
  await ctx.close();
  console.log("saved", file.replace(ROOT, "").replace(/\\/g, "/"));
}

for (const [name, size] of Object.entries(SIZES)) {
  for (const p of pages) await shoot(size, `site/${p.preview}${p.previewQuery || ""}`, join(OUT, name, `${p.id}.png`));
}

// Interaction states
const S = join(OUT, "states");
await shoot(SIZES.mobile, "site/index.html", join(S, "mobile-menu-open.png"), (p) => p.click("[data-oc-menu-toggle]"));
await shoot(SIZES.desktop, "site/eyewear.html?category=sunglasses", join(S, "eyewear-filtered-sunglasses.png"));
await shoot(SIZES.desktop, "site/eyewear.html?q=nothing-matches", join(S, "eyewear-no-results.png"));
await shoot(SIZES.desktop, "site/product.html?p=arden-101", join(S, "product-inquiry-open.png"), async (p) => {
  await p.getByRole("button", { name: "52 · Tortoise" }).click();
  await p.getByRole("button", { name: "Ask about this" }).click();
});
await shoot(SIZES.mobile, "site/book.html?branch=quezon-city&service=contact-lens", join(S, "booking-deep-link-mobile.png"));

// White-label example
for (const [name, size] of [["desktop", SIZES.desktop], ["mobile", SIZES.mobile]]) {
  await shoot(size, "site-alt/index.html", join(OUT, "white-label", `home-${name}.png`));
}
await shoot(SIZES.desktop, "site-alt/book.html", join(OUT, "white-label", "book-desktop.png"));

await browser.close();
