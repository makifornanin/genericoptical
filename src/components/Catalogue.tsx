"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import type { Category, ProductSummary } from "@/lib/api-types";
import type { MoneyFormat } from "@/lib/format";
import { Icon } from "./Icon";
import { ProductCard } from "./ProductCard";

/*
 * Eyewear catalogue (ported from pages/eyewear/eyewear.js): category pills with counts, search,
 * filters kept in the URL (?category=frames&q=tortoise) so they can be linked to, an empty state
 * and a live status line. Filtering runs in the browser over the list the server rendered.
 */

interface Props {
  products: ProductSummary[];
  categories: Category[];
  initialCategory: string | null;
  initialQuery: string;
  fmt: MoneyFormat;
  priceNote: string;
}

function haystack(p: ProductSummary): string {
  return [p.name, p.brand, p.category.name, p.description].filter(Boolean).join(" ").toLowerCase();
}

export function Catalogue({ products, categories, initialCategory, initialQuery, fmt, priceNote }: Props) {
  const pills = useMemo(() => categories.filter((c) => c.productCount > 0), [categories]);
  const [category, setCategory] = useState<string | null>(pills.some((c) => c.slug === initialCategory) ? initialCategory : null);
  const [input, setInput] = useState(initialQuery);
  const [query, setQuery] = useState(initialQuery.trim());
  const searchRef = useRef<HTMLInputElement>(null);
  const indexed = useMemo(() => products.map((p) => ({ p, text: haystack(p) })), [products]);

  // Debounce typing into the applied query.
  useEffect(() => {
    const t = window.setTimeout(() => setQuery(input.trim()), 120);
    return () => window.clearTimeout(t);
  }, [input]);

  // Keep the filters in the URL without a navigation or scroll (Next.js syncs history.replaceState).
  useEffect(() => {
    const url = new URL(window.location.href);
    url.searchParams.delete("category");
    url.searchParams.delete("q");
    if (category) url.searchParams.set("category", category);
    if (query) url.searchParams.set("q", query);
    const next = url.pathname + url.search + url.hash;
    if (next !== window.location.pathname + window.location.search + window.location.hash) window.history.replaceState(null, "", next);
  }, [category, query]);

  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  const shown = indexed.filter(({ p, text }) => (!category || p.category.slug === category) && words.every((w) => text.includes(w))).map((x) => x.p);
  const categoryName = pills.find((c) => c.slug === category)?.name;
  const what = categoryName ? categoryName.toLowerCase() : "products";
  const status = query
    ? `${shown.length} ${shown.length === 1 ? "result" : "results"} for “${query}”${categoryName ? ` in ${what}` : ""}`
    : `Showing ${shown.length} ${shown.length === 1 && !category ? "product" : what}`;

  function clear() {
    setCategory(null);
    setInput("");
    setQuery("");
    searchRef.current?.focus();
  }

  return (
    <div className="oc-container oc-catalogue">
      <div className="oc-catalogue__bar">
        <div className="oc-pills" role="group" aria-label="Filter by category">
          {[{ slug: null as string | null, name: "Everything", productCount: products.length }, ...pills].map((c) => (
            <button key={c.slug ?? "all"} type="button" className="oc-pill" aria-pressed={category === c.slug} onClick={() => setCategory(c.slug)}>
              {c.name}
              <span className="oc-pill__count">{c.productCount}</span>
            </button>
          ))}
        </div>
        <div className="oc-search">
          <label className="oc-sr-only" htmlFor="oc-catalogue-search">
            Search eyewear
          </label>
          <Icon name="search" />
          <input
            ref={searchRef}
            className="oc-input"
            id="oc-catalogue-search"
            type="search"
            placeholder="Search name, brand or colour"
            autoComplete="off"
            enterKeyHint="search"
            value={input}
            onChange={(e) => setInput(e.target.value)}
          />
        </div>
      </div>
      <p className="oc-catalogue__status" role="status" aria-live="polite">
        {status}
      </p>
      <ul className="oc-product-grid oc-product-grid--catalogue" hidden={!shown.length}>
        {shown.map((p) => (
          <li key={p.id}>
            <ProductCard product={p} fmt={fmt} />
          </li>
        ))}
      </ul>
      <div className="oc-empty" hidden={shown.length > 0}>
        <p>Nothing matches that search. Try another word, or ask us — we may have it in branch.</p>
        <button type="button" className="oc-btn oc-btn--outline" onClick={clear}>
          Clear filters
        </button>{" "}
        <Link className="oc-btn oc-btn--brand" href="/contact">
          Ask us
        </Link>
      </div>
      <p className="oc-catalogue__note">{priceNote}</p>
    </div>
  );
}
