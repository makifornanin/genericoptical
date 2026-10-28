import "server-only";
import { normalizeDashboardUrl } from "./dashboard-url";

/*
 * Server-only environment. None of these values may reach the browser: there are no NEXT_PUBLIC_
 * variables in this project, and this module refuses to be imported by a Client Component.
 */

export interface ApiConfig {
  baseUrl: string;
  siteKey: string;
}

/**
 * The dashboard API settings, or null when the site isn't configured yet. DASHBOARD_API_URL may be
 * the dashboard origin or the full ".../api/public/v1" path (see normalizeDashboardUrl).
 */
export function apiConfig(): ApiConfig | null {
  const baseUrl = normalizeDashboardUrl(process.env.DASHBOARD_API_URL);
  const siteKey = (process.env.DASHBOARD_SITE_KEY ?? "").trim();
  if (!baseUrl || !siteKey) return null;
  return { baseUrl, siteKey };
}

export function revalidateSecret(): string | null {
  const s = (process.env.REVALIDATE_SECRET ?? "").trim();
  return s.length > 0 ? s : null;
}

/** Public URL of this website, for metadata, sitemap.xml and robots.txt. */
export function siteUrl(): string {
  const candidates = [process.env.SITE_URL, process.env.VERCEL_PROJECT_PRODUCTION_URL && `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`];
  for (const c of candidates) {
    if (!c) continue;
    try {
      const u = new URL(c);
      return u.origin;
    } catch {
      /* ignore invalid values */
    }
  }
  return "http://localhost:3200";
}

export function noindexForced(): boolean {
  const v = (process.env.SITE_NOINDEX ?? "").trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}
