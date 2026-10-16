import type { MetadataRoute } from "next";
import { siteUrl } from "@/lib/env";
import { shouldNoindex } from "@/lib/seo";

export const revalidate = 60;

/* Disallow everything for a demo business (business.isDemo) or when SITE_NOINDEX=1. */
export default async function robots(): Promise<MetadataRoute.Robots> {
  if (await shouldNoindex()) return { rules: [{ userAgent: "*", disallow: "/" }] };
  const base = siteUrl();
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: ["/api/", "/booking-confirmed", "/thank-you"] }],
    sitemap: `${base}/sitemap.xml`,
    host: base,
  };
}
