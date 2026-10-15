import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
export const PAGES = JSON.parse(readFileSync(join(ROOT, "pages", "pages.json"), "utf8")).pages;
export const VIEWPORTS = {
  mobile: { width: 390, height: 844 },
  tablet: { width: 768, height: 1024 },
  desktop: { width: 1280, height: 900 },
  wide: { width: 1920, height: 1080 },
};
export const url = (page, site = "site") => `${site}/${page.preview}${page.previewQuery || ""}`;

/** Never let a test reach GoHighLevel: stub the official widget URLs and embed script. */
export async function blockGhl(page) {
  await page.route(/leadconnectorhq\.com|msgsndr\.com|gohighlevel\.com/, (route) => {
    const isScript = route.request().resourceType() === "script";
    route.fulfill({ status: 200, contentType: isScript ? "text/javascript" : "text/html", body: isScript ? "/* stub */" : "<!doctype html><title>stub</title>" });
  });
}

/** Collect console errors and page errors (warnings are allowed). */
export function watchConsole(page) {
  const problems = [];
  page.on("console", (m) => m.type() === "error" && problems.push(`console: ${m.text()}`));
  page.on("pageerror", (e) => problems.push(`pageerror: ${e.message}`));
  return problems;
}
