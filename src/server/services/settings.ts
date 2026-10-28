import { and, asc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { catalogueFeedInput, optEmail, optPhone, optText, reqText, websiteOrdersInput } from "@/lib/schemas";
import { WEEKDAYS, type WeekHours } from "@/lib/types";
import { getDb, type Executor } from "@/server/db";
import { appointmentTypes, branches, businesses, inventoryLocations } from "@/server/db/schema";
import { audit, db, diff, invalid, mapDbError, notFound, now, requirePermission, type Ctx } from "./core";

const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use HH:mm.");
const dayHours = z
  .object({ open: hhmm, close: hhmm })
  .nullable()
  .refine((d) => !d || d.open < d.close, "Closing time must be after opening time.");
export const weekHoursSchema = z.object(Object.fromEntries(WEEKDAYS.map((d) => [d, dayHours])) as Record<(typeof WEEKDAYS)[number], typeof dayHours>);

const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/, "Use a hex colour like #1F2B22.");

export const businessProfileInput = z.object({
  name: reqText("Business name", 120),
  legalName: optText(160),
  tagline: optText(160),
  description: optText(2000),
  logoUrl: z
    .string()
    .trim()
    .max(500)
    .transform((v) => (v === "" ? null : v))
    .nullish()
    .refine((v) => !v || /^(https:\/\/|\/)[^\s]+$/.test(v), "Use an https:// URL or a /path."),
  brandColor: hex,
  accentColor: hex,
  email: optEmail,
  phone: optPhone,
  website: optText(200),
  addressLine1: optText(200),
  addressLine2: optText(200),
  city: optText(80),
  region: optText(80),
  postalCode: optText(20),
  country: z.string().trim().length(2).default("PH"),
});

export const taxInput = z.object({
  currency: z.string().trim().length(3).toUpperCase(),
  locale: z.string().trim().min(2).max(20),
  timezone: z.string().trim().min(3).max(60).refine((tz) => {
    try {
      new Intl.DateTimeFormat("en", { timeZone: tz });
      return true;
    } catch {
      return false;
    }
  }, "Unknown time zone."),
  taxName: reqText("Tax name", 20),
  taxRateBps: z.number().int().min(0).max(10000),
  pricesIncludeTax: z.boolean(),
  taxRegistration: optText(60),
  receiptFooter: optText(500),
  maxStaffDiscountBps: z.number().int().min(0).max(10000),
});

export const websiteInput = z.object({
  heroEyebrow: optText(80),
  heroTitle: optText(160),
  heroBody: optText(600),
  aboutTitle: optText(160),
  aboutBody: optText(3000),
  values: z.array(z.object({ title: reqText("Title", 80), body: reqText("Text", 300) })).max(8).default([]),
  faqs: z.array(z.object({ question: reqText("Question", 200), answer: reqText("Answer", 1500) })).max(30).default([]),
  privacyContactEmail: optEmail,
});

export const branchInput = z.object({
  name: reqText("Branch name", 80),
  code: reqText("Code", 12).regex(/^[A-Za-z0-9-]+$/, "Letters, numbers and dashes only."),
  addressLine1: optText(200),
  addressLine2: optText(200),
  city: optText(80),
  region: optText(80),
  phone: optPhone,
  email: optEmail,
  mapUrl: optText(500),
  imageUrl: optText(500),
  businessHours: weekHoursSchema.nullable().default(null),
  isActive: z.boolean().default(true),
});

export const appointmentTypeInput = z.object({
  name: reqText("Name", 80),
  code: reqText("Code", 40).regex(/^[a-z0-9_]+$/, "Lowercase letters, numbers and underscores."),
  description: optText(400),
  durationMinutes: z.number().int().min(5).max(480),
  requiresPractitioner: z.boolean(),
  isPublic: z.boolean(),
  priceCents: z.number().int().min(0).nullish(),
  isActive: z.boolean().default(true),
});

// ─── Reads (public website uses these without a session) ─────────────────────

export async function getBusiness(businessId: string, ex: Executor = db()) {
  const [b] = await ex.select().from(businesses).where(eq(businesses.id, businessId)).limit(1);
  if (!b) throw notFound("Business");
  return b;
}

/**
 * The business served by the public website. Single-business deployments use the only/first
 * business; set SITE_BUSINESS_SLUG to choose one when several share a database.
 */
export async function getSiteBusiness() {
  const slug = process.env.SITE_BUSINESS_SLUG;
  const [b] = slug
    ? await db().select().from(businesses).where(eq(businesses.slug, slug)).limit(1)
    : await db().select().from(businesses).orderBy(asc(businesses.isDemo), asc(businesses.createdAt)).limit(1);
  return b ?? null;
}

export async function listBranches(businessId: string, opts: { activeOnly?: boolean } = {}, ex: Executor = db()) {
  const conds = [eq(branches.businessId, businessId)];
  if (opts.activeOnly) conds.push(eq(branches.isActive, true));
  return ex.select().from(branches).where(and(...conds)).orderBy(asc(branches.sortOrder), asc(branches.name));
}

// ─── Mutations ───────────────────────────────────────────────────────────────

export async function updateBusinessProfile(ctx: Ctx, raw: unknown) {
  requirePermission(ctx, "settings.manage");
  const input = businessProfileInput.parse(raw);
  const before = await getBusiness(ctx.businessId);
  await db().update(businesses).set({ ...input, updatedAt: now(ctx) }).where(eq(businesses.id, ctx.businessId));
  await audit(db(), ctx, { action: "settings.profile", entityType: "business", entityId: ctx.businessId, summary: "Updated business profile and branding", changes: diff(before as unknown as Record<string, unknown>, input) });
}

export async function updateTaxSettings(ctx: Ctx, raw: unknown) {
  requirePermission(ctx, "settings.manage");
  const input = taxInput.parse(raw);
  const before = await getBusiness(ctx.businessId);
  const { maxStaffDiscountBps, ...rest } = input;
  await db()
    .update(businesses)
    .set({ ...rest, settings: { ...before.settings, maxStaffDiscountBps }, updatedAt: now(ctx) })
    .where(eq(businesses.id, ctx.businessId));
  await audit(db(), ctx, { action: "settings.tax", entityType: "business", entityId: ctx.businessId, summary: "Updated currency, tax and receipt settings", changes: diff(before as unknown as Record<string, unknown>, rest) });
}

export async function updateBusinessHours(ctx: Ctx, raw: unknown) {
  requirePermission(ctx, "settings.manage");
  const hours = weekHoursSchema.parse(raw) as WeekHours;
  await db().update(businesses).set({ businessHours: hours, updatedAt: now(ctx) }).where(eq(businesses.id, ctx.businessId));
  await audit(db(), ctx, { action: "settings.hours", entityType: "business", entityId: ctx.businessId, summary: "Updated business hours" });
}

export async function updateWebsiteContent(ctx: Ctx, raw: unknown) {
  requirePermission(ctx, "settings.manage");
  const input = websiteInput.parse(raw);
  const clean = Object.fromEntries(Object.entries(input).map(([k, v]) => [k, v ?? undefined]));
  await db().update(businesses).set({ websiteContent: clean, updatedAt: now(ctx) }).where(eq(businesses.id, ctx.businessId));
  await audit(db(), ctx, { action: "settings.website", entityType: "business", entityId: ctx.businessId, summary: "Updated website content" });
}

/** Turns the public catalogue feed on/off and sets which website origins may read it from a browser. */
export async function updateCatalogueFeed(ctx: Ctx, raw: unknown) {
  requirePermission(ctx, "settings.manage");
  const input = catalogueFeedInput.parse(raw);
  const origins = [...new Set(input.origins)];
  await db()
    .update(businesses)
    .set({ settings: sql`coalesce(${businesses.settings}, '{}'::jsonb) || ${JSON.stringify({ catalogueFeed: { enabled: input.enabled, origins } })}::jsonb`, updatedAt: now(ctx) })
    .where(eq(businesses.id, ctx.businessId));
  await audit(db(), ctx, { action: "settings.catalogue_feed", entityType: "business", entityId: ctx.businessId, summary: `${input.enabled ? "Enabled" : "Disabled"} the public catalogue feed${origins.length ? ` for ${origins.join(", ")}` : ""}` });
}

/** Switches orders from the customer website on or off (pickup only; online payment is the simulated demo card). */
export async function updateWebsiteOrders(ctx: Ctx, raw: unknown) {
  requirePermission(ctx, "settings.manage");
  const input = websiteOrdersInput.parse(raw);
  await db()
    .update(businesses)
    .set({ settings: sql`coalesce(${businesses.settings}, '{}'::jsonb) || ${JSON.stringify({ websiteOrders: { enabled: input.enabled } })}::jsonb`, updatedAt: now(ctx) })
    .where(eq(businesses.id, ctx.businessId));
  await audit(db(), ctx, { action: "settings.website_orders", entityType: "business", entityId: ctx.businessId, summary: `${input.enabled ? "Enabled" : "Disabled"} orders from the customer website` });
}

/** Saving a branch also guarantees it has a stock location. */
export async function saveBranch(ctx: Ctx, id: string | null, raw: unknown) {
  requirePermission(ctx, "settings.manage");
  const input = branchInput.parse(raw);
  try {
    return await getDb().transaction(async (tx) => {
      const at = now(ctx);
      let branchId = id;
      if (!id) {
        const [{ max }] = await tx.select({ max: sql<number>`coalesce(max(${branches.sortOrder}), 0)::int` }).from(branches).where(eq(branches.businessId, ctx.businessId));
        const [row] = await tx
          .insert(branches)
          .values({ ...input, code: input.code.toUpperCase(), businessId: ctx.businessId, sortOrder: Number(max) + 1, createdAt: at, updatedAt: at })
          .returning();
        branchId = row.id;
      } else {
        const [row] = await tx
          .update(branches)
          .set({ ...input, code: input.code.toUpperCase(), updatedAt: at })
          .where(and(eq(branches.businessId, ctx.businessId), eq(branches.id, id)))
          .returning();
        if (!row) throw notFound("Branch");
      }
      const [loc] = await tx
        .select({ id: inventoryLocations.id })
        .from(inventoryLocations)
        .where(and(eq(inventoryLocations.businessId, ctx.businessId), eq(inventoryLocations.branchId, branchId!)))
        .limit(1);
      if (!loc) {
        await tx.insert(inventoryLocations).values({ businessId: ctx.businessId, branchId: branchId!, name: `${input.name} stockroom`, code: `${input.code.toUpperCase()}-STOCK` });
      } else {
        await tx.update(inventoryLocations).set({ isActive: input.isActive }).where(eq(inventoryLocations.id, loc.id));
      }
      await audit(tx, ctx, { action: id ? "branch.updated" : "branch.created", entityType: "branch", entityId: branchId, summary: `${id ? "Updated" : "Added"} branch ${input.name}` });
      return { branchId: branchId! };
    });
  } catch (error) {
    mapDbError(error);
  }
}

export async function saveAppointmentType(ctx: Ctx, id: string | null, raw: unknown) {
  requirePermission(ctx, "settings.manage");
  const input = appointmentTypeInput.parse(raw);
  try {
    if (!id) {
      const [row] = await db().insert(appointmentTypes).values({ ...input, businessId: ctx.businessId }).returning();
      await audit(db(), ctx, { action: "appointment_type.created", entityType: "appointment_type", entityId: row.id, summary: `Added appointment type ${row.name}` });
      return row;
    }
    const [row] = await db()
      .update(appointmentTypes)
      .set(input)
      .where(and(eq(appointmentTypes.businessId, ctx.businessId), eq(appointmentTypes.id, id)))
      .returning();
    if (!row) throw notFound("Appointment type");
    await audit(db(), ctx, { action: "appointment_type.updated", entityType: "appointment_type", entityId: row.id, summary: `Updated appointment type ${row.name}` });
    return row;
  } catch (error) {
    mapDbError(error);
  }
}

export function assertValidHours(hours: unknown) {
  const parsed = weekHoursSchema.safeParse(hours);
  if (!parsed.success) throw invalid("Invalid business hours.");
  return parsed.data;
}
