#!/usr/bin/env node
/*
 * Fixture dashboard API for tests (plain node:http, no dependencies). It serves contract-shaped
 * JSON (docs/PUBLIC_API.md in the dashboard repo) built from the old sample business, so the site
 * can be built and tested without the real dashboard. Test-only: never deploy this.
 *
 *   GET  /api/public/v1/site                     → tests/fixtures/data/site.json
 *   GET  /api/public/v1/products?category=&q=    → product summaries
 *   GET  /api/public/v1/products/:slug           → { product } | 404
 *   POST /api/public/v1/inquiries                → 201 | 400 | 413 | 429 (recorded in the log)
 *   GET  /products/*.svg                         → product art from public/products
 * All /api/public/v1 routes require Authorization: Bearer <FIXTURE_SITE_KEY> (default "test-key").
 *
 * Test controls (unauthenticated):
 *   POST /__control { "mode": "ok" | "down" }    "down" → every API route answers 503
 *   GET  /__control                              → { mode, hits }
 *   GET  /__inquiries                            → recorded inquiries (also in tests/.tmp/inquiries.json)
 *   POST /__inquiries/reset                      → clear the log
 * Magic values in fullName: "RATE-LIMIT-ME" → 429, "SERVER-REJECT" → 400 with a phone field error.
 */
import { createServer } from "node:http";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const PORT = Number(process.env.FIXTURE_PORT || 3299);
const KEY = process.env.FIXTURE_SITE_KEY || "test-key";
const BASE = `http://localhost:${PORT}`;
const LOG_DIR = join(ROOT, "tests", ".tmp");
const LOG_FILE = join(LOG_DIR, process.env.FIXTURE_LOG || "inquiries.json");

const withBase = (text) => text.replaceAll("{{BASE}}", BASE);
const site = JSON.parse(withBase(readFileSync(join(ROOT, "tests", "fixtures", "data", "site.json"), "utf8")));
const products = JSON.parse(withBase(readFileSync(join(ROOT, "tests", "fixtures", "data", "products.json"), "utf8")));

const state = { mode: "ok", hits: { site: 0, products: 0, product: 0, inquiries: 0 } };
let log = [];
mkdirSync(LOG_DIR, { recursive: true });
writeFileSync(LOG_FILE, "[]\n");

const INTERESTS = ["eye_exam", "prescription_glasses", "contact_lenses", "sunglasses", "frames", "repair", "other"];
const KINDS = ["contact", "product_inquiry", "appointment_request"];

function summary(p) {
  const rest = { ...p };
  delete rest.attributes;
  delete rest.variants;
  return rest;
}
function send(res, status, body, headers = {}) {
  res.writeHead(status, { "Content-Type": "application/json", "Cache-Control": "private, max-age=0, s-maxage=30, stale-while-revalidate=60", ...headers });
  res.end(JSON.stringify(body));
}
function readBody(req, limit) {
  return new Promise((resolveBody) => {
    const chunks = [];
    let size = 0;
    let tooLarge = false;
    req.on("data", (c) => {
      size += c.length;
      if (size > limit) tooLarge = true;
      else chunks.push(c);
    });
    req.on("end", () => resolveBody({ tooLarge, text: Buffer.concat(chunks).toString("utf8") }));
  });
}
function validateInquiry(b) {
  const fieldErrors = {};
  if (typeof b.fullName !== "string" || !b.fullName.trim() || b.fullName.length > 120) fieldErrors.fullName = ["Required"];
  const email = typeof b.email === "string" && b.email.trim() ? b.email.trim() : null;
  const phone = typeof b.phone === "string" && b.phone.trim() ? b.phone.trim() : null;
  if (!email && !phone) fieldErrors.email = ["Email or phone required"];
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fieldErrors.email = ["Invalid email"];
  if (phone && phone.replace(/\D/g, "").length < 7) fieldErrors.phone = ["Phone needs at least 7 digits"];
  if (!INTERESTS.includes(b.interest)) fieldErrors.interest = ["Invalid"];
  if (!KINDS.includes(b.kind)) fieldErrors.kind = ["Invalid"];
  if (b.preferredBranchId != null && !site.branches.some((x) => x.id === b.preferredBranchId)) fieldErrors.preferredBranchId = ["Unknown branch"];
  if (b.message != null && (typeof b.message !== "string" || b.message.length > 2000)) fieldErrors.message = ["Too long"];
  if (b.sourcePage != null && (typeof b.sourcePage !== "string" || !b.sourcePage.startsWith("/"))) fieldErrors.sourcePage = ["Must start with /"];
  if (typeof b.website === "string" && b.website !== "") fieldErrors.website = ["Must be empty"];
  return fieldErrors;
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, BASE);
  const path = url.pathname;

  // ── test controls ──
  if (path === "/__control") {
    if (req.method === "POST") {
      const { text } = await readBody(req, 4096);
      const mode = JSON.parse(text || "{}").mode;
      if (mode === "ok" || mode === "down") state.mode = mode;
    }
    return send(res, 200, state);
  }
  if (path === "/__inquiries") return send(res, 200, log);
  if (path === "/__inquiries/reset" && req.method === "POST") {
    log = [];
    writeFileSync(LOG_FILE, "[]\n");
    return send(res, 200, { ok: true });
  }

  // ── product art ──
  if (req.method === "GET" && /^\/products\/[a-z0-9-]+\.svg$/.test(path)) {
    const file = join(ROOT, "public", path);
    if (!existsSync(file)) return send(res, 404, { error: "Not found" });
    res.writeHead(200, { "Content-Type": "image/svg+xml", "Cache-Control": "public, max-age=3600" });
    return res.end(readFileSync(file));
  }

  if (!path.startsWith("/api/public/v1/")) return send(res, 404, { error: "Not found" });
  if (req.headers.authorization !== `Bearer ${KEY}`) return send(res, 401, { error: "Unauthorized" });
  if (state.mode === "down") return send(res, 503, { error: "Service unavailable" });

  const route = path.slice("/api/public/v1".length);
  if (req.method === "GET" && route === "/site") {
    state.hits.site++;
    return send(res, 200, { ...site, generatedAt: new Date().toISOString() });
  }
  if (req.method === "GET" && route === "/products") {
    state.hits.products++;
    const category = url.searchParams.get("category");
    const q = (url.searchParams.get("q") || "").toLowerCase();
    const list = products.filter((p) => (!category || p.category.slug === category) && (!q || `${p.name} ${p.brand} ${p.description}`.toLowerCase().includes(q)));
    return send(res, 200, { products: list.map(summary), generatedAt: new Date().toISOString() });
  }
  const m = /^\/products\/([^/]+)$/.exec(route);
  if (req.method === "GET" && m) {
    state.hits.product++;
    const p = products.find((x) => x.slug === decodeURIComponent(m[1]));
    if (!p) return send(res, 404, { error: "Not found" });
    const related = products.filter((x) => x.category.slug === p.category.slug && x.slug !== p.slug).slice(0, 4).map(summary);
    return send(res, 200, { product: { ...p, related } });
  }
  if (req.method === "POST" && route === "/inquiries") {
    state.hits.inquiries++;
    const { tooLarge, text } = await readBody(req, 16 * 1024);
    if (tooLarge) return send(res, 413, { error: "Payload too large" });
    let body;
    try {
      body = JSON.parse(text);
    } catch {
      return send(res, 400, { error: "Invalid JSON", fieldErrors: {} });
    }
    const name = String(body.fullName || "");
    if (name.includes("RATE-LIMIT-ME")) return send(res, 429, { error: "Too many requests" }, { "Retry-After": "60" });
    if (name.includes("SERVER-REJECT")) return send(res, 400, { error: "Invalid input", fieldErrors: { phone: ["This number was rejected by the dashboard."] } });
    const fieldErrors = validateInquiry(body);
    if (Object.keys(fieldErrors).length) return send(res, 400, { error: "Invalid input", fieldErrors });
    log.push({
      receivedAt: new Date().toISOString(),
      clientIp: req.headers["x-client-ip"] ?? null,
      authorized: true,
      body,
    });
    writeFileSync(LOG_FILE, JSON.stringify(log, null, 2) + "\n");
    return send(res, 201, { ok: true });
  }
  return send(res, 404, { error: "Not found" });
});

server.listen(PORT, () => console.log(`fixture dashboard API on ${BASE} (key: ${KEY === "test-key" ? "test-key" : "custom"})`));
