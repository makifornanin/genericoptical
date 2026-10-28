import Link from "next/link";
import type { SiteData } from "@/lib/api-types";
import { FOOTER_COLUMNS } from "@/lib/content";
import { groupedHours, telHref } from "@/lib/format";

/** Dark footer: how to reach the shop (from the dashboard), link columns, legal. */
export function Footer({ site, name }: { site: SiteData | null; name: string }) {
  const b = site?.business;
  const hours = site?.branches[0] ? groupedHours(site.branches[0].hours) : [];
  return (
    <footer className="footer">
      <div className="wrap footer__top">
        <div className="footer__help">
          <h2>We&apos;re here to help</h2>
          {b?.phone ? (
            <p>
              Call <a href={telHref(b.phone)}>{b.phone}</a>
              {b.email ? (
                <>
                  {" "}
                  or email <a href={`mailto:${b.email}`}>{b.email}</a>
                </>
              ) : null}
            </p>
          ) : null}
          {hours.length ? (
            <p style={{ marginTop: 8 }}>
              Branches open {hours.map((h) => `${h.days} ${h.time}`).join(" · ")}
            </p>
          ) : null}
        </div>
        <div className="footer__cols">
          {FOOTER_COLUMNS.map((col) => (
            <div key={col.title}>
              <h3>{col.title}</h3>
              <ul>
                {col.links.map((l) => (
                  <li key={l.href}>
                    <Link href={l.href}>{l.label}</Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
      <div className="wrap footer__base">
        <span>
          © {new Date().getFullYear()} {b?.legalName ?? name}
          {b?.pricesIncludeTax ? ` · Prices include ${b.taxName ?? "tax"}` : ""}
        </span>
        <nav aria-label="Legal">
          <Link href="/about">About</Link>
          <Link href="/privacy">Privacy</Link>
          <Link href="/terms">Terms</Link>
        </nav>
      </div>
    </footer>
  );
}
