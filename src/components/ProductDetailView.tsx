"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { ProductDetail, ProductVariant } from "@/lib/api-types";
import { AVAILABILITY_LABEL, availabilityTagClass, money, type MoneyFormat } from "@/lib/format";
import { ORDERING_NOTE } from "@/lib/site-settings";
import { Icon } from "./Icon";
import { InquiryForm } from "./InquiryForm";
import { PriceText, ProductArt } from "./ProductCard";

/*
 * Product detail body (ported from pages/product-detail/product-detail.js): image, variants as
 * chips, price and availability per variant (with the branches that have it), "Ask about this"
 * (inquiry form, loaded on first open, prefilled with the product and chosen variant) and a
 * booking button. No checkout: online ordering isn't offered.
 */

interface Props {
  product: ProductDetail;
  fmt: MoneyFormat;
  booking: { href: string; label: string } | null;
  branches: { id: string; name: string }[];
  phone: string | null;
  defaultInterest: Parameters<typeof InquiryForm>[0]["defaultInterest"];
}

function branchLine(v: ProductVariant): string | null {
  if (v.availability === "made_to_order") return "Made to order — we'll order it in for you.";
  if (v.availability === "service") return null;
  const where = v.branches.filter((b) => b.availability !== "out_of_stock");
  if (!where.length) return "Not in stock at any branch right now — ask us and we'll check when it's due in.";
  return `Available at: ${where.map((b) => (b.availability === "low_stock" ? `${b.branchName} (low stock)` : b.branchName)).join(", ")}`;
}

export function ProductDetailView({ product, fmt, booking, branches, phone, defaultInterest }: Props) {
  const variants = product.variants;
  const [selectedId, setSelectedId] = useState<string | null>(variants.length === 1 ? variants[0].id : null);
  const [open, setOpen] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const selected = variants.find((v) => v.id === selectedId) ?? null;
  const productName = selected ? `${product.name} (${selected.label})` : product.name;
  const availability = selected ? selected.availability : product.availability;
  const tag = AVAILABILITY_LABEL[availability];
  const line = selected ? branchLine(selected) : variants.length > 1 ? "Stock differs by branch and option — choose one to see where it's available." : null;

  function toggle(next = !open) {
    setOpen(next);
    if (next) {
      setLoaded(true);
      window.requestAnimationFrame(() => {
        const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        panelRef.current?.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "nearest" });
      });
    }
  }

  // A link ending in ?ask=1 (e.g. from an email) opens the inquiry panel straight away.
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("ask") !== "1") return;
    const t = window.setTimeout(() => {
      setOpen(true);
      setLoaded(true);
    }, 0);
    return () => window.clearTimeout(t);
  }, []);

  const meta = [product.brand, product.category.name].filter(Boolean).join(" · ");
  const showVariantPrice = selected && selected.priceCents !== null;

  return (
    <div className="oc-product__layout">
      <div className="oc-product__gallery">
        <ProductArt product={product} className="oc-art oc-art--r28" priority />
      </div>
      <div>
        {meta ? <p className="oc-eyebrow">{meta}</p> : null}
        <h1 className="oc-product__title">{product.name}</h1>
        {product.priceFromCents !== null ? (
          <p className="oc-product__price" data-price>
            {showVariantPrice ? money(selected.priceCents, fmt) : <PriceText product={product} fmt={fmt} fromClass="oc-product__from" />}
          </p>
        ) : null}
        {product.description ? <p className="oc-product__desc">{product.description}</p> : null}
        {variants.length ? (
          <>
            <p className="oc-product__label" id="oc-variants-label">
              {variants.length > 1 ? "Available in — choose one to ask about it" : "Available in"}
            </p>
            <div className="oc-chips" role="group" aria-labelledby="oc-variants-label">
              {variants.map((v) => (
                <button key={v.id} type="button" className="oc-chip" aria-pressed={v.id === selectedId} onClick={() => setSelectedId(v.id)}>
                  {v.label}
                  {v.priceCents !== null && v.priceCents !== product.priceFromCents ? <span className="oc-chip__price">{money(v.priceCents, fmt)}</span> : null}
                </button>
              ))}
            </div>
          </>
        ) : null}
        {tag || line ? (
          <p className="oc-availability" data-availability={availability} aria-live="polite">
            <Icon name="info" />
            <span>
              {tag ? <span className={availabilityTagClass(availability)}>{tag}</span> : null}
              {line ? <span className="oc-availability__branches">{line}</span> : null}
            </span>
          </p>
        ) : null}
        <p className="oc-availability">
          <Icon name="info" />
          <span>{ORDERING_NOTE}</span>
        </p>
        <div className="oc-product__actions">
          <button type="button" className="oc-btn oc-btn--brand oc-btn--lg" aria-expanded={open} aria-controls="oc-product-inquiry" onClick={() => toggle()}>
            Ask about this
          </button>
          {booking ? (
            <Link className="oc-btn oc-btn--outline oc-btn--lg" href={booking.href}>
              {booking.label}
            </Link>
          ) : null}
        </div>
        <div className="oc-product__inquiry" id="oc-product-inquiry" ref={panelRef} hidden={!open}>
          <p className="oc-product__label">
            Asking about <strong data-asking>{productName}</strong>
          </p>
          {loaded ? (
            <div style={{ marginTop: 12 }}>
              <InquiryForm
                kind="product_inquiry"
                title={`Ask about ${product.name}`}
                branches={branches}
                productName={productName}
                defaultMessage={`I'd like to know more about ${productName}.`}
                defaultInterest={defaultInterest}
                phone={phone}
              />
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
