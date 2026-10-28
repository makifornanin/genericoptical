import Link from "next/link";
import { ProductTile } from "@/components/ProductTile";
import { Unavailable } from "@/components/Sections";
import { getProducts, getSite } from "@/lib/api";
import { colourName, label, MATERIAL_LABELS, SHAPE_LABELS } from "@/lib/catalog";
import { plural } from "@/lib/format";
import { pageMetadata } from "@/lib/seo";

export const metadata = pageMetadata({ title: "Search", description: "Search frames, sunglasses, contact lenses and accessories.", path: "/search", noindex: true });

export default async function SearchPage(props: PageProps<"/search">) {
  const search = await props.searchParams;
  const q = typeof search.q === "string" ? search.q.trim().slice(0, 80) : "";
  const [site, products] = await Promise.all([getSite(), getProducts()]);
  if (!products.ok) return <Unavailable reason={products.reason} what="Search" />;
  const fmt = site.ok ? { currency: site.data.business.currency, locale: site.data.business.locale } : { currency: "PHP", locale: "en-PH" };
  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  const results = words.length
    ? products.data.filter((p) => {
        const text = [p.name, p.brand, p.category.name, p.description, label(SHAPE_LABELS, p.filters.shape), label(MATERIAL_LABELS, p.filters.material), ...p.colours.map((c) => colourName(c.toLowerCase()))].join(" ").toLowerCase();
        return words.every((w) => text.includes(w));
      })
    : [];
  return (
    <div className="wrap">
      <header className="page-head">
        <h1>{q ? `Results for “${q}”` : "Search"}</h1>
        <form action="/search" role="search" style={{ display: "flex", gap: 10, marginTop: 20, maxWidth: 640 }}>
          <label htmlFor="search-q" className="sr-only">
            Search
          </label>
          <input id="search-q" name="q" type="search" defaultValue={q} className="input" placeholder="Try “round tortoise” or “daily lenses”" style={{ borderRadius: 999, paddingInline: 20 }} />
          <button type="submit" className="btn btn--primary">
            Search
          </button>
        </form>
      </header>
      {q ? (
        results.length ? (
          <>
            <p className="result-count">{plural(results.length, ["result", "results"])}</p>
            <div className="grid grid--4">
              {results.map((p) => (
                <ProductTile key={p.id} product={p} fmt={fmt} />
              ))}
            </div>
          </>
        ) : (
          <div className="empty">
            <h2>No results</h2>
            <p>Try a shape (round, cat-eye), a colour (tortoise, gold) or a product type.</p>
            <p style={{ marginTop: 18, display: "flex", gap: 10, justifyContent: "center", flexWrap: "wrap" }}>
              <Link href="/glasses" className="btn btn--secondary">
                Browse glasses
              </Link>
              <Link href="/sunglasses" className="btn btn--secondary">
                Browse sunglasses
              </Link>
            </p>
          </div>
        )
      ) : null}
    </div>
  );
}
