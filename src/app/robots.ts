import type { MetadataRoute } from "next";
import { siteUrl } from "@/lib/env";
import { shouldNoindex } from "@/lib/seo";

export default async function robots(): Promise<MetadataRoute.Robots> {
  if (await shouldNoindex()) return { rules: [{ userAgent: "*", disallow: "/" }] };
  return { rules: [{ userAgent: "*", allow: "/", disallow: ["/api/", "/bag", "/checkout", "/order"] }], sitemap: `${siteUrl()}/sitemap.xml` };
}
