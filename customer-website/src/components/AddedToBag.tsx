"use client";

import Link from "next/link";
import { lineTotal } from "@/lib/bag";
import { money } from "@/lib/format";
import { rxModeLabel } from "@/lib/lens";
import { productImage } from "@/lib/media";
import { useBag } from "./BagProvider";
import { Drawer } from "./Drawer";
import { Picture } from "./Picture";

/** Confirmation panel after "Add to bag": what was added, then bag or checkout. */
export function AddedToBag({ currency, locale }: { currency: string; locale: string }) {
  const { lastAdded: line, dismissAdded, count } = useBag();
  const fmt = { currency, locale };
  return (
    <Drawer
      open={Boolean(line)}
      onClose={dismissAdded}
      title="Added to your bag"
      footer={
        <>
          <Link href="/bag" className="btn btn--secondary" onClick={dismissAdded} style={{ marginLeft: 0 }}>
            View bag ({count})
          </Link>
          <Link href="/checkout" className="btn btn--primary" onClick={dismissAdded}>
            Checkout
          </Link>
        </>
      }
    >
      {line ? (
        <div className="bag-line" style={{ borderBottom: 0, paddingTop: 0 }}>
          <div className="bag-line__media">
            <Picture image={productImage(line.slug, line.colourKey, "front")} alt="" sizes="200px" />
          </div>
          <div>
            <div className="bag-line__head">
              <span>{line.name}</span>
              <span className="num">{money(lineTotal(line), fmt)}</span>
            </div>
            <div className="bag-line__parts">
              <div>
                <span>{line.variantLabel}</span>
              </div>
              {line.lens ? (
                <div>
                  <span>Lenses: {line.lens.title}</span>
                </div>
              ) : null}
              {line.prescription ? (
                <div>
                  <span>Prescription: {rxModeLabel(line.prescription.mode)}</span>
                </div>
              ) : null}
              {line.quantity > 1 ? (
                <div>
                  <span>Quantity {line.quantity}</span>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </Drawer>
  );
}
