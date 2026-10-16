import Link from "next/link";
import type { ProductSummary } from "@/lib/api-types";
import { AVAILABILITY_LABEL, availabilityTagClass, money, type MoneyFormat } from "@/lib/format";

export function productHref(p: { slug: string }): string {
  return `/eyewear/${encodeURIComponent(p.slug)}`;
}

/** "from ₱2,950.00" when variants are priced differently, else the price. */
export function PriceText({ product, fmt, fromClass = "oc-product-card__from" }: { product: ProductSummary; fmt: MoneyFormat; fromClass?: string }) {
  if (product.priceFromCents === null) return null;
  const range = product.priceToCents !== null && product.priceToCents > product.priceFromCents;
  return (
    <>
      {range ? <span className={fromClass}>from </span> : null}
      {money(product.priceFromCents, fmt)}
    </>
  );
}

export function ProductArt({ product, className = "oc-art", priority = false }: { product: ProductSummary; className?: string; priority?: boolean }) {
  if (!product.imageUrl) return <div className={`${className} oc-art--empty`} aria-hidden="true" />;
  return (
    <div className={className}>
      {/* eslint-disable-next-line @next/next/no-img-element -- product images are remote URLs from the dashboard API (origin differs per deployment) */}
      <img
        src={product.imageUrl}
        alt={product.name}
        width={400}
        height={300}
        loading={priority ? "eager" : "lazy"}
        decoding="async"
        fetchPriority={priority ? "high" : undefined}
      />
    </div>
  );
}

/* Product tile (oc-product-card). Compact cards (home, related) show the plain lowest price. */
export function ProductCard({ product, fmt, compact = false }: { product: ProductSummary; fmt: MoneyFormat; compact?: boolean }) {
  const meta = [product.brand, product.category.name].filter(Boolean).join(" · ");
  const label = AVAILABILITY_LABEL[product.availability];
  const options = !compact && product.variantCount > 1 ? `${product.variantCount} options` : null;
  return (
    <Link className="oc-product-card" href={productHref(product)}>
      <ProductArt product={product} />
      <div className="oc-product-card__row">
        <div className="oc-product-card__text">
          <p className="oc-product-card__name oc-truncate">{product.name}</p>
          {meta ? <p className="oc-product-card__meta oc-truncate">{meta}</p> : null}
        </div>
        <p className="oc-product-card__price">{compact ? money(product.priceFromCents, fmt) : <PriceText product={product} fmt={fmt} />}</p>
      </div>
      {options || label ? (
        <p className="oc-product-card__foot">
          {options ? <span>{options}</span> : null}
          {label ? <span className={availabilityTagClass(product.availability)}>{label}</span> : null}
        </p>
      ) : null}
    </Link>
  );
}
