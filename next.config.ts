import type { NextConfig } from "next";

/*
 * Security headers. Custom headers are compiled into the build, so the Content-Security-Policy is
 * computed when `next build` runs (DASHBOARD_API_URL must be set at build time, as it is on Vercel).
 *
 * - Scripts: Next.js App Router streams its payload in inline <script> tags, and this site is
 *   statically generated (ISR), so per-request nonces are not possible: 'unsafe-inline' is needed.
 *   The only third-party script is GoHighLevel's official embed helper (link.msgsndr.com).
 * - Frames: only GoHighLevel's booking widgets. A white-label (custom-domain) widget base can be
 *   allowed with CSP_EXTRA_FRAME_SRC (space-separated origins).
 * - Images: product, logo and branch images are absolute URLs from the dashboard (or its storage),
 *   so https: is allowed, plus the dashboard origin itself when it is plain http (local development).
 * - Fonts are self-hosted by next/font.
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
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""} https://link.msgsndr.com`,
  "style-src 'self' 'unsafe-inline'",
  `img-src 'self' data: blob: https:${httpImageOrigin}`,
  "font-src 'self'",
  `connect-src 'self' ${ghlOrigins.join(" ")}`,
  `frame-src ${[...ghlOrigins, ...extraFrames].join(" ")}`,
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
