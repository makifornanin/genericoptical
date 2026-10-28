import { fileURLToPath } from "node:url";
import type { NextConfig } from "next";

const securityHeaders = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
];

// Old public-website paths. When PUBLIC_WEBSITE_URL (the GoHighLevel site) is set at build time they
// redirect there so existing links and bookmarks keep working; otherwise they return 404.
const LEGACY_SITE_PATHS = ["/eyewear", "/eyewear/:path*", "/services", "/book", "/about", "/faq", "/contact", "/privacy", "/terms", "/sitemap.xml"];
const publicSite = process.env.PUBLIC_WEBSITE_URL?.replace(/\/$/, "");

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  poweredByHeader: false,
  serverExternalPackages: ["embedded-postgres"],
  experimental: {
    // Expense receipts can be up to 5 MB (src/server/storage.ts) plus multipart overhead.
    serverActions: { bodySizeLimit: "6mb" },
  },
  turbopack: {
    root: fileURLToPath(new URL(".", import.meta.url)),
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
  async redirects() {
    if (!publicSite) return [];
    return LEGACY_SITE_PATHS.map((source) => ({ source, destination: `${publicSite}${source === "/sitemap.xml" ? "/" : source.replace("/:path*", "")}`, permanent: false }));
  },
};

export default nextConfig;
