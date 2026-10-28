import type { NextConfig } from "next";
import { CSP_FONT_ORIGINS, CSP_FRAME_ORIGINS, CSP_SCRIPT_ORIGINS, CSP_STYLE_ORIGINS } from "./src/lib/ghl";

/*
 * Security headers. Custom headers are compiled into the build, so the Content-Security-Policy is
 * computed when `next build` runs (DASHBOARD_API_URL must be set at build time, as it is on Vercel).
 *
 * - Scripts: Next.js App Router streams its payload in inline <script> tags, and this site is
 *   statically generated (ISR), so per-request nonces are not possible: 'unsafe-inline' is needed.
 *   Third-party scripts: GoHighLevel's embed helper (link.msgsndr.com and the account's white-label
 *   domain) and its Conversation AI chat loader (widgets.leadconnectorhq.com). See src/lib/ghl.ts.
 * - Frames: GoHighLevel's forms and booking widgets, on its own domains and the account's white-label
 *   domain. Another white-label domain can be allowed with CSP_EXTRA_FRAME_SRC (space-separated).
 * - Images: product, logo and branch images are absolute URLs from the dashboard (or its storage),
 *   so https: is allowed, plus the dashboard origin itself when it is plain http (local development).
 * - Fonts: the site's own are self-hosted by next/font; the GHL chat widget brings its own.
 */
function originOf(url: string | undefined): string | null {
  if (!url) return null;
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}

const isDev = process.env.NODE_ENV === "development";
const dashboardOrigin = originOf(process.env.DASHBOARD_API_URL);
const ghlOrigins = ["https://*.leadconnectorhq.com", "https://*.msgsndr.com"];
const extraFrames = (process.env.CSP_EXTRA_FRAME_SRC ?? "")
  .split(/\s+/)
  .map((s) => originOf(s))
  .filter((s): s is string => Boolean(s));
const httpImageOrigin = dashboardOrigin && dashboardOrigin.startsWith("http:") ? ` ${dashboardOrigin}` : "";
const upgradeInsecure = !isDev && Boolean(dashboardOrigin?.startsWith("https:"));

const contentSecurityPolicy = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""} https://link.msgsndr.com ${CSP_SCRIPT_ORIGINS.join(" ")}`,
  `style-src 'self' 'unsafe-inline' ${CSP_STYLE_ORIGINS.join(" ")}`,
  `img-src 'self' data: blob: https:${httpImageOrigin}`,
  `font-src 'self' ${CSP_FONT_ORIGINS.join(" ")}`,
  `connect-src 'self' ${ghlOrigins.join(" ")}`,
  `frame-src ${[...ghlOrigins, ...CSP_FRAME_ORIGINS, ...extraFrames].join(" ")}`,
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  ...(upgradeInsecure ? ["upgrade-insecure-requests"] : []),
].join("; ");

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // This folder is the app root (a stray lockfile higher up must not change the workspace root).
  turbopack: { root: process.cwd() },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Content-Security-Policy", value: contentSecurityPolicy },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), usb=(), browsing-topics=()" },
          { key: "Strict-Transport-Security", value: "max-age=31536000" },
        ],
      },
    ];
  },
};

export default nextConfig;
