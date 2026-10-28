import { after } from "next/server";
import { errorFields, log } from "@/server/log";

/**
 * Tells the separately deployed customer website to refresh its cached data now, instead of within
 * its 60-second revalidation window. Optional: configure WEBSITE_REVALIDATE_URL
 * (https://<website>/api/revalidate) and WEBSITE_REVALIDATE_SECRET (the website's REVALIDATE_SECRET).
 * Failures are logged and never affect the change that triggered them.
 */
export type WebsiteTag = "site" | "catalog";

export async function revalidateWebsite(tags: WebsiteTag[]) {
  const url = process.env.WEBSITE_REVALIDATE_URL;
  const secret = process.env.WEBSITE_REVALIDATE_SECRET;
  if (!url || !secret) return { skipped: true as const };
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { authorization: `Bearer ${secret}`, "content-type": "application/json" },
      body: JSON.stringify({ tags }),
      cache: "no-store",
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) log.warn("website.revalidate_failed", { status: res.status, tags });
    return { ok: res.ok, status: res.status };
  } catch (error) {
    log.warn("website.revalidate_failed", { ...errorFields(error), tags });
    return { ok: false as const };
  }
}

/** Schedules the refresh after the response is sent (Server Actions and route handlers). */
export function revalidateWebsiteAfter(...tags: WebsiteTag[]) {
  if (!process.env.WEBSITE_REVALIDATE_URL || !process.env.WEBSITE_REVALIDATE_SECRET) return;
  after(() => revalidateWebsite(tags));
}
