import "@/styles/pages/product-detail.css";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ApiState } from "@/components/ApiState";
import { Icon } from "@/components/Icon";
import { ProductCard } from "@/components/ProductCard";
import { ProductDetailView } from "@/components/ProductDetailView";
import { getProduct, getSite } from "@/lib/api";
import { bookingServiceFor, interestForCategory } from "@/lib/catalog";

// Product pages are generated on first visit and then cached (ISR, 60 s) — no build-time list.
export const revalidate = 60;
export const dynamicParams = true;
export async function generateStaticParams() {
  return [];
}

type Params = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug } = await params;
  const result = await getProduct(slug);
  if (!result.ok) return { title: result.reason === "not_found" ? "Product not found" : "Eyewear" };
  const p = result.data;
  const description = (p.description ?? `${p.name}${p.brand ? ` by ${p.brand}` : ""} — ${p.category.name.toLowerCase()}. Try it on in branch or ask us about it.`).slice(0, 200);
  return {
    title: p.name,
    description,
    alternates: { canonical: `/eyewear/${p.slug}` },
    openGraph: { title: p.name, description, url: `/eyewear/${p.slug}`, ...(p.imageUrl ? { images: [{ url: p.imageUrl }] } : {}) },
  };
}

function BackLink() {
  return (
    <Link className="oc-back" href="/eyewear">
      <Icon name="back" />
      All eyewear
    </Link>
  );
}

export default async function ProductPage({ params }: Params) {
  const { slug } = await params;
  const [productResult, siteResult] = await Promise.all([getProduct(slug), getSite()]);
  if (!productResult.ok && productResult.reason === "not_found") notFound();
  const site = siteResult.ok ? siteResult.data : null;
  const b = site?.business;
  const fmt = { currency: b?.currency ?? "USD", locale: b?.locale ?? "en" };

  if (!productResult.ok) {
    return (
      <section>
        <div className="oc-container oc-product">
          <BackLink />
          <h1 className="oc-sr-only">Eyewear</h1>
          <ApiState reason={productResult.reason} what="This product" phone={b?.phone} className="oc-state" />
        </div>
      </section>
    );
  }

  const p = productResult.data;
  const booking = bookingServiceFor(p.category, site?.services ?? []);
  return (
    <section>
      <div className="oc-container oc-product">
        <BackLink />
        <ProductDetailView
          product={p}
          fmt={fmt}
          booking={booking ? { href: `/book?service=${encodeURIComponent(booking.service.code)}`, label: booking.label } : null}
          branches={(site?.branches ?? []).map((br) => ({ id: br.id, name: br.name }))}
          phone={b?.phone ?? null}
          defaultInterest={interestForCategory(p.category)}
        />
        {p.related.length ? (
          <section className="oc-related" aria-labelledby="oc-related-title">
            <h2 className="oc-related__title" id="oc-related-title">
              More {p.category.name.toLowerCase()}
            </h2>
            <ul className="oc-product-grid oc-product-grid--4">
              {p.related.slice(0, 4).map((r) => (
                <li key={r.id}>
                  <ProductCard product={r} fmt={fmt} compact />
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </div>
    </section>
  );
}
