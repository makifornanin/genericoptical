// Scans public/media and writes src/lib/media-manifest.json (which renders exist, at which widths,
// with their pixel size). Run after rendering:  node tools/renders/manifest.mjs
import { readdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const MEDIA = join(ROOT, "public", "media");

/** Width and height from a WebP file header (VP8, VP8L or VP8X). */
function webpSize(file) {
  const b = readFileSync(file);
  const chunk = b.toString("ascii", 12, 16);
  if (chunk === "VP8X") return { w: 1 + b.readUIntLE(24, 3), h: 1 + b.readUIntLE(27, 3) };
  if (chunk === "VP8 ") return { w: b.readUInt16LE(26) & 0x3fff, h: b.readUInt16LE(28) & 0x3fff };
  if (chunk === "VP8L") {
    const bits = b.readUInt32LE(21);
    return { w: (bits & 0x3fff) + 1, h: ((bits >> 14) & 0x3fff) + 1 };
  }
  throw new Error(`Unknown WebP chunk ${chunk} in ${file}`);
}

const products = {};
const productDir = join(MEDIA, "products");
if (existsSync(productDir)) {
  for (const slug of readdirSync(productDir).sort()) {
    for (const file of readdirSync(join(productDir, slug)).sort()) {
      const m = /^([a-z0-9]+)-(front|angle|side|top|detail)-(\d+)\.webp$/.exec(file);
      if (!m) continue;
      const [, colour, view, width] = m;
      const entry = ((products[slug] ??= {})[colour] ??= { views: [], widths: [], ratio: null });
      if (!entry.views.includes(view)) entry.views.push(view);
      if (!entry.widths.includes(Number(width))) entry.widths.push(Number(width));
      if (!entry.ratio) {
        const { w, h } = webpSize(join(productDir, slug, file));
        entry.ratio = [w, h];
      }
    }
  }
  const order = ["front", "angle", "side", "top", "detail"];
  for (const colours of Object.values(products)) {
    for (const e of Object.values(colours)) {
      e.views.sort((a, b) => order.indexOf(a) - order.indexOf(b));
      e.widths.sort((a, b) => a - b);
    }
  }
}

const editorial = {};
const editorialDir = join(MEDIA, "editorial");
if (existsSync(editorialDir)) {
  for (const file of readdirSync(editorialDir).sort()) {
    const m = /^([a-z0-9-]+)-(\d+)\.webp$/.exec(file);
    if (!m) continue;
    const [, name, width] = m;
    const entry = (editorial[name] ??= { widths: [], ratio: null });
    entry.widths.push(Number(width));
    entry.widths.sort((a, b) => a - b);
    if (!entry.ratio) {
      const { w, h } = webpSize(join(editorialDir, file));
      entry.ratio = [w, h];
    }
  }
}

// Stock photos (tools/stock/import.mjs): stand-ins for products without a render.
const stock = {};
const stockDir = join(MEDIA, "stock");
if (existsSync(stockDir)) {
  for (const file of readdirSync(stockDir).sort()) {
    const m = /^([a-z0-9-]+)-(\d+)\.webp$/.exec(file);
    if (!m) continue;
    const [, name, width] = m;
    const entry = (stock[name] ??= { widths: [], ratio: null });
    entry.widths.push(Number(width));
    entry.widths.sort((a, b) => a - b);
    if (!entry.ratio) {
      const { w, h } = webpSize(join(stockDir, file));
      entry.ratio = [w, h];
    }
  }
}

const out = join(ROOT, "src", "lib", "media-manifest.json");
writeFileSync(out, JSON.stringify({ products, editorial, stock }, null, 1) + "\n");
console.log(`${Object.keys(products).length} products, ${Object.keys(editorial).length} editorial images, ${Object.keys(stock).length} stock photos → ${out}`);
