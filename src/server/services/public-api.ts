import { and, asc, eq, inArray, isNull, sql } from "drizzle-orm";
import { createHash, randomBytes } from "node:crypto";
import { getDb } from "@/server/db";
import {
  API_KEY_SCOPES,
  apiKeys,
  apiRateLimits,
  appointmentTypes,
  branches,
  businesses,
  ghlCalendars,
  integrationConnections,
  inventoryBalances,
  inventoryLocations,
  productCategories,
  products,
  productVariants,
  type ApiKeyScope,
} from "@/server/db/schema";
import { env } from "@/server/env";
import { log } from "@/server/log";
import type { WeekHours } from "@/lib/types";
import { audit, invalid, notFound, requirePermission, type Ctx } from "./core";

/*
 * Public website API (docs/PUBLIC_API.md): read-only business data and inquiry intake for the
 * separately deployed customer website. Every function here is scoped by the business the API key
 * belongs to, and returns only intentionally public fields (no costs, exact stock or personal data).
 */

const db = () => getDb();
const KEY_PREFIX = "ocsk_";
const hashKey = (key: string) => createHash("sha256").update(key).digest("hex");

export class PublicApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public retryAfter?: number,
  ) {
    super(message);
  }
}

// ─── Keys ────────────────────────────────────────────────────────────────────

export type SiteKeyAuth = { keyId: string; businessId: string; scopes: ApiKeyScope[] };

/** Validates `Authorization: Bearer <key>` and the required scope. Throws PublicApiError(401/403). */
export async function authenticateSiteKey(authorization: string | null, scope: ApiKeyScope): Promise<SiteKeyAuth> {
  const token = authorization?.match(/^Bearer\s+(\S+)$/i)?.[1];
  if (!token || !token.startsWith(KEY_PREFIX) || token.length > 200) throw new PublicApiError(401, "Missing or invalid API key");
  const [row] = await db()
    .select({ id: apiKeys.id, businessId: apiKeys.businessId, scopes: apiKeys.scopes, revokedAt: apiKeys.revokedAt, lastUsedAt: apiKeys.lastUsedAt })
    .from(apiKeys)
    .where(eq(apiKeys.keyHash, hashKey(token)))
    .limit(1);
  if (!row || row.revokedAt) throw new PublicApiError(401, "Missing or invalid API key");
  if (!row.scopes.includes(scope)) throw new PublicApiError(403, `This key doesn't allow ${scope}`);
  // Record use at most every five minutes, so reads don't write on every request.
  if (!row.lastUsedAt || Date.now() - row.lastUsedAt.getTime() > 5 * 60_000) {
    await db().update(apiKeys).set({ lastUsedAt: new Date() }).where(eq(apiKeys.id, row.id));
  }
  return { keyId: row.id, businessId: row.businessId, scopes: row.scopes };
}

export async function createSiteKey(businessId: string, name: string, scopes: ApiKeyScope[] = [...API_KEY_SCOPES], createdByMembershipId: string | null = null) {
  const clean = scopes.filter((s) => (API_KEY_SCOPES as readonly string[]).includes(s));
  if (!clean.length) throw invalid("Choose at least one scope.");
  const key = KEY_PREFIX + randomBytes(32).toString("base64url");
  const [row] = await db()
    .insert(apiKeys)
    .values({ businessId, name: name.trim().slice(0, 80) || "Website", prefix: key.slice(0, 12), keyHash: hashKey(key), scopes: clean, createdByMembershipId })
    .returning({ id: apiKeys.id, prefix: apiKeys.prefix });
  return { id: row.id, prefix: row.prefix, key };
}

/** Settings → Integrations: list and manage this business's website keys (never returns the key). */
export async function listSiteKeys(ctx: Ctx) {
  requirePermission(ctx, "integrations.manage");
  return db()
    .select({ id: apiKeys.id, name: apiKeys.name, prefix: apiKeys.prefix, scopes: apiKeys.scopes, createdAt: apiKeys.createdAt, lastUsedAt: apiKeys.lastUsedAt, revokedAt: apiKeys.revokedAt })
    .from(apiKeys)
    .where(eq(apiKeys.businessId, ctx.businessId))
    .orderBy(asc(apiKeys.createdAt));
}

export async function issueSiteKey(ctx: Ctx, name: string) {
  requirePermission(ctx, "integrations.manage");
  const created = await createSiteKey(ctx.businessId, name, [...API_KEY_SCOPES], ctx.membershipId);
  await audit(db(), ctx, { action: "api_key.created", entityType: "api_key", entityId: created.id, summary: `Created website API key ${created.prefix}… (${name})` });
  return created;
}

export async function revokeSiteKey(ctx: Ctx, id: string) {
  requirePermission(ctx, "integrations.manage");
  const [row] = await db()
    .update(apiKeys)
    .set({ revokedAt: new Date() })
    .where(and(eq(apiKeys.businessId, ctx.businessId), eq(apiKeys.id, id), isNull(apiKeys.revokedAt)))
    .returning({ prefix: apiKeys.prefix });
  if (!row) throw notFound("API key");
  await audit(db(), ctx, { action: "api_key.revoked", entityType: "api_key", entityId: id, summary: `Revoked website API key ${row.prefix}…` });
}

// ─── Public catalogue feed (anonymous, opt-in) ───────────────────────────────

/**
 * The business behind a public feed URL, only if its owner switched the feed on (Settings → Website).
 * Unknown and disabled businesses look the same (404), so the feed reveals nothing about either.
 */
export async function feedBusiness(slug: string) {
  const [biz] = await db().select({ id: businesses.id, settings: businesses.settings }).from(businesses).where(eq(businesses.slug, slug.slice(0, 80))).limit(1);
  const feed = biz?.settings?.catalogueFeed;
  if (!biz || !feed?.enabled) throw new PublicApiError(404, "Not found");
  return { businessId: biz.id, origins: feed.origins ?? [] };
}

// ─── Rate limiting (durable, fixed window) ──────────────────────────────────

/** Counts one hit for `bucket`; throws 429 with Retry-After when over `limit` in the window. */
export async function rateLimit(bucket: string, limit: number, windowSeconds: number) {
  const now = Date.now();
  const start = new Date(Math.floor(now / (windowSeconds * 1000)) * windowSeconds * 1000);
  const [row] = await db()
    .insert(apiRateLimits)
    .values({ bucket, windowStart: start, count: 1 })
    .onConflictDoUpdate({ target: [apiRateLimits.bucket, apiRateLimits.windowStart], set: { count: sql`${apiRateLimits.count} + 1` } })
    .returning({ count: apiRateLimits.count });
  // Occasionally drop finished windows so the table stays small.
  if (Math.random() < 0.01) await db().delete(apiRateLimits).where(sql`${apiRateLimits.windowStart} < now() - interval '1 day'`);
  if (row.count > limit) {
    const retryAfter = Math.max(1, Math.ceil((start.getTime() + windowSeconds * 1000 - now) / 1000));
    log.warn("public_api.rate_limited", { bucket: bucket.replace(/:ip:.*/, ":ip:…"), limit, windowSeconds });
    throw new PublicApiError(429, "Too many requests — please try again shortly.", retryAfter);
  }
}

// ─── Shared helpers ──────────────────────────────────────────────────────────

const absolute = (url: string | null) => {
  if (!url) return null;
  if (/^https?:\/\//i.test(url)) return url;
  return `${env().APP_URL.replace(/\/$/, "")}${url.startsWith("/") ? "" : "/"}${url}`;
};
const slugify = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "") || "item";

export type Availability = "in_stock" | "low_stock" | "out_of_stock" | "made_to_order" | "service";
const CATALOGUE_EXCLUDED_KINDS = ["services", "rx_lenses"];

function stockStatus(available: number, reorderPoint: number): Exclude<Availability, "made_to_order" | "service"> {
  if (available <= 0) return "out_of_stock";
  return available <= Math.max(2, reorderPoint) ? "low_stock" : "in_stock";
}
const rank: Record<Availability, number> = { in_stock: 4, made_to_order: 3, service: 3, low_stock: 2, out_of_stock: 1 };

// ─── /site ───────────────────────────────────────────────────────────────────

export async function publicSite(businessId: string) {
  const [biz] = await db().select().from(businesses).where(eq(businesses.id, businessId)).limit(1);
  if (!biz) throw new PublicApiError(404, "Not found");
  const [branchRows, typeRows, calendarRows, conn, categoryRows, serviceProducts] = await Promise.all([
    db().select().from(branches).where(and(eq(branches.businessId, businessId), eq(branches.isActive, true))).orderBy(asc(branches.sortOrder), asc(branches.name)),
    db()
      .select()
      .from(appointmentTypes)
      .where(and(eq(appointmentTypes.businessId, businessId), eq(appointmentTypes.isActive, true), eq(appointmentTypes.isPublic, true)))
      .orderBy(asc(appointmentTypes.sortOrder), asc(appointmentTypes.name)),
    db()
      .select({ calendarId: ghlCalendars.ghlCalendarId, branchId: ghlCalendars.branchId, typeId: ghlCalendars.appointmentTypeId })
      .from(ghlCalendars)
      .where(and(eq(ghlCalendars.businessId, businessId), eq(ghlCalendars.isActive, true))),
    db().select({ status: integrationConnections.status }).from(integrationConnections).where(and(eq(integrationConnections.businessId, businessId), eq(integrationConnections.provider, "gohighlevel"))).limit(1),
    catalogueRows(businessId),
    db()
      .select({ id: products.id, name: products.name, description: products.description, min: sql<number>`min(${productVariants.priceCents})`, max: sql<number>`max(${productVariants.priceCents})` })
      .from(products)
      .innerJoin(productCategories, eq(productCategories.id, products.categoryId))
      .innerJoin(productVariants, and(eq(productVariants.productId, products.id), eq(productVariants.isActive, true), isNull(productVariants.archivedAt)))
      .where(and(eq(products.businessId, businessId), eq(products.showOnWebsite, true), eq(products.isActive, true), isNull(products.archivedAt), inArray(productCategories.kind, CATALOGUE_EXCLUDED_KINDS as never)))
      .groupBy(products.id)
      .orderBy(asc(products.name)),
  ]);
  const activeBranchIds = new Set(branchRows.map((b) => b.id));
  const content = biz.websiteContent ?? {};
  const categories = new Map<string, { slug: string; name: string; kind: string; productCount: number }>();
  for (const p of categoryRows) {
    const c = categories.get(p.categorySlug) ?? { slug: p.categorySlug, name: p.categoryName, kind: p.categoryKind, productCount: 0 };
    c.productCount++;
    categories.set(p.categorySlug, c);
  }
  return {
    business: {
      name: biz.name,
      legalName: biz.legalName,
      tagline: biz.tagline,
      description: biz.description,
      logoUrl: absolute(biz.logoUrl),
      phone: biz.phone,
      email: biz.email,
      address: [biz.addressLine1, biz.addressLine2, biz.city].filter(Boolean).join(", ") || null,
      website: biz.website,
      timezone: biz.timezone,
      currency: biz.currency,
      locale: biz.locale,
      taxName: biz.taxName,
      pricesIncludeTax: biz.pricesIncludeTax,
      brandColor: biz.brandColor,
      accentColor: biz.accentColor,
      isDemo: biz.isDemo,
    },
    content: {
      heroEyebrow: content.heroEyebrow ?? null,
      heroTitle: content.heroTitle ?? null,
      heroBody: content.heroBody ?? null,
      aboutTitle: content.aboutTitle ?? null,
      aboutBody: content.aboutBody ?? null,
      values: (content.values ?? []).map((v) => ({ title: v.title, body: v.body })),
      faqs: (content.faqs ?? []).map((f) => ({ question: f.question, answer: f.answer })),
      privacyContactEmail: content.privacyContactEmail ?? null,
    },
    branches: branchRows.map((b) => ({
      id: b.id,
      code: b.code,
      name: b.name,
      address: [b.addressLine1, [b.addressLine2, b.city].filter(Boolean).join(", ")].filter((x): x is string => Boolean(x)),
      phone: b.phone,
      email: b.email,
      mapUrl: b.mapUrl,
      imageUrl: absolute(b.imageUrl),
      hours: (b.businessHours ?? biz.businessHours) as WeekHours,
    })),
    services: typeRows.map((t) => ({
      id: t.id,
      code: t.code,
      name: t.name,
      description: t.description,
      durationMinutes: t.durationMinutes,
      priceCents: t.priceCents === null ? null : Number(t.priceCents),
      calendars: calendarRows
        .filter((c) => c.typeId === t.id && c.branchId && activeBranchIds.has(c.branchId))
        .map((c) => ({ branchId: c.branchId as string, calendarId: c.calendarId })),
    })),
    inBranchServices: serviceProducts.map((s) => ({ id: s.id, name: s.name, description: s.description, priceCents: Number(s.min), fromPrice: Number(s.max) > Number(s.min) })),
    categories: [...categories.values()],
    booking: {
      widgetBase: (process.env.GHL_WIDGET_BASE || "https://api.leadconnectorhq.com/widget/booking/").replace(/\/?$/, "/"),
      ghlConnected: conn[0]?.status === "connected",
    },
    generatedAt: new Date().toISOString(),
  };
}

// ─── Catalogue ───────────────────────────────────────────────────────────────

/** Published catalogue products with their category, in a stable order (slugs depend on it). */
async function catalogueRows(businessId: string) {
  return db()
    .select({
      id: products.id,
      name: products.name,
      brand: products.brand,
      description: products.description,
      imageUrl: products.imageUrl,
      productType: products.productType,
      attributes: products.attributes,
      updatedAt: products.updatedAt,
      createdAt: products.createdAt,
      categorySlug: productCategories.slug,
      categoryName: productCategories.name,
      categoryKind: productCategories.kind,
      categorySort: productCategories.sortOrder,
    })
    .from(products)
    .innerJoin(productCategories, eq(productCategories.id, products.categoryId))
    .where(
      and(
        eq(products.businessId, businessId),
        eq(products.showOnWebsite, true),
        eq(products.isActive, true),
        isNull(products.archivedAt),
        eq(productCategories.isActive, true),
        sql`${productCategories.kind} not in ('services', 'rx_lenses')`,
        sql`${products.productType} <> 'service'`,
      ),
    )
    .orderBy(asc(productCategories.sortOrder), asc(products.name), asc(products.createdAt), asc(products.id));
}

/** Stable URL slugs: the product name, with -2, -3… for duplicates in creation order. */
function withSlugs<T extends { id: string; name: string; createdAt: Date }>(rows: T[]) {
  const byAge = [...rows].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime() || a.id.localeCompare(b.id));
  const seen = new Map<string, number>();
  const slugs = new Map<string, string>();
  for (const r of byAge) {
    const base = slugify(r.name);
    const n = (seen.get(base) ?? 0) + 1;
    seen.set(base, n);
    slugs.set(r.id, n === 1 ? base : `${base}-${n}`);
  }
  return rows.map((r) => ({ ...r, slug: slugs.get(r.id)! }));
}

async function variantsWithStock(businessId: string, productIds: string[]) {
  if (!productIds.length) return [];
  const variants = await db()
    .select({ id: productVariants.id, productId: productVariants.productId, label: productVariants.label, options: productVariants.options, priceCents: productVariants.priceCents, sku: productVariants.sku, reorderPoint: productVariants.reorderPoint })
    .from(productVariants)
    .where(and(eq(productVariants.businessId, businessId), inArray(productVariants.productId, productIds), eq(productVariants.isActive, true), isNull(productVariants.archivedAt)))
    .orderBy(asc(productVariants.sortOrder), asc(productVariants.label));
  if (!variants.length) return [];
  const [activeBranches, stock] = await Promise.all([
    db()
      .select({ id: branches.id, name: branches.name })
      .from(branches)
      .where(and(eq(branches.businessId, businessId), eq(branches.isActive, true)))
      .orderBy(asc(branches.sortOrder), asc(branches.name)),
    // Available per variant and branch, summed over the branch's active stock locations.
    db()
      .select({ variantId: inventoryBalances.variantId, branchId: inventoryLocations.branchId, available: sql<number>`sum(greatest(${inventoryBalances.onHand} - ${inventoryBalances.reserved}, 0))::int` })
      .from(inventoryBalances)
      .innerJoin(inventoryLocations, eq(inventoryLocations.id, inventoryBalances.locationId))
      .where(and(eq(inventoryBalances.businessId, businessId), inArray(inventoryBalances.variantId, variants.map((v) => v.id)), eq(inventoryLocations.isActive, true)))
      .groupBy(inventoryBalances.variantId, inventoryLocations.branchId),
  ]);
  const availableAt = new Map(stock.map((s) => [`${s.variantId}:${s.branchId}`, Number(s.available)]));
  return variants.map((v) => {
    // Every active branch is listed, so a branch that never stocked the item reads "out of stock".
    const perBranch = activeBranches.map((b) => ({ branchId: b.id, branchName: b.name, available: availableAt.get(`${v.id}:${b.id}`) ?? 0 }));
    const total = perBranch.reduce((n, r) => n + r.available, 0);
    return { ...v, priceCents: Number(v.priceCents), total, perBranch };
  });
}

type CatalogueRow = Awaited<ReturnType<typeof catalogueRows>>[number] & { slug: string };
type VariantRow = Awaited<ReturnType<typeof variantsWithStock>>[number];

function variantAvailability(productType: string, v: VariantRow): Availability {
  if (productType === "made_to_order") return "made_to_order";
  if (productType === "service") return "service";
  return stockStatus(v.total, v.reorderPoint);
}

function summary(p: CatalogueRow, variants: VariantRow[]) {
  const prices = variants.map((v) => v.priceCents);
  const statuses = variants.map((v) => variantAvailability(p.productType, v));
  const best = statuses.sort((a, b) => rank[b] - rank[a])[0] ?? "out_of_stock";
  return {
    id: p.id,
    slug: p.slug,
    name: p.name,
    brand: p.brand,
    category: { slug: p.categorySlug, name: p.categoryName, kind: p.categoryKind },
    description: p.description,
    imageUrl: absolute(p.imageUrl),
    priceFromCents: prices.length ? Math.min(...prices) : null,
    priceToCents: prices.length ? Math.max(...prices) : null,
    variantCount: variants.length,
    availability: best as Availability,
    updatedAt: p.updatedAt.toISOString(),
  };
}

export async function publicProducts(businessId: string, filter: { category?: string | null; q?: string | null } = {}) {
  const rows = withSlugs(await catalogueRows(businessId));
  const q = (filter.q ?? "").trim().toLowerCase().slice(0, 100);
  const filtered = rows.filter((r) => {
    if (filter.category && r.categorySlug !== filter.category) return false;
    if (!q) return true;
    const text = [r.name, r.brand, r.categoryName, r.description].join(" ").toLowerCase();
    return q.split(/\s+/).every((w) => text.includes(w));
  });
  const variants = await variantsWithStock(businessId, filtered.map((r) => r.id));
  const byProduct = Map.groupBy(variants, (v) => v.productId);
  return {
    products: filtered.filter((r) => byProduct.has(r.id)).map((r) => summary(r, byProduct.get(r.id) ?? [])),
    generatedAt: new Date().toISOString(),
  };
}

export async function publicProduct(businessId: string, slugOrId: string) {
  const rows = withSlugs(await catalogueRows(businessId));
  const p = rows.find((r) => r.slug === slugOrId || r.id === slugOrId);
  if (!p) throw new PublicApiError(404, "Not found");
  const variants = await variantsWithStock(businessId, [p.id]);
  if (!variants.length) throw new PublicApiError(404, "Not found");
  const relatedRows = rows.filter((r) => r.categorySlug === p.categorySlug && r.id !== p.id).slice(0, 4);
  const relatedVariants = Map.groupBy(await variantsWithStock(businessId, relatedRows.map((r) => r.id)), (v) => v.productId);
  return {
    product: {
      ...summary(p, variants),
      attributes: p.attributes ?? {},
      variants: variants.map((v) => ({
        id: v.id,
        label: v.label,
        options: v.options ?? {},
        priceCents: v.priceCents,
        sku: v.sku,
        availability: variantAvailability(p.productType, v),
        branches:
          p.productType === "stock"
            ? v.perBranch.map((b) => ({ branchId: b.branchId, branchName: b.branchName, availability: stockStatus(b.available, v.reorderPoint) }))
            : [],
      })),
      related: relatedRows.filter((r) => relatedVariants.has(r.id)).map((r) => summary(r, relatedVariants.get(r.id) ?? [])),
    },
  };
}
