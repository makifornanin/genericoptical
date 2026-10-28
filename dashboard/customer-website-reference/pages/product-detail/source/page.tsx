import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { formatter } from "@/lib/format";
import { InquiryForm } from "../../inquiry-form";
import { getShowcase, getSite } from "../../site-data";
import { Container, Eyebrow, ProductArt } from "../../site-ui";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function findProduct(id: string) {
  if (!UUID.test(id)) return null;
  const site = await getSite();
  if (!site) return null;
  const items = await getShowcase(site.biz.id);
  const product = items.find((p) => p.id === id);
  return product ? { site, product, related: items.filter((p) => p.category === product.category && p.id !== id).slice(0, 4) } : null;
}

export async function generateMetadata(props: PageProps<"/eyewear/[id]">): Promise<Metadata> {
  const { id } = await props.params;
  const found = await findProduct(id);
  if (!found) return { title: "Not found" };
  return { title: found.product.name, description: found.product.description ?? `${found.product.name} — ${found.product.category}` };
}

async function Product({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const found = await findProduct(id);
  if (!found) notFound();
  const { site, product: p, related } = found;
  const f = formatter(site.biz);
  const interest = p.categoryKind === "contact_lenses" ? "contact_lenses" : p.categoryKind === "sunglasses" ? "sunglasses" : p.categoryKind === "frames" ? "frames" : "other";

  return (
    <Container className="py-10">
      <Link href="/eyewear" className="inline-flex items-center gap-1.5 text-[13.5px] text-text-2 hover:text-text">
        <ArrowLeft className="size-4" /> All eyewear
      </Link>
      <div className="mt-6 grid gap-10 lg:grid-cols-[1.2fr_1fr] lg:gap-14">
        <ProductArt src={p.imageUrl} alt={p.name} className="rounded-[28px]" />
        <div>
          <Eyebrow>{[p.brand, p.category].filter(Boolean).join(" · ")}</Eyebrow>
          <h1 className="mt-3 font-display text-[38px] font-semibold leading-[1.05] text-text sm:text-[46px]">{p.name}</h1>
          <p className="mt-4 font-display text-[24px] text-text tabular">
            {p.options.length > 1 ? <span className="text-[16px] text-text-3">from </span> : null}
            {f.money(p.minPrice)}
          </p>
          {p.description ? <p className="mt-5 text-[16px] leading-relaxed text-text-2">{p.description}</p> : null}
          {p.options.length ? (
            <div className="mt-6">
              <p className="text-[13px] font-medium text-text-2">Available in</p>
              <ul className="mt-2 flex flex-wrap gap-2">
                {p.options.map((o) => (
                  <li key={o} className="rounded-full border border-line-strong bg-surface px-3 py-1.5 text-[13px] text-text">
                    {o}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          <p className="mt-6 text-[13.5px] leading-relaxed text-text-3">
            Stock differs by branch. Send us a note and we&apos;ll confirm availability, or reserve it for a try-on.
          </p>
          <InquiryForm
            className="mt-8"
            branches={site.branches.map((b) => ({ id: b.id, name: b.name }))}
            kind="product_inquiry"
            productName={p.name}
            defaultInterest={interest}
            submitLabel="Ask about this"
          />
        </div>
      </div>

      {related.length ? (
        <section className="mt-24 border-t border-line pt-8">
          <h2 className="font-display text-[26px] font-semibold">More {p.category.toLowerCase()}</h2>
          <ul className="mt-6 grid grid-cols-2 gap-4 md:grid-cols-4">
            {related.map((r) => (
              <li key={r.id}>
                <Link href={`/eyewear/${r.id}`} className="group block">
                  <ProductArt src={r.imageUrl} alt={r.name} />
                  <p className="mt-2 truncate text-[14px] font-medium">{r.name}</p>
                  <p className="text-[13px] text-text-3 tabular">{f.money(r.minPrice)}</p>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </Container>
  );
}

export default function ProductPage(props: PageProps<"/eyewear/[id]">) {
  return (
    <Suspense fallback={<div className="h-[70vh]" />}>
      <Product params={props.params} />
    </Suspense>
  );
}
