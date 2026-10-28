import type { MetadataRoute } from "next";

// Prerendered at build time, so it reads APP_URL directly instead of validating the full server env.
export default function robots(): MetadataRoute.Robots {
  const base = (process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: ["/app/", "/api/", "/print/", "/login", "/forgot-password", "/reset-password"] }],
    sitemap: `${base}/sitemap.xml`,
  };
}
