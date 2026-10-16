#!/usr/bin/env node
/*
 * Regenerates scripts/oc-catalogue.js from the management dashboard's product export, so the
 * website showcase follows the dashboard (the source of truth) instead of being retyped.
 *
 *   Dashboard → Products → Export CSV  (columns: product_name, brand, category, type, sku,
 *   variant_label, price, active, description, …)
 *
 *   node tools/catalogue-from-csv.mjs products.csv > scripts/oc-catalogue.js.new
 *   node tools/catalogue-from-csv.mjs products.csv --previous=scripts/oc-catalogue.js --out=scripts/oc-catalogue.js
 *
 * What it takes from the export: names, brands, categories, descriptions, variants and prices
 * (lowest price = the "from" price). Inactive rows, services and made-to-order lenses are skipped.
 * What it keeps from --previous (website-only fields): images, featured order, storeUrl, notes, and
 * variant images (matched by product id and variant label). New products get a placeholder image
 * per category and are listed on stderr so you can set a real one.
 *
 * Category mapping: dashboard category name → website category id (OC_CONFIG.catalogue.categories).
 * Override with --map="Frames=frames,Sunglasses=sunglasses,Contact lenses=contact-lenses".
 * No stock is exported: the showcase is not live inventory (live stock lives in the GHL store).
 */
import { readFileSync, writeFileSync } from "node:fs";

const [csvPath, ...rest] = process.argv.slice(2);
if (!csvPath) {
  console.error("Usage: node tools/catalogue-from-csv.mjs <products.csv> [--previous=scripts/oc-catalogue.js] [--out=file] [--map=Name=id,…]");
  process.exit(1);
}
const args = Object.fromEntries(rest.map((a) => a.replace(/^--/, "").split(/=(.*)/s).slice(0, 2)));

const DEFAULT_MAP = {
  frames: "frames",
  "optical frames": "frames",
  sunglasses: "sunglasses",
  "contact lenses": "contact-lenses",
  "contact lens": "contact-lenses",
  accessories: "accessories",
  cases: "accessories",
  cleaning: "accessories",
  "lens care": "accessories",
};
const map = { ...DEFAULT_MAP };
if (args.map) for (const pair of args.map.split(",")) {
  const [k, v] = pair.split("=");
  if (k && v) map[k.trim().toLowerCase()] = v.trim();
}
const PLACEHOLDER = { frames: "products/frame-square-black.svg", sunglasses: "products/sun-round-smoke.svg", "contact-lenses": "products/contact-box.svg", accessories: "products/accessory.svg" };

/** RFC 4180 CSV → array of records keyed by header. */
function parseCsv(text) {
  const rows = [];
  let row = [], cell = "", q = false;
  text = text.replace(/^﻿/, "");
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') q = false;
      else cell += c;
    } else if (c === '"' && cell === "") q = true;
    else if (c === ",") { row.push(cell); cell = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(cell); cell = "";
      if (row.some((x) => x !== "")) rows.push(row);
      row = [];
    } else cell += c;
  }
  row.push(cell);
  if (row.some((x) => x !== "")) rows.push(row);
  const [head, ...body] = rows;
  return body.map((r) => Object.fromEntries(head.map((h, i) => [h.trim(), (r[i] ?? "").trim()])));
}
const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const unformula = (s) => s.replace(/^'(?=[=+\-@])/, ""); // undo the export's spreadsheet-injection guard
const money = (s) => {
  const n = Number(String(s).replace(/[^0-9.\-]/g, ""));
  return Number.isFinite(n) ? n : null;
};

let previous = { products: [] };
if (args.previous) {
  const src = readFileSync(args.previous, "utf8");
  const sandbox = {};
  new Function("window", src)(sandbox); // the file only assigns window.OC_CATALOGUE
  previous = sandbox.OC_CATALOGUE || previous;
}
const prevById = new Map(previous.products.map((p) => [p.id, p]));

const groups = new Map();
const skipped = [];
for (const r of parseCsv(readFileSync(csvPath, "utf8"))) {
  const name = unformula(r.product_name || "");
  if (!name) continue;
  if (/^(no|false|0)$/i.test(r.active || "yes")) continue;
  if (r.type && r.type !== "stock") continue; // services and made-to-order lenses are not showcase items
  const category = map[(r.category || "").toLowerCase()];
  if (!category) {
    skipped.push(`${name} (category "${r.category}")`);
    continue;
  }
  const key = `${name.toLowerCase()}|${(r.brand || "").toLowerCase()}`;
  const g = groups.get(key) || { name, brand: unformula(r.brand || ""), category, description: unformula(r.description || ""), variants: [] };
  const price = money(r.price);
  g.variants.push({ label: unformula(r.variant_label || "Default"), price });
  groups.set(key, g);
}

const missingImages = [];
const products = [...groups.values()].map((g) => {
  const id = slug(g.name);
  const prev = prevById.get(id);
  const prices = g.variants.map((v) => v.price).filter((n) => n !== null);
  const low = prices.length ? Math.min(...prices) : null;
  const prevVariant = new Map((prev?.variants || []).map((v) => [v.label, v]));
  const variants = g.variants.map((v) => {
    const out = { label: v.label };
    if (v.price !== null && v.price !== low) out.price = v.price;
    if (prevVariant.get(v.label)?.image) out.image = prevVariant.get(v.label).image;
    return out;
  });
  if (!prev) missingImages.push(g.name);
  const p = {
    id,
    name: g.name,
    brand: g.brand,
    category: g.category,
    price: low,
    description: g.description || prev?.description || "",
    image: prev?.image || PLACEHOLDER[g.category] || "",
    images: prev?.images || [prev?.image || PLACEHOLDER[g.category]].filter(Boolean),
    variants: variants.length === 1 && variants[0].label === "Default" ? [] : variants,
  };
  for (const k of ["featured", "storeUrl", "note"]) if (prev && prev[k] !== undefined) p[k] = prev[k];
  return p;
});

const header = `/*
 * Optical customer website — product showcase data
 * Generated by tools/catalogue-from-csv.mjs from the dashboard product export on ${new Date().toISOString().slice(0, 10)}.
 * Display data only (no stock). Live stock and checkout are in the native GHL store, synced from the
 * dashboard. Edit images / featured / storeUrl here; re-run the tool for prices and variants.
 */
`;
const out = header + "window.OC_CATALOGUE = " + JSON.stringify({ updated: new Date().toISOString().slice(0, 10), products }, null, 2) + ";\n";
if (args.out) writeFileSync(args.out, out);
else process.stdout.write(out);
console.error(`${products.length} products${skipped.length ? `; skipped (unmapped category): ${skipped.join(", ")}` : ""}${missingImages.length ? `; NEW — set an image: ${missingImages.join(", ")}` : ""}`);
