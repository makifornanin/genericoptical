import { ArrowUpRight } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense, type CSSProperties } from "react";
import { brandVars } from "@/lib/color";
import { SiteHeader } from "./site-header";
import { getSite } from "./site-data";
import { Container, Eyebrow, groupedHours, SITE_NAV } from "./site-ui";

export async function generateMetadata(): Promise<Metadata> {
  const site = await getSite();
  if (!site) return { title: "Website" };
  const { biz } = site;
  return {
    title: { default: `${biz.name} — ${biz.tagline ?? "Eye care & eyewear"}`, template: `%s · ${biz.name}` },
    description: biz.websiteContent.heroBody ?? biz.description ?? undefined,
    openGraph: { siteName: biz.name, type: "website" },
    // Demo businesses are fictional; keep them out of search engines.
    robots: biz.isDemo ? { index: false, follow: false } : undefined,
  };
}

async function SiteFrame({ children }: { children: React.ReactNode }) {
  await connection();
  const site = await getSite();
  if (!site) {
    return (
      <main className="flex min-h-screen items-center justify-center px-6">
        <div className="max-w-[420px] text-center">
          <h1 className="font-display text-[28px] font-semibold">This website isn&apos;t set up yet</h1>
          <p className="mt-3 text-[15px] text-text-2">Create a business and sign in to configure the public site from Settings → Website.</p>
          <Link href="/login" className="mt-6 inline-block text-[14px] font-medium underline underline-offset-4">
            Staff sign in
          </Link>
        </div>
      </main>
    );
  }
  const { biz, branches } = site;
  const address = [biz.addressLine1, biz.city].filter(Boolean).join(", ");

  return (
    <div style={brandVars(biz.brandColor, biz.accentColor) as CSSProperties} className="flex min-h-screen flex-col">
      {biz.isDemo ? (
        <div className="bg-ink px-4 py-2 text-center text-[12.5px] text-white/85">
          <span className="font-semibold text-white">Demo website.</span> {biz.name} is a fictional business — names, prices and branches are sample data.{" "}
          <Link href="/login" className="underline decoration-white/40 underline-offset-2 hover:decoration-white">
            Open the staff demo
          </Link>
        </div>
      ) : null}
      <SiteHeader name={biz.name} logoUrl={biz.logoUrl} tagline={biz.tagline} />
      <main id="main" className="flex-1">
        {children}
      </main>

      <footer className="mt-24 bg-brand text-brand-ink">
        <Container className="py-14">
          <div className="grid gap-12 lg:grid-cols-[1.1fr_2fr]">
            <div>
              <p className="font-display text-[26px] font-semibold leading-tight">{biz.name}</p>
              {biz.tagline ? <p className="mt-2 text-[14px] opacity-70">{biz.tagline}</p> : null}
              <div className="mt-6 space-y-1.5 text-[14px] opacity-85">
                {biz.phone ? (
                  <p>
                    <a href={`tel:${biz.phone.replace(/\s/g, "")}`} className="hover:underline">
                      {biz.phone}
                    </a>
                  </p>
                ) : null}
                {biz.email ? (
                  <p>
                    <a href={`mailto:${biz.email}`} className="hover:underline">
                      {biz.email}
                    </a>
                  </p>
                ) : null}
                {address ? <p>{address}</p> : null}
              </div>
              <Link href="/book" className="mt-7 inline-flex h-11 items-center gap-2 rounded-full bg-accent px-5 text-[14px] font-medium text-accent-ink hover:brightness-95">
                Book an eye exam <ArrowUpRight className="size-4" />
              </Link>
            </div>

            <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-3">
              {branches.slice(0, 3).map((br) => (
                <div key={br.id}>
                  <Eyebrow className="text-current opacity-60">{br.name}</Eyebrow>
                  <p className="mt-3 text-[14px] leading-relaxed opacity-90">
                    {br.addressLine1}
                    {br.city ? (
                      <>
                        <br />
                        {br.city}
                      </>
                    ) : null}
                  </p>
                  <ul className="mt-3 space-y-0.5 text-[13px] opacity-75">
                    {groupedHours(br.businessHours ?? biz.businessHours).map((g) => (
                      <li key={g.days} className="flex justify-between gap-4">
                        <span>{g.days}</span>
                        <span className="tabular">{g.text}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-14 flex flex-col gap-4 border-t border-current/15 pt-6 text-[13px] sm:flex-row sm:items-center sm:justify-between">
            <nav aria-label="Footer" className="flex flex-wrap gap-x-5 gap-y-2 opacity-80">
              {SITE_NAV.map((n) => (
                <Link key={n.href} href={n.href} className="hover:underline">
                  {n.label}
                </Link>
              ))}
              <Link href="/privacy" className="hover:underline">
                Privacy
              </Link>
              <Link href="/terms" className="hover:underline">
                Terms
              </Link>
            </nav>
            <p className="opacity-60">
              © {new Date().getFullYear()} {biz.legalName ?? biz.name}.{" "}
              <Link href="/login" className="hover:underline">
                Staff sign in
              </Link>
            </p>
          </div>
        </Container>
      </footer>
    </div>
  );
}

function SiteSkeleton() {
  return (
    <div className="min-h-screen">
      <div className="h-16 border-b border-line" />
      <div className="mx-auto max-w-[1200px] px-8 py-20">
        <div className="h-4 w-32 animate-pulse rounded bg-muted-soft" />
        <div className="mt-6 h-14 w-3/4 animate-pulse rounded bg-muted-soft" />
        <div className="mt-4 h-14 w-1/2 animate-pulse rounded bg-muted-soft" />
      </div>
    </div>
  );
}

export default function SiteLayout({ children }: LayoutProps<"/">) {
  return (
    <Suspense fallback={<SiteSkeleton />}>
      <SiteFrame>{children}</SiteFrame>
    </Suspense>
  );
}
