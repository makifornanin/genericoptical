import Link from "next/link";
import type { ApiFailure } from "@/lib/api";
import type { Branch } from "@/lib/api-types";
import { groupedHours, openStatus, telHref } from "@/lib/format";
import { editorialImage, productImage, type View } from "@/lib/media";
import { Icon } from "./Icon";
import { Picture } from "./Picture";

/** An editorial image, or a product render while the editorial shot doesn't exist. */
export function Media({ name, alt, sizes, product, priority = false }: { name: string; alt: string; sizes: string; product?: { slug: string; colour?: string | null; view?: View }; priority?: boolean }) {
  const image = editorialImage(name) ?? (product ? productImage(product.slug, product.colour, product.view ?? "angle") : null);
  return <Picture image={image} alt={alt} sizes={sizes} priority={priority} />;
}

export function BranchCell({ branch, timezone, now }: { branch: Branch; timezone: string; now: Date }) {
  const status = openStatus(branch.hours, timezone, now);
  return (
    <article className="branch-cell">
      <h3>{branch.name}</h3>
      <address>
        {branch.address.map((line) => (
          <span key={line} style={{ display: "block" }}>
            {line}
          </span>
        ))}
      </address>
      {status ? (
        <p className="status">
          <span className={`dot ${status.open ? "dot--in" : ""}`} aria-hidden="true" />
          {status.label}
        </p>
      ) : null}
      <dl className="hours">
        {groupedHours(branch.hours).map((h) => (
          <div key={h.days} style={{ display: "contents" }}>
            <dt>{h.days}</dt>
            <dd>{h.time}</dd>
          </div>
        ))}
      </dl>
      <div className="links">
        {branch.mapUrl ? (
          <a href={branch.mapUrl} className="arrow-link" target="_blank" rel="noopener noreferrer">
            Directions
          </a>
        ) : (
          <a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(branch.address.join(", "))}`} className="arrow-link" target="_blank" rel="noopener noreferrer">
            Directions
          </a>
        )}
        {branch.phone ? (
          <a href={telHref(branch.phone)} className="arrow-link">
            <Icon name="phone" className="icon icon--s" /> {branch.phone}
          </a>
        ) : null}
      </div>
    </article>
  );
}

/** Shown when the dashboard can't be reached or the site isn't connected to it yet. */
export function Unavailable({ reason, what = "This page" }: { reason: ApiFailure; what?: string }) {
  return (
    <div className="wrap empty" role="status">
      <h2>{reason === "not_configured" ? "Almost ready" : `${what} isn't available right now`}</h2>
      <p>{reason === "not_configured" ? "This site isn't connected to the shop's system yet." : "We couldn't load the latest details. Please try again in a moment, or call your nearest branch."}</p>
      <p style={{ marginTop: 20 }}>
        <Link href="/stores" className="btn btn--secondary">
          Find a branch
        </Link>
      </p>
    </div>
  );
}
