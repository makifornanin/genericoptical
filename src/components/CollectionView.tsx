"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { ProductSummary } from "@/lib/api-types";
import { colourName, label, MATERIAL_LABELS, SHAPE_LABELS, SWATCH, type Collection } from "@/lib/catalog";
import { applyFilters, facetOptions, filtersToQuery, type Filters, type SortKey } from "@/lib/filters";
import { plural, type MoneyFormat } from "@/lib/format";
import { Icon } from "./Icon";
import { ProductTile } from "./ProductTile";

const FACET_TITLES = { shape: "Frame shape", material: "Material", colour: "Colour" } as const;

function Facet({ facet, options, selected, onToggle }: { facet: "shape" | "material" | "colour"; options: { value: string; count: number }[]; selected: string[]; onToggle: (v: string) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === "Escape" : !ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", close);
    };
  }, [open]);
  const name = (v: string) => (facet === "shape" ? label(SHAPE_LABELS, v) : facet === "material" ? label(MATERIAL_LABELS, v) : colourName(v));
  return (
    <div className="filter" ref={ref}>
      <button type="button" aria-expanded={open} aria-controls={`facet-${facet}`} onClick={() => setOpen((o) => !o)}>
        {FACET_TITLES[facet]}
        {selected.length ? <span className="badge">{selected.length}</span> : null}
        <Icon name="chevronDown" className="icon icon--s" />
      </button>
      {open ? (
        <fieldset className="filter__panel" id={`facet-${facet}`}>
          <legend className="sr-only">{FACET_TITLES[facet]}</legend>
          {options.map((o) => (
            <label key={o.value}>
              <input type="checkbox" checked={selected.includes(o.value)} onChange={() => onToggle(o.value)} disabled={!o.count && !selected.includes(o.value)} />
              {facet === "colour" ? <span className="swatch" style={{ background: SWATCH[o.value] ?? "#b9b8b2", backgroundSize: "cover" }} aria-hidden="true" /> : null}
              {name(o.value)}
              <span className="count">{o.count}</span>
            </label>
          ))}
        </fieldset>
      ) : null}
    </div>
  );
}

/** Collection grid with shape / material / colour filters and sorting, kept in the URL. */
export function CollectionView({ products, collection, initial, fmt, feature }: { products: ProductSummary[]; collection: Collection; initial: Filters; fmt: MoneyFormat; feature?: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [filters, setFilters] = useState<Filters>(initial);
  const shown = useMemo(() => applyFilters(products, filters), [products, filters]);
  const active = filters.shape.length + filters.material.length + filters.colour.length;

  function update(next: Filters) {
    setFilters(next);
    router.replace(`${pathname}${filtersToQuery(next)}`, { scroll: false });
  }
  const toggle = (facet: "shape" | "material" | "colour") => (value: string) => {
    const cur = filters[facet];
    update({ ...filters, [facet]: cur.includes(value) ? cur.filter((v) => v !== value) : [...cur, value] });
  };
  const chips = (["shape", "material", "colour"] as const).flatMap((facet) =>
    filters[facet].map((v) => ({ facet, value: v, text: facet === "shape" ? label(SHAPE_LABELS, v) : facet === "material" ? label(MATERIAL_LABELS, v) : colourName(v) })),
  );

  return (
    <>
      {collection.filters.length || products.length > 4 ? (
        <div className="toolbar">
          {collection.filters.map((facet) => (
            <Facet key={facet} facet={facet} options={facetOptions(products, filters, facet)} selected={filters[facet]} onToggle={toggle(facet)} />
          ))}
          <div className="toolbar__end">
            <label htmlFor="sort" className="muted" style={{ fontSize: 15 }}>
              Sort
            </label>
            <select id="sort" value={filters.sort} onChange={(e) => update({ ...filters, sort: e.target.value as SortKey })}>
              <option value="recommended">Recommended</option>
              <option value="price-asc">Price, low to high</option>
              <option value="price-desc">Price, high to low</option>
              <option value="name">Name</option>
            </select>
          </div>
        </div>
      ) : null}
      <p className="result-count" aria-live="polite">
        {plural(shown.length, collection.noun)}
      </p>
      {chips.length ? (
        <div className="active-filters">
          {chips.map((c) => (
            <button key={`${c.facet}-${c.value}`} type="button" onClick={() => toggle(c.facet)(c.value)} aria-label={`Remove filter ${c.text}`}>
              {c.text} <Icon name="close" className="icon icon--s" />
            </button>
          ))}
          <button type="button" onClick={() => update({ ...filters, shape: [], material: [], colour: [] })} className="text-btn" style={{ background: "none" }}>
            Clear all
          </button>
        </div>
      ) : null}
      {shown.length ? (
        <div className="grid grid--4">
          {shown.map((p, i) => (
            <FragmentWithFeature key={p.id} feature={!active && i === 4 ? feature : null}>
              <ProductTile product={p} fmt={fmt} priority={i < 4} />
            </FragmentWithFeature>
          ))}
        </div>
      ) : (
        <div className="empty">
          <h2>Nothing matches those filters</h2>
          <p>Try removing a filter, or visit a branch to see the full range.</p>
          <p style={{ marginTop: 18 }}>
            <button type="button" className="btn btn--secondary" onClick={() => update({ ...filters, shape: [], material: [], colour: [] })}>
              Clear filters
            </button>
          </p>
        </div>
      )}
    </>
  );
}

function FragmentWithFeature({ feature, children }: { feature: ReactNode; children: ReactNode }) {
  return (
    <>
      {feature}
      {children}
    </>
  );
}
