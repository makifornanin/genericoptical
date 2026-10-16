import "server-only";
import { cache } from "react";
import { unstable_cache } from "next/cache";
import { apiConfig } from "./env";
import {
  DAY_KEYS,
  type Availability,
  type Branch,
  type BranchAvailability,
  type Category,
  type CategoryRef,
  type DayHours,
  type ProductDetail,
  type ProductSummary,
  type ProductVariant,
  type Service,
  type SiteData,
  type WeeklyHours,
} from "./api-types";

/*
 * Server-only client for the dashboard's public website API (docs/PUBLIC_API.md in the dashboard).
 *
 * - Every call authenticates with the site key (Authorization: Bearer …). The key never leaves the
 *   server: this module imports "server-only", and nothing here is passed to Client Components.
 * - Results are cached for 60 seconds and tagged "site" / "catalog" so POST /api/revalidate can
 *   refresh them on demand (src/app/api/revalidate/route.ts).
 * - Failures never throw into rendering: callers get { ok: false, reason } and render a friendly
 *   "temporarily unavailable" or "setup needed" state. `next build` succeeds without the API.
 * - Outages: the cached request (unstable_cache) throws on a failed upstream call, which makes
 *   Next.js keep serving the last good response it has instead of caching the failure. Only when
 *   there is no good copy at all (first deploy while the API is down, or right after an on-demand
 *   revalidation) does a page show the unavailable state, and it retries on the next request.
 */

export const REVALIDATE_SECONDS = 60;
export type CacheTag = "site" | "catalog";
export type ApiFailure = "not_configured" | "unavailable" | "not_found";
export type ApiResult<T> = { ok: true; data: T } | { ok: false; reason: ApiFailure };

const TIMEOUT_MS = 8000;

class UpstreamError extends Error {
  constructor(
    readonly reason: "unavailable" | "not_configured",
    message: string,
  ) {
    super(message);
    this.name = "UpstreamError";
  }
}

type Fetched = { status: 200; body: unknown } | { status: 404 };

async function requestJson(path: string, tag: CacheTag): Promise<Fetched> {
  const config = apiConfig();
  if (!config) throw new UpstreamError("not_configured", "DASHBOARD_API_URL / DASHBOARD_SITE_KEY not set");
  let res: Response;
  try {
    res = await fetch(`${config.baseUrl}/api/public/v1${path}`, {
      headers: { Authorization: `Bearer ${config.siteKey}`, Accept: "application/json" },
      next: { revalidate: REVALIDATE_SECONDS, tags: [tag] },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (error) {
    const why = error instanceof Error && error.name === "TimeoutError" ? `timed out after ${TIMEOUT_MS} ms` : "network error";
    throw new UpstreamError("unavailable", `GET ${path}: ${why}`);
  }
  if (res.status === 404) return { status: 404 };
  if (res.status === 401 || res.status === 403) {
    throw new UpstreamError("not_configured", `GET ${path}: HTTP ${res.status} (site key rejected — check DASHBOARD_SITE_KEY)`);
  }
  if (!res.ok) throw new UpstreamError("unavailable", `GET ${path}: HTTP ${res.status}`);
  try {
    return { status: 200, body: await res.json() };
  } catch {
    throw new UpstreamError("unavailable", `GET ${path}: invalid JSON`);
  }
}

const cachedSite = unstable_cache(() => requestJson("/site", "site"), ["public-api-v1", "site"], {
  revalidate: REVALIDATE_SECONDS,
  tags: ["site"],
});
const cachedProducts = unstable_cache((query: string) => requestJson(`/products${query}`, "catalog"), ["public-api-v1", "products"], {
  revalidate: REVALIDATE_SECONDS,
  tags: ["catalog"],
});
const cachedProduct = unstable_cache((slug: string) => requestJson(`/products/${encodeURIComponent(slug)}`, "catalog"), ["public-api-v1", "product"], {
  revalidate: REVALIDATE_SECONDS,
  tags: ["catalog"],
});

async function settle<T>(label: string, load: () => Promise<Fetched>, parse: (body: unknown) => T | null): Promise<ApiResult<T>> {
  if (!apiConfig()) return { ok: false, reason: "not_configured" };
  try {
    const result = await load();
    if (result.status === 404) return { ok: false, reason: "not_found" };
    const data = parse(result.body);
    if (data === null) {
      console.error(`[public-api] ${label}: response did not match the contract`);
      return { ok: false, reason: "unavailable" };
    }
    return { ok: true, data };
  } catch (error) {
    const reason = error instanceof UpstreamError ? error.reason : "unavailable";
    console.error(`[public-api] ${label} failed (${reason}): ${error instanceof Error ? error.message : String(error)}`);
    return { ok: false, reason };
  }
}

/** Business profile, website copy, branches, services, categories and booking settings. */
export const getSite = cache(() => settle("site", () => cachedSite(), parseSite));

// React's cache() dedupes by argument identity, so the per-render memo is keyed by the query string.
const productsByQuery = cache((query: string) =>
  settle(`products${query}`, () => cachedProducts(query), (body) => {
    const items = obj(body)?.products;
    return Array.isArray(items) ? items.map(parseProductSummary).filter((p): p is ProductSummary => p !== null) : null;
  }),
);

/** Published products (summary). Filtering on the eyewear page happens client-side over the full list. */
export function getProducts(filter: { category?: string; q?: string } = {}): Promise<ApiResult<ProductSummary[]>> {
  const params = new URLSearchParams();
  if (filter.category) params.set("category", filter.category);
  if (filter.q) params.set("q", filter.q);
  return productsByQuery(params.size ? `?${params.toString()}` : "");
}

/** One product with variants, per-branch availability and related products. */
export const getProduct = cache((slug: string) => {
  // Anything that can't be a slug is a 404 without calling the API.
  if (!/^[a-z0-9][a-z0-9._-]{0,159}$/i.test(slug)) return Promise.resolve<ApiResult<ProductDetail>>({ ok: false, reason: "not_found" });
  return settle(`product ${slug}`, () => cachedProduct(slug), (body) => parseProductDetail(obj(body)?.product));
});

/* ── Normalisers: tolerate missing optional fields, reject what would break rendering ─────── */

type Obj = Record<string, unknown>;
function obj(v: unknown): Obj | null {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Obj) : null;
}
function str(v: unknown): string | null {
  return typeof v === "string" && v.trim() !== "" ? v : null;
}
function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}
function list(v: unknown): unknown[] {
  return Array.isArray(v) ? v : [];
}
/** Only absolute http(s) URLs are used in src/href attributes. */
function url(v: unknown): string | null {
  const s = str(v);
  if (!s) return null;
  try {
    const u = new URL(s);
    return u.protocol === "https:" || u.protocol === "http:" ? u.toString() : null;
  } catch {
    return null;
  }
}
function color(v: unknown): string | null {
  const s = str(v);
  return s && /^#?[0-9a-f]{6}$/i.test(s.trim()) ? (s.trim().startsWith("#") ? s.trim() : `#${s.trim()}`) : null;
}
const AVAILABILITY: Availability[] = ["in_stock", "low_stock", "out_of_stock", "made_to_order", "service"];
function availability(v: unknown): Availability {
  return AVAILABILITY.includes(v as Availability) ? (v as Availability) : "out_of_stock";
}
function branchAvailability(v: unknown): BranchAvailability {
  return v === "in_stock" || v === "low_stock" ? v : "out_of_stock";
}
function hhmm(v: unknown): string | null {
  const s = str(v);
  return s && /^\d{1,2}:\d{2}$/.test(s) ? s.padStart(5, "0") : null;
}
function hours(v: unknown): WeeklyHours {
  const o = obj(v) ?? {};
  const out = {} as WeeklyHours;
  for (const d of DAY_KEYS) {
    const h = obj(o[d]);
    const open = h ? hhmm(h.open) : null;
    const close = h ? hhmm(h.close) : null;
    out[d] = (open && close ? { open, close } : null) satisfies DayHours;
  }
  return out;
}
function stringMap(v: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, val] of Object.entries(obj(v) ?? {})) if (typeof val === "string" || typeof val === "number") out[k] = String(val);
  return out;
}

function parseBranch(v: unknown): Branch | null {
  const b = obj(v);
  const id = b && str(b.id);
  const name = b && str(b.name);
  if (!b || !id || !name) return null;
  return {
    id,
    code: str(b.code),
    name,
    address: list(b.address).filter((x): x is string => typeof x === "string" && x.trim() !== ""),
    phone: str(b.phone),
    email: str(b.email),
    mapUrl: url(b.mapUrl),
    imageUrl: url(b.imageUrl),
    hours: hours(b.hours),
  };
}

function parseService(v: unknown): Service | null {
  const s = obj(v);
  const id = s && str(s.id);
  const name = s && str(s.name);
  if (!s || !id || !name) return null;
  return {
    id,
    code: str(s.code) ?? id,
    name,
    description: str(s.description),
    durationMinutes: num(s.durationMinutes),
    priceCents: num(s.priceCents),
    calendars: list(s.calendars)
      .map(obj)
      .filter((c): c is Obj => c !== null)
      // A calendar ID goes into an iframe URL: accept only GHL-style IDs.
      .filter((c) => typeof c.branchId === "string" && typeof c.calendarId === "string" && /^[A-Za-z0-9_-]{4,64}$/.test(c.calendarId))
      .map((c) => ({ branchId: c.branchId as string, calendarId: c.calendarId as string })),
  };
}

function parseCategoryRef(v: unknown): CategoryRef {
  const c = obj(v) ?? {};
  const slug = str(c.slug) ?? "other";
  return { slug, name: str(c.name) ?? slug, kind: str(c.kind) ?? slug };
}

export function parseSite(body: unknown): SiteData | null {
  const root = obj(body);
  const b = obj(root?.business);
  const name = b && str(b.name);
  if (!root || !b || !name) return null;
  const c = obj(root.content) ?? {};
  const booking = obj(root.booking) ?? {};
  const widgetBase = url(booking.widgetBase);
  return {
    business: {
      name,
      legalName: str(b.legalName),
      tagline: str(b.tagline),
      description: str(b.description),
      logoUrl: url(b.logoUrl),
      phone: str(b.phone),
      email: str(b.email),
      address: str(b.address),
      website: url(b.website),
      timezone: str(b.timezone) ?? "UTC",
      currency: str(b.currency) ?? "USD",
      locale: str(b.locale) ?? "en",
      taxName: str(b.taxName),
      pricesIncludeTax: b.pricesIncludeTax !== false,
      brandColor: color(b.brandColor),
      accentColor: color(b.accentColor),
      isDemo: b.isDemo === true,
    },
    content: {
      heroEyebrow: str(c.heroEyebrow),
      heroTitle: str(c.heroTitle),
      heroBody: str(c.heroBody),
      aboutTitle: str(c.aboutTitle),
      aboutBody: str(c.aboutBody),
      values: list(c.values)
        .map(obj)
        .filter((x): x is Obj => x !== null && Boolean(str(x.title)))
        .map((x) => ({ title: str(x.title) as string, body: str(x.body) ?? "" })),
      faqs: list(c.faqs)
        .map(obj)
        .filter((x): x is Obj => x !== null && Boolean(str(x.question)) && Boolean(str(x.answer)))
        .map((x) => ({ question: str(x.question) as string, answer: str(x.answer) as string })),
      privacyContactEmail: str(c.privacyContactEmail),
    },
    branches: list(root.branches).map(parseBranch).filter((x): x is Branch => x !== null),
    services: list(root.services).map(parseService).filter((x): x is Service => x !== null),
    inBranchServices: list(root.inBranchServices)
      .map(obj)
      .filter((x): x is Obj => x !== null && Boolean(str(x.name)))
      .map((x) => ({
        id: str(x.id) ?? (str(x.name) as string),
        name: str(x.name) as string,
        description: str(x.description),
        priceCents: num(x.priceCents),
        fromPrice: x.fromPrice === true,
      })),
    categories: list(root.categories)
      .map(obj)
      .filter((x): x is Obj => x !== null && Boolean(str(x.slug)))
      .map((x): Category => ({ ...parseCategoryRef(x), productCount: num(x.productCount) ?? 0 })),
    booking: {
      widgetBase: widgetBase && widgetBase.startsWith("https:") ? (widgetBase.endsWith("/") ? widgetBase : `${widgetBase}/`) : null,
      ghlConnected: booking.ghlConnected === true,
    },
    generatedAt: str(root.generatedAt),
  };
}

function parseProductSummary(v: unknown): ProductSummary | null {
  const p = obj(v);
  const id = p && str(p.id);
  const slug = p && str(p.slug);
  const name = p && str(p.name);
  if (!p || !id || !slug || !name) return null;
  return {
    id,
    slug,
    name,
    brand: str(p.brand),
    category: parseCategoryRef(p.category),
    description: str(p.description),
    imageUrl: url(p.imageUrl),
    priceFromCents: num(p.priceFromCents),
    priceToCents: num(p.priceToCents),
    variantCount: num(p.variantCount) ?? 0,
    availability: availability(p.availability),
    updatedAt: str(p.updatedAt),
  };
}

function parseVariant(v: unknown): ProductVariant | null {
  const x = obj(v);
  const id = x && str(x.id);
  if (!x || !id) return null;
  return {
    id,
    label: str(x.label) ?? id,
    options: stringMap(x.options),
    priceCents: num(x.priceCents),
    sku: str(x.sku),
    availability: availability(x.availability),
    branches: list(x.branches)
      .map(obj)
      .filter((b): b is Obj => b !== null && Boolean(str(b.branchId)))
      .map((b) => ({ branchId: b.branchId as string, branchName: str(b.branchName) ?? "", availability: branchAvailability(b.availability) })),
  };
}

export function parseProductDetail(v: unknown): ProductDetail | null {
  const summary = parseProductSummary(v);
  const p = obj(v);
  if (!summary || !p) return null;
  return {
    ...summary,
    attributes: stringMap(p.attributes),
    variants: list(p.variants).map(parseVariant).filter((x): x is ProductVariant => x !== null),
    related: list(p.related).map(parseProductSummary).filter((x): x is ProductSummary => x !== null),
  };
}
