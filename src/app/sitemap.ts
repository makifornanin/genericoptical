import type { MetadataRoute } from "next";
import { getProducts } from "@/lib/api";
import { siteUrl } from "@/lib/env";

export const revalidate = 3600;

const PAGES = ["", "/glasses", "/sunglasses", "/contact-lenses", "/accessories", "/eye-exam", "/stores", "/about", "/help", "/contact", "/privacy", "/terms"];

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = siteUrl();
  const products = await getProducts();
  return [
    ...PAGES.map((p) => ({ url: `${base}${p}`, changeFrequency: "weekly" as const })),
    ...(products.ok ? products.data.map((p) => ({ url: `${base}/products/${p.slug}`, lastModified: p.updatedAt ?? undefined, changeFrequency: "weekly" as const })) : []),
  ];
}
