import Link from "next/link";
import type { SiteData } from "@/lib/api-types";
import { telHref } from "@/lib/format";
import { FALLBACK_BRAND, NAV, SOCIAL, STAFF_LOGIN_URL } from "@/lib/site-settings";
import { HoursRows } from "./HoursRows";
import { Icon } from "./Icon";

/* Global footer (components/footer.html in the GHL-builder version). */
export function SiteFooter({ site }: { site: SiteData | null }) {
  const b = site?.business;
  const branches = (site?.branches ?? []).slice(0, 3);
  const links = [...NAV, { label: "Privacy", href: "/privacy" }, { label: "Terms", href: "/terms" }];
  const social = SOCIAL.filter((s) => /^https?:\/\//.test(s.href));
  const year = new Date().getFullYear();

  return (
    <footer className="oc oc-footer">
      <div className="oc-container oc-footer__inner">
        <div className="oc-footer__grid">
          <div>
            <p className="oc-footer__name">{b?.name ?? FALLBACK_BRAND}</p>
            {b?.tagline ? <p className="oc-footer__tagline">{b.tagline}</p> : null}
            {b && (b.phone || b.email || b.address) ? (
              <div className="oc-footer__contact">
                {b.phone ? (
                  <p>
                    <a href={telHref(b.phone)}>{b.phone}</a>
                  </p>
                ) : null}
                {b.email ? (
                  <p>
                    <a href={`mailto:${b.email}`}>{b.email}</a>
                  </p>
                ) : null}
                {b.address ? <p>{b.address}</p> : null}
              </div>
            ) : null}
            {social.length ? (
              <div className="oc-footer__social">
                {social.map((s) => (
                  <a key={s.href} href={s.href} rel="noopener" target="_blank">
                    {s.label}
                    <span className="oc-sr-only"> (opens in a new tab)</span>
                  </a>
                ))}
              </div>
            ) : null}
            <div className="oc-footer__cta">
              <Link className="oc-btn oc-btn--accent" href="/book">
                Book an eye exam
                <Icon name="up" />
              </Link>
            </div>
          </div>
          {branches.length ? (
            <div className="oc-footer__branches">
              {branches.map((br) => (
                <div key={br.id}>
                  <p className="oc-eyebrow oc-eyebrow--inherit">{br.name}</p>
                  <p className="oc-footer__address">
                    {br.address.map((line, i) => (
                      <span key={i}>
                        {i > 0 ? <br /> : null}
                        {line}
                      </span>
                    ))}
                  </p>
                  <ul className="oc-footer__hours">
                    <HoursRows hours={br.hours} />
                  </ul>
                </div>
              ))}
            </div>
          ) : null}
        </div>
        <div className="oc-footer__bottom">
          <nav className="oc-footer__nav" aria-label="Footer">
            {links.map((n) => (
              <Link key={n.href} href={n.href}>
                {n.label}
              </Link>
            ))}
          </nav>
          <p className="oc-footer__copy">
            © {year} {b?.legalName ?? b?.name ?? FALLBACK_BRAND}
            {STAFF_LOGIN_URL ? <a href={STAFF_LOGIN_URL}> · Staff sign in</a> : null}
          </p>
        </div>
      </div>
    </footer>
  );
}
