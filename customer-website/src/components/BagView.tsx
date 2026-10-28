"use client";

import Link from "next/link";
import { lineTotal, MAX_QTY, type BagLine } from "@/lib/bag";
import { productHref } from "@/lib/catalog";
import { money, type MoneyFormat } from "@/lib/format";
import { rxModeLabel } from "@/lib/lens";
import { productImage } from "@/lib/media";
import { useBag } from "./BagProvider";
import { Picture } from "./Picture";
import { useQuote } from "./useQuote";

export function LineParts({ line, fmt }: { line: BagLine; fmt: MoneyFormat }) {
  return (
    <div className="bag-line__parts">
      <div>
        <span>
          {line.eye ? `${line.eye === "right" ? "Right eye" : "Left eye"} · ` : ""}
          {line.variantLabel === "Default" ? "One size" : line.variantLabel}
        </span>
        <span>{money(line.unitPriceCents * line.quantity, fmt)}</span>
      </div>
      {line.lens ? (
        <div>
          <span>Lenses: {line.lens.title}</span>
          <span>{money(line.lens.priceCents * line.quantity, fmt)}</span>
        </div>
      ) : line.categoryKind === "frames" ? (
        <div>
          <span>Non-prescription demo lenses</span>
          <span>{money(0, fmt)}</span>
        </div>
      ) : null}
      {line.prescription ? (
        <div>
          <span>Prescription: {rxModeLabel(line.prescription.mode)}</span>
        </div>
      ) : null}
    </div>
  );
}

export function BagView({ fmt, orderingEnabled, demo }: { fmt: MoneyFormat; orderingEnabled: boolean; demo: boolean }) {
  const { lines, ready, setQuantity, remove } = useBag();
  const { quote, error, loading } = useQuote(lines, ready);

  if (!ready) return <div className="empty" aria-busy="true" />;
  if (!lines.length) {
    return (
      <div className="empty">
        <h2>Your bag is empty</h2>
        <p>Frames, sunglasses and lenses you add will appear here.</p>
        <p style={{ marginTop: 20, display: "flex", gap: 10, justifyContent: "center", flexWrap: "wrap" }}>
          <Link href="/glasses" className="btn btn--primary">
            Shop glasses
          </Link>
          <Link href="/sunglasses" className="btn btn--secondary">
            Shop sunglasses
          </Link>
        </p>
      </div>
    );
  }
  const anyBranch = quote?.branches.some((b) => b.canFulfil) ?? true;
  const displayTotal = lines.reduce((n, l) => n + lineTotal(l), 0);
  const total = quote?.totalCents ?? displayTotal;
  const changed = quote && quote.totalCents !== displayTotal;

  return (
    <div className="bag">
      <div>
        <ul className="bag-lines">
          {lines.map((line) => (
            <li key={line.id} className="bag-line">
              <Link href={productHref(line.slug, line.colourKey)} className="bag-line__media" aria-label={line.name}>
                <Picture image={productImage(line.slug, line.colourKey, "front")} alt="" sizes="200px" />
              </Link>
              <div>
                <div className="bag-line__head">
                  <Link href={productHref(line.slug, line.colourKey)}>{line.name}</Link>
                  <span className="num">{money(lineTotal(line), fmt)}</span>
                </div>
                <LineParts line={line} fmt={fmt} />
                <div className="bag-line__actions">
                  <div className="qty" role="group" aria-label={`Quantity of ${line.name}`}>
                    <button type="button" onClick={() => setQuantity(line.id, line.quantity - 1)} disabled={line.quantity <= 1} aria-label="Fewer">
                      −
                    </button>
                    <output>{line.quantity}</output>
                    <button type="button" onClick={() => setQuantity(line.id, line.quantity + 1)} disabled={line.quantity >= MAX_QTY} aria-label="More">
                      +
                    </button>
                  </div>
                  <button type="button" className="text-btn" onClick={() => remove(line.id)}>
                    Remove
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      </div>
      <aside className="summary" aria-labelledby="summary-title">
        <h2 id="summary-title">Summary</h2>
        <dl>
          <div>
            <dt>Subtotal</dt>
            <dd>{money(total, fmt)}</dd>
          </div>
          <div>
            <dt>Collection in branch</dt>
            <dd>Free</dd>
          </div>
          {quote?.pricesIncludeTax && quote.taxCents ? (
            <div className="muted" style={{ fontSize: 13.5 }}>
              <dt>Includes VAT</dt>
              <dd>{money(quote.taxCents, fmt)}</dd>
            </div>
          ) : null}
          <div className="total">
            <dt>Total</dt>
            <dd aria-live="polite">{loading && !quote ? "…" : money(total, fmt)}</dd>
          </div>
        </dl>
        {changed ? <p className="notice notice--warn">Some prices have changed since you added them. The total above is the current price.</p> : null}
        {error ? (
          <p className="notice notice--error" role="alert">
            {error}
          </p>
        ) : null}
        {quote && !anyBranch ? <p className="notice notice--warn">No single branch has everything in your bag right now. Remove an item, or contact us and we&apos;ll arrange a transfer.</p> : null}
        {orderingEnabled ? (
          <Link href="/checkout" className="btn btn--primary btn--block" aria-disabled={Boolean(error) || !anyBranch} onClick={(e) => (error || !anyBranch) && e.preventDefault()}>
            Checkout
          </Link>
        ) : (
          <p className="notice">Online ordering is paused. Please visit a branch or contact us.</p>
        )}
        <p className="fine">You choose your pickup branch at checkout. {demo ? "Demo store: online card payments are simulated." : "Pay online or at pickup."}</p>
      </aside>
    </div>
  );
}
