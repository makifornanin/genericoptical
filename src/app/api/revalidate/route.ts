import { createHash, timingSafeEqual } from "node:crypto";
import { revalidateTag } from "next/cache";
import { revalidateSecret } from "@/lib/env";

/*
 * POST /api/revalidate — on-demand cache refresh, called by the dashboard after it changes
 * products, prices, stock or website settings.
 *
 *   Authorization: Bearer <REVALIDATE_SECRET>      (or header x-revalidate-secret: <secret>)
 *   { "tags": ["site", "catalog"] }                 any non-empty subset
 *
 * 200 { revalidated: [...] } · 400 unknown/missing tags · 401 bad or missing secret.
 *
 * Next.js 16: revalidateTag(tag, profile) needs a profile. From a webhook-style Route Handler the
 * docs recommend { expire: 0 }: the tagged data and pages expire immediately, so the next visit
 * renders fresh data from the dashboard (blocking) instead of serving the stale copy once more.
 * The 60-second time-based revalidation stays in place for everything else.
 */

const TAGS = ["site", "catalog"] as const;
type Tag = (typeof TAGS)[number];

function digest(value: string): Buffer {
  return createHash("sha256").update(value, "utf8").digest();
}

function authorised(request: Request): boolean {
  const secret = revalidateSecret();
  if (!secret) return false;
  const auth = request.headers.get("authorization") ?? "";
  const bearer = /^Bearer\s+(.+)$/i.exec(auth.trim())?.[1]?.trim();
  const provided = bearer ?? request.headers.get("x-revalidate-secret")?.trim() ?? "";
  if (!provided) return false;
  // Hash both sides so the comparison is constant-time regardless of length.
  return timingSafeEqual(digest(provided), digest(secret));
}

export async function POST(request: Request) {
  if (!authorised(request)) {
    return Response.json({ error: "Unauthorized" }, { status: 401, headers: { "Cache-Control": "no-store" } });
  }
  const body = (await request.json().catch(() => null)) as { tags?: unknown } | null;
  const tags = body?.tags;
  if (!Array.isArray(tags) || tags.length === 0 || !tags.every((t): t is Tag => (TAGS as readonly unknown[]).includes(t))) {
    return Response.json({ error: `tags must be a non-empty subset of ${JSON.stringify(TAGS)}` }, { status: 400, headers: { "Cache-Control": "no-store" } });
  }
  const unique = [...new Set(tags)];
  for (const tag of unique) revalidateTag(tag, { expire: 0 });
  return Response.json({ revalidated: unique }, { headers: { "Cache-Control": "no-store" } });
}
