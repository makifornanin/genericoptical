import "server-only";

/*
 * First-line, per-instance rate limit for the inquiry form (in memory). It only blunts bursts
 * from one visitor on one server instance; the dashboard enforces the durable limits (per key and
 * per visitor IP, in PostgreSQL) — see docs/PUBLIC_API.md → Rate limits.
 */

const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 5;
const MAX_TRACKED = 5_000;
const hits = new Map<string, number[]>();

export function rateLimit(key: string, now = Date.now()): { allowed: boolean; retryAfterSeconds: number } {
  const recent = (hits.get(key) ?? []).filter((t) => now - t < WINDOW_MS);
  if (recent.length >= MAX_PER_WINDOW) {
    hits.set(key, recent);
    return { allowed: false, retryAfterSeconds: Math.max(1, Math.ceil((WINDOW_MS - (now - recent[0])) / 1000)) };
  }
  recent.push(now);
  hits.set(key, recent);
  if (hits.size > MAX_TRACKED) {
    // Drop the oldest entries so memory stays bounded.
    for (const k of hits.keys()) {
      hits.delete(k);
      if (hits.size <= MAX_TRACKED / 2) break;
    }
  }
  return { allowed: true, retryAfterSeconds: 0 };
}

/**
 * The visitor's IP: the first address in x-forwarded-for, else x-real-ip. On Vercel both headers
 * are set by the platform (client-supplied values are overwritten), so they can be trusted there.
 */
export function clientIp(headers: Headers): string | null {
  const forwarded = headers.get("x-forwarded-for");
  const first = forwarded?.split(",")[0]?.trim();
  const candidate = first || headers.get("x-real-ip")?.trim() || "";
  return /^[0-9a-fA-F:.]{2,45}$/.test(candidate) ? candidate : null;
}
