import Link from "next/link";
import type { ProductSummary } from "@/lib/api-types";
import { colourName, productHref, summaryColourKeys, SWATCH } from "@/lib/catalog";
import { money, type MoneyFormat } from "@/lib/format";
import { productImage, renderedColours } from "@/lib/media";
import { Picture } from "./Picture";

const TILE_SIZES = "(min-width: 1240px) 25vw, (min-width: 900px) 33vw, 50vw";

/** The colour a tile shows: the first catalogue colour that has a render, else the first rendered one. */
export function tileColour(p: ProductSummary): string | null {
  const rendered = renderedColours(p.slug);
  return summaryColourKeys(p).find((c) => rendered.includes(c)) ?? rendered[0] ?? null;
}

/** Product tile: flat stone image, name and price on one line, colour underneath, swatches. */
export function ProductTile({ product: p, fmt, sizes = TILE_SIZES, priority = false, showSwatches = true }: { product: ProductSummary; fmt: MoneyFormat; sizes?: string; priority?: boolean; showSwatches?: boolean }) {
  const colour = tileColour(p);
  const front = productImage(p.slug, colour, "front");
  const angle = productImage(p.slug, colour, "angle");
  const colours = summaryColourKeys(p);
  const price = p.priceFromCents !== null ? `${p.priceToCents !== null && p.priceToCents > p.priceFromCents ? "From " : ""}${money(p.priceFromCents, fmt)}` : "";
  const sub = colours.length ? colourName(colours[0] === colour ? colours[0] : (colour ?? colours[0])) : (p.brand ?? p.category.name);
  return (
    <Link href={productHref(p.slug, colour)} className="tile">
      <div className="tile__media">
        <Picture image={front} fallback={p.imageUrl} alt="" sizes={sizes} priority={priority} />
        {angle ? <Picture image={angle} alt="" sizes={sizes} className="tile__alt" /> : null}
        {p.availability === "out_of_stock" ? <span className="tile__flag">Sold out online</span> : p.availability === "low_stock" ? <span className="tile__flag">Last few</span> : null}
      </div>
      <div className="tile__info">
        <div className="tile__row">
          <span>{p.name}</span>
          <span className="tile__price">{price}</span>
        </div>
        <div className="tile__sub">{sub}</div>
        {showSwatches && colours.length > 1 ? (
          <div className="swatches" role="img" aria-label={`${colours.length} colours: ${colours.map(colourName).join(", ")}`}>
            {colours.map((c) => (
              <span key={c} className={`swatch${c === colour ? " is-current" : ""}`} style={{ background: SWATCH[c] ?? "#b9b8b2", backgroundSize: "cover" }} />
            ))}
          </div>
        ) : null}
      </div>
    </Link>
  );
}
