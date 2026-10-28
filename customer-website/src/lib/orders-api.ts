import "server-only";
import { apiConfig } from "./env";
import type { OrderView, Quote } from "./api-types";

/*
 * Server-only client for the dashboard's order endpoints (docs/PUBLIC_API.md → Website orders).
 * Nothing here is cached: quotes, orders and order status are always read live. The site key and
 * the visitor's order token travel server-to-server only.
 */

const TIMEOUT_MS = 10_000;

export type UpstreamResult<T> = { ok: true; data: T } | { ok: false; status: number; error: string; fieldErrors?: Record<string, string[]> };

async function call<T>(method: "GET" | "POST", path: string, opts: { body?: unknown; ip?: string | null; orderToken?: string | null } = {}): Promise<UpstreamResult<T>> {
  const config = apiConfig();
  if (!config) return { ok: false, status: 503, error: "Online ordering isn't set up on this site yet." };
  const headers: Record<string, string> = { Authorization: `Bearer ${config.siteKey}`, Accept: "application/json" };
  if (opts.body !== undefined) headers["Content-Type"] = "application/json";
  if (opts.ip) headers["X-Client-IP"] = opts.ip;
  if (opts.orderToken) headers["X-Order-Token"] = opts.orderToken;
  let res: Response;
  try {
    res = await fetch(`${config.baseUrl}/api/public/v1${path}`, {
      method,
      headers,
      body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
      cache: "no-store",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (error) {
    console.error(`[orders-api] ${method} ${path}: ${error instanceof Error ? error.name : "network error"}`);
    return { ok: false, status: 503, error: "We couldn't reach the shop's system. Please try again in a moment." };
  }
  let body: Record<string, unknown> = {};
  try {
    body = (await res.json()) as Record<string, unknown>;
  } catch {
    /* empty or non-JSON body */
  }
  if (res.ok) return { ok: true, data: body as T };
  if (res.status === 401 || res.status === 403) {
    if (res.status === 403 && typeof body.error === "string" && /switched off/i.test(body.error)) return { ok: false, status: 403, error: body.error };
    console.error(`[orders-api] ${method} ${path}: HTTP ${res.status} (site key rejected or missing scope)`);
    return { ok: false, status: 503, error: "Online ordering isn't available right now. Please contact a branch." };
  }
  if (res.status >= 500) {
    console.error(`[orders-api] ${method} ${path}: HTTP ${res.status}`);
    return { ok: false, status: 503, error: "Something went wrong on our side. Please try again in a moment." };
  }
  return {
    ok: false,
    status: res.status,
    error: typeof body.error === "string" ? body.error : "Please check your details and try again.",
    fieldErrors: body.fieldErrors && typeof body.fieldErrors === "object" ? (body.fieldErrors as Record<string, string[]>) : undefined,
  };
}

export type CartLineInput = { variantId: string; quantity: number; lensVariantId?: string | null };

export const quoteCart = (items: CartLineInput[]) => call<Quote & { generatedAt: string }>("POST", "/cart/quote", { body: { items } });

export const placeOrder = (body: unknown, ip: string | null) => call<{ order: OrderView; token: string; replayed: boolean }>("POST", "/orders", { body, ip });

const safeNumber = (n: string) => (/^ORD-\d{1,12}$/i.test(n) ? n.toUpperCase() : null);

export function getOrder(number: string, token: string) {
  const n = safeNumber(number);
  if (!n || !token) return Promise.resolve<UpstreamResult<{ order: OrderView }>>({ ok: false, status: 404, error: "We couldn't find that order." });
  return call<{ order: OrderView }>("GET", `/orders/${n}`, { orderToken: token });
}

export function cancelOrder(number: string, token: string, ip: string | null) {
  const n = safeNumber(number);
  if (!n || !token) return Promise.resolve<UpstreamResult<{ order: OrderView }>>({ ok: false, status: 404, error: "We couldn't find that order." });
  return call<{ order: OrderView }>("POST", `/orders/${n}/cancel`, { body: {}, ip, orderToken: token });
}

export const lookupOrder = (number: string, email: string, ip: string | null) => call<{ number: string; token: string }>("POST", "/orders/lookup", { body: { number, email }, ip });
