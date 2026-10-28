import { log } from "@/server/log";
import { GhlAuthError, GhlNetworkError, GhlNotFoundError, GhlPermissionError, GhlRateLimitError, GhlRequestError, GhlServerError } from "./errors";

export const GHL_BASE_URL = "https://services.leadconnectorhq.com";
/** Default API version header for LeadConnector v2 endpoints. Some endpoint groups document a different value. */
export const GHL_API_VERSION = "2021-07-28";

export type Fetch = typeof fetch;

export type TokenSource = {
  /** Returns a valid access token, refreshing first if it is about to expire. */
  get: () => Promise<string>;
  /** Called once after a 401: force a refresh and return the new token, or throw if re-auth is needed. */
  refresh: () => Promise<string>;
};

export type RequestOptions = {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  query?: Record<string, string | number | boolean | undefined | null>;
  body?: unknown;
  /** Overrides the Version header for endpoint groups that document another version. */
  version?: string;
  /** Human label for error messages, e.g. "Contact". */
  what?: string;
  timeoutMs?: number;
};

/**
 * Minimal LeadConnector v2 client. Every call carries the bearer token and Version header, times out
 * after 15s, retries exactly once after a 401 (token refresh), and turns failures into typed errors.
 * It never logs tokens or bodies — only method, path, status and duration.
 */
export class GhlClient {
  constructor(
    private readonly tokens: TokenSource,
    private readonly fetchImpl: Fetch = fetch,
    private readonly context: Record<string, unknown> = {},
  ) {}

  async request<T>(path: string, opts: RequestOptions = {}): Promise<T> {
    let token = await this.tokens.get();
    for (let attempt = 0; attempt < 2; attempt++) {
      const res = await this.send(path, opts, token);
      if (res.status === 401 && attempt === 0) {
        token = await this.tokens.refresh();
        continue;
      }
      return this.parse<T>(res, opts);
    }
    throw new GhlAuthError();
  }

  private async send(path: string, opts: RequestOptions, token: string): Promise<Response> {
    const url = new URL(path, GHL_BASE_URL);
    for (const [k, v] of Object.entries(opts.query ?? {})) if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
    const started = Date.now();
    try {
      const res = await this.fetchImpl(url, {
        method: opts.method ?? "GET",
        headers: {
          Authorization: `Bearer ${token}`,
          Version: opts.version ?? GHL_API_VERSION,
          Accept: "application/json",
          ...(opts.body !== undefined ? { "Content-Type": "application/json" } : {}),
        },
        body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
        cache: "no-store",
        signal: AbortSignal.timeout(opts.timeoutMs ?? 15_000),
      });
      log.debug("ghl.request", { ...this.context, method: opts.method ?? "GET", path: url.pathname, status: res.status, ms: Date.now() - started });
      return res;
    } catch (error) {
      const timeout = error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError");
      log.warn("ghl.request_failed", { ...this.context, method: opts.method ?? "GET", path: url.pathname, ms: Date.now() - started, timeout });
      throw new GhlNetworkError(timeout ? "GoHighLevel did not respond in time." : "Couldn't reach GoHighLevel.");
    }
  }

  private async parse<T>(res: Response, opts: RequestOptions): Promise<T> {
    const text = await res.text().catch(() => "");
    let payload: unknown = null;
    try {
      payload = text ? JSON.parse(text) : null;
    } catch {
      payload = null;
    }
    if (res.ok) return payload as T;
    const detail = messageOf(payload) ?? `HTTP ${res.status}`;
    if (res.status === 401) throw new GhlAuthError(`GoHighLevel rejected the access token (${detail}).`);
    if (res.status === 403) throw new GhlPermissionError(detail);
    if (res.status === 404) throw new GhlNotFoundError(opts.what ?? "The record");
    if (res.status === 429) throw new GhlRateLimitError(retryAfterMs(res));
    if (res.status >= 500) throw new GhlServerError(res.status, detail);
    throw new GhlRequestError(res.status, detail);
  }
}

function messageOf(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;
  const m = (payload as { message?: unknown; error?: unknown }).message ?? (payload as { error?: unknown }).error;
  if (Array.isArray(m)) return m.map(String).join("; ").slice(0, 300);
  if (typeof m === "string") return m.slice(0, 300);
  return null;
}

/** Honours Retry-After (seconds or HTTP date); otherwise waits for the rate-limit window to roll over. */
export function retryAfterMs(res: Response): number {
  const ra = res.headers.get("retry-after");
  if (ra) {
    const secs = Number(ra);
    if (Number.isFinite(secs)) return Math.max(1000, secs * 1000);
    const at = Date.parse(ra);
    if (Number.isFinite(at)) return Math.max(1000, at - Date.now());
  }
  const interval = Number(res.headers.get("x-ratelimit-interval-milliseconds"));
  return Number.isFinite(interval) && interval > 0 ? interval : 10_000;
}
