import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Gallery } from "@/components/Gallery";
import { ProductPurchase } from "@/components/ProductPurchase";
import { ProductTile } from "@/components/ProductTile";
import { Unavailable } from "@/components/Sections";
import { getLenses, getProduct, getSite } from "@/lib/api";
import { collectionOf, colourGroups, colourName, isContactLens, isFrame, isSunglasses, label, MATERIAL_LABELS, productHref, SHAPE_LABELS, sizeLabel, SWATCH } from "@/lib/catalog";
import { ORDERING_HELP } from "@/lib/content";
import { money } from "@/lib/format";
import { lensCopy } from "@/lib/lens";
import { productGallery } from "@/lib/media";
import { pageMetadata } from "@/lib/seo";

export const revalidate = 60;

export async function generateMetadata(props: PageProps<"/products/[slug]">): Promise<Metadata> {
  const { slug } = await props.params;
  const res = await getProduct(slug);
  if (!res.ok) return { title: "Product" };
  const p = res.data;
  return pageMetadata({ title: p.name, description: p.description ?? `${p.name} — order online and collect in branch.`, path: `/products/${p.slug}` });
}

export default async function ProductPage(props: PageProps<"/products/[slug]">) {
  const [{ slug }, search] = await Promise.all([props.params, props.searchParams]);
  const [res, siteRes, lensesRes] = await Promise.all([getProduct(slug), getSite(), getLenses()]);
  if (!res.ok) {
    if (res.reason === "not_found") notFound();
    return <Unavailable reason={res.reason} what="This product" />;
  }
  const p = res.data;
  const site = siteRes.ok ? siteRes.data : null;
  const fmt = site ? { currency: site.business.currency, locale: site.business.locale } : { currency: "PHP", locale: "en-PH" };
  const ordering = site?.ordering ?? { enabled: false, demoPayments: true, paymentOptions: [] };
  const lenses = lensesRes.ok ? lensesRes.data : [];
  const groups = colourGroups(p);
  const requested = typeof search.colour === "string" ? search.colour.toLowerCase() : null;
  const group = groups.find((g) => g.key === requested) ?? groups[0];
  const colourKey = group && group.key !== "default" ? group.key : null;
  const colourLabel = colourKey ? colourName(colourKey) : "";
  const collection = collectionOf(p.category);
  const kind = isFrame(p.category) ? "frame" : isSunglasses(p.category) ? "sunglasses" : isContactLens(p.category) ? "contact" : "accessory";
  const images = productGallery(p.slug, colourKey ?? "default");
  const prices = group?.variants.map((v) => v.priceCents).filter((x): x is number => x !== null) ?? [];
  const price = prices.length ? Math.min(...prices) : p.priceFromCents;
  const lensFrom = lenses.length ? Math.min(...lenses.map((l) => l.priceCents)) : null;
  const sizes = [...new Set(p.variants.map((v) => v.options.size).filter(Boolean))] as string[];

  const specs: [string, string][] = [];
  if (p.brand) specs.push(["Collection", p.brand]);
  if (p.filters.shape) specs.push(["Shape", label(SHAPE_LABELS, p.filters.shape)]);
  if (p.filters.material) specs.push(["Material", label(MATERIAL_LABELS, p.filters.material)]);
  if (sizes.length) specs.push(["Lens width", sizes.map(sizeLabel).join(", ")]);
  if (groups.length > 1 || colourKey) specs.push([kind === "sunglasses" ? "Lens tint" : "Colours", groups.map((g) => colourName(g.key)).join(", ")]);
  if (kind === "sunglasses") specs.push(["UV protection", "UV400"]);
  const sku = group?.variants[0]?.sku;
  if (sku) specs.push(["Reference", group.variants.length > 1 ? sku.replace(/-[^-]+$/, "") : sku]);

  return (
    <div className="wrap" style={{ paddingTop: 20 }}>
      <nav className="crumbs" aria-label="Breadcrumb">
        <Link href="/">Home</Link>
        <span aria-hidden="true">/</span>
        {collection ? (
          <>
            <Link href={collection.path}>{collection.title}</Link>
            <span aria-hidden="true">/</span>
          </>
        ) : null}
        <span aria-current="page">{p.name}</span>
      </nav>
      <div className="pdp">
        <Gallery name={p.name} colourLabel={colourLabel || p.name} images={images} fallback={p.imageUrl} />
        <div className="pdp__info">
          <div className="pdp__title">
            <h1>{p.name}</h1>
            <p className="pdp__price">
              <span className="num" style={{ color: "var(--ink)" }}>
                {money(price, fmt)}
              </span>
              {kind === "frame" && lensFrom !== null ? <span> frame · with prescription lenses from {money((price ?? 0) + lensFrom, fmt)}</span> : kind === "contact" ? <span> per box</span> : null}
            </p>
          </div>
          {groups.length > 1 || colourKey ? (
            <div>
              <p className="pdp__label">
                {kind === "sunglasses" ? "Lens" : "Colour"} <strong>{colourLabel}</strong>
              </p>
              <div className="colour-links">
                {groups.map((g) => (
                  <Link key={g.key} href={productHref(p.slug, g.key)} aria-current={g.key === group?.key ? "true" : undefined} aria-label={colourName(g.key)} title={colourName(g.key)} scroll={false} replace>
                    <span className="swatch" style={{ background: SWATCH[g.key] ?? "#b9b8b2", backgroundSize: "cover" }} />
                  </Link>
                ))}
              </div>
            </div>
          ) : null}
          {group ? (
            <ProductPurchase key={group.key} slug={p.slug} name={p.name} categoryKind={p.category.kind} kind={kind} variants={group.variants} colourKey={colourKey} colourLabel={colourLabel} lenses={lenses} ordering={ordering} fmt={fmt} />
          ) : null}
        </div>
      </div>

      <section className="pdp-details" aria-label="Details">
        <div>
          {p.description ? <p className="lead">{p.description}</p> : null}
          {kind === "frame" && lenses.length ? (
            <div style={{ marginTop: 40 }}>
              <h2>Lens options</h2>
              <ul className="price-list" style={{ maxWidth: "none" }}>
                {lenses.map((l) => (
                  <li key={l.variantId}>
                    <span>
                      {l.type === "single_vision" ? "Single vision" : l.type === "progressive" ? "Progressive" : "Bifocal"} · {lensCopy(l).title}
                      <small>{lensCopy(l).body}</small>
                    </span>
                    <span>+{money(l.priceCents, fmt)}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
        <div>
          <h2>Details</h2>
          <table className="spec">
            <tbody>
              {specs.map(([k, v]) => (
                <tr key={k}>
                  <th scope="row">{k}</th>
                  <td>{v}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="accordion" style={{ marginTop: 28 }}>
            {ORDERING_HELP.filter((h) => (kind === "frame" ? ["pickup", "prescription", "payment"] : ["pickup", "payment"]).includes(h.id)).map((h) => (
              <details key={h.id}>
                <summary>{h.question}</summary>
                <div className="accordion__body">{h.answer}</div>
              </details>
            ))}
          </div>
        </div>
      </section>

      {p.related.length ? (
        <section className="home-section" aria-labelledby="related">
          <div className="section-head">
            <h2 id="related">You might also like</h2>
            {collection ? (
              <Link href={collection.path} className="arrow-link">
                All {collection.title.toLowerCase()}
              </Link>
            ) : null}
          </div>
          <div className="grid grid--4">
            {p.related.map((r) => (
              <ProductTile key={r.id} product={r} fmt={fmt} />
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
