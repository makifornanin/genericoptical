import "@/styles/oc-base.css";
import "@/styles/app.css";
import type { Metadata, Viewport } from "next";
import { Instrument_Sans, Inter_Tight } from "next/font/google";
import type { ReactNode } from "react";
import { SiteFooter } from "@/components/SiteFooter";
import { SiteHeader, type Banner } from "@/components/SiteHeader";
import { getSite } from "@/lib/api";
import type { SiteData } from "@/lib/api-types";
import { siteUrl } from "@/lib/env";
import { shouldNoindex } from "@/lib/seo";
import { FALLBACK_BRAND, HEADER_CTA, NAV, PROMO, SHOW_DEMO_NOTICE } from "@/lib/site-settings";
import { themeStyle } from "@/lib/theme";

// Self-hosted by next/font at build time (no request to Google from the visitor's browser).
const interTight = Inter_Tight({ subsets: ["latin"], weight: ["400", "500", "600", "700"], variable: "--font-inter-tight", display: "swap" });
const instrumentSans = Instrument_Sans({ subsets: ["latin"], weight: ["500", "600", "700"], variable: "--font-instrument-sans", display: "swap" });

export const revalidate = 60;

export const viewport: Viewport = {
  themeColor: "#f6f6f3",
};

export async function generateMetadata(): Promise<Metadata> {
  const site = await getSite();
  const business = site.ok ? site.data.business : null;
  const name = business?.name ?? FALLBACK_BRAND;
  const tagline = business?.tagline;
  const description = business?.description ?? "Eye examinations, prescription eyewear, sunglasses and contact lenses — book online or visit a branch.";
  const noindex = await shouldNoindex();
  return {
    metadataBase: new URL(siteUrl()),
    title: { default: tagline ? `${name} — ${tagline}` : name, template: `%s · ${name}` },
    description,
    applicationName: name,
    icons: { icon: "/brand/favicon.ico" },
    openGraph: { type: "website", siteName: name, locale: business?.locale.replace("-", "_") },
    formatDetection: { telephone: false },
    ...(noindex ? { robots: { index: false, follow: false } } : {}),
  };
}

function banner(site: SiteData | null): Banner | null {
  if (site?.business.isDemo && SHOW_DEMO_NOTICE) {
    return { strong: "Demo website.", text: `${site.business.name} is a fictional business — names, prices and branches are sample data.` };
  }
  if (PROMO.enabled && (PROMO.strong || PROMO.text)) return PROMO;
  return null;
}

export default async function RootLayout({ children }: { children: ReactNode }) {
  const result = await getSite();
  const site = result.ok ? result.data : null;
  const b = site?.business;
  return (
    <html lang={b?.locale ?? "en"} className={`${interTight.variable} ${instrumentSans.variable}`}>
      <body>
        <div className="oc oc-root" style={themeStyle(b?.brandColor, b?.accentColor)}>
          <SiteHeader name={b?.name ?? FALLBACK_BRAND} tagline={b?.tagline ?? null} logoUrl={b?.logoUrl ?? null} nav={NAV} cta={HEADER_CTA} banner={banner(site)} />
          <main id="oc-main" tabIndex={-1}>
            {children}
          </main>
          <SiteFooter site={site} />
        </div>
      </body>
    </html>
  );
}
