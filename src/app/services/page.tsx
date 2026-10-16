import "@/styles/pages/services.css";
import type { Metadata } from "next";
import Link from "next/link";
import { ApiState } from "@/components/ApiState";
import { Icon } from "@/components/Icon";
import { PageIntro, SectionHead } from "@/components/SectionHead";
import { getSite } from "@/lib/api";
import { servicePrice } from "@/lib/format";
import { pageMetadata } from "@/lib/seo";

export const revalidate = 60;

export const metadata: Metadata = pageMetadata({
  title: "Services",
  description: "Eye examinations, contact lens consultations, prescription eyewear, lens replacement and frame repairs.",
  path: "/services",
});

export default async function ServicesPage() {
  const result = await getSite();
  const site = result.ok ? result.data : null;
  const fmt = { currency: site?.business.currency ?? "USD", locale: site?.business.locale ?? "en" };
  let index = 0;

  return (
    <>
      <PageIntro eyebrow="Services" title="Thorough eye care, explained clearly.">
        From comprehensive examinations to the final fitting of your glasses, here&apos;s what we offer and what it costs.
      </PageIntro>

      {!result.ok ? <ApiState reason={result.reason} what="Our services and prices" /> : null}

      {site && site.services.length ? (
        <section>
          <div className="oc-container oc-section">
            <SectionHead
              index={++index}
              eyebrow="Book online"
              title="Appointments"
              body="Bookable online at any branch. Each slot is reserved for you and an optometrist or optician."
            />
            <ul className="oc-svc-cards">
              {site.services.map((s) => (
                <li className="oc-svc-card" key={s.id}>
                  <div className="oc-svc-card__top">
                    <h3 className="oc-svc-card__title">{s.name}</h3>
                    <p className="oc-svc-card__price">{servicePrice(s.priceCents, fmt)}</p>
                  </div>
                  <p className="oc-svc-card__meta">
                    {s.durationMinutes ? (
                      <span>
                        <Icon name="clock" className="oc-icon--sm" />
                        {s.durationMinutes} minutes
                      </span>
                    ) : null}
                    <span>
                      <Icon name="calendar" className="oc-icon--sm" />
                      Book online
                    </span>
                  </p>
                  {s.description ? <p className="oc-svc-card__desc">{s.description}</p> : null}
                  <div className="oc-svc-card__action">
                    <Link className="oc-btn oc-btn--brand" href={`/book?service=${encodeURIComponent(s.code)}`}>
                      Book this<span className="oc-sr-only"> — {s.name}</span>
                      <Icon name="up" />
                    </Link>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </section>
      ) : null}

      {site && site.inBranchServices.length ? (
        <section>
          <div className={`oc-container oc-section${index ? " oc-section--tight-top" : ""}`}>
            <SectionHead
              index={++index}
              eyebrow="In branch"
              title="Eyewear, lenses and repairs"
              body="No appointment needed — visit any branch. Your optician will quote before any work starts."
              action={
                <Link className="oc-arrow-link" href="/contact">
                  Ask a question
                  <Icon name="arrow" />
                </Link>
              }
            />
            <ul className="oc-price-list">
              {site.inBranchServices.map((s) => (
                <li key={s.id}>
                  <div>
                    <h3 className="oc-price-list__name">{s.name}</h3>
                    {s.description ? <p className="oc-price-list__desc">{s.description}</p> : null}
                  </div>
                  <p className="oc-price-list__price">{servicePrice(s.priceCents, fmt, s.fromPrice)}</p>
                </li>
              ))}
            </ul>
          </div>
        </section>
      ) : null}

      <section>
        <div className={`oc-container oc-section${index ? " oc-section--tight-top" : ""}`}>
          <div className="oc-cta oc-cta--single">
            <div className="oc-cta__main">
              <p className="oc-eyebrow oc-eyebrow--inherit">Not sure where to start?</p>
              <h2 className="oc-cta__title">Start with an eye exam.</h2>
              <p className="oc-cta__body">It tells us what you need before you choose lenses or frames — and we&apos;ll explain every result in plain language.</p>
              <div className="oc-cta__actions">
                <Link className="oc-btn oc-btn--accent oc-btn--lg" href="/book">
                  Book an eye exam
                  <Icon name="arrow" />
                </Link>
                <Link className="oc-btn oc-btn--light oc-btn--lg" href="/contact">
                  Ask a question
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
