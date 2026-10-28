import { apiConfig } from "@/lib/env";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { INQUIRY_FIELDS, parseInquiry, type InquiryField } from "@/lib/inquiry-schema";

/*
 * POST /api/inquiry — the website's inquiry endpoint (contact form, product inquiries and
 * appointment requests). The browser posts here; this handler validates the input, applies a
 * first-line rate limit and forwards it server-to-server to the dashboard
 * (POST /api/public/v1/inquiries) with the secret site key. Responses never contain secrets or
 * upstream details.
 *
 * Response: 201 { ok: true } | 4xx/5xx { ok: false, code, error, fieldErrors? }
 *   code: "invalid" | "rate_limited" | "unavailable" | "forbidden" | "too_large"
 */

const MAX_BODY_BYTES = 16 * 1024; // matches the dashboard's limit
const TIMEOUT_MS = 8000;

type Code = "invalid" | "rate_limited" | "unavailable" | "forbidden" | "too_large";
const MESSAGES: Record<Code, string> = {
  invalid: "Please check the highlighted fields.",
  rate_limited: "You've sent several messages in a short time. Please wait a few minutes and try again.",
  unavailable: "We couldn't send your message right now — please call us.",
  forbidden: "This form can only be sent from our website.",
  too_large: "Your message is too long. Please shorten it and try again.",
};

function fail(status: number, code: Code, extra: Record<string, unknown> = {}, headers: Record<string, string> = {}) {
  return Response.json({ ok: false, code, error: MESSAGES[code], ...extra }, { status, headers: { "Cache-Control": "no-store", ...headers } });
}

function sameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return true; // non-browser clients; the dashboard still authenticates and rate-limits
  try {
    const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

export async function POST(request: Request) {
  if (!sameOrigin(request)) return fail(403, "forbidden");

  const declared = Number(request.headers.get("content-length") ?? "0");
  if (declared > MAX_BODY_BYTES) return fail(413, "too_large");
  let raw: string;
  try {
    raw = await request.text();
  } catch {
    return fail(400, "invalid");
  }
  if (new TextEncoder().encode(raw).length > MAX_BODY_BYTES) return fail(413, "too_large");

  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return fail(400, "invalid");
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) return fail(400, "invalid");

  // Honeypot: real visitors never fill the hidden "website" field. Pretend success, forward nothing.
  const honeypot = (body as Record<string, unknown>).website;
  if (typeof honeypot === "string" && honeypot.trim() !== "") {
    return Response.json({ ok: true }, { status: 201, headers: { "Cache-Control": "no-store" } });
  }

  const ip = clientIp(request.headers);
  const limit = rateLimit(ip ?? "unknown");
  if (!limit.allowed) return fail(429, "rate_limited", {}, { "Retry-After": String(limit.retryAfterSeconds) });

  const parsed = parseInquiry(body);
  if (!parsed.ok) return fail(400, "invalid", { fieldErrors: parsed.fieldErrors });

  const config = apiConfig();
  if (!config) {
    console.error("[inquiry] DASHBOARD_API_URL / DASHBOARD_SITE_KEY not set — inquiry not forwarded");
    return fail(503, "unavailable");
  }

  let upstream: Response;
  try {
    upstream = await fetch(`${config.baseUrl}/api/public/v1/inquiries`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.siteKey}`,
        "Content-Type": "application/json",
        Accept: "application/json",
        ...(ip ? { "X-Client-IP": ip } : {}),
      },
      body: JSON.stringify(parsed.data),
      cache: "no-store",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (error) {
    console.error(`[inquiry] forwarding failed: ${error instanceof Error ? error.name : "error"}`);
    return fail(502, "unavailable");
  }

  if (upstream.status === 201 || upstream.status === 200) {
    return Response.json({ ok: true }, { status: 201, headers: { "Cache-Control": "no-store" } });
  }
  if (upstream.status === 400) {
    // Pass through only field errors for fields we know (never raw upstream text).
    const data = (await upstream.json().catch(() => null)) as { fieldErrors?: Record<string, unknown> } | null;
    const fieldErrors: Partial<Record<InquiryField, string>> = {};
    for (const [key, value] of Object.entries(data?.fieldErrors ?? {})) {
      if (!(INQUIRY_FIELDS as string[]).includes(key)) continue;
      const message = Array.isArray(value) ? value[0] : value;
      if (typeof message === "string" && message.length <= 200) fieldErrors[key as InquiryField] = message;
    }
    return fail(400, "invalid", { fieldErrors });
  }
  if (upstream.status === 413) return fail(413, "too_large");
  if (upstream.status === 429) {
    const retryAfter = upstream.headers.get("retry-after");
    return fail(429, "rate_limited", {}, retryAfter && /^\d+$/.test(retryAfter) ? { "Retry-After": retryAfter } : {});
  }
  console.error(`[inquiry] dashboard responded HTTP ${upstream.status}`);
  return fail(502, "unavailable");
}
