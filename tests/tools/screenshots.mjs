#!/usr/bin/env node
/*
 * Full-page screenshots of every page at four widths, plus key interaction states, from the
 * production build with fixture data:
 *   → screenshots/{mobile,tablet,desktop,wide}/<page>.png and screenshots/states/*.png
 * Uses the running servers (next start on 3200 + fixture API on 3299) if they are up; otherwise
 * starts both (run `npm run test:build` first). GoHighLevel requests are stubbed (blank widget).
 * Branch "Open / Closed" badges depend on the time of day.
 */
import { spawn } from "node:child_process";
import { mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const BASE = process.env.SITE_BASE || "http://localhost:3200";
const OUT = join(ROOT, "screenshots");
const SIZES = { mobile: [390, 844], tablet: [768, 1024], desktop: [1440, 900], wide: [1920, 1080] };
const PAGES = [
  ["home", "/"],
  ["eyewear", "/eyewear"],
  ["product-detail", "/eyewear/arden-101"],
  ["services", "/services"],
  ["booking", "/book"],
  ["contact", "/contact"],
  ["about", "/about"],
  ["faq", "/faq"],
  ["privacy", "/privacy"],
  ["terms", "/terms"],
  ["booking-confirmed", "/booking-confirmed"],
  ["thank-you", "/thank-you"],
];

const children = [];
async function up(url) {
  try {
    return (await fetch(url)).ok;
  } catch {
    return false;
  }
}
async function waitFor(url, ms = 60000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (await up(url)) return;
    await new Promise((r) => setTimeout(r, 300));
  }
  throw new Error(`not reachable: ${url}`);
}
if (!(await up("http://localhost:3299/__control"))) {
  children.push(spawn(process.execPath, [join(ROOT, "tests", "fixtures", "api-server.mjs")], { stdio: "ignore" }));
  await waitFor("http://localhost:3299/__control");
}
if (!(await up(`${BASE}/api/health`))) {
  const env = { ...process.env, DASHBOARD_API_URL: "http://localhost:3299", DASHBOARD_SITE_KEY: "test-key", REVALIDATE_SECRET: "test-secret", SITE_URL: "http://localhost:3200" };
  children.push(spawn(process.execPath, [join(ROOT, "node_modules", "next", "dist", "bin", "next"), "start", "-p", "3200"], { cwd: ROOT, stdio: "ignore", env }));
  await waitFor(`${BASE}/api/health`);
}

const browser = await chromium.launch();
async function shoot(size, path, file, prepare) {
  const ctx = await browser.newContext({ viewport: { width: size[0], height: size[1] }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  await page.route(/leadconnectorhq\.com|msgsndr\.com/, (r) => r.fulfill({ status: 200, contentType: r.request().resourceType() === "script" ? "text/javascript" : "text/html", body: "" }));
  await page.goto(BASE + path, { waitUntil: "networkidle" });
  await page.evaluate(async () => {
    await document.fonts.ready;
    for (const img of Array.from(document.images)) img.loading = "eager";
  });
  await page.waitForLoadState("networkidle");
  if (prepare) await prepare(page);
  await page.waitForTimeout(300);
  // Full-page captures render sticky elements at the current scroll position: start at the top.
  await page.evaluate(() => {
    document.documentElement.style.scrollBehavior = "auto";
    window.scrollTo(0, 0);
    if (document.activeElement instanceof HTMLElement && document.activeElement.matches(".oc-skip")) document.activeElement.blur();
  });
  await page.waitForTimeout(100);
  mkdirSync(dirname(file), { recursive: true });
  await page.screenshot({ path: file, fullPage: true });
  await ctx.close();
  console.log("saved", file.replace(ROOT, "").replace(/\\/g, "/"));
}

try {
  for (const [name, size] of Object.entries(SIZES)) {
    for (const [id, path] of PAGES) await shoot(size, path, join(OUT, name, `${id}.png`));
  }
  const S = join(OUT, "states");
  await shoot(SIZES.mobile, "/", join(S, "mobile-menu-open.png"), (p) => p.getByRole("button", { name: "Open menu" }).click());
  await shoot(SIZES.desktop, "/eyewear?category=sunglasses", join(S, "eyewear-filtered-sunglasses.png"));
  await shoot(SIZES.desktop, "/eyewear?q=nothing-matches", join(S, "eyewear-no-results.png"));
  await shoot(SIZES.desktop, "/eyewear/arden-101", join(S, "product-inquiry-open.png"), async (p) => {
    await p.getByRole("button", { name: "52 · Tortoise" }).click();
    await p.getByRole("button", { name: "Ask about this" }).click();
  });
  await shoot(SIZES.desktop, "/eyewear/arden-101?ask=1", join(S, "product-inquiry-errors.png"), async (p) => {
    await p.getByRole("button", { name: "Send message" }).click();
  });
  await shoot(SIZES.mobile, "/book?branch=qc&service=contact_lens_consultation", join(S, "booking-request-form-mobile.png"));
  await shoot(SIZES.desktop, "/book?branch=qc&service=eye_exam", join(S, "booking-request-form-desktop.png"));
} finally {
  await browser.close();
  for (const c of children) c.kill();
}
