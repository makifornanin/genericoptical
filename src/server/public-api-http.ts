import { unstable_rethrow } from "next/navigation";
import { ZodError } from "zod";
import type { ApiKeyScope } from "@/server/db/schema";
import { errorFields, log } from "@/server/log";
import { AppError } from "@/server/services/core";
import { authenticateSiteKey, PublicApiError, rateLimit, type SiteKeyAuth } from "@/server/services/public-api";

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

/** The visitor IP the website server forwarded, if it looks like an IP address. */
export function forwardedClientIp(request: Request): string | null {
  const raw = request.headers.get("x-client-ip")?.trim() ?? "";
  return raw && raw.length <= 45 && /^[0-9a-fA-F:.]+$/.test(raw) ? raw : null;
}
