import "@/styles/tokens.css";
import "@/styles/base.css";
import "@/styles/components.css";
import "@/styles/pages.css";
import type { Metadata, Viewport } from "next";
import { Host_Grotesk } from "next/font/google";
import type { ReactNode } from "react";
import { AddedToBag } from "@/components/AddedToBag";
import { BagProvider } from "@/components/BagProvider";
import { GhlChat } from "@/components/GhlEmbeds";
import { Footer } from "@/components/Footer";
import { Header } from "@/components/Header";
import { getSite } from "@/lib/api";
import { DEMO_NOTICE } from "@/lib/content";
import { siteUrl } from "@/lib/env";
import { shouldNoindex } from "@/lib/seo";
import { themeStyle } from "@/lib/theme";

// Self-hosted by next/font at build time: visitors' browsers never contact Google.
const host = Host_Grotesk({ subsets: ["latin"], weight: ["400", "500", "600"], variable: "--font-host", display: "swap" });

export const revalidate = 60;
const FALLBACK_NAME = "Optical store";

export const viewport: Viewport = { themeColor: "#ffffff" };

export async function generateMetadata(): Promise<Metadata> {
  const site = await getSite();
  const b = site.ok ? site.data.business : null;
  const name = b?.name ?? FALLBACK_NAME;
  const noindex = await shouldNoindex();
  return {
    metadataBase: new URL(siteUrl()),
    title: { default: b?.tagline ? `${name} — ${b.tagline}` : name, template: `%s · ${name}` },
    description: "Prescription glasses, sunglasses and contact lenses. Order online and collect in branch, or book an eye exam.",
    applicationName: name,
    icons: { icon: "/brand/favicon.ico" },
    openGraph: { type: "website", siteName: name, locale: b?.locale.replace("-", "_") },
    formatDetection: { telephone: false },
    ...(noindex ? { robots: { index: false, follow: false } } : {}),
  };
}

/** "Lensmere Optical" → "Lensmere": the short wordmark for the header. */
function wordmarkOf(name: string) {
  const short = name.replace(/\s+(optical|opticians?|eyewear|eye care|vision)( co\.?| inc\.?)?$/i, "").trim();
  return short || name;
}

export default async function RootLayout({ children }: { children: ReactNode }) {
  const result = await getSite();
  const site = result.ok ? result.data : null;
  const b = site?.business;
  const name = b?.name ?? FALLBACK_NAME;
  const notice = b?.isDemo ? { text: DEMO_NOTICE.short, href: "/help#demo", link: "How it works" } : null;
  return (
    <html lang={b?.locale ?? "en"} className={host.variable}>
      <body style={themeStyle(b?.brandColor, b?.accentColor)}>
        <a href="#main" className="skip-link">
          Skip to content
        </a>
        <BagProvider>
          <Header wordmark={wordmarkOf(name)} notice={notice} />
          <main id="main">{children}</main>
          <Footer site={site} name={name} />
          <AddedToBag currency={b?.currency ?? "PHP"} locale={b?.locale ?? "en-PH"} />
        </BagProvider>
        <GhlChat />
      </body>
    </html>
  );
}
