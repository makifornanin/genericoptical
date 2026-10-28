import { unstable_rethrow } from "next/navigation";
import { ZodError } from "zod";
import type { ApiKeyScope } from "@/server/db/schema";
import { errorFields, log } from "@/server/log";
import { AppError } from "@/server/services/core";
import { clientIp, readBodyCapped } from "@/server/http";
import { authenticateSiteKey, feedBusiness, PublicApiError, rateLimit, type SiteKeyAuth } from "@/server/services/public-api";

/** Shared request handling for /api/public/v1 (docs/PUBLIC_API.md). Server-to-server only: no CORS. */

const READ_CACHE = "private, max-age=0, s-maxage=30, stale-while-revalidate=60";
const NO_STORE = { "Cache-Control": "no-store" };

export function publicError(error: unknown): Response {
  // Next.js control flow (e.g. leaving prerendering when the request is read) must propagate.
  unstable_rethrow(error);
  if (error instanceof PublicApiError) {
    const headers: Record<string, string> = { ...NO_STORE };
    if (error.retryAfter) headers["Retry-After"] = String(error.retryAfter);
    if (error.status === 401) headers["WWW-Authenticate"] = 'Bearer realm="public-api"';
    return Response.json({ error: error.message }, { status: error.status, headers });
  }
  if (error instanceof ZodError) {
    const fieldErrors: Record<string, string[]> = {};
    for (const issue of error.issues) (fieldErrors[issue.path.join(".") || "_"] ??= []).push(issue.message);
    return Response.json({ error: "Please check the highlighted fields.", fieldErrors }, { status: 400, headers: NO_STORE });
  }
  if (error instanceof AppError && error.code !== "unauthorized" && error.code !== "forbidden") {
    // Validation/not-found raised inside services, e.g. a branch id from another business.
    return Response.json({ error: error.message, fieldErrors: error.fieldErrors }, { status: 400, headers: NO_STORE });
  }
  log.error("public_api.failed", errorFields(error));
  return Response.json({ error: "Something went wrong." }, { status: 500, headers: NO_STORE });
}

/** Authenticated, rate-limited, CDN-cacheable read. */
export async function publicRead(request: Request, scope: ApiKeyScope, load: (auth: SiteKeyAuth) => Promise<unknown>): Promise<Response> {
  try {
    const auth = await authenticateSiteKey(request.headers.get("authorization"), scope);
    await rateLimit(`read:key:${auth.keyId}`, 600, 60);
    const body = await load(auth);
    return Response.json(body, { headers: { "Cache-Control": READ_CACHE, Vary: "Authorization" } });
  } catch (error) {
    return publicError(error);
  }
}

/**
 * Authenticated, uncached JSON write (website orders, cart quotes). The body is capped; `limits`
 * apply per key and, when the website forwarded it, per visitor IP.
 */
export async function publicWrite(
  request: Request,
  scope: ApiKeyScope,
  opts: { maxBytes: number; perKey: [number, number]; perIp?: [number, number]; bucket: string; status?: number },
  handle: (auth: SiteKeyAuth, body: unknown, ip: string | null) => Promise<unknown>,
): Promise<Response> {
  try {
    const auth = await authenticateSiteKey(request.headers.get("authorization"), scope);
    const raw = await readBodyCapped(request, opts.maxBytes);
    if (raw === null) throw new PublicApiError(413, "Payload too large");
    let body: unknown = {};
    if (raw.trim()) {
      try {
        body = JSON.parse(raw);
      } catch {
        throw new PublicApiError(400, "Send a JSON body.");
      }
    }
    const ip = forwardedClientIp(request);
    if (ip && opts.perIp) await rateLimit(`${opts.bucket}:ip:${auth.businessId}:${ip}`, opts.perIp[0], opts.perIp[1]);
    await rateLimit(`${opts.bucket}:key:${auth.keyId}`, opts.perKey[0], opts.perKey[1]);
    const result = await handle(auth, body, ip);
    return Response.json(result, { status: opts.status ?? 200, headers: NO_STORE });
  } catch (error) {
    return publicError(error);
  }
}

/** The visitor IP the website server forwarded, if it looks like an IP address. */
export function forwardedClientIp(request: Request): string | null {
  const raw = request.headers.get("x-client-ip")?.trim() ?? "";
  return raw && raw.length <= 45 && /^[0-9a-fA-F:.]+$/.test(raw) ? raw : null;
}

// ─── Public catalogue feed ───────────────────────────────────────────────────

/** CORS for the feed: only origins the business listed. Public data, so this limits embedding, not access. */
function corsFor(origin: string | null, allowed: string[]): Record<string, string> {
  return origin && allowed.includes(origin) ? { "Access-Control-Allow-Origin": origin, "Access-Control-Allow-Methods": "GET, OPTIONS", "Access-Control-Max-Age": "86400" } : {};
}

/** Anonymous, opt-in, rate-limited read of intentionally public catalogue data. */
export async function publicFeed(request: Request, slug: string, load: (businessId: string) => Promise<unknown>): Promise<Response> {
  try {
    const feed = await feedBusiness(slug);
    const ip = clientIp(request.headers.get("x-forwarded-for"), request.headers.get("x-real-ip")) ?? "unknown";
    await rateLimit(`feed:ip:${feed.businessId}:${ip}`, 240, 60);
    const body = await load(feed.businessId);
    return Response.json(body, {
      // No stale-while-revalidate: switching the feed off must reach visitors within a minute.
      headers: { "Cache-Control": "public, max-age=60, s-maxage=60", Vary: "Origin", ...corsFor(request.headers.get("origin"), feed.origins) },
    });
  } catch (error) {
    return publicError(error);
  }
}

/** CORS preflight for the feed (browsers only send it for non-simple requests, but answer it properly). */
export async function publicFeedPreflight(request: Request, slug: string): Promise<Response> {
  try {
    const feed = await feedBusiness(slug);
    return new Response(null, { status: 204, headers: { Vary: "Origin", ...corsFor(request.headers.get("origin"), feed.origins) } });
  } catch (error) {
    return publicError(error);
  }
}
