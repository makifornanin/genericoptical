"use client";

import Link from "next/link";
import { useState } from "react";
import type { Lens, OrderingConfig, ProductVariant } from "@/lib/api-types";
import { MAX_QTY, newLineId } from "@/lib/bag";
import { sizeLabel } from "@/lib/catalog";
import { money, type MoneyFormat } from "@/lib/format";
import { useBag } from "./BagProvider";
import { Icon } from "./Icon";
import { LensFlow } from "./LensFlow";

const STOCK_LABEL = { in_stock: "In stock", low_stock: "Last few", out_of_stock: "Not in stock" } as const;
const STOCK_DOT = { in_stock: "dot--in", low_stock: "dot--low", out_of_stock: "dot--out" } as const;

type Kind = "frame" | "sunglasses" | "contact" | "accessory";

function BranchStock({ variant }: { variant: ProductVariant }) {
  if (!variant.branches.length) return null;
  return (
    <div>
      <p className="pdp__label">Available to collect</p>
      <ul className="branch-stock">
        {variant.branches.map((b) => (
          <li key={b.branchId}>
            <span>{b.branchName}</span>
            <span>
              <span className={`dot ${STOCK_DOT[b.availability]}`} aria-hidden="true" />
              {STOCK_LABEL[b.availability]}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Qty({ value, onChange, label }: { value: number; onChange: (n: number) => void; label: string }) {
  return (
    <div className="qty" role="group" aria-label={label}>
      <button type="button" onClick={() => onChange(value - 1)} disabled={value <= 1} aria-label="Fewer">
        −
      </button>
      <output aria-live="polite">{value}</output>
      <button type="button" onClick={() => onChange(value + 1)} disabled={value >= MAX_QTY} aria-label="More">
        +
      </button>
    </div>
  );
}

export function ProductPurchase({
  slug,
  name,
  categoryKind,
  kind,
  variants,
  colourKey,
  colourLabel,
  lenses,
  ordering,
  fmt,
}: {
  slug: string;
  name: string;
  categoryKind: string;
  kind: Kind;
  variants: ProductVariant[];
  colourKey: string | null;
  colourLabel: string;
  lenses: Lens[];
  ordering: OrderingConfig;
  fmt: MoneyFormat;
}) {
  const { add } = useBag();
  const firstAvailable = variants.find((v) => v.availability !== "out_of_stock") ?? variants[0];
  const [variantId, setVariantId] = useState(firstAvailable?.id);
  const variant = variants.find((v) => v.id === variantId) ?? variants[0];
  const [qty, setQty] = useState(1);
  const [lensOpen, setLensOpen] = useState(false);
  // Contact lenses: power and boxes per eye.
  const [right, setRight] = useState({ id: firstAvailable?.id ?? "", qty: 1 });
  const [left, setLeft] = useState({ id: firstAvailable?.id ?? "", qty: 1 });
  const [sameBoth, setSameBoth] = useState(true);

  if (!variant) return null;
  const sizes = variants.filter((v) => v.options.size);
  const soldOut = variant.availability === "out_of_stock";
  const price = variant.priceCents ?? 0;
  const ask = `/contact?product=${encodeURIComponent(`${name} (${variant.label})`)}`;

  if (!ordering.enabled) {
    return (
      <div className="pdp__actions">
        <BranchStock variant={variant} />
        <p className="notice">Online ordering is paused. Visit a branch to try it on, or send us a message and we&apos;ll set one aside.</p>
        <Link href={ask} className="btn btn--primary btn--block">
          Ask about this {kind === "frame" ? "frame" : "item"}
        </Link>
      </div>
    );
  }

  function addSimple() {
    add({ id: newLineId(), slug, name, categoryKind, variantId: variant.id, variantLabel: variant.label, colourKey, quantity: qty, unitPriceCents: price, lens: null, prescription: null, eye: null });
    setQty(1);
  }

  function addContacts() {
    const byId = (id: string) => variants.find((v) => v.id === id) ?? variant;
    const r = byId(right.id);
    const lines = sameBoth
      ? [{ v: r, q: right.qty * 2, eye: null }]
      : [
          { v: r, q: right.qty, eye: "right" as const },
          { v: byId(left.id), q: left.qty, eye: "left" as const },
        ];
    for (const l of lines) {
      add({ id: newLineId(), slug, name, categoryKind, variantId: l.v.id, variantLabel: l.v.label, colourKey: null, quantity: Math.min(MAX_QTY, l.q), unitPriceCents: l.v.priceCents ?? 0, lens: null, prescription: null, eye: l.eye });
    }
  }

  return (
    <div className="pdp__actions" style={{ gap: 22 }}>
      {kind === "frame" && sizes.length > 1 ? (
        <div>
          <p className="pdp__label" id="size-label">
            Size <strong>{sizeLabel(variant.options.size ?? "")}</strong> lens width
          </p>
          <div className="chips" role="radiogroup" aria-labelledby="size-label">
            {sizes.map((v) => (
              <button key={v.id} type="button" role="radio" aria-checked={v.id === variant.id} className="chip" onClick={() => setVariantId(v.id)}>
                {sizeLabel(v.options.size ?? v.label)}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {kind === "contact" ? (
        <div style={{ display: "grid", gap: 16 }}>
          <label className="check">
            <input type="checkbox" checked={sameBoth} onChange={(e) => setSameBoth(e.target.checked)} />
            Same power for both eyes
          </label>
          {(sameBoth ? [["Both eyes", right, setRight] as const] : ([["Right eye (OD)", right, setRight], ["Left eye (OS)", left, setLeft]] as const)).map(([title, value, set]) => (
            <div key={title} className="form-grid" style={{ gridTemplateColumns: "minmax(0,1fr) auto", alignItems: "end", gap: 12 }}>
              <div className="field">
                <label htmlFor={`power-${title}`}>{title}: power</label>
                <select id={`power-${title}`} className="select" value={value.id} onChange={(e) => set({ ...value, id: e.target.value })}>
                  {variants.map((v) => (
                    <option key={v.id} value={v.id} disabled={v.availability === "out_of_stock"}>
                      {v.options.power ?? v.label}
                      {v.availability === "out_of_stock" ? " (not in stock)" : ""}
                    </option>
                  ))}
                </select>
              </div>
              <Qty value={value.qty} onChange={(n) => set({ ...value, qty: n })} label={`${title}: boxes`} />
            </div>
          ))}
          <p className="muted" style={{ fontSize: 14 }}>
            {money(price, fmt)} per box{sameBoth ? `, ${right.qty * 2} boxes in total (one per eye)` : ""}. You&apos;ll confirm you have a current contact lens prescription at checkout.
          </p>
        </div>
      ) : null}

      <BranchStock variant={kind === "contact" ? (variants.find((v) => v.id === right.id) ?? variant) : variant} />

      {kind === "frame" ? (
        <>
          <button type="button" className="btn btn--primary btn--block" onClick={() => setLensOpen(true)} disabled={soldOut}>
            {soldOut ? "Not in stock online" : "Select lenses"}
          </button>
          <LensFlow
            open={lensOpen}
            onClose={() => setLensOpen(false)}
            frame={{ slug, name, categoryKind, variantId: variant.id, variantLabel: variant.label, colourKey, colourLabel, priceCents: price }}
            lenses={lenses}
            fmt={fmt}
            onAdd={(line) => {
              setLensOpen(false);
              add(line);
            }}
          />
        </>
      ) : kind === "contact" ? (
        <button type="button" className="btn btn--primary btn--block" onClick={addContacts}>
          Add to bag
        </button>
      ) : (
        <div style={{ display: "flex", gap: 10 }}>
          <Qty value={qty} onChange={setQty} label="Quantity" />
          <button type="button" className="btn btn--primary" style={{ flex: 1 }} onClick={addSimple} disabled={soldOut}>
            {soldOut ? "Not in stock online" : "Add to bag"}
          </button>
        </div>
      )}
      <ul className="checklist">
        <li>
          <Icon name="check" /> Collect in branch{kind === "frame" || kind === "sunglasses" ? ", fitted and adjusted for you" : ""}
        </li>
        {kind === "frame" ? (
          <li>
            <Icon name="check" /> Lenses made to your prescription at our partner lab
          </li>
        ) : null}
        <li>
          <Icon name="check" /> Pay online or when you collect
        </li>
      </ul>
      <Link href={ask} className="text-btn" style={{ justifySelf: "start" }}>
        Questions about this {kind === "frame" || kind === "sunglasses" ? "pair" : "product"}? Ask us
      </Link>
    </div>
  );
}
