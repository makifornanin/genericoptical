#!/usr/bin/env node
/*
 * Local preview builder (preview tooling only — never pasted into GHL).
 *
 * Assembles each page the way GHL will: global fonts + oc-base.css + page CSS, the global header
 * block, the page's blocks in order, the global footer block, then oc-config.js, oc-catalogue.js,
 * oc-site.js and the page script. The GHL files are referenced in place (no copies), so the preview
 * always shows exactly the code you paste into GHL.
 *
 *   node previews/build.mjs                      → previews/site/*.html
 *   node previews/build.mjs --config=path.js     → use another business config (white-label check)
 *   node previews/build.mjs --out=previews/site-alt
 *
 * The only preview-specific additions: window.OC_PREVIEW (maps GHL paths like "/eyewear" to the
 * preview files and sets the asset folder) and a <main> wrapper around the page blocks.
 * Native GHL forms, calendars and the store are NOT simulated: with no IDs configured, oc-site.js
 * shows labelled placeholders.
 */
import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync, rmSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const args = Object.fromEntries(process.argv.slice(2).map((a) => a.replace(/^--/, "").split("=")));
const OUT = resolve(ROOT, args.out || "previews/site");
const CONFIG = resolve(ROOT, args.config || "scripts/oc-config.js");

const manifest = JSON.parse(readFileSync(join(ROOT, "pages", "pages.json"), "utf8"));
const header = readFileSync(join(ROOT, "components", "header.html"), "utf8");
const footer = readFileSync(join(ROOT, "components", "footer.html"), "utf8");

// Business name for <title> tags (read the config without executing page code).
const configSrc = readFileSync(CONFIG, "utf8");
const businessName = (configSrc.match(/business:\s*{[\s\S]*?name:\s*"([^"]+)"/) || [])[1] || "Optical";

const rel = (abs) => relative(OUT, abs).split(sep).join("/");
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");
const stripComments = (html) => html.replace(/<!--[\s\S]*?-->\s*/g, "");

const pageMap = Object.fromEntries(manifest.pages.map((p) => [p.path, p.preview]));

if (existsSync(OUT)) rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

for (const page of manifest.pages) {
  const dir = join(ROOT, "pages", page.id);
  const blockDir = join(dir, "blocks");
  const blocks = existsSync(blockDir) ? readdirSync(blockDir).filter((f) => f.endsWith(".html")).sort() : [];
  if (!blocks.length) {
    console.warn(`skip ${page.id}: no blocks yet`);
    continue;
  }
  const css = existsSync(join(dir, `${page.id}.css`)) ? join(dir, `${page.id}.css`) : null;
  const js = existsSync(join(dir, `${page.id}.js`)) ? join(dir, `${page.id}.js`) : null;
  const preview = { assetBase: rel(join(ROOT, "assets")) + "/", pages: pageMap, current: page.path };
  const title = page.title.replace("{business}", businessName);
  const body = blocks.map((b) => `<!-- block: pages/${page.id}/blocks/${b} -->\n` + stripComments(readFileSync(join(blockDir, b), "utf8"))).join("\n");

  const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${esc(title)}</title>
  <meta name="description" content="${esc(page.description)}">
  <meta name="robots" content="noindex, nofollow">
  <link rel="icon" href="${rel(join(ROOT, "assets", "brand", "favicon.ico"))}">
  <!-- Head tracking code (fonts) + global styles (in GHL: the header section's <style>) -->
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter+Tight:wght@400;500;600;700&family=Instrument+Sans:wght@500;600;700&display=swap">
  <link rel="stylesheet" href="${rel(join(ROOT, "styles", "oc-base.css"))}">
${css ? `  <link rel="stylesheet" href="${rel(css)}">\n` : ""}  <style>/* preview only: GHL provides the page body */ body { margin: 0; background: #f6f6f3; }</style>
  <script>window.OC_PREVIEW = ${JSON.stringify(preview)};</script>
  <script src="${rel(CONFIG)}"></script>
</head>
<body>
<!-- global section: components/header.html -->
${stripComments(header)}
<main>
${body}
</main>
<!-- global section: components/footer.html -->
${stripComments(footer)}
<!-- Global footer section scripts (ghl-ready/site/C-footer-section.html) -->
<script src="${rel(join(ROOT, "scripts", "oc-site.js"))}"></script>
${page.catalogue ? `<!-- page script element: catalogue data -->\n<script src="${rel(join(ROOT, "scripts", "oc-catalogue.js"))}"></script>\n` : ""}${js ? `<!-- page script element -->\n<script src="${rel(js)}"></script>\n` : ""}</body>
</html>
`;
  writeFileSync(join(OUT, page.preview), html);
  console.log(`built ${rel(join(OUT, page.preview))}  (${blocks.length} blocks${css ? ", css" : ""}${js ? ", js" : ""})`);
}

// Index of preview pages (handy entry point when opened from the file system).
const links = manifest.pages
  .filter((p) => existsSync(join(OUT, p.preview)))
  .map((p) => `<li><a href="${p.preview}${p.previewQuery || ""}">${esc(p.name)}</a> <code>${esc(p.path)}</code></li>`)
  .join("\n");
writeFileSync(
  join(OUT, "_pages.html"),
  `<!doctype html><meta charset="utf-8"><title>Preview pages</title><style>body{font:16px/1.6 system-ui;margin:40px;max-width:640px}code{color:#666}</style><h1>Local preview</h1><p>Native GHL forms, calendars and store elements appear as labelled placeholders. See previews/README.md.</p><ul>${links}</ul>`,
);
