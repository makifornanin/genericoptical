import "@/styles/pages/home.css";
import type { Metadata } from "next";
import Link from "next/link";
import { ApiState } from "@/components/ApiState";
import { HoursRows } from "@/components/HoursRows";
import { Icon } from "@/components/Icon";
import { OpenStatus } from "@/components/OpenStatus";
import { PriceText, ProductCard, productHref } from "@/components/ProductCard";
import { SectionHead } from "@/components/SectionHead";
import { getProducts, getSite } from "@/lib/api";
import type { ProductSummary, SiteData } from "@/lib/api-types";
import { featuredProducts, heroProducts, isFrames, isSunglasses } from "@/lib/catalog";
import { servicePrice, telHref, type MoneyFormat } from "@/lib/format";
import { DEFAULT_COPY, TESTIMONIALS } from "@/lib/site-settings";

export const revalidate = 60;

export async function generateMetadata(): Promise<Metadata> {
  const site = await getSite();
  return {
    // The layout's default title: "{business} — {tagline}".
    description: (site.ok && (site.data.content.heroBody ?? site.data.business.description)) || DEFAULT_COPY.heroBody,
    alternates: { canonical: "/" },
  };
}

function Arrow() {
  return <Icon name="arrow" />;
}

function Hero({ site, products, fmt }: { site: SiteData | null; products: ProductSummary[]; fmt: MoneyFormat }) {
  const c = site?.content;
  const picks = heroProducts(products);
  const eyewearCount = products.filter((p) => isFrames(p.category) || isSunglasses(p.category)).length;
  const firstService = site?.services.find((s) => s.durationMinutes);
  const stats: [string, string][] = [];
  if (site?.branches.length) stats.push([site.branches.length === 1 ? "Branch" : "Branches", String(site.branches.length)]);
  if (eyewearCount) stats.push(["Frames & eyewear", String(eyewearCount)]);
  if (firstService) stats.push([/exam/i.test(firstService.code) ? "Eye exam" : firstService.name, `${firstService.durationMinutes} min`]);

  return (
    <section className="oc-hero">
      <div className="oc-container oc-hero__inner">
        <div>
          <p className="oc-eyebrow">{c?.heroEyebrow ?? site?.business.tagline ?? "Eye care & eyewear"}</p>
          <h1 className="oc-hero__title">{c?.heroTitle ?? DEFAULT_COPY.heroTitle}</h1>
          <p className="oc-hero__body">{c?.heroBody ?? DEFAULT_COPY.heroBody}</p>
          <div className="oc-hero__actions">
            <Link className="oc-btn oc-btn--brand oc-btn--lg" href="/book">
              Book an eye exam
              <Arrow />
            </Link>
            <Link className="oc-btn oc-btn--outline oc-btn--lg" href="/eyewear">
              Browse eyewear
            </Link>
          </div>
          {stats.length ? (
            <dl className="oc-stats" style={{ gridTemplateColumns: `repeat(${stats.length}, minmax(0, 1fr))` }}>
              {stats.map(([label, value]) => (
                <div key={label}>
                  <dt>{label}</dt>
                  <dd>{value}</dd>
                </div>
              ))}
            </dl>
          ) : null}
        </div>
        <div className="oc-hero-art">
          {picks.map((p, i) =>
            i === 0 ? (
              <Link key={p.id} className="oc-hero-art__main" href={productHref(p)}>
                <div className="oc-art oc-art--hero">
                  {/* eslint-disable-next-line @next/next/no-img-element -- remote product image from the dashboard API */}
                  <img src={p.imageUrl ?? ""} alt={p.name} width={400} height={300} fetchPriority="high" />
                </div>
              </Link>
            ) : (
              <Link key={p.id} href={productHref(p)}>
                <div className="oc-art oc-art--r20">
                  {/* eslint-disable-next-line @next/next/no-img-element -- remote product image from the dashboard API */}
                  <img src={p.imageUrl ?? ""} alt={p.name} width={400} height={300} loading="lazy" />
                </div>
                <p className="oc-hero-art__name">{p.name}</p>
                <p className="oc-hero-art__price">
                  <PriceText product={p} fmt={fmt} fromClass="" />
                </p>
              </Link>
            ),
          )}
        </div>
      </div>
    </section>
  );
}

export default async function HomePage() {
  const [siteResult, productsResult] = await Promise.all([getSite(), getProducts()]);
  const site = siteResult.ok ? siteResult.data : null;
  const products = productsResult.ok ? productsResult.data : [];
  const fmt: MoneyFormat = { currency: site?.business.currency ?? "USD", locale: site?.business.locale ?? "en" };
  const featured = featuredProducts(products);
  const testimonials = TESTIMONIALS.enabled ? TESTIMONIALS.items.filter((q) => q.quote).slice(0, 3) : [];
  const values = site?.content.values.length ? site.content.values : DEFAULT_COPY.values;
  const aboutBody = (site?.content.aboutBody ?? DEFAULT_COPY.aboutBody).replace(/\s*\n\s*\n\s*/g, " ");
  let index = 0;

  return (
    <>
      <Hero site={site} products={products} fmt={fmt} />

      {!site ? <ApiState reason={siteResult.ok ? "unavailable" : siteResult.reason} what="Our services, branches and opening hours" /> : null}

      {site && site.services.length ? (
        <section>
          <div className="oc-container oc-section">
            <SectionHead
              index={++index}
              eyebrow="Services"
              title="Care that starts with a proper examination."
              body="Every service below can be booked online. Durations are what we actually schedule, so you'll never be rushed."
              action={
                <Link className="oc-arrow-link" href="/services">
                  All services
                  <Arrow />
                </Link>
              }
            />
            <ol className="oc-service-rows">
              {site.services.map((s, i) => (
                <li key={s.id}>
                  <span className="oc-service-rows__num">{String(i + 1).padStart(2, "0")}</span>
                  <div>
                    <h3 className="oc-service-rows__name">{s.name}</h3>
                    {s.description ? <p className="oc-service-rows__desc">{s.description}</p> : null}
                  </div>
                  <div className="oc-service-rows__meta">
                    <span className="oc-service-rows__duration">
                      {s.durationMinutes ? (
                        <>
                          <Icon name="clock" className="oc-icon--muted" />
                          {s.durationMinutes} minutes
                        </>
                      ) : null}
                    </span>
                    <span className="oc-service-rows__price">{servicePrice(s.priceCents, fmt)}</span>
                    <Link className="oc-underline-link" href={`/book?service=${encodeURIComponent(s.code)}`}>
                      Book<span className="oc-sr-only"> — {s.name}</span>
                      <Icon name="up" className="oc-icon--sm" />
                    </Link>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </section>
      ) : null}

      {featured.length ? (
        <section className="oc-bg-surface">
          <div className="oc-container oc-section">
            <SectionHead
              index={++index}
              eyebrow="Eyewear"
              title="Frames chosen for fit, not just fashion."
              body="A considered selection across shapes and materials. Try anything on in branch — our opticians will check the fit to your face and prescription."
              action={
                <Link className="oc-arrow-link" href="/eyewear">
                  See all eyewear
                  <Arrow />
                </Link>
              }
            />
            <ul className="oc-product-grid oc-product-grid--4">
              {featured.map((p) => (
                <li key={p.id}>
                  <ProductCard product={p} fmt={fmt} compact />
                </li>
              ))}
            </ul>
          </div>
        </section>
      ) : null}

      <section>
        <div className="oc-container oc-section">
          <SectionHead index={++index} eyebrow="Our approach" title={site?.content.aboutTitle ?? DEFAULT_COPY.aboutTitle} body={aboutBody} />
          <ul className="oc-values">
            {values.slice(0, 4).map((v, i) => (
              <li key={v.title}>
                <span className="oc-values__num">{String(i + 1).padStart(2, "0")}</span>
                <h3 className="oc-values__title">{v.title}</h3>
                <p className="oc-values__body">{v.body}</p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {testimonials.length ? (
        <section>
          <div className="oc-container oc-section oc-section--tight-top">
            <SectionHead index={++index} eyebrow="In their words" title="What customers notice first: the time we take." />
            {TESTIMONIALS.sample ? (
              <p className="oc-notice oc-quotes__sample">
                <span>
                  <strong>Sample reviews.</strong> Placeholder text for layout only — replace with real customer reviews before publishing.
                </span>
              </p>
            ) : null}
            <ul className="oc-quotes">
              {testimonials.map((q) => (
                <li key={q.quote}>
                  <figure className="oc-quote">
                    <blockquote className="oc-quote__text">
                      <p>“{q.quote}”</p>
                    </blockquote>
                    <figcaption className="oc-quote__by">
                      <span>
                        <span className="oc-quote__name">{q.name}</span>
                        {q.context ? <span className="oc-quote__context"> · {q.context}</span> : null}
                      </span>
                      {TESTIMONIALS.sample ? <span className="oc-tag oc-tag--warn">Sample</span> : null}
                    </figcaption>
                  </figure>
                </li>
              ))}
            </ul>
          </div>
        </section>
      ) : null}

      {site && site.branches.length ? (
        <section>
          <div className="oc-container oc-section oc-section--tight-top">
            <SectionHead index={++index} eyebrow="Visit us" title={site.branches.length === 1 ? "Visit us." : `${site.branches.length} branches, one standard of care.`} />
            <ul className="oc-branch-cards">
              {site.branches.map((b) => (
                <li className="oc-branch-card" key={b.id}>
                  <OpenStatus hours={b.hours} timeZone={site.business.timezone} name={b.name} />
                  <div className="oc-branch-card__info">
                    {b.address.length ? (
                      <p>
                        <Icon name="pin" />
                        <span>{b.address.join(", ")}</span>
                      </p>
                    ) : null}
                    {b.phone ? (
                      <p>
                        <Icon name="phone" />
                        <a href={telHref(b.phone)}>{b.phone}</a>
                      </p>
                    ) : null}
                  </div>
                  <ul className="oc-branch-card__hours">
                    <HoursRows hours={b.hours} />
                  </ul>
                  <div className="oc-branch-card__actions">
                    <Link className="oc-btn oc-btn--brand" href={`/book?branch=${encodeURIComponent(b.code ? b.code.toLowerCase() : b.id)}`}>
                      Book here<span className="oc-sr-only"> — {b.name}</span>
                    </Link>
                    {b.mapUrl ? (
                      <a className="oc-btn oc-btn--outline" href={b.mapUrl} target="_blank" rel="noopener">
                        Map<span className="oc-sr-only"> of {b.name} (opens in a new tab)</span>
                      </a>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </section>
      ) : null}

      <section>
        <div className="oc-container oc-section oc-section--tight-top">
          <div className={site && site.content.faqs.length ? "oc-cta" : "oc-cta oc-cta--single"}>
            <div className="oc-cta__main">
              <p className="oc-eyebrow oc-eyebrow--inherit">Ready when you are</p>
              <h2 className="oc-cta__title">Book your next eye exam online.</h2>
              <p className="oc-cta__body">Pick a branch, a service and a time that suits you. We&apos;ll confirm by phone or email.</p>
              <div className="oc-cta__actions">
                <Link className="oc-btn oc-btn--accent oc-btn--lg" href="/book">
                  Book an appointment
                  <Arrow />
                </Link>
                <Link className="oc-btn oc-btn--light oc-btn--lg" href="/contact">
                  Ask a question
                </Link>
              </div>
            </div>
            {site && site.content.faqs.length ? (
              <div className="oc-cta__faq">
                <p className="oc-eyebrow oc-eyebrow--inherit">Common questions</p>
                <div className="oc-faq-mini">
                  {site.content.faqs.slice(0, 4).map((f) => (
                    <details key={f.question}>
                      <summary>
                        {f.question}{" "}
                        <span className="oc-plus" aria-hidden="true">
                          +
                        </span>
                      </summary>
                      <p className="oc-faq-mini__answer">{f.answer}</p>
                    </details>
                  ))}
                </div>
                <Link className="oc-arrow-link" href="/faq">
                  All questions
                  <Arrow />
                </Link>
              </div>
            ) : null}
          </div>
        </div>
      </section>
    </>
  );
}
