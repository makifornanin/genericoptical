import Link from "next/link";
import { getLenses, getProducts, getSite } from "@/lib/api";
import { COLLECTIONS, inCollection, type CollectionKey } from "@/lib/catalog";
import { parseFilters } from "@/lib/filters";
import { money } from "@/lib/format";
import { minPrice } from "@/lib/merch";
import { CollectionView } from "./CollectionView";
import { Media, Unavailable } from "./Sections";

/** Introductions per collection, built from live data (counts and starting prices). */
function intro(key: CollectionKey, from: string | null, lensFrom: string | null): string {
  switch (key) {
    case "glasses":
      return `Acetate and metal frames${from ? ` from ${from}` : ""}. Add prescription lenses made at our partner laboratory${lensFrom ? ` from ${lensFrom}` : ""}, then collect and have them fitted in branch.`;
    case "sunglasses":
      return `Sunglasses with UV400 lenses${from ? `, from ${from}` : ""}. Order online and pick them up at your nearest branch.`;
    case "contact-lenses":
      return "Daily, bi-weekly and monthly lenses, by the box. You need a current contact lens prescription; if you're new to contacts, book a contact lens fitting first.";
    case "accessories":
      return "Cases, cleaning and small parts to look after your glasses and lenses.";
  }
}

const FEATURES: Partial<Record<CollectionKey, { name: string; caption: string; href: string; cta: string }>> = {
  glasses: { name: "collection-glasses", caption: "Not sure about your prescription? Start with an eye exam.", href: "/eye-exam", cta: "Book an eye exam" },
  sunglasses: { name: "collection-sunglasses", caption: "Try them on before you buy: every branch keeps the range.", href: "/stores", cta: "Find a branch" },
};

export async function CollectionPage({ collectionKey, searchParams }: { collectionKey: CollectionKey; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const collection = COLLECTIONS[collectionKey];
  const [site, products, lenses, params] = await Promise.all([getSite(), getProducts(), getLenses(), searchParams]);
  if (!products.ok) return <Unavailable reason={products.reason} what={collection.title} />;
  const fmt = site.ok ? { currency: site.data.business.currency, locale: site.data.business.locale } : { currency: "PHP", locale: "en-PH" };
  const items = products.data.filter((p) => inCollection(p, collection));
  const from = minPrice(items);
  const lensFrom = lenses.ok && lenses.data.length ? Math.min(...lenses.data.map((l) => l.priceCents)) : null;
  const f = FEATURES[collectionKey];
  const feature = f ? (
    <Link href={f.href} className="grid__feature" key="feature">
      <Media name={f.name} alt="" sizes="(min-width: 1240px) 50vw, (min-width: 900px) 66vw, 100vw" />
      <div className="caption">
        <p>{f.caption}</p>
        <span className="btn btn--light btn--small">{f.cta}</span>
      </div>
    </Link>
  ) : null;

  return (
    <div className="wrap">
      <header className="page-head">
        <nav className="crumbs" aria-label="Breadcrumb">
          <Link href="/">Home</Link>
          <span aria-hidden="true">/</span>
          <span aria-current="page">{collection.title}</span>
        </nav>
        <h1>{collection.title}</h1>
        <p>{intro(collectionKey, from !== null ? money(from, fmt) : null, lensFrom !== null ? money(lensFrom, fmt) : null)}</p>
      </header>
      <CollectionView products={items} collection={collection} initial={parseFilters(params)} fmt={fmt} feature={feature} />
    </div>
  );
}
