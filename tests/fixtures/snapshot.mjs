#!/usr/bin/env node
/*
 * Refreshes the fixture data from a running dashboard (normally the local one with the demo seed):
 *   node --env-file=.env.local tests/fixtures/snapshot.mjs
 * Writes tests/fixtures/data/{site,products,lenses}.json. The dashboard origin is replaced with
 * {{BASE}} so the fixture server can serve the same image URLs itself. No keys are written.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const base = (process.env.DASHBOARD_API_URL || "").replace(/\/+$/, "").replace(/\/api\/public\/v1$/, "");
const key = process.env.DASHBOARD_SITE_KEY;
if (!base || !key) {
  console.error("Set DASHBOARD_API_URL and DASHBOARD_SITE_KEY (e.g. node --env-file=.env.local …)");
  process.exit(1);
}

async function get(path) {
  const res = await fetch(`${base}/api/public/v1${path}`, { headers: { Authorization: `Bearer ${key}` } });
  if (!res.ok) throw new Error(`${path}: HTTP ${res.status}`);
  return res.json();
}

const scrub = (value) => JSON.parse(JSON.stringify(value).replaceAll(base, "{{BASE}}"));

const site = await get("/site");
delete site.generatedAt;
const { products } = await get("/products");
const details = [];
for (const p of products) {
  const { product } = await get(`/products/${p.slug}`);
  delete product.related; // the fixture server recomputes related items
  details.push(product);
}
const { lenses } = await get("/lenses");

const out = join(ROOT, "tests", "fixtures", "data");
mkdirSync(out, { recursive: true });
writeFileSync(join(out, "site.json"), JSON.stringify(scrub(site), null, 2) + "\n");
writeFileSync(join(out, "products.json"), JSON.stringify(scrub(details), null, 2) + "\n");
writeFileSync(join(out, "lenses.json"), JSON.stringify(scrub(lenses), null, 2) + "\n");
console.log(`site + ${details.length} products + ${lenses.length} lenses → ${out}`);
