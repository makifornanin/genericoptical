import Link from "next/link";
import { Booking } from "@/components/Booking";
import { BOOKING_CALENDAR_ID, bookingUrl } from "@/lib/ghl";
import { Media, Unavailable } from "@/components/Sections";
import { getSite } from "@/lib/api";
import { servicePrice } from "@/lib/format";
import { pageMetadata } from "@/lib/seo";

export const metadata = pageMetadata({ title: "Eye exams", description: "Book an eye exam or contact lens fitting at one of our branches.", path: "/eye-exam" });
export const revalidate = 60;

export default async function EyeExamPage(props: PageProps<"/eye-exam">) {
  const [site, search] = await Promise.all([getSite(), props.searchParams]);
  if (!site.ok) return <Unavailable reason={site.reason} what="Booking" />;
  const { business: b, services, branches, inBranchServices, booking, content } = site.data;
  const fmt = { currency: b.currency, locale: b.locale };
  const exam = services.find((s) => s.code.includes("exam")) ?? services[0];
  const examFaqs = content.faqs.filter((f) => /exam|appointment|prescription|contact lens|fitting/i.test(f.question));

  return (
    <>
      <section className="band" style={{ marginTop: 0 }} aria-labelledby="exam-title">
        <div className="band__media">
          <Media name="eye-exam" alt="" sizes="(min-width: 900px) 50vw, 100vw" priority />
        </div>
        <div className="band__panel">
          <p className="eyebrow">Eye care</p>
          <h1 id="exam-title" style={{ fontSize: "var(--t-3xl)" }}>
            Eye exams
          </h1>
          <p>{exam?.description ?? "A full check of your vision and eye health."} Our optometrists explain what they find and what it means for your glasses or lenses.</p>
          {exam ? (
            <p style={{ fontWeight: 500 }}>
              {exam.name}: {servicePrice(exam.priceCents, fmt)}
              {exam.durationMinutes ? ` · ${exam.durationMinutes} minutes` : ""}
            </p>
          ) : null}
          <div>
            <a href="#book" className="btn btn--accent">
              Book now
            </a>
          </div>
        </div>
      </section>

      <div className="wrap">
        <section className="split home-section" id="book" aria-labelledby="book-title" style={{ scrollMarginTop: 90 }}>
          <div className="split__aside">
            <h2 id="book-title">Book an appointment</h2>
            <p className="muted" style={{ marginTop: 12, maxWidth: "40ch" }}>
              {services.some((s) => s.calendars.length)
                ? "Choose what you'd like and where, then pick a time."
                : BOOKING_CALENDAR_ID
                  ? "Pick a time in the calendar below."
                  : "Choose what you'd like and where. The branch confirms your time by phone or text."}
            </p>
          </div>
          <Booking services={services} branches={branches} widgetBase={booking.widgetBase} defaultCalendarUrl={BOOKING_CALENDAR_ID ? bookingUrl(BOOKING_CALENDAR_ID) : null} fmt={fmt} initialService={typeof search.service === "string" ? search.service : undefined} initialBranch={typeof search.branch === "string" ? search.branch : undefined} />
        </section>

        <section className="split home-section" id="services" aria-labelledby="prices-title" style={{ scrollMarginTop: 90 }}>
          <div className="split__aside">
            <h2 id="prices-title">Prices &amp; services</h2>
            <p className="muted" style={{ marginTop: 12, maxWidth: "40ch" }}>
              Prices include {b.taxName ?? "tax"}. Lens prices are for a pair.
            </p>
          </div>
          <ul className="price-list" style={{ maxWidth: "none" }}>
            {services.map((s) => (
              <li key={s.id}>
                <span>
                  {s.name}
                  {s.durationMinutes ? <small>{s.durationMinutes} minutes · by appointment</small> : null}
                </span>
                <span>{servicePrice(s.priceCents, fmt)}</span>
              </li>
            ))}
            {inBranchServices
              .filter((s) => !services.some((x) => x.name.toLowerCase() === s.name.toLowerCase()))
              .map((s) => (
                <li key={s.id}>
                  <span>
                    {s.name}
                    {s.description ? <small>{s.description}</small> : null}
                  </span>
                  <span>{servicePrice(s.priceCents, fmt, s.fromPrice)}</span>
                </li>
              ))}
          </ul>
        </section>

        {examFaqs.length ? (
          <section className="split home-section" aria-labelledby="exam-faq">
            <div className="split__aside">
              <h2 id="exam-faq">Good to know</h2>
              <p style={{ marginTop: 12 }}>
                <Link href="/help" className="arrow-link">
                  All questions
                </Link>
              </p>
            </div>
            <div className="accordion">
              {examFaqs.map((f) => (
                <details key={f.question}>
                  <summary>{f.question}</summary>
                  <div className="accordion__body">{f.answer}</div>
                </details>
              ))}
            </div>
          </section>
        ) : null}
      </div>
    </>
  );
}
