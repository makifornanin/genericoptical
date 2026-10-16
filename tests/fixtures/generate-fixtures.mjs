#!/usr/bin/env node
/*
 * Builds the contract-shaped fixture data (tests/fixtures/data/site.json, products.json) from the
 * superseded GHL-builder sample business (legacy/ghl-builder/scripts/oc-config.js and
 * oc-catalogue.js). Run once after changing those samples: node tests/fixtures/generate-fixtures.mjs
 *
 * The output follows docs/PUBLIC_API.md in the dashboard repository. Image URLs contain the
 * placeholder {{BASE}}, which the fixture server replaces with its own origin.
 * Availability values are assigned deterministically so every case is covered: in_stock,
 * low_stock, out_of_stock (per variant and per branch) and made_to_order (no branch list).
 */
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const LEGACY = join(ROOT, "legacy", "ghl-builder", "scripts");
const OUT = join(ROOT, "tests", "fixtures", "data");

const ctx = { window: {} };
vm.createContext(ctx);
vm.runInContext(readFileSync(join(LEGACY, "oc-config.js"), "utf8"), ctx);
vm.runInContext(readFileSync(join(LEGACY, "oc-catalogue.js"), "utf8"), ctx);
const config = ctx.window.OC_CONFIG;
const catalogue = ctx.window.OC_CATALOGUE.products;

/** Deterministic RFC 4122-shaped (version 4) UUID from a name. */
function uuid(name) {
  const h = createHash("sha1").update(`lensmere-fixture:${name}`).digest("hex");
  const variant = ((parseInt(h[16], 16) & 0x3) | 0x8).toString(16);
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-${variant}${h.slice(17, 20)}-${h.slice(20, 32)}`;
}
const UPDATED = "2026-10-15T09:00:00.000Z";

/* ── Branches ─────────────────────────────────────────────────────────────── */
const CODES = { makati: "MKT", "quezon-city": "QC", pasig: "PSG" };
const branches = config.branches.map((b) => ({
  id: uuid(`branch:${b.id}`),
  code: CODES[b.id],
  name: b.name,
  address: b.address,
  phone: b.phone,
  email: `${b.id}@lensmere.example`,
  mapUrl: null,
  imageUrl: null,
  hours: Object.fromEntries(["mon", "tue", "wed", "thu", "fri", "sat", "sun"].map((d) => [d, b.hours[d] ? { open: b.hours[d][0], close: b.hours[d][1] } : null])),
}));
const [MKT] = branches;

/* ── Services (bookable appointment types) ────────────────────────────────── */
// One service has a GoHighLevel calendar for one branch (eye exam at Makati); the rest are unmapped.
const services = [
  {
    id: uuid("service:eye_exam"),
    code: "eye_exam",
    name: "Comprehensive eye exam",
    description: "Refraction, eye-health screening and a clear explanation of your prescription.",
    durationMinutes: 45,
    priceCents: 50000,
    calendars: [{ branchId: MKT.id, calendarId: "FixtureEyeExamMKT01" }],
  },
  {
    id: uuid("service:contact_lens_consultation"),
    code: "contact_lens_consultation",
    name: "Contact lens consultation",
    description: "Measurements, trial lenses and a handling lesson — for first-time and experienced wearers.",
    durationMinutes: 30,
    priceCents: 80000,
    calendars: [],
  },
  {
    id: uuid("service:frame_lens_consultation"),
    code: "frame_lens_consultation",
    name: "Frame & lens consultation",
    description: "Help choosing frames and lens options for how you work, drive and read.",
    durationMinutes: 30,
    priceCents: 0,
    calendars: [],
  },
];

const inBranchServices = [
  { id: uuid("inbranch:single-vision"), name: "Single-vision prescription lenses", description: "Made to your prescription by our partner laboratory. Ready in 3–5 days.", priceCents: 150000, fromPrice: true },
  { id: uuid("inbranch:progressive"), name: "Progressive lenses", description: "Near, intermediate and distance in one lens, measured and fitted in branch. Ready in 5–7 days.", priceCents: 450000, fromPrice: true },
  { id: uuid("inbranch:lens-replacement"), name: "Lens replacement", description: "New lenses in the frame you already love. Bring your frame and prescription; we check the frame's condition first.", priceCents: 120000, fromPrice: true },
  { id: uuid("inbranch:repairs"), name: "Frame adjustment & repairs", description: "Free adjustments for any frame bought from us; screws, nose pads and hinge repairs while you wait where possible.", priceCents: null, fromPrice: false },
];

/* ── Categories ───────────────────────────────────────────────────────────── */
const CATEGORY = {
  frames: { slug: "frames", name: "Frames", kind: "frames" },
  sunglasses: { slug: "sunglasses", name: "Sunglasses", kind: "sunglasses" },
  "contact-lenses": { slug: "contact-lenses", name: "Contact lenses", kind: "contact_lenses" },
  "cleaning-care": { slug: "cleaning-care", name: "Cleaning & care", kind: "accessories" },
  cases: { slug: "cases", name: "Cases", kind: "accessories" },
  accessories: { slug: "accessories", name: "Accessories", kind: "accessories" },
};
function categoryOf(p) {
  if (p.category !== "accessories") return CATEGORY[p.category];
  if (/case/i.test(p.name)) return CATEGORY.cases;
  if (/cloth|spray|solution/i.test(p.name)) return CATEGORY["cleaning-care"];
  return CATEGORY.accessories;
}

/* ── Availability (deterministic) ─────────────────────────────────────────── */
const MADE_TO_ORDER = new Set(["aquasoft-toric-monthly-6-pack"]);
const FIXED = {
  // Arden 101 covers every per-variant case.
  "arden-101": [
    ["in_stock", "low_stock", "out_of_stock"],
    ["low_stock", "out_of_stock", "out_of_stock"],
    ["out_of_stock", "out_of_stock", "out_of_stock"],
    ["in_stock", "in_stock", "in_stock"],
  ],
  "kiyo-titan": [["low_stock", "out_of_stock", "out_of_stock"]],
  "solenne-muse": [["out_of_stock", "out_of_stock", "out_of_stock"]],
  "halden-pilot": [["low_stock", "low_stock", "out_of_stock"]],
};
function branchStates(productId, variantIndex) {
  if (FIXED[productId]) return FIXED[productId][variantIndex] ?? FIXED[productId][0];
  const h = createHash("sha1").update(`${productId}:${variantIndex}`).digest();
  return [0, 1, 2].map((i) => (h[i] % 10 < 6 ? "in_stock" : h[i] % 10 < 8 ? "low_stock" : "out_of_stock"));
}
function rollUp(states) {
  if (states.includes("in_stock")) return "in_stock";
  if (states.includes("low_stock")) return "low_stock";
  return "out_of_stock";
}

function options(label) {
  let m = /^(\d+) · (.+)$/.exec(label);
  if (m) return { size: m[1], colour: m[2] };
  m = /^(.+) lens$/i.exec(label);
  if (m) return { lens: m[1] };
  m = /^Power (.+)$/.exec(label);
  if (m) return { power: m[1] };
  return { option: label };
}
function attributes(p, category) {
  const shape = /frame-(\w+)-|sun-(\w+)-/.exec(p.image);
  const attrs = {};
  if (shape) attrs.shape = shape[1] || shape[2];
  if (category.kind === "frames" || category.kind === "sunglasses") attrs.material = /gold|wire|titan|aviator/i.test(p.image + p.name) ? "metal" : "acetate";
  return attrs;
}

const details = catalogue.map((p) => {
  const category = categoryOf(p);
  const madeToOrder = MADE_TO_ORDER.has(p.id);
  const base = Math.round(p.price * 100);
  const sizes = [...new Set(p.variants.map((v) => options(v.label).size).filter(Boolean))].sort();
  const variants = p.variants.map((v, i) => {
    const opts = options(v.label);
    // Larger frame sizes cost a little more, so "from" pricing is exercised (as in the contract example).
    const priceCents = opts.size && sizes.length > 1 && opts.size !== sizes[0] ? base + 20000 : base;
    if (madeToOrder) {
      return { id: uuid(`variant:${p.id}:${i}`), label: v.label, options: opts, priceCents, sku: `${p.id.toUpperCase().slice(0, 12)}-${i + 1}`, availability: "made_to_order", branches: [] };
    }
    const states = branchStates(p.id, i);
    return {
      id: uuid(`variant:${p.id}:${i}`),
      label: v.label,
      options: opts,
      priceCents,
      sku: `${p.id.toUpperCase().slice(0, 12)}-${i + 1}`,
      availability: rollUp(states),
      branches: branches.map((b, bi) => ({ branchId: b.id, branchName: b.name, availability: states[bi] })),
    };
  });
  const prices = variants.map((v) => v.priceCents);
  return {
    id: uuid(`product:${p.id}`),
    slug: p.id,
    name: p.name,
    brand: p.brand,
    category,
    description: p.note ? `${p.description} ${p.note}`.trim() : p.description,
    imageUrl: `{{BASE}}/${p.image}`,
    priceFromCents: Math.min(...prices),
    priceToCents: Math.max(...prices),
    variantCount: variants.length,
    availability: madeToOrder ? "made_to_order" : rollUp(variants.map((v) => v.availability)),
    updatedAt: UPDATED,
    attributes: attributes(p, category),
    variants,
  };
});

const categories = Object.values(CATEGORY).map((c) => ({ ...c, productCount: details.filter((d) => d.category.slug === c.slug).length }));

const site = {
  business: {
    name: config.business.name,
    legalName: config.business.legalName,
    tagline: config.business.tagline,
    description: "Comprehensive eye examinations, prescription eyewear and contact lens fittings across three branches.",
    logoUrl: null,
    phone: config.business.phone,
    email: config.business.email,
    address: config.business.address,
    website: null,
    timezone: config.business.timezone,
    currency: config.business.currency,
    locale: config.business.locale,
    taxName: "VAT",
    pricesIncludeTax: true,
    brandColor: "#1F2B22",
    accentColor: "#B5E14A",
    isDemo: true,
  },
  content: {
    heroEyebrow: null,
    heroTitle: "Clear vision, unhurried care, and frames that feel like you.",
    heroBody: "Comprehensive eye examinations, prescription eyewear and contact lens fittings across three branches — with optometrists who take the time to explain your options.",
    aboutTitle: "It starts with listening.",
    aboutBody:
      "Choosing eyewear is about more than picking a frame. We begin with a thorough examination, explain what we find in plain language, and help you weigh lens and frame options against how you actually live — screens, sport, driving, reading.\n\nFrom the first check to the final fitting, every visit is meant to feel considered and never rushed.",
    values: [
      { title: "Thorough eye exams", body: "Refraction, eye-health screening and a clear explanation of your prescription." },
      { title: "Honest guidance", body: "Lens and frame recommendations that fit your needs and budget." },
      { title: "Made-to-measure lenses", body: "Single vision, progressives and specialty lenses from our partner laboratory." },
      { title: "Aftercare included", body: "Free adjustments and fit checks for the life of your frames." },
    ],
    faqs: config.faqs.map((f) => ({ question: f.q, answer: f.a })),
    privacyContactEmail: config.legal.privacyEmail,
  },
  branches,
  services,
  inBranchServices,
  categories,
  booking: { widgetBase: "https://api.leadconnectorhq.com/widget/booking/", ghlConnected: true },
  generatedAt: UPDATED,
};

mkdirSync(OUT, { recursive: true });
writeFileSync(join(OUT, "site.json"), JSON.stringify(site, null, 2) + "\n");
writeFileSync(join(OUT, "products.json"), JSON.stringify(details, null, 2) + "\n");
console.log(`wrote ${details.length} products, ${branches.length} branches, ${services.length} services, ${categories.length} categories → tests/fixtures/data/`);
