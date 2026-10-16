/*
 * Normalises DASHBOARD_API_URL to the dashboard's base URL (origin + optional path prefix, no
 * trailing slash). The dashboard's Settings card shows the plain origin, but staff may paste the
 * full API path, so a trailing "/api/public/v1" (with or without a slash) is removed:
 *   "https://dash.example"                    → "https://dash.example"
 *   "https://dash.example/api/public/v1/"     → "https://dash.example"
 * Returns null for anything that isn't an http(s) URL. Pure function (unit-tested in tests/unit).
 */
export function normalizeDashboardUrl(raw: string | undefined | null): string | null {
  const value = (raw ?? "").trim();
  if (!value) return null;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  const path = url.pathname
    .replace(/\/+$/, "")
    .replace(/\/api\/public\/v1$/i, "")
    .replace(/\/+$/, "");
  return url.origin + path;
}
