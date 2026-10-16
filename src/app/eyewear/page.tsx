import "@/styles/pages/eyewear.css";
import type { Metadata } from "next";
import { ApiState } from "@/components/ApiState";
import { Catalogue } from "@/components/Catalogue";
import { PageIntro } from "@/components/SectionHead";
import { getProducts, getSite } from "@/lib/api";
import { pageMetadata } from "@/lib/seo";
import { PRICE_NOTE } from "@/lib/site-settings";

// Rendered per request so ?category= and ?q= links arrive pre-filtered (works without JavaScript);
// the API data itself is cached for 60 s (src/lib/api.ts).
export const metadata: Metadata = pageMetadata({
  title: "Eyewear",
  description: "Prescription frames, sunglasses, contact lenses and eye-care accessories. Try anything on in branch.",
  path: "/eyewear",
});

function first(v: string | string[] | undefined): string {
  return (Array.isArray(v) ? v[0] : v) ?? "";
}

export default async function EyewearPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const [siteResult, productsResult] = await Promise.all([getSite(), getProducts()]);
  const site = siteResult.ok ? siteResult.data : null;
  const b = site?.business;
  const tax = b?.taxName ? (b.pricesIncludeTax ? `Prices include ${b.taxName} where applicable.` : `Prices exclude ${b.taxName}.`) : "";

  return (
    <>
      <PageIntro eyebrow="Eyewear" title="Frames, sunglasses and lenses.">
        Browse what we carry, then try it on in branch. Every pair is fitted and adjusted by our opticians.
      </PageIntro>
      <section>
        {productsResult.ok ? (
          <Catalogue
            products={productsResult.data}
            categories={site?.categories ?? []}
            initialCategory={first(params.category).slice(0, 80) || null}
            initialQuery={first(params.q).slice(0, 100)}
            fmt={{ currency: b?.currency ?? "USD", locale: b?.locale ?? "en" }}
            priceNote={[tax, PRICE_NOTE].filter(Boolean).join(" ")}
          />
        ) : (
          <ApiState reason={productsResult.reason === "not_found" ? "unavailable" : productsResult.reason} what="Our eyewear catalogue" phone={b?.phone} />
        )}
      </section>
    </>
  );
}
