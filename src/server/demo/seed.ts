/**
 * Demo data generator. Builds a fictional optical business ("Lensmere Optical") and then
 * simulates ~9 months of trading by calling the REAL services with a simulated clock. Every sale,
 * payment, stock movement, order, appointment and lead therefore obeys the same business rules as
 * the live app, and every dashboard total is derived from these records.
 */
import { eq, sql } from "drizzle-orm";
import { resolvePermissions, type Role } from "@/lib/permissions";
export { DEMO_ACCOUNTS, DEMO_DOMAIN, DEMO_PASSWORD, DEMO_SLUG } from "./constants";
import type { WeekHours, WebsiteContent } from "@/lib/types";
import { hashPassword } from "@/server/auth/password";
import { getDb } from "@/server/db";
import {
  appointmentTypes,
  branches,
  businesses,
  businessMemberships,
  expenseCategories,
  inventoryLocations,
  productCategories,
  purchaseOrderItems,
  users,
} from "@/server/db/schema";
import { zonedInstant } from "@/server/services/appointments";
import * as appointmentsSvc from "@/server/services/appointments";
import * as catalog from "@/server/services/catalog";
import type { Ctx } from "@/server/services/core";
import * as customersSvc from "@/server/services/customers";
import * as expensesSvc from "@/server/services/expenses";
import * as inventorySvc from "@/server/services/inventory";
import * as leadsSvc from "@/server/services/leads";
import * as purchasing from "@/server/services/purchasing";
import * as salesSvc from "@/server/services/sales";
import { DEMO_ACCOUNTS, DEMO_DOMAIN, DEMO_PASSWORD, DEMO_SLUG, type StaffSpec } from "./constants";
import { CARE, CONTACTS, FIRST_NAMES, FRAMES, LAST_NAMES, POWERS, RX_LENSES, SERVICES, SUNGLASSES, SUPPLIERS } from "./catalog-data";

const TZ = "Asia/Manila";

const EXTRA_STAFF: StaffSpec[] = [
  { email: `miguel.tan@${DEMO_DOMAIN}`, name: "Dr. Miguel Tan", role: "practitioner", title: "Optometrist", branch: "QC", takes: true, color: "#7A5A3A" },
  { email: `rina.bautista@${DEMO_DOMAIN}`, name: "Dr. Rina Bautista", role: "practitioner", title: "Optometrist", branch: "PSG", takes: true, color: "#3E5C76" },
  { email: `mia.garcia@${DEMO_DOMAIN}`, name: "Mia Garcia", role: "sales", title: "Optical sales associate", branch: "MKT" },
  { email: `jo.ramos@${DEMO_DOMAIN}`, name: "Jo Ramos", role: "sales", title: "Optical sales associate", branch: "PSG" },
];

const WEEK_HOURS: WeekHours = {
  mon: { open: "10:00", close: "19:00" },
  tue: { open: "10:00", close: "19:00" },
  wed: { open: "10:00", close: "19:00" },
  thu: { open: "10:00", close: "19:00" },
  fri: { open: "10:00", close: "19:00" },
  sat: { open: "10:00", close: "19:00" },
  sun: { open: "11:00", close: "17:00" },
};

const WEBSITE: WebsiteContent = {
  heroEyebrow: "Eye care & eyewear",
  heroTitle: "Clear vision, unhurried care, and frames that feel like you.",
  heroBody:
    "Comprehensive eye examinations, prescription eyewear and contact lens fittings across three branches — with optometrists who take the time to explain your options.",
  aboutTitle: "It starts with listening.",
  aboutBody:
    "Choosing eyewear is about more than picking a frame. We begin with a thorough examination, explain what we find in plain language, and help you weigh lens and frame options against how you actually live — screens, sport, driving, reading. From the first check to the final fitting, every visit is meant to feel considered and never rushed.",
  values: [
    { title: "Thorough eye exams", body: "Refraction, eye-health screening and a clear explanation of your prescription." },
    { title: "Honest guidance", body: "Lens and frame recommendations that fit your needs and budget." },
    { title: "Made-to-measure lenses", body: "Single vision, progressives and specialty lenses from our partner laboratory." },
    { title: "Aftercare included", body: "Free adjustments and fit checks for the life of your frames." },
  ],
  faqs: [
    { question: "Do I need an appointment for an eye exam?", answer: "Walk-ins are welcome when an optometrist is free, but booking guarantees your slot. Comprehensive exams take about 45 minutes." },
    { question: "How long do prescription glasses take?", answer: "Most single-vision orders are ready in 3–5 days. Progressive and specialty lenses take 5–7 days because they're made to measure at our partner laboratory." },
    { question: "Can I bring a prescription from another clinic?", answer: "Yes. Bring your written prescription (ideally less than a year old) and we'll fit lenses to it. We may recommend a quick check if it's older." },
    { question: "Which payment methods do you accept?", answer: "Cash, credit and debit cards, bank transfer, GCash and Maya. Orders can be reserved with a deposit and settled at pickup." },
    { question: "Do you fit contact lenses for first-time wearers?", answer: "Yes. A contact lens fitting includes measurements, trial lenses and a lesson on safe handling and care." },
    { question: "Is there a warranty on frames?", answer: "Frames carry a 6-month warranty against manufacturing defects, and adjustments are always free." },
  ],
  privacyContactEmail: `privacy@${DEMO_DOMAIN}`,
};

// ─── Deterministic randomness ────────────────────────────────────────────────

function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
let R = mulberry32(20261015);
const pick = <T>(arr: readonly T[]): T => arr[Math.floor(R() * arr.length)];
const int = (a: number, b: number) => a + Math.floor(R() * (b - a + 1));
const chance = (p: number) => R() < p;
function weighted<T>(items: [T, number][]): T {
  const total = items.reduce((s, [, w]) => s + w, 0);
  let x = R() * total;
  for (const [v, w] of items) {
    if ((x -= w) <= 0) return v;
  }
  return items[items.length - 1][0];
}
function poisson(lambda: number) {
  const L = Math.exp(-lambda);
  let k = 0;
  let p = 1;
  do {
    k++;
    p *= R();
  } while (p > L);
  return k - 1;
}
let keySeq = 0;
const key = (p: string) => `${p}-${(++keySeq).toString(36)}-${Math.floor(R() * 1e9).toString(36)}`;

// ─── Calendar helpers (calendar days in the business time zone) ──────────────

function addDays(day: string, n: number) {
  const [y, m, d] = day.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return t.toISOString().slice(0, 10);
}
const weekday = (day: string) => {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0 = Sunday
};
const hoursOf = (day: string) => (weekday(day) === 0 ? { open: 11 * 60, close: 17 * 60 } : { open: 10 * 60, close: 19 * 60 });
const hhmm = (min: number) => `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;
function randomTime(day: string, from?: number, to?: number, step = 5) {
  const h = hoursOf(day);
  const a = Math.max(h.open + 10, from ?? 0);
  const b = Math.min(h.close - 20, to ?? 24 * 60);
  if (b <= a) return hhmm(a);
  return hhmm(a + Math.floor((R() * (b - a)) / step) * step);
}
const todayLocal = () => new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());

// ─── Removal ─────────────────────────────────────────────────────────────────

/** Deletes demo businesses (is_demo = true) and demo-only user accounts. Never touches other businesses. */
export async function removeDemoData() {
  const db = getDb();
  const demo = await db.select({ id: businesses.id }).from(businesses).where(eq(businesses.isDemo, true));
  for (const b of demo) await db.delete(businesses).where(eq(businesses.id, b.id));
  await db.execute(sql`
    delete from users u
    where lower(u.email) like ${"%@" + DEMO_DOMAIN}
      and not exists (select 1 from business_memberships m where m.user_id = u.id)`);
  return demo.length;
}

// ─── Seed ────────────────────────────────────────────────────────────────────

type Variant = {
  id: string;
  productId: string;
  name: string;
  label: string;
  sku: string;
  price: number;
  cost: number;
  type: "stock" | "service" | "made_to_order";
  kind: string;
  supplier: string | null;
  reorderPoint: number;
  reorderQty: number;
  code?: string;
};

type Ev = { t: Date; label: string; run: () => Promise<void> };

export async function seedDemo(opts: { days?: number; log?: (m: string) => void } = {}) {
  const log = opts.log ?? ((m: string) => console.log(m));
  const DAYS = opts.days ?? 270;
  const db = getDb();
  R = mulberry32(20261015);
  keySeq = 0;
  const REAL_NOW = new Date();
  const today = todayLocal();
  const start = addDays(today, -DAYS);
  const clock = { now: zonedInstant(start, "08:00", TZ) };
  const setClock = (d: Date) => {
    clock.now = d > REAL_NOW ? REAL_NOW : d;
  };
  const failures = new Map<string, number>();
  const fail = (label: string, error: unknown) => {
    const msg = `${label}: ${error instanceof Error ? error.message : String(error)}`.slice(0, 160);
    failures.set(msg, (failures.get(msg) ?? 0) + 1);
  };

  // ── Business, branches, staff ──
  log("Creating demo business …");
  const [biz] = await db
    .insert(businesses)
    .values({
      slug: DEMO_SLUG,
      name: "Lensmere Optical",
      legalName: "Lensmere Optical Co. (demo)",
      tagline: "Eye care & eyewear",
      description: "A fictional three-branch optical business used to demonstrate the platform.",
      brandColor: "#1F2B22",
      accentColor: "#B5E14A",
      email: `hello@${DEMO_DOMAIN}`,
      phone: "+63 2 8000 0100",
      website: "https://lensmere.example",
      addressLine1: "2F Linden Arcade, 118 Lumen Street",
      city: "Makati City",
      region: "Metro Manila",
      postalCode: "1200",
      country: "PH",
      currency: "PHP",
      locale: "en-PH",
      timezone: TZ,
      taxName: "VAT",
      taxRateBps: 1200,
      pricesIncludeTax: true,
      taxRegistration: "000-000-000-00000 (demo)",
      receiptFooter: "Thank you for visiting Lensmere Optical. Frames include free adjustments. This is a demonstration receipt.",
      businessHours: WEEK_HOURS,
      websiteContent: WEBSITE,
      settings: { maxStaffDiscountBps: 2000, appointmentsAuthority: "platform" },
      isDemo: true,
      createdAt: clock.now,
      updatedAt: clock.now,
    })
    .returning();
  const businessId = biz.id;

  const branchSpecs = [
    { code: "MKT", name: "Makati", addressLine1: "2F Linden Arcade, 118 Lumen Street", city: "Makati City", phone: "+63 2 8000 0101", imageUrl: null },
    { code: "QC", name: "Quezon City", addressLine1: "Unit 4, 52 Verde Avenue", city: "Quezon City", phone: "+63 2 8000 0102", imageUrl: null },
    { code: "PSG", name: "Pasig", addressLine1: "G/F Alder Place, 9 Alder Road", city: "Pasig City", phone: "+63 2 8000 0103", imageUrl: null },
  ];
  const branchByCode: Record<string, { id: string; locationId: string; name: string }> = {};
  for (const [i, b] of branchSpecs.entries()) {
    const [row] = await db
      .insert(branches)
      .values({ ...b, businessId, region: "Metro Manila", email: `${b.code.toLowerCase()}@${DEMO_DOMAIN}`, sortOrder: i, createdAt: clock.now, updatedAt: clock.now })
      .returning();
    const [loc] = await db
      .insert(inventoryLocations)
      .values({ businessId, branchId: row.id, name: `${b.name} stockroom`, code: `${b.code}-STOCK` })
      .returning();
    branchByCode[b.code] = { id: row.id, locationId: loc.id, name: b.name };
  }

  const passwordHash = await hashPassword(DEMO_PASSWORD);
  const staff: Record<string, { membershipId: string; role: Role; name: string; branch: string; ctx: Ctx }> = {};
  for (const s of [...DEMO_ACCOUNTS, ...EXTRA_STAFF]) {
    const [existing] = await db.select().from(users).where(sql`lower(${users.email}) = ${s.email}`).limit(1);
    const user = existing ?? (await db.insert(users).values({ email: s.email, name: s.name, passwordHash }).returning())[0];
    const [m] = await db
      .insert(businessMemberships)
      .values({
        businessId,
        userId: user.id,
        role: s.role,
        title: s.title,
        defaultBranchId: branchByCode[s.branch].id,
        takesAppointments: Boolean(s.takes),
        calendarColor: s.color ?? null,
        createdAt: clock.now,
      })
      .returning();
    staff[s.email] = {
      membershipId: m.id,
      role: s.role,
      name: s.name,
      branch: s.branch,
      ctx: {
        userId: user.id,
        membershipId: m.id,
        businessId,
        role: s.role,
        permissions: resolvePermissions(s.role, {}),
        actorLabel: s.name,
        branchId: branchByCode[s.branch].id,
        now: () => clock.now,
      },
    };
  }
  const S = (local: string) => staff[`${local}@${DEMO_DOMAIN}`];
  const owner = S("owner").ctx;
  const manager = S("manager").ctx;
  const inventoryCtx = S("inventory").ctx;
  const websiteCtx: Ctx = {
    userId: null,
    membershipId: null,
    businessId,
    role: "system",
    permissions: new Set(["leads.manage", "leads.view", "leads.view_all"]),
    actorLabel: "Website",
    branchId: null,
    now: () => clock.now,
  };
  const salesFor: Record<string, Ctx[]> = { MKT: [S("mia.garcia").ctx, manager], QC: [S("sales").ctx], PSG: [S("jo.ramos").ctx] };
  const practitionerFor: Record<string, { membershipId: string; ctx: Ctx }> = {
    MKT: { membershipId: S("optometrist").membershipId, ctx: S("optometrist").ctx },
    QC: { membershipId: S("miguel.tan").membershipId, ctx: S("miguel.tan").ctx },
    PSG: { membershipId: S("rina.bautista").membershipId, ctx: S("rina.bautista").ctx },
  };
  const BRANCHES = ["MKT", "QC", "PSG"] as const;
  const ctxByMembership = new Map(Object.values(staff).map((s) => [s.membershipId, s.ctx]));

  // ── Reference data ──
  const apptTypeRows = await db
    .insert(appointmentTypes)
    .values([
      { businessId, code: "eye_exam", name: "Comprehensive eye exam", description: "Refraction, eye-health screening and prescription.", durationMinutes: 45, requiresPractitioner: true, isPublic: true, priceCents: 50000, sortOrder: 1 },
      { businessId, code: "contact_lens_fitting", name: "Contact lens fitting", description: "Measurements, trial lenses and handling lesson.", durationMinutes: 30, requiresPractitioner: true, isPublic: true, priceCents: 80000, sortOrder: 2 },
      { businessId, code: "frame_consultation", name: "Frame & lens consultation", description: "Help choosing frames and lens options.", durationMinutes: 30, requiresPractitioner: false, isPublic: true, priceCents: null, sortOrder: 3 },
      { businessId, code: "follow_up", name: "Follow-up check", description: "Review after a new prescription or fitting.", durationMinutes: 20, requiresPractitioner: true, isPublic: false, priceCents: null, sortOrder: 4 },
      { businessId, code: "pickup", name: "Eyewear pickup & fitting", description: "Collect and fit finished eyewear.", durationMinutes: 15, requiresPractitioner: false, isPublic: false, priceCents: null, sortOrder: 5 },
    ])
    .returning();
  const apptType = Object.fromEntries(apptTypeRows.map((t) => [t.code, t]));

  const categoryRows = await db
    .insert(productCategories)
    .values([
      { businessId, name: "Frames", slug: "frames", kind: "frames", sortOrder: 1 },
      { businessId, name: "Sunglasses", slug: "sunglasses", kind: "sunglasses", sortOrder: 2 },
      { businessId, name: "Prescription lenses", slug: "prescription-lenses", kind: "rx_lenses", sortOrder: 3 },
      { businessId, name: "Contact lenses", slug: "contact-lenses", kind: "contact_lenses", sortOrder: 4 },
      { businessId, name: "Cleaning & care", slug: "cleaning-care", kind: "cleaning", sortOrder: 5 },
      { businessId, name: "Cases", slug: "cases", kind: "cases", sortOrder: 6 },
      { businessId, name: "Accessories", slug: "accessories", kind: "accessories", sortOrder: 7 },
      { businessId, name: "Services", slug: "services", kind: "services", sortOrder: 8 },
    ])
    .returning();
  const cat = Object.fromEntries(categoryRows.map((c) => [c.kind, c]));

  const expenseCatRows = await db
    .insert(expenseCategories)
    .values(["Rent", "Payroll", "Utilities", "Laboratory fees", "Marketing", "Store supplies", "Maintenance & repairs", "Professional fees"].map((name, i) => ({ businessId, name, sortOrder: i })))
    .returning();
  const expCat = Object.fromEntries(expenseCatRows.map((c) => [c.name, c.id]));

  log("Creating suppliers …");
  const supplierId: Record<string, string> = {};
  for (const s of SUPPLIERS) {
    const row = await purchasing.saveSupplier(owner, null, { ...s, address: "Metro Manila (demo)", notes: null, isActive: true });
    supplierId[s.code] = row!.id;
  }

  // ── Catalogue with opening stock ──
  log("Creating catalogue and opening stock …");
  const variants: Variant[] = [];
  const stock = new Map<string, { onHand: number; reserved: number }>();
  const sk = (variantId: string, loc: string) => `${variantId}|${loc}`;
  const avail = (v: Variant, loc: string) => {
    const s = stock.get(sk(v.id, loc));
    return s ? s.onHand - s.reserved : 0;
  };
  const bump = (v: Variant, loc: string, onHand: number, reserved = 0) => {
    const s = stock.get(sk(v.id, loc)) ?? { onHand: 0, reserved: 0 };
    s.onHand += onHand;
    s.reserved += reserved;
    stock.set(sk(v.id, loc), s);
  };
  const branchMult: Record<string, number> = { MKT: 1.25, QC: 1, PSG: 0.8 };

  async function addProduct(
    p: { name: string; brand: string | null; kind: string; type: "stock" | "service" | "made_to_order"; image: string; supplier: string | null; description: string; website?: boolean; taxExempt?: boolean; attributes?: Record<string, string> },
    vs: { label: string; sku: string; price: number; cost: number; options?: Record<string, string>; reorderPoint?: number; reorderQty?: number; opening?: [number, number]; code?: string }[],
  ) {
    const opening: { variantIndex: number; locationId: string; quantity: number }[] = [];
    if (p.type === "stock") {
      vs.forEach((v, i) => {
        for (const b of BRANCHES) {
          const [lo, hi] = v.opening ?? [3, 6];
          opening.push({ variantIndex: i, locationId: branchByCode[b].locationId, quantity: Math.max(1, Math.round(int(lo, hi) * branchMult[b])) });
        }
      });
    }
    const res = await catalog.createProduct(
      owner,
      {
        name: p.name,
        brand: p.brand,
        description: p.description,
        imageUrl: `/products/${p.image}.svg`,
        categoryId: cat[p.kind].id,
        supplierId: p.supplier ? supplierId[p.supplier] : null,
        productType: p.type,
        taxExempt: p.taxExempt ?? false,
        showOnWebsite: p.website ?? false,
        isActive: true,
        attributes: p.attributes ?? {},
        variants: vs.map((v) => ({
          sku: v.sku,
          barcode: p.type === "stock" ? `48${String(1000000000 + variants.length * 7 + vs.indexOf(v)).slice(-10)}` : null,
          label: v.label,
          options: v.options ?? {},
          priceCents: v.price * 100,
          costCents: v.cost * 100,
          reorderPoint: v.reorderPoint ?? 0,
          reorderQty: v.reorderQty ?? 0,
          isActive: true,
        })),
      },
      opening,
    );
    res!.variantIds.forEach((id, i) => {
      const v = vs[i];
      const rec: Variant = {
        id,
        productId: res!.productId,
        name: p.name,
        label: v.label,
        sku: v.sku,
        price: v.price * 100,
        cost: v.cost * 100,
        type: p.type,
        kind: p.kind,
        supplier: p.supplier,
        reorderPoint: v.reorderPoint ?? 0,
        reorderQty: v.reorderQty ?? 0,
        code: v.code,
      };
      variants.push(rec);
    });
    for (const o of opening) bump(variants[variants.length - vs.length + o.variantIndex], o.locationId, o.quantity);
  }

  const colorName: Record<string, string> = { black: "Black", tortoise: "Tortoise", crystal: "Crystal", gold: "Gold" };
  for (const f of FRAMES) {
    const vs = f.colors.flatMap((c) =>
      f.sizes.map((size) => ({
        label: `${size} · ${colorName[c]}`,
        sku: `FR-${f.name.replace(/[^A-Za-z0-9]/g, "").slice(0, 8).toUpperCase()}-${c.slice(0, 3).toUpperCase()}-${size}`,
        price: f.price,
        cost: Math.round(f.price * 0.32),
        options: { size, color: colorName[c], material: f.material === "metal" ? "Metal" : "Acetate" },
        reorderPoint: 1,
        reorderQty: 3,
        opening: [3, 5] as [number, number],
      })),
    );
    await addProduct(
      { name: f.name, brand: f.brand, kind: "frames", type: "stock", image: `frame-${f.shape}-${f.colors[0]}`, supplier: f.supplier, website: true, description: `${f.material === "metal" ? "Lightweight metal" : "Hand-polished acetate"} ${f.shape} frame. Available in ${f.colors.map((c) => colorName[c].toLowerCase()).join(", ")}.`, attributes: { shape: f.shape, material: f.material } },
      vs,
    );
  }
  for (const s of SUNGLASSES) {
    await addProduct(
      { name: s.name, brand: s.brand, kind: "sunglasses", type: "stock", image: `sun-${s.shape}-${s.tints[0]}`, supplier: "SUN", website: true, description: `UV400 ${s.shape} sunglasses.`, attributes: { shape: s.shape } },
      s.tints.map((t) => ({ label: `${t[0].toUpperCase()}${t.slice(1)} lens`, sku: `SG-${s.name.replace(/[^A-Za-z0-9]/g, "").slice(0, 8).toUpperCase()}-${t.slice(0, 3).toUpperCase()}`, price: s.price, cost: Math.round(s.price * 0.37), options: { tint: t }, reorderPoint: 1, reorderQty: 3, opening: [2, 4] as [number, number] })),
    );
  }
  for (const c of CONTACTS) {
    await addProduct(
      { name: c.name, brand: c.brand, kind: "contact_lenses", type: "stock", image: "contact-box", supplier: "ASC", website: true, description: "Soft contact lenses. Requires a valid contact lens prescription." },
      POWERS.map((pw) => ({ label: `Power ${pw}`, sku: `CL-${c.name.replace(/[^A-Za-z0-9]/g, "").slice(0, 10).toUpperCase()}${pw.replace(/[^0-9]/g, "")}`, price: c.price, cost: c.cost, options: { power: pw }, reorderPoint: 2, reorderQty: 6, opening: [4, 8] as [number, number] })),
    );
  }
  for (const [i, c] of CARE.entries()) {
    await addProduct(
      { name: c.name, brand: "Lensmere Care", kind: c.category, type: "stock", image: c.image, supplier: "CPS", description: `${c.name}.` },
      [{ label: "Default", sku: `AC-${String(i + 1).padStart(3, "0")}-${c.name.replace(/[^A-Za-z]/g, "").slice(0, 6).toUpperCase()}`, price: c.price, cost: c.cost, reorderPoint: 4, reorderQty: 12, opening: [8, 16] as [number, number] }],
    );
  }
  for (const [i, l] of RX_LENSES.entries()) {
    await addProduct(
      { name: l.name, brand: "Clarity Lab", kind: "rx_lenses", type: "made_to_order", image: "rx-lens", supplier: "CLL", description: "Made to your prescription at our partner laboratory." },
      [{ label: "Pair", sku: `RX-${String(i + 1).padStart(3, "0")}-${l.name.replace(/[^A-Za-z]/g, "").slice(0, 6).toUpperCase()}`, price: l.price, cost: l.cost }],
    );
  }
  for (const s of SERVICES) {
    await addProduct(
      { name: s.name, brand: null, kind: "services", type: "service", image: "service-exam", supplier: null, description: s.name, taxExempt: s.code === "eye_exam" },
      [{ label: "Service", sku: `SV-${s.code.toUpperCase()}`, price: s.price, cost: 0, code: s.code }],
    );
  }
  const byKind = (k: string) => variants.filter((v) => v.kind === k);
  const service = (code: string) => variants.find((v) => v.code === code)!;
  const frames = byKind("frames");
  const sunglasses = byKind("sunglasses");
  const contacts = byKind("contact_lenses");
  const care = [...byKind("cleaning"), ...byKind("cases"), ...byKind("accessories")];
  const solutions = byKind("cleaning").filter((v) => v.name.startsWith("Multipurpose"));
  const cases = byKind("cases");
  const rxLenses = byKind("rx_lenses");

  // ── Customers ──
  log("Creating customers …");
  type Cust = { id: string; branch: string; rx: string | null; age: number; cl: boolean };
  const customers: Cust[] = [];
  const usedNames = new Set<string>();
  const personName = () => {
    for (let i = 0; i < 50; i++) {
      const n = [pick(FIRST_NAMES), pick(LAST_NAMES)] as const;
      if (!usedNames.has(n.join(" "))) {
        usedNames.add(n.join(" "));
        return n;
      }
    }
    return [pick(FIRST_NAMES), pick(LAST_NAMES)] as const;
  };
  let phoneSeq = 1000;
  async function newCustomer(ctx: Ctx, branch: string, source: string) {
    const [first, last] = personName();
    const handle = `${first}.${last}`.toLowerCase().replace(/[^a-z.]/g, "");
    const row = await customersSvc.createCustomer(ctx, {
      firstName: first,
      lastName: last,
      email: chance(0.8) ? `${handle}${int(1, 99)}@example.com` : null,
      phone: `+63 917 000 ${String(phoneSeq++).padStart(4, "0")}`,
      city: { MKT: "Makati City", QC: "Quezon City", PSG: "Pasig City" }[branch] ?? null,
      source,
      homeBranchId: branchByCode[branch].id,
      marketingConsent: chance(0.45),
      smsConsent: chance(0.6),
      birthDate: `${int(1958, 2012)}-${String(int(1, 12)).padStart(2, "0")}-${String(int(1, 28)).padStart(2, "0")}`,
    });
    const c: Cust = { id: row!.id, branch, rx: null, age: 2026 - Number(row!.birthDate!.slice(0, 4)), cl: chance(0.25) };
    customers.push(c);
    return c;
  }
  for (let i = 0; i < 95; i++) {
    setClock(zonedInstant(addDays(start, -int(5, 360)), randomTime(start), TZ));
    await newCustomer(owner, weighted([["MKT", 4], ["QC", 3.5], ["PSG", 2.5]]), weighted([["walk_in", 5], ["referral", 2], ["website", 2], ["facebook", 1]]));
  }

  async function prescribe(c: Cust, practitioner: Ctx, day: string) {
    const sph = () => (-int(1, 24) * 0.25).toFixed(2);
    const cyl = () => (chance(0.5) ? "0.00" : (-int(1, 6) * 0.25).toFixed(2));
    const add = c.age >= 42 ? (int(4, 10) * 0.25).toFixed(2) : null;
    const res = await customersSvc.savePrescription(practitioner, null, {
      customerId: c.id,
      kind: c.cl && chance(0.5) ? "contact_lens" : "spectacles",
      examinedOn: day,
      expiresOn: addDays(day, 365),
      practitionerMembershipId: practitioner.membershipId,
      odSphere: sph(),
      odCylinder: cyl(),
      odAxis: int(1, 18) * 10,
      odAdd: add,
      osSphere: sph(),
      osCylinder: cyl(),
      osAxis: int(1, 18) * 10,
      osAdd: add,
      pdDistance: (int(116, 136) / 2).toFixed(1),
      notes: chance(0.2) ? "Advised blue-light filter for prolonged screen use." : null,
    });
    c.rx = res!.prescriptionId;
  }

  // ── Agenda ──
  const agenda = new Map<string, Ev[]>();
  const schedule = (day: string, time: string, label: string, run: () => Promise<void>) => {
    const t = zonedInstant(day, time, TZ);
    if (t > REAL_NOW) return false;
    const list = agenda.get(day) ?? [];
    list.push({ t, label, run });
    agenda.set(day, list);
    return true;
  };

  const payMethod = () => weighted<"cash" | "gcash" | "card" | "maya" | "bank_transfer" | "other">([["cash", 38], ["gcash", 27], ["card", 22], ["maya", 8], ["bank_transfer", 3], ["other", 2]]);
  let refSeq = 100000;
  const payment = (method: string, amountCents: number) => {
    const tendered = method === "cash" ? Math.ceil(amountCents / 50000) * 50000 : null;
    const reference = method === "cash" ? null : method === "card" ? `AUTH${refSeq++}` : method === "gcash" ? `GC${refSeq++}` : method === "maya" ? `MY${refSeq++}` : `REF${refSeq++}`;
    return { method: method as "cash", amountCents, tenderedCents: tendered && tendered >= amountCents ? tendered : null, reference };
  };
  const discount = () =>
    weighted<{ type: "percent"; valueBps: number } | null>([
      [null, 85],
      [{ type: "percent", valueBps: 2000 }, 8], // senior citizen / PWD
      [{ type: "percent", valueBps: 1000 }, 7], // promo
    ]);
  const priceOf = (items: { v: Variant; q: number; price?: number }[], d: { valueBps: number } | null) => {
    const sub = items.reduce((s, i) => s + (i.price ?? i.v.price) * i.q, 0);
    return d ? sub - Math.round((sub * d.valueBps) / 10000) : sub;
  };

  const stats = { sales: 0, orders: 0, appointments: 0, leads: 0, refunds: 0, purchaseOrders: 0, expenses: 0 };

  async function posSale(branch: string, day: string, time: string, items: { v: Variant; q: number }[], customer: Cust | null, opts: { partial?: boolean; seller?: Ctx } = {}) {
    const loc = branchByCode[branch].locationId;
    for (const i of items) if (i.v.type === "stock" && avail(i.v, loc) < i.q) return null;
    const seller = opts.seller ?? pick(salesFor[branch]);
    setClock(zonedInstant(day, time, TZ));
    const d = customer ? discount() : null;
    const total = priceOf(items, d);
    const partial = Boolean(opts.partial && customer && total > 300000);
    const paidNow = partial ? Math.round(total * 0.5 / 100) * 100 : total;
    const method = payMethod();
    const res = await salesSvc.checkout(seller, {
      branchId: branchByCode[branch].id,
      customerId: customer?.id ?? null,
      items: items.map((i) => ({ variantId: i.v.id, quantity: i.q, lineDiscountCents: 0 })),
      orderDiscount: d,
      payments: paidNow > 0 ? [payment(method, paidNow)] : [],
      notes: null,
      idempotencyKey: key("pos"),
    });
    for (const i of items) if (i.v.type === "stock") bump(i.v, loc, -i.q);
    stats.sales++;
    if (partial) {
      const settleDay = addDays(day, int(3, 28));
      const old = Date.parse(today) - Date.parse(day) > 75 * 86_400_000;
      if (chance(old ? 0.99 : 0.8)) {
        schedule(settleDay, randomTime(settleDay), "settle", async () => {
          setClock(zonedInstant(settleDay, randomTime(settleDay), TZ));
          await salesSvc.recordPayment(pick(salesFor[branch]), { saleId: res!.saleId, ...payment(payMethod(), res!.balanceDueCents), notes: "Balance settled", idempotencyKey: key("pay") });
        });
      }
    }
    // Occasional return of a stocked item.
    const returnable = items.filter((i) => i.v.type === "stock");
    if (!partial && returnable.length && chance(0.025)) {
      const rDay = addDays(day, int(1, 6));
      const line = returnable[0];
      schedule(rDay, randomTime(rDay), "refund", async () => {
        setClock(zonedInstant(rDay, randomTime(rDay), TZ));
        const sale = await salesSvc.getSale(manager, res!.saleId);
        const item = sale.items.find((x) => x.variantId === line.v.id)!;
        const restock = chance(0.75);
        await salesSvc.refundSale(manager, {
          saleId: res!.saleId,
          items: [{ saleItemId: item.id, quantity: 1, restock }],
          method: method === "other" ? "cash" : method,
          reason: restock ? weighted([["Changed mind — unopened", 2], ["Wrong size", 1]]) : "Defective on arrival",
          idempotencyKey: key("rf"),
        });
        if (restock) bump(line.v, loc, 1);
        stats.refunds++;
      });
    }
    return res;
  }

  type OpenOrder = { saleId: string; branch: string; frame: Variant | null; caseItem: Variant | null };
  async function createOrderFor(c: Cust, branch: string, day: string, time: string) {
    const loc = branchByCode[branch].locationId;
    const frameOptions = frames.filter((v) => avail(v, loc) > 0);
    const ownFrame = frameOptions.length === 0 || chance(0.07);
    const frame = ownFrame ? null : pick(frameOptions);
    const lens = weighted<Variant>(rxLenses.map((v, i) => [v, [30, 22, 12, 14, 8, 14][i] ?? 5]));
    const caseItem = chance(0.3) ? cases.find((v) => avail(v, loc) > 0) ?? null : null;
    const items = [
      ...(frame ? [{ v: frame, q: 1 }] : [{ v: service("lens_fit"), q: 1 }]),
      { v: lens, q: 1 },
      ...(caseItem ? [{ v: caseItem, q: 1 }] : []),
    ];
    const seller = pick(salesFor[branch]);
    setClock(zonedInstant(day, time, TZ));
    const d = discount();
    const total = priceOf(items, d);
    const depositPlan = weighted<"half" | "full" | "none">([["half", 55], ["full", 25], ["none", 20]]);
    const depositAmount = depositPlan === "full" ? total : depositPlan === "half" ? Math.round(total * 0.5 / 100) * 100 : 0;
    const res = await salesSvc.createOrder(seller, {
      branchId: branchByCode[branch].id,
      customerId: c.id,
      items: items.map((i) => ({ variantId: i.v.id, quantity: i.q, lineDiscountCents: 0, prescriptionId: i.v.type === "made_to_order" ? c.rx : null })),
      orderDiscount: d,
      deposit: depositAmount > 0 ? payment(payMethod(), depositAmount) : null,
      dueOn: addDays(day, lens.price >= 900000 ? 12 : 9),
      labSupplierId: supplierId.CLL,
      labReference: `CLL-${int(10000, 99999)}`,
      notes: ownFrame ? "Customer supplied own frame." : null,
      confirm: true,
      idempotencyKey: key("ord"),
    });
    if (frame) bump(frame, loc, 0, 1);
    if (caseItem) bump(caseItem, loc, 0, 1);
    stats.orders++;
    const order: OpenOrder = { saleId: res!.saleId, branch, frame, caseItem };
    if (chance(0.04)) {
      const cDay = addDays(day, int(0, 1));
      schedule(cDay, randomTime(cDay, zonedToMin(time) + 30), "cancel order", async () => {
        setClock(zonedInstant(cDay, randomTime(cDay, zonedToMin(time) + 30), TZ));
        if (depositAmount > 0) {
          await salesSvc.refundSale(manager, { saleId: order.saleId, items: [], amountCents: depositAmount, method: "cash", reason: "Deposit returned — customer cancelled", idempotencyKey: key("dep") });
        }
        await salesSvc.transitionOrder(manager, order.saleId, "cancelled", "Customer changed their mind");
        if (frame) bump(frame, loc, 0, -1);
        if (caseItem) bump(caseItem, loc, 0, -1);
      });
      return order;
    }
    // Fulfilment timeline.
    let d1 = addDays(day, int(0, 1));
    const steps: ["processing" | "awaiting_lab" | "ready_for_pickup" | "completed", number][] = [
      ["processing", int(0, 1)],
      ["awaiting_lab", int(0, 2)],
      ["ready_for_pickup", weighted([[int(3, 6), 85], [int(7, 11), 15]])],
      ["completed", int(1, 7)],
    ];
    let prevMin = zonedToMin(time) + 20;
    for (const [stage, offset] of steps) {
      d1 = addDays(d1, offset);
      const tm = offset === 0 ? randomTime(d1, prevMin + 10) : randomTime(d1);
      prevMin = zonedToMin(tm);
      const dayCopy = d1;
      schedule(dayCopy, tm, `order ${stage}`, async () => {
        setClock(zonedInstant(dayCopy, tm, TZ));
        const actor = stage === "completed" ? pick(salesFor[branch]) : weighted([[pick(salesFor[branch]), 3], [manager, 1]]);
        if (stage === "completed") {
          const sale = await salesSvc.getSale(manager, order.saleId);
          const balance = sale.sale.balanceDueCents;
          if (balance > 0) {
            const plan = weighted<"full" | "partial" | "none">([["full", 86], ["partial", 9], ["none", 5]]);
            const amt = plan === "full" ? balance : plan === "partial" ? Math.round(balance * 0.5 / 100) * 100 : 0;
            if (amt > 0) await salesSvc.recordPayment(actor, { saleId: order.saleId, ...payment(payMethod(), amt), notes: "Paid at pickup", idempotencyKey: key("pay") });
            const oldOrder = Date.parse(today) - Date.parse(dayCopy) > 75 * 86_400_000;
            if ((plan === "partial" || (plan === "none" && oldOrder)) && chance(oldOrder ? 0.99 : 0.75)) {
              const sDay = addDays(dayCopy, int(5, 30));
              schedule(sDay, randomTime(sDay), "settle order", async () => {
                setClock(zonedInstant(sDay, randomTime(sDay), TZ));
                const s2 = await salesSvc.getSale(manager, order.saleId);
                if (s2.sale.balanceDueCents > 0) await salesSvc.recordPayment(pick(salesFor[branch]), { saleId: order.saleId, ...payment(payMethod(), s2.sale.balanceDueCents), notes: "Balance settled", idempotencyKey: key("pay") });
              });
            }
          }
        }
        await salesSvc.transitionOrder(actor, order.saleId, stage);
        if (stage === "completed") {
          if (frame) bump(frame, loc, -1, -1);
          if (caseItem) bump(caseItem, loc, -1, -1);
        }
      });
    }
    return order;
  }

  function zonedToMin(t: string) {
    const [h, m] = t.split(":").map(Number);
    return h * 60 + m;
  }

  // Appointment outcomes are decided when the day arrives.
  async function bookAppointment(day: string, bookingDay: string, branch: string, typeCode: string, who: { customer?: Cust; leadId?: string }) {
    const type = apptType[typeCode];
    const practitioner = type.requiresPractitioner ? practitionerFor[branch] : null;
    const h = hoursOf(day);
    const slot = h.open + Math.floor(R() * ((h.close - h.open - type.durationMinutes) / 30)) * 30;
    const time = hhmm(slot);
    const booker = weighted([[pick(salesFor[branch]), 3], [manager, 1]]);
    setClock(zonedInstant(bookingDay, randomTime(bookingDay), TZ));
    if (zonedInstant(day, time, TZ) <= clock.now) return;
    try {
      const appt = await appointmentsSvc.createAppointment(booker, {
        branchId: branchByCode[branch].id,
        appointmentTypeId: type.id,
        customerId: who.customer?.id ?? null,
        leadId: who.leadId ?? null,
        practitionerMembershipId: practitioner?.membershipId ?? null,
        date: day,
        time,
        notes: null,
      });
      stats.appointments++;
      const id = appt!.id;
      const outcome = weighted<"completed" | "no_show" | "cancelled">([["completed", 80], ["no_show", 8], ["cancelled", 12]]);
      if (outcome !== "cancelled" && chance(0.5)) {
        const cDay = addDays(day, -1) < bookingDay ? bookingDay : addDays(day, -1);
        schedule(cDay, randomTime(cDay), "confirm appt", async () => {
          setClock(zonedInstant(cDay, randomTime(cDay), TZ));
          await appointmentsSvc.setAppointmentStatus(booker, id, "confirmed");
        });
      }
      const endMin = slot + type.durationMinutes;
      if (outcome === "cancelled") {
        const cDay = addDays(day, -int(0, 2)) < bookingDay ? bookingDay : addDays(day, -int(0, 2));
        schedule(cDay, cDay === day ? hhmm(Math.max(h.open, slot - 60)) : randomTime(cDay), "cancel appt", async () => {
          setClock(zonedInstant(cDay, cDay === day ? hhmm(Math.max(h.open, slot - 60)) : randomTime(cDay), TZ));
          await appointmentsSvc.setAppointmentStatus(booker, id, "cancelled", pick(["Schedule conflict", "Feeling unwell", "Rescheduling later", "Traffic — will rebook"]));
        });
        return;
      }
      schedule(day, hhmm(Math.min(endMin + 5, 23 * 60)), `appt ${outcome}`, async () => {
        setClock(zonedInstant(day, hhmm(endMin + 5), TZ));
        const actor = practitioner?.ctx ?? booker;
        if (outcome === "no_show") {
          await appointmentsSvc.setAppointmentStatus(actor, id, "no_show");
          if (who.leadId) await leadsSvc.changeLeadStage(manager, who.leadId, "follow_up", "Missed appointment — follow up to rebook").catch(() => {});
          return;
        }
        await appointmentsSvc.setAppointmentStatus(actor, id, "completed");
        let c = who.customer;
        if (who.leadId) {
          const conv = await leadsSvc.convertLead(manager, who.leadId);
          c = { id: conv!.customerId, branch, rx: null, age: int(18, 70), cl: typeCode === "contact_lens_fitting" };
          customers.push(c);
        }
        if (!c) return;
        const seller = pick(salesFor[branch]);
        const t2 = hhmm(Math.min(endMin + 15, h.close - 5));
        if (typeCode === "eye_exam") {
          setClock(zonedInstant(day, hhmm(endMin + 8), TZ));
          await prescribe(c, practitioner!.ctx, day);
          await posSale(branch, day, t2, [{ v: service("eye_exam"), q: 1 }], c, { seller });
          if (chance(0.62)) await createOrderFor(c, branch, day, hhmm(Math.min(endMin + 30, h.close - 5)));
          else if (c.cl && chance(0.4)) {
            const cl = contacts.filter((v) => avail(v, branchByCode[branch].locationId) >= 2);
            if (cl.length) await posSale(branch, day, hhmm(Math.min(endMin + 35, h.close - 5)), [{ v: pick(cl), q: 2 }, ...(chance(0.6) ? [{ v: pick(solutions), q: 1 }] : [])], c);
          }
        } else if (typeCode === "contact_lens_fitting") {
          c.cl = true;
          if (!c.rx) await prescribe(c, practitioner!.ctx, day);
          const cl = contacts.filter((v) => avail(v, branchByCode[branch].locationId) >= 2);
          await posSale(branch, day, t2, [{ v: service("cl_fitting"), q: 1 }, ...(cl.length ? [{ v: pick(cl), q: 2 }] : []), ...(chance(0.7) ? [{ v: pick(solutions), q: 1 }] : [])], c, { seller });
        } else if (typeCode === "frame_consultation" && chance(0.5) && c.rx) {
          await createOrderFor(c, branch, day, t2);
        }
      });
    } catch (error) {
      fail("book appointment", error);
    }
  }

  // Leads: created, worked through stages, some book appointments and convert.
  async function newLead(day: string) {
    const time = randomTime(day);
    const source = weighted<string>([["website", 34], ["facebook", 18], ["instagram", 14], ["walk_in", 12], ["phone", 10], ["referral", 12]]);
    const branch = weighted([["MKT", 4], ["QC", 3.5], ["PSG", 2.5]]);
    const interest = weighted<string>([["eye_exam", 34], ["prescription_glasses", 30], ["contact_lenses", 16], ["sunglasses", 8], ["frames", 8], ["repair", 4]]);
    const [first, last] = personName();
    setClock(zonedInstant(day, time, TZ));
    const ctx = source === "website" ? websiteCtx : manager;
    const lead = await leadsSvc.createLead(ctx, {
      firstName: first,
      lastName: last,
      email: chance(0.85) ? `${first}.${last}`.toLowerCase().replace(/[^a-z.]/g, "") + `${int(1, 99)}@example.com` : null,
      phone: `+63 918 000 ${String(phoneSeq++).padStart(4, "0")}`,
      source: source as "website",
      interest: interest as "eye_exam",
      message: pick([
        "Hi, I'd like to book an eye check this week.",
        "How much are progressive lenses?",
        "Do you have frames for kids?",
        "Looking for contact lenses — first time user.",
        "Can I get my glasses ready in 3 days?",
        "Do you accept GCash?",
        null,
      ]),
      preferredBranchId: branchByCode[branch].id,
      estimatedValueCents: interest === "prescription_glasses" ? int(40, 120) * 10000 : interest === "eye_exam" ? 50000 : int(10, 40) * 10000,
      smsConsent: chance(0.6),
      marketingConsent: chance(0.4),
      assignedMembershipId: null,
    });
    stats.leads++;
    const leadId = lead!.id;
    const assignee = { MKT: pick([S("mia.garcia").membershipId, S("manager").membershipId]), QC: S("sales").membershipId, PSG: S("jo.ramos").membershipId }[branch]!;
    const ownerCtx = ctxByMembership.get(assignee)!;
    // Day 0: assign. Later: contacted → qualified → appointment / lost / follow-up.
    const tAssign = randomTime(day, zonedToMin(time) + 10);
    schedule(day, tAssign, "assign lead", async () => {
      setClock(zonedInstant(day, tAssign, TZ));
      await leadsSvc.assignLead(manager, leadId, assignee);
    });
    let plan = weighted<"convert" | "lost_early" | "lost_late" | "open" | "stalled">([["convert", 42], ["lost_early", 14], ["lost_late", 10], ["open", 22], ["stalled", 12]]);
    // A well-run shop closes out old leads: only recent ones stay open or untouched.
    const ageDays = Math.round((Date.parse(today) - Date.parse(day)) / 86_400_000);
    if (ageDays > 40 && (plan === "open" || plan === "stalled")) plan = chance(0.6) ? "lost_late" : "convert";
    if (plan === "stalled") return;
    const dContact = addDays(day, int(0, 2));
    const tContact = dContact === day ? randomTime(day, zonedToMin(tAssign) + 15) : randomTime(dContact);
    schedule(dContact, tContact, "contact lead", async () => {
      setClock(zonedInstant(dContact, tContact, TZ));
      await leadsSvc.addLeadNote(ownerCtx, leadId, { body: pick(["Called — interested, comparing options.", "Replied on Messenger with pricing.", "Sent branch hours and booking link.", "Spoke by phone; will visit this week."]), type: pick(["call", "sms", "note"] as const) });
      await leadsSvc.changeLeadStage(ownerCtx, leadId, "contacted");
    });
    if (plan === "lost_early") {
      const dLost = addDays(dContact, int(2, 10));
      schedule(dLost, randomTime(dLost), "lose lead", async () => {
        setClock(zonedInstant(dLost, randomTime(dLost), TZ));
        await leadsSvc.changeLeadStage(ownerCtx, leadId, "lost", pick(["Went with another shop", "Price too high", "No response after 3 attempts", "Only browsing"]));
      });
      return;
    }
    const dQual = addDays(dContact, int(1, 4));
    schedule(dQual, randomTime(dQual), "qualify lead", async () => {
      setClock(zonedInstant(dQual, randomTime(dQual), TZ));
      await leadsSvc.changeLeadStage(ownerCtx, leadId, "qualified", "Confirmed needs and budget");
    });
    if (plan === "open") {
      const dF = addDays(dQual, int(0, 2));
      schedule(dF, randomTime(dF), "follow-up", async () => {
        setClock(zonedInstant(dF, randomTime(dF), TZ));
        await leadsSvc.changeLeadStage(ownerCtx, leadId, "follow_up", "Wants to check schedule first");
        await leadsSvc.setLeadFollowUp(ownerCtx, leadId, zonedInstant(addDays(dF, int(-3, 10)), randomTime(dF), TZ));
      });
      return;
    }
    if (plan === "lost_late") {
      const dLost = addDays(dQual, int(3, 14));
      schedule(dLost, randomTime(dLost), "lose lead", async () => {
        setClock(zonedInstant(dLost, randomTime(dLost), TZ));
        await leadsSvc.changeLeadStage(ownerCtx, leadId, "lost", pick(["Decided to wait", "Bought online", "Moved away"]));
      });
      return;
    }
    // Convert path: book an exam/fitting a few days out; conversion happens when it's completed.
    const dBook = addDays(dQual, int(0, 2));
    const apptDay = addDays(dBook, int(1, 6));
    schedule(dBook, randomTime(dBook), "lead books", async () => {
      await bookAppointment(apptDay, dBook, branch, interest === "contact_lenses" ? "contact_lens_fitting" : "eye_exam", { leadId });
    });
  }

  async function restock(day: string, branch: string, lastStretch: boolean) {
    const loc = branchByCode[branch].locationId;
    const low = variants.filter((v) => v.type === "stock" && avail(v, loc) <= v.reorderPoint);
    const bySupplier = new Map<string, Variant[]>();
    for (const v of low) {
      if (!v.supplier) continue;
      bySupplier.set(v.supplier, [...(bySupplier.get(v.supplier) ?? []), v]);
    }
    for (const [sup, vs] of bySupplier) {
      if (lastStretch && chance(0.6)) continue; // leave some genuine low-stock alerts at the end of the demo window
      setClock(zonedInstant(day, "10:40", TZ));
      const po = await purchasing.savePurchaseOrder(inventoryCtx, null, {
        supplierId: supplierId[sup],
        locationId: loc,
        expectedOn: addDays(day, SUPPLIERS.find((s) => s.code === sup)!.leadTimeDays),
        notes: "Weekly replenishment",
        items: vs.map((v) => ({ variantId: v.id, quantity: Math.max(v.reorderQty, v.reorderPoint * 2 + 2 - Math.max(0, avail(v, loc))), unitCostCents: Math.round(v.cost * (0.95 + R() * 0.1)) })),
      });
      stats.purchaseOrders++;
      setClock(zonedInstant(day, "11:10", TZ));
      await purchasing.confirmPurchaseOrder(manager, po!.purchaseOrderId);
      const items = await db.select().from(purchaseOrderItems).where(eq(purchaseOrderItems.purchaseOrderId, po!.purchaseOrderId));
      const lead = SUPPLIERS.find((s) => s.code === sup)!.leadTimeDays + int(0, 2);
      const rDay = addDays(day, lead);
      const partial = chance(0.12);
      schedule(rDay, randomTime(rDay, 10 * 60, 13 * 60), "receive PO", async () => {
        setClock(zonedInstant(rDay, randomTime(rDay, 10 * 60, 13 * 60), TZ));
        const lines = items.map((i) => ({ itemId: i.id, quantity: partial ? Math.max(1, Math.floor(i.quantityOrdered * 0.6)) : i.quantityOrdered }));
        await purchasing.receivePurchaseOrder(inventoryCtx, { purchaseOrderId: po!.purchaseOrderId, items: lines, notes: partial ? "Partial delivery — balance to follow" : null, idempotencyKey: key("rcv") });
        items.forEach((i, idx) => bump(variants.find((v) => v.id === i.variantId)!, loc, lines[idx].quantity));
        if (partial) {
          const r2 = addDays(rDay, int(3, 8));
          schedule(r2, randomTime(r2, 10 * 60, 13 * 60), "receive PO balance", async () => {
            setClock(zonedInstant(r2, randomTime(r2, 10 * 60, 13 * 60), TZ));
            const rest = items.map((i, idx) => ({ itemId: i.id, quantity: i.quantityOrdered - lines[idx].quantity })).filter((l) => l.quantity > 0);
            if (!rest.length) return;
            await purchasing.receivePurchaseOrder(inventoryCtx, { purchaseOrderId: po!.purchaseOrderId, items: rest, notes: "Balance delivered", idempotencyKey: key("rcv") });
            rest.forEach((l) => bump(variants.find((v) => v.id === items.find((i) => i.id === l.itemId)!.variantId)!, loc, l.quantity));
          });
        }
      });
    }
  }

  // ── Simulation ──
  log(`Simulating ${DAYS} days of trading (${start} → ${today}) …`);
  const lambda: Record<string, number> = { MKT: 2.9, QC: 2.4, PSG: 1.8 };
  for (let i = 0; i <= DAYS; i++) {
    const day = addDays(start, i);
    const wd = weekday(day);
    const lastStretch = i > DAYS - 18;
    const busy = wd === 6 || wd === 0 ? 1.3 : 1;

    for (const branch of BRANCHES) {
      // Bookings for the coming days.
      const n = poisson(1.6);
      for (let k = 0; k < n; k++) {
        const target = addDays(day, int(1, 12));
        const typeCode = weighted<string>([["eye_exam", 66], ["contact_lens_fitting", 18], ["follow_up", 10], ["frame_consultation", 6]]);
        const pool = customers.filter((c) => c.branch === branch);
        const c = pool.length && chance(0.85) ? pick(pool) : null;
        schedule(day, randomTime(day), "book", async () => {
          const cust = c ?? (await newCustomer(pick(salesFor[branch]), branch, "walk_in"));
          await bookAppointment(target, day, branch, typeCode, { customer: cust });
        });
      }
      // Walk-in sales.
      const walkIns = poisson(lambda[branch] * busy);
      for (let k = 0; k < walkIns; k++) {
        const time = randomTime(day);
        schedule(day, time, "walk-in sale", async () => {
          const loc = branchByCode[branch].locationId;
          const kind = weighted<string>([["sun", 22], ["contacts", 26], ["care", 30], ["repair", 12], ["frame", 10]]);
          const pool = customers.filter((c) => c.branch === branch);
          const needsCustomer = kind === "contacts" || kind === "frame";
          let c: Cust | null = null;
          if (needsCustomer || chance(0.6)) c = pool.length && chance(0.8) ? pick(pool) : await newCustomer(pick(salesFor[branch]), branch, "walk_in");
          let items: { v: Variant; q: number }[] = [];
          const ok = (v: Variant, q = 1) => avail(v, loc) >= q;
          if (kind === "sun") {
            const v = sunglasses.filter((x) => ok(x));
            if (v.length) items = [{ v: pick(v), q: 1 }, ...(chance(0.3) && cases.some((x) => ok(x)) ? [{ v: pick(cases.filter((x) => ok(x))), q: 1 }] : [])];
          } else if (kind === "contacts") {
            const v = contacts.filter((x) => ok(x, 2));
            if (v.length) items = [{ v: pick(v), q: chance(0.5) ? 2 : 1 }, ...(chance(0.5) ? [{ v: pick(solutions), q: 1 }] : [])];
          } else if (kind === "care") {
            const v = care.filter((x) => ok(x, 2));
            const count = int(1, 3);
            for (let j = 0; j < count && v.length; j++) {
              const pickV = pick(v);
              if (!items.some((it) => it.v.id === pickV.id)) items.push({ v: pickV, q: int(1, 2) });
            }
          } else if (kind === "repair") {
            items = [{ v: service("repair"), q: 1 }];
          } else {
            const v = frames.filter((x) => ok(x));
            if (v.length) items = [{ v: pick(v), q: 1 }, { v: service("lens_fit"), q: 1 }];
          }
          if (!items.length) return;
          await posSale(branch, day, time, items, c, { partial: chance(0.04) });
        });
      }
      // Weekly replenishment.
      if (wd === 1) schedule(day, "10:30", "restock", () => restock(day, branch, lastStretch));
      // Occasional damage.
      if (chance(0.03)) {
        schedule(day, randomTime(day), "damage", async () => {
          const loc = branchByCode[branch].locationId;
          const v = [...frames, ...care].filter((x) => avail(x, loc) > 1);
          if (!v.length) return;
          const target = pick(v);
          setClock(zonedInstant(day, randomTime(day), TZ));
          await inventorySvc.adjustStock(inventoryCtx, { variantId: target.id, locationId: loc, mode: "damage", quantity: 1, reason: pick(["Scratched during display", "Dropped — hinge broken", "Packaging water damage"]), idempotencyKey: key("dmg") });
          bump(target, loc, -1);
        });
      }
    }
    // Branch-to-branch transfers on Thursdays.
    if (wd === 4) {
      schedule(day, "15:00", "transfer", async () => {
        const from = branchByCode.MKT.locationId;
        for (const to of [branchByCode.PSG.locationId, branchByCode.QC.locationId]) {
          const v = frames.find((x) => avail(x, to) <= 0 && avail(x, from) >= 3);
          if (!v) continue;
          setClock(zonedInstant(day, "15:00", TZ));
          await inventorySvc.transferStock(inventoryCtx, { variantId: v.id, fromLocationId: from, toLocationId: to, quantity: 1, reason: "Rebalancing between branches", idempotencyKey: key("xfer") });
          bump(v, from, -1);
          bump(v, to, 1);
        }
      });
    }
    // Leads.
    const leadsToday = poisson(0.38);
    for (let k = 0; k < leadsToday; k++) schedule(day, randomTime(day), "new lead", () => newLead(day));
    // Expenses.
    const dom = Number(day.slice(8, 10));
    const exp = (cat: string, amount: number, desc: string, branch: string | null, payee: string, method = "bank_transfer") =>
      schedule(day, "09:30", "expense", async () => {
        setClock(zonedInstant(day, "09:30", TZ));
        await expensesSvc.saveExpense(chance(0.7) ? owner : manager, null, { categoryId: expCat[cat], branchId: branch ? branchByCode[branch].id : null, amountCents: amount, expenseDate: day, paymentMethod: method, payee, description: desc, reference: `EXP-${int(1000, 9999)}` });
        stats.expenses++;
      });
    if (dom === 1) {
      exp("Rent", 4800000, "Monthly rent — Makati", "MKT", "Linden Arcade Leasing");
      exp("Rent", 3600000, "Monthly rent — Quezon City", "QC", "Verde Properties");
      exp("Rent", 3100000, "Monthly rent — Pasig", "PSG", "Alder Place Holdings");
    }
    if (dom === 15 || dom === 28) {
      exp("Payroll", 4000000 + int(0, 300) * 1000, "Semi-monthly payroll — Makati", "MKT", "Staff payroll");
      exp("Payroll", 3400000 + int(0, 250) * 1000, "Semi-monthly payroll — Quezon City", "QC", "Staff payroll");
      exp("Payroll", 2800000 + int(0, 250) * 1000, "Semi-monthly payroll — Pasig", "PSG", "Staff payroll");
    }
    if (dom === 6) for (const b of BRANCHES) exp("Utilities", int(900, 1800) * 1000, `Electricity & water — ${branchByCode[b].name}`, b, "Metro utilities");
    if (dom === 10) exp("Marketing", int(800, 1600) * 1000, "Social media advertising", null, "Ad platform", "card");
    if (dom === 26) exp("Laboratory fees", int(1800, 4200) * 1000, "Monthly lab processing & edging fees", null, "Clarity Lens Laboratory");
    if (chance(0.18)) exp("Store supplies", int(8, 60) * 1000, pick(["Receipt paper and bags", "Cleaning supplies", "Display stands", "Printer ink"]), pick([...BRANCHES]), "Office Depot (demo)", "cash");
    if (chance(0.03)) exp("Maintenance & repairs", int(25, 120) * 1000, pick(["Autorefractor calibration", "Aircon servicing", "Display light repair"]), pick([...BRANCHES]), "Service contractor");

    // Run the day's agenda in time order. Events may add more events for the same day, so drain it as a queue.
    for (;;) {
      const list = agenda.get(day);
      if (!list?.length) break;
      list.sort((a, b) => a.t.getTime() - b.t.getTime());
      const ev = list.shift()!;
      try {
        await ev.run();
      } catch (error) {
        fail(ev.label, error);
      }
    }
    agenda.delete(day);
    if (i % 30 === 0) log(`  … ${day}: ${stats.sales} sales, ${stats.orders} orders, ${stats.appointments} appointments, ${stats.leads} leads`);
  }

  // A draft purchase order waiting for approval, so the purchasing screens show every state.
  try {
    setClock(new Date(REAL_NOW.getTime() - 2 * 3600_000));
    const loc = branchByCode.QC.locationId;
    const draftItems = frames.filter((v) => v.supplier === "MFH").slice(0, 4);
    await purchasing.savePurchaseOrder(inventoryCtx, null, {
      supplierId: supplierId.MFH,
      locationId: loc,
      expectedOn: addDays(today, 6),
      notes: "New season metal frames — awaiting manager approval",
      items: draftItems.map((v) => ({ variantId: v.id, quantity: 3, unitCostCents: v.cost })),
    });
  } catch (error) {
    fail("draft PO", error);
  }

  // Record that the integration is intentionally not configured.
  await db.execute(sql`insert into integration_connections (business_id, provider, status) values (${businessId}, 'gohighlevel', 'not_configured') on conflict do nothing`);

  if (failures.size) {
    log("Skipped events (expected occasionally, e.g. a slot taken or stock sold out):");
    for (const [msg, n] of [...failures.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12)) log(`  ${n} × ${msg}`);
  }
  return { businessId, stats, skipped: [...failures.values()].reduce((a, b) => a + b, 0) };
}

/** Cross-checks stored balances against their source records. Returns a list of problems (empty = consistent). */
export async function verifyIntegrity(businessId: string) {
  const db = getDb();
  const problems: string[] = [];
  const checks: [string, ReturnType<typeof sql>][] = [
    [
      "inventory on-hand matches the sum of stock movements",
      sql`select count(*)::int as n from inventory_balances b
          where b.business_id = ${businessId}
            and b.on_hand <> coalesce((select sum(m.quantity) from stock_movements m where m.variant_id = b.variant_id and m.location_id = b.location_id), 0)`,
    ],
    [
      "reserved stock matches active reservations",
      sql`select count(*)::int as n from inventory_balances b
          where b.business_id = ${businessId}
            and b.reserved <> coalesce((select sum(r.quantity) from stock_reservations r where r.variant_id = b.variant_id and r.location_id = b.location_id and r.status = 'active'), 0)`,
    ],
    [
      "sale totals match their line items",
      sql`select count(*)::int as n from sales s
          where s.business_id = ${businessId}
            and s.total_cents <> (select coalesce(sum(line_total_cents), 0) from sale_items si where si.sale_id = s.id)`,
    ],
    [
      "paid amounts match recorded payments",
      sql`select count(*)::int as n from sales s
          where s.business_id = ${businessId}
            and s.paid_cents <> (select coalesce(sum(amount_cents), 0) from payments p where p.sale_id = s.id and p.status = 'completed')`,
    ],
    [
      "refund totals match refund records",
      sql`select count(*)::int as n from sales s
          where s.business_id = ${businessId}
            and (s.refunded_cents <> (select coalesce(sum(amount_cents), 0) from refunds r where r.sale_id = s.id and r.affects_revenue)
              or s.refunded_cash_cents <> (select coalesce(sum(amount_cents), 0) from refunds r where r.sale_id = s.id and r.method <> 'balance_adjustment'))`,
    ],
    [
      "balances due follow total − paid − credited refunds",
      sql`select count(*)::int as n from sales s
          where s.business_id = ${businessId} and s.status <> 'cancelled'
            and s.balance_due_cents <> s.total_cents - s.paid_cents - (s.refunded_cents - s.refunded_cash_cents)`,
    ],
    [
      "completed orders have consumed their reservations",
      sql`select count(*)::int as n from stock_reservations r join sales s on s.id = r.sale_id
          where r.business_id = ${businessId} and r.status = 'active' and s.status <> 'open'`,
    ],
  ];
  for (const [label, q] of checks) {
    const res = await db.execute<{ n: number }>(q);
    const n = Number(res.rows[0].n);
    if (n > 0) problems.push(`${label}: ${n} mismatch(es)`);
  }
  return problems;
}
