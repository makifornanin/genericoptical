import { apiConfig } from "@/lib/env";

/*
 * GET /api/health — liveness for monitoring. Checks the dashboard API quickly (uncached) and
 * reports only a coarse status: { status: "ok", api: "ok" | "unconfigured" | "unreachable" }.
 */

export const dynamic = "force-dynamic";

export async function GET() {
  const config = apiConfig();
  let api: "ok" | "unconfigured" | "unreachable" = "unconfigured";
  if (config) {
    try {
      const res = await fetch(`${config.baseUrl}/api/public/v1/site`, {
        headers: { Authorization: `Bearer ${config.siteKey}`, Accept: "application/json" },
        cache: "no-store",
        signal: AbortSignal.timeout(3000),
      });
      api = res.ok ? "ok" : res.status === 401 || res.status === 403 ? "unconfigured" : "unreachable";
    } catch {
      api = "unreachable";
    }
  }
  return Response.json({ status: "ok", api }, { headers: { "Cache-Control": "no-store" } });
}
