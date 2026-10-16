import type { MetadataRoute } from "next";
import { getProducts } from "@/lib/api";
import { siteUrl } from "@/lib/env";

export const revalidate = 60;

const PAGES = ["/", "/eyewear", "/services", "/book", "/contact", "/about", "/faq", "/privacy", "/terms"];

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = siteUrl();
  const products = await getProducts();
  return [
    ...PAGES.map((path) => ({ url: `${base}${path === "/" ? "" : path}`, changeFrequency: "weekly" as const, priority: path === "/" ? 1 : 0.7 })),
    ...(products.ok
      ? products.data.map((p) => ({
          url: `${base}/eyewear/${encodeURIComponent(p.slug)}`,
          ...(p.updatedAt && !Number.isNaN(Date.parse(p.updatedAt)) ? { lastModified: p.updatedAt } : {}),
          changeFrequency: "weekly" as const,
          priority: 0.5,
        }))
      : []),
  ];
}
