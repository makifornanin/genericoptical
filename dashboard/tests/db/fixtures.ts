import { randomUUID } from "node:crypto";
import { resolvePermissions, type Role } from "@/lib/permissions";
import type { WeekHours } from "@/lib/types";
import { getDb } from "@/server/db";
import {
  appointmentTypes,
  branches,
  businesses,
  businessMemberships,
  expenseCategories,
  inventoryLocations,
  productCategories,
  suppliers,
  users,
} from "@/server/db/schema";
import * as catalog from "@/server/services/catalog";
import type { Ctx } from "@/server/services/core";
import * as customers from "@/server/services/customers";

export const key = () => randomUUID();

export const HOURS: WeekHours = {
  mon: { open: "09:00", close: "18:00" },
  tue: { open: "09:00", close: "18:00" },
  wed: { open: "09:00", close: "18:00" },
  thu: { open: "09:00", close: "18:00" },
  fri: { open: "09:00", close: "18:00" },
  sat: { open: "09:00", close: "18:00" },
  sun: null,
};

/** A future weekday date (yyyy-MM-dd) in Asia/Manila. weekday: 1 = Monday … 0 = Sunday. */
export function futureDay(weekday: number, weeksAhead = 1) {
  const now = new Date();
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 2 + weeksAhead * 7));
  while (d.getUTCDay() !== weekday) d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

export type Fixture = Awaited<ReturnType<typeof createBusiness>>;

export async function createBusiness(label = "A", opts: { pricesIncludeTax?: boolean; taxRateBps?: number } = {}) {
  const db = getDb();
  const suffix = randomUUID().slice(0, 8);
  const [biz] = await db
    .insert(businesses)
    .values({
      slug: `biz-${label.toLowerCase()}-${suffix}`,
      name: `Test Optical ${label}`,
      businessHours: HOURS,
      taxRateBps: opts.taxRateBps ?? 1200,
      pricesIncludeTax: opts.pricesIncludeTax ?? true,
      settings: { maxStaffDiscountBps: 2000 },
    })
    .returning();
  const mkBranch = async (code: string, sort: number) => {
    const [b] = await db.insert(branches).values({ businessId: biz.id, name: `${label} ${code}`, code, sortOrder: sort }).returning();
    const [l] = await db.insert(inventoryLocations).values({ businessId: biz.id, branchId: b.id, name: `${label} ${code} stock`, code: `${code}-STOCK` }).returning();
    return { id: b.id, locationId: l.id };
  };
  const main = await mkBranch("MAIN", 0);
  const second = await mkBranch("SECOND", 1);

  const roles: Role[] = ["owner", "manager", "sales", "inventory", "practitioner"];
  const ctx = {} as Record<Role, Ctx>;
  const membership = {} as Record<Role, string>;
  for (const role of roles) {
    const [u] = await db
      .insert(users)
      .values({ email: `${role}-${suffix}@test.example`, name: `${label} ${role}`, passwordHash: "x" })
      .returning();
    const [m] = await db
      .insert(businessMemberships)
      .values({ businessId: biz.id, userId: u.id, role, defaultBranchId: main.id, takesAppointments: role === "practitioner" })
      .returning();
    membership[role] = m.id;
    ctx[role] = {
      userId: u.id,
      membershipId: m.id,
      businessId: biz.id,
      role,
      permissions: resolvePermissions(role, {}),
      actorLabel: `${label} ${role}`,
      branchId: main.id,
    };
  }
  const cats = await db
    .insert(productCategories)
    .values([
      { businessId: biz.id, name: "Frames", slug: "frames", kind: "frames" },
      { businessId: biz.id, name: "Services", slug: "services", kind: "services" },
      { businessId: biz.id, name: "Rx lenses", slug: "rx", kind: "rx_lenses" },
      { businessId: biz.id, name: "Care", slug: "care", kind: "cleaning" },
    ])
    .returning();
  const category = Object.fromEntries(cats.map((c) => [c.kind, c.id])) as Record<string, string>;
  const [supplier] = await db.insert(suppliers).values({ businessId: biz.id, code: "SUP", name: `${label} Supplier` }).returning();
  const [expenseCategory] = await db.insert(expenseCategories).values({ businessId: biz.id, name: "Rent" }).returning();
  const types = await db
    .insert(appointmentTypes)
    .values([
      { businessId: biz.id, code: "eye_exam", name: "Eye exam", durationMinutes: 45, requiresPractitioner: true, isPublic: true },
      { businessId: biz.id, code: "consult", name: "Frame consult", durationMinutes: 30, requiresPractitioner: false, isPublic: true },
    ])
    .returning();
  return {
    businessId: biz.id,
    main,
    second,
    ctx,
    membership,
    category,
    supplierId: supplier.id,
    expenseCategoryId: expenseCategory.id,
    examTypeId: types[0].id,
    consultTypeId: types[1].id,
  };
}

let skuSeq = 0;

/** A stocked frame with opening stock at the main branch. Prices in whole currency units. */
export async function stockProduct(f: Fixture, opts: { price?: number; cost?: number; qty?: number; secondQty?: number; reorderPoint?: number; name?: string } = {}) {
  const sku = `T-${++skuSeq}-${randomUUID().slice(0, 4)}`;
  const opening = [{ variantIndex: 0, locationId: f.main.locationId, quantity: opts.qty ?? 10 }];
  if (opts.secondQty) opening.push({ variantIndex: 0, locationId: f.second.locationId, quantity: opts.secondQty });
  const res = await catalog.createProduct(
    f.ctx.owner,
    {
      name: opts.name ?? `Frame ${sku}`,
      categoryId: f.category.frames,
      supplierId: f.supplierId,
      productType: "stock",
      variants: [{ sku, label: "Default", priceCents: (opts.price ?? 1000) * 100, costCents: (opts.cost ?? 400) * 100, reorderPoint: opts.reorderPoint ?? 2, reorderQty: 5 }],
    },
    opening.filter((o) => o.quantity > 0),
  );
  return { productId: res!.productId, variantId: res!.variantIds[0], sku };
}

export async function serviceProduct(f: Fixture, price = 500, taxExempt = false) {
  const res = await catalog.createProduct(f.ctx.owner, {
    name: `Eye exam ${++skuSeq}`,
    categoryId: f.category.services,
    productType: "service",
    taxExempt,
    variants: [{ sku: `SV-${skuSeq}-${randomUUID().slice(0, 4)}`, priceCents: price * 100, costCents: 0 }],
  });
  return { productId: res!.productId, variantId: res!.variantIds[0] };
}

export async function lensProduct(f: Fixture, price = 2000, cost = 800) {
  const res = await catalog.createProduct(f.ctx.owner, {
    name: `Single vision ${++skuSeq}`,
    categoryId: f.category.rx_lenses,
    productType: "made_to_order",
    variants: [{ sku: `RX-${skuSeq}-${randomUUID().slice(0, 4)}`, priceCents: price * 100, costCents: cost * 100 }],
  });
  return { productId: res!.productId, variantId: res!.variantIds[0] };
}

export async function customer(f: Fixture, name = "Jamie Test") {
  const [first, last] = name.split(" ");
  const c = await customers.createCustomer(f.ctx.owner, { firstName: first, lastName: last ?? "Test", phone: `+63 917 000 ${Math.floor(Math.random() * 9000 + 1000)}` });
  return c!;
}
