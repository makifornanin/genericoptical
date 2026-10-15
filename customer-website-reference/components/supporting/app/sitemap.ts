import type { MetadataRoute } from "next";
import { connection } from "next/server";
import { env } from "@/server/env";
import { getShowcase, getSite } from "./(site)/site-data";

// Built per request: product listings and the site's business come from the database.
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  await connection();
  const base = env().APP_URL.replace(/\/$/, "");
  const site = await getSite();
  if (!site || site.biz.isDemo) return [];
  const pages = ["", "/eyewear", "/services", "/book", "/about", "/faq", "/contact", "/privacy", "/terms"].map((p) => ({ url: `${base}${p}`, changeFrequency: "weekly" as const }));
  const products = (await getShowcase(site.biz.id)).map((p) => ({ url: `${base}/eyewear/${p.id}`, changeFrequency: "weekly" as const }));
  return [...pages, ...products];
}
