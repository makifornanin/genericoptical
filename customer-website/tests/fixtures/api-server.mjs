#!/usr/bin/env node
/*
 * Fixture dashboard API for tests (plain node:http, no dependencies). It serves the contract
 * (docs/PUBLIC_API.md in the dashboard repo) from a snapshot of the demo dashboard
 * (tests/fixtures/snapshot.mjs), and implements the order endpoints in memory. Test-only.
 *
 *   GET  /api/public/v1/site | /products | /products/:slug | /lenses
 *   POST /api/public/v1/inquiries                 → recorded (tests/.tmp/inquiries.json)
 *   POST /api/public/v1/cart/quote                → prices + per-branch fulfilment
 *   POST /api/public/v1/orders                    → 201 { order, token, replayed } (tests/.tmp/orders.json)
 *   GET  /api/public/v1/orders/:number            → needs X-Order-Token
 *   POST /api/public/v1/orders/:number/cancel     → needs X-Order-Token
 *   POST /api/public/v1/orders/lookup             → { number, token } for number + email
 *   GET  /products/*.svg                          → product art from public/products
 * All /api/public/v1 routes need Authorization: Bearer <FIXTURE_SITE_KEY> (default "test-key").
 *
 * Test controls (unauthenticated):
 *   POST /__control { mode: "ok" | "down", ordering?: boolean }   GET /__control → state
 *   GET  /__inquiries · POST /__inquiries/reset · GET /__orders · POST /__orders/reset
 * Magic names (customer.fullName / inquiry fullName): "SOLD-OUT" → 409, "PRICE-CHANGE" → 409,
 * "RATE-LIMIT-ME" → 429, "SERVER-REJECT" → 400 with a field error.
 */
import { createHash, randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const PORT = Number(process.env.FIXTURE_PORT || 3299);
const KEY = process.env.FIXTURE_SITE_KEY || "test-key";
const BASE = `http://localhost:${PORT}`;
const LOG_DIR = join(ROOT, "tests", ".tmp");
const INQUIRY_LOG = join(LOG_DIR, process.env.FIXTURE_LOG || "inquiries.json");
const ORDER_LOG = join(LOG_DIR, process.env.FIXTURE_ORDER_LOG || "orders.json");

const load = (name) => JSON.parse(readFileSync(join(ROOT, "tests", "fixtures", "data", name), "utf8").replaceAll("{{BASE}}", BASE));
const site = load("site.json");
const products = load("products.json");
const lenses = load("lenses.json");

const state = { mode: "ok", ordering: true, hits: { site: 0, products: 0, product: 0, lenses: 0, inquiries: 0, quote: 0, orders: 0 } };
let inquiries = [];
let orders = [];
mkdirSync(LOG_DIR, { recursive: true });
writeFileSync(INQUIRY_LOG, "[]\n");
writeFileSync(ORDER_LOG, "[]\n");

const INTERESTS = ["eye_exam", "prescription_glasses", "contact_lenses", "sunglasses", "frames", "repair", "other"];
const KINDS = ["contact", "product_inquiry", "appointment_request"];

function summary(p) {
  const rest = { ...p };
  delete rest.attributes;
  delete rest.variants;
  return rest;
}
function send(res, status, body, headers = {}) {
  res.writeHead(status, { "Content-Type": "application/json", "Cache-Control": "no-store", ...headers });
  res.end(JSON.stringify(body));
}
function readBody(req, limit) {
  return new Promise((done) => {
    const chunks = [];
    let size = 0;
    let tooLarge = false;
    req.on("data", (c) => {
      size += c.length;
      if (size > limit) tooLarge = true;
      else chunks.push(c);
    });
    req.on("end", () => done({ tooLarge, text: Buffer.concat(chunks).toString("utf8") }));
  });
}
async function json(req, limit) {
  const { tooLarge, text } = await readBody(req, limit);
  if (tooLarge) return { error: 413 };
  try {
    return { body: JSON.parse(text || "{}") };
  } catch {
    return { error: 400 };
  }
}

// ── Catalogue lookups ──
const variantIndex = new Map();
for (const p of products) for (const v of p.variants) variantIndex.set(v.id, { product: p, variant: v });
const lensIndex = new Map(lenses.map((l) => [l.variantId, l]));
const STOCK = { in_stock: 5, low_stock: 1, out_of_stock: 0 };

function priceLines(items) {
  const lines = [];
  for (const item of items) {
    const hit = variantIndex.get(item.variantId);
    if (!hit) return { error: "An item in your bag is no longer available online." };
    lines.push({ variantId: item.variantId, name: hit.product.name, variantLabel: hit.variant.label, productType: "stock", quantity: item.quantity, unitPriceCents: hit.variant.priceCents, lineTotalCents: hit.variant.priceCents * item.quantity });
    if (item.lensVariantId) {
      const lens = lensIndex.get(item.lensVariantId);
      if (!lens) return { error: `The lenses chosen for ${hit.product.name} are no longer available.` };
      if (hit.product.category.kind !== "frames") return { error: `Prescription lenses can only be added to frames, not ${hit.product.name}.` };
      lines.push({ variantId: lens.variantId, name: lens.name, variantLabel: "Pair", productType: "made_to_order", quantity: item.quantity, unitPriceCents: lens.priceCents, lineTotalCents: lens.priceCents * item.quantity });
    }
  }
  const total = lines.reduce((n, l) => n + l.lineTotalCents, 0);
  return { lines, total, tax: Math.round(total - total / 1.12) };
}

function branchFulfilment(items) {
  return site.branches.map((b) => {
    const short = [];
    for (const item of items) {
      const hit = variantIndex.get(item.variantId);
      if (!hit) continue;
      const at = hit.variant.branches.find((x) => x.branchId === b.id);
      if (!at) continue;
      if ((STOCK[at.availability] ?? 0) < item.quantity) short.push(item.variantId);
    }
    return { branchId: b.id, name: b.name, code: b.code, canFulfil: short.length === 0, unavailableVariantIds: short };
  });
}

const hashToken = (t) => createHash("sha256").update(t).digest("hex");

function orderView(o) {
  const branch = site.branches.find((b) => b.id === o.branchId);
  return {
    number: o.number,
    placedAt: o.placedAt,
    status: o.status,
    stage: o.stage,
    paymentStatus: o.paid ? "paid" : "unpaid",
    paymentOption: o.payment.option,
    currency: "PHP",
    subtotalCents: o.total,
    taxCents: o.tax,
    totalCents: o.total,
    paidCents: o.paid,
    balanceDueCents: o.status === "cancelled" ? 0 : o.total - o.paid,
    readyBy: o.readyBy,
    readyAt: null,
    completedAt: null,
    cancelledAt: o.cancelledAt ?? null,
    cancelledByCustomer: Boolean(o.cancelledAt),
    canCancel: o.status === "open" && o.paid === 0,
    contact: { name: o.customer.fullName, email: o.customer.email, phone: o.customer.phone },
    branch: { id: branch.id, name: branch.name, address: branch.address, phone: branch.phone, mapUrl: branch.mapUrl, hours: branch.hours },
    items: o.lines.map((l) => ({ name: l.name, variantLabel: l.variantLabel, productType: l.productType, quantity: l.quantity, unitPriceCents: l.unitPriceCents, lineTotalCents: l.lineTotalCents, note: null })),
    prescriptions: o.items
      .filter((i) => i.lensVariantId && i.prescription)
      .map((i) => {
        const hit = variantIndex.get(i.variantId);
        const rx = i.prescription;
        return { frame: `${hit.product.name} · ${hit.variant.label}`, lens: lensIndex.get(i.lensVariantId).name, mode: rx.mode, ...(rx.mode === "enter" ? { values: { od: rx.od, os: rx.os, pd: rx.pd ?? null, issuedOn: rx.issuedOn ?? null } } : {}) };
      }),
    timeline: [{ stage: "placed", at: o.placedAt }, ...(o.status === "cancelled" ? [{ stage: "cancelled", at: o.cancelledAt }] : [{ stage: "confirmed", at: o.placedAt }])],
  };
}

const saveOrders = () => writeFileSync(ORDER_LOG, JSON.stringify(orders, null, 2) + "\n");

function validateInquiry(b) {
  const fieldErrors = {};
  if (typeof b.fullName !== "string" || !b.fullName.trim() || b.fullName.length > 120) fieldErrors.fullName = ["Required"];
  const email = typeof b.email === "string" && b.email.trim() ? b.email.trim() : null;
  const phone = typeof b.phone === "string" && b.phone.trim() ? b.phone.trim() : null;
  if (!email && !phone) fieldErrors.email = ["Email or phone required"];
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fieldErrors.email = ["Invalid email"];
  if (!INTERESTS.includes(b.interest)) fieldErrors.interest = ["Invalid"];
  if (!KINDS.includes(b.kind)) fieldErrors.kind = ["Invalid"];
  if (b.preferredBranchId != null && !site.branches.some((x) => x.id === b.preferredBranchId)) fieldErrors.preferredBranchId = ["Unknown branch"];
  return fieldErrors;
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, BASE);
  const path = url.pathname;

  // ── test controls ──
  if (path === "/__control") {
    if (req.method === "POST") {
      const { body = {} } = await json(req, 4096);
      if (body.mode === "ok" || body.mode === "down") state.mode = body.mode;
      if (typeof body.ordering === "boolean") state.ordering = body.ordering;
    }
    return send(res, 200, state);
  }
  if (path === "/__inquiries") return send(res, 200, inquiries);
  if (path === "/__inquiries/reset" && req.method === "POST") {
    inquiries = [];
    writeFileSync(INQUIRY_LOG, "[]\n");
    return send(res, 200, { ok: true });
  }
  if (path === "/__orders") return send(res, 200, orders);
  if (path === "/__orders/reset" && req.method === "POST") {
    orders = [];
    saveOrders();
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
    return send(res, 200, { ...site, ordering: { ...site.ordering, enabled: state.ordering }, generatedAt: new Date().toISOString() });
  }
  if (req.method === "GET" && route === "/products") {
    state.hits.products++;
    const category = url.searchParams.get("category");
    const q = (url.searchParams.get("q") || "").toLowerCase();
    const list = products.filter((p) => (!category || p.category.slug === category) && (!q || `${p.name} ${p.brand} ${p.description}`.toLowerCase().includes(q)));
    return send(res, 200, { products: list.map(summary), generatedAt: new Date().toISOString() });
  }
  if (req.method === "GET" && route === "/lenses") {
    state.hits.lenses++;
    return send(res, 200, { lenses, generatedAt: new Date().toISOString() });
  }
  const productMatch = /^\/products\/([^/]+)$/.exec(route);
  if (req.method === "GET" && productMatch) {
    state.hits.product++;
    const p = products.find((x) => x.slug === decodeURIComponent(productMatch[1]));
    if (!p) return send(res, 404, { error: "Not found" });
    const related = products.filter((x) => x.category.slug === p.category.slug && x.slug !== p.slug).slice(0, 4).map(summary);
    return send(res, 200, { product: { ...p, related } });
  }

  if (req.method === "POST" && route === "/inquiries") {
    state.hits.inquiries++;
    const { body, error } = await json(req, 16 * 1024);
    if (error === 413) return send(res, 413, { error: "Payload too large" });
    if (error) return send(res, 400, { error: "Invalid JSON", fieldErrors: {} });
    const name = String(body.fullName || "");
    if (name.includes("RATE-LIMIT-ME")) return send(res, 429, { error: "Too many requests" }, { "Retry-After": "60" });
    if (name.includes("SERVER-REJECT")) return send(res, 400, { error: "Invalid input", fieldErrors: { phone: ["This number was rejected by the dashboard."] } });
    const fieldErrors = validateInquiry(body);
    if (Object.keys(fieldErrors).length) return send(res, 400, { error: "Invalid input", fieldErrors });
    inquiries.push({ receivedAt: new Date().toISOString(), clientIp: req.headers["x-client-ip"] ?? null, body });
    writeFileSync(INQUIRY_LOG, JSON.stringify(inquiries, null, 2) + "\n");
    return send(res, 201, { ok: true });
  }

  if (req.method === "POST" && route === "/cart/quote") {
    state.hits.quote++;
    const { body, error } = await json(req, 16 * 1024);
    if (error || !Array.isArray(body.items) || !body.items.length) return send(res, 400, { error: "Your bag is empty." });
    const priced = priceLines(body.items);
    if (priced.error) return send(res, 400, { error: priced.error });
    return send(res, 200, { currency: "PHP", pricesIncludeTax: true, subtotalCents: priced.total, taxCents: priced.tax, totalCents: priced.total, lines: priced.lines, branches: branchFulfilment(body.items), generatedAt: new Date().toISOString() });
  }

  if (req.method === "POST" && route === "/orders") {
    state.hits.orders++;
    if (!state.ordering) return send(res, 403, { error: "Online ordering is switched off. Please visit a branch or contact us." });
    const { body, error } = await json(req, 32 * 1024);
    if (error) return send(res, 400, { error: "Send a JSON body." });
    const existing = orders.find((o) => o.idempotencyKey === body.idempotencyKey);
    if (existing) return send(res, 201, { order: orderView(existing), token: existing.token, replayed: true });
    const fieldErrors = {};
    if (!body.customer?.fullName) fieldErrors["customer.fullName"] = ["Your name is required."];
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.customer?.email ?? "")) fieldErrors["customer.email"] = ["Enter a valid email address."];
    if ((body.customer?.phone ?? "").replace(/\D/g, "").length < 7) fieldErrors["customer.phone"] = ["Enter a mobile number so the branch can reach you."];
    if (Object.keys(fieldErrors).length) return send(res, 400, { error: "Please check the highlighted fields.", fieldErrors });
    if (body.payment?.option === "demo_card" && !/^DEMO-[A-Z0-9]{8,24}$/.test(body.payment.reference ?? "")) return send(res, 400, { error: "Invalid demo payment reference.", fieldErrors: { "payment.reference": ["Invalid"] } });
    if (body.customer.fullName.includes("SOLD-OUT")) return send(res, 409, { error: "Some items just sold out at this branch. Choose another branch or remove them from your bag." });
    const priced = priceLines(body.items ?? []);
    if (priced.error) return send(res, 400, { error: priced.error });
    if (body.customer.fullName.includes("PRICE-CHANGE") || priced.total !== body.expectedTotalCents) {
      return send(res, 409, { error: `Prices changed while you were checking out: the total is now ₱${(priced.total / 100).toLocaleString("en-PH")}. Review your bag and place the order again.` });
    }
    const fulfil = branchFulfilment(body.items).find((b) => b.branchId === body.branchId);
    if (!fulfil) return send(res, 400, { error: "Choose an active branch." });
    if (!fulfil.canFulfil) return send(res, 409, { error: "Some items just sold out at this branch. Choose another branch or remove them from your bag." });
    const token = randomBytes(24).toString("base64url").slice(0, 32);
    const order = {
      number: `ORD-${String(900000 + orders.length + 1)}`,
      token,
      tokenHash: hashToken(token),
      idempotencyKey: body.idempotencyKey,
      placedAt: new Date().toISOString(),
      status: "open",
      stage: "confirmed",
      branchId: body.branchId,
      customer: body.customer,
      items: body.items,
      lines: priced.lines,
      total: priced.total,
      tax: priced.tax,
      paid: body.payment?.option === "demo_card" ? priced.total : 0,
      payment: body.payment,
      readyBy: new Date(Date.now() + (body.items.some((i) => i.lensVariantId) ? 7 : 2) * 86400000).toISOString().slice(0, 10),
      clientIp: req.headers["x-client-ip"] ?? null,
      raw: body,
    };
    orders.push(order);
    saveOrders();
    return send(res, 201, { order: orderView(order), token, replayed: false });
  }

  if (req.method === "POST" && route === "/orders/lookup") {
    const { body = {} } = await json(req, 2048);
    const o = orders.find((x) => x.number === String(body.number ?? "").toUpperCase().trim() && x.customer.email.toLowerCase() === String(body.email ?? "").toLowerCase().trim());
    if (!o) return send(res, 404, { error: "Not found" });
    return send(res, 200, { number: o.number, token: o.token });
  }

  const orderMatch = /^\/orders\/(ORD-\d+)(\/cancel)?$/.exec(route);
  if (orderMatch) {
    const o = orders.find((x) => x.number === orderMatch[1]);
    const token = req.headers["x-order-token"];
    if (!o || typeof token !== "string" || hashToken(token) !== o.tokenHash) return send(res, 404, { error: "Not found" });
    if (req.method === "GET" && !orderMatch[2]) return send(res, 200, { order: orderView(o) });
    if (req.method === "POST" && orderMatch[2]) {
      if (o.paid > 0) return send(res, 409, { error: "This order was paid online. Please contact the branch to cancel it." });
      if (o.status !== "cancelled") {
        o.status = "cancelled";
        o.stage = "cancelled";
        o.cancelledAt = new Date().toISOString();
        saveOrders();
      }
      return send(res, 200, { order: orderView(o) });
    }
  }
  return send(res, 404, { error: "Not found" });
});

server.listen(PORT, () => console.log(`fixture dashboard API on ${BASE} (key: ${KEY === "test-key" ? "test-key" : "custom"})`));
