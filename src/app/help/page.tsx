import Link from "next/link";
import { getSite } from "@/lib/api";
import { DEMO_NOTICE, ORDERING_HELP } from "@/lib/content";
import { pageMetadata } from "@/lib/seo";

export const metadata = pageMetadata({ title: "Help", description: "Ordering, pickup, prescriptions, payment and frequently asked questions.", path: "/help" });
export const revalidate = 60;

export default async function HelpPage() {
  const site = await getSite();
  const faqs = site.ok ? site.data.content.faqs : [];
  const demo = site.ok && site.data.business.isDemo;
  const faqLd = faqs.length ? { "@context": "https://schema.org", "@type": "FAQPage", mainEntity: faqs.map((f) => ({ "@type": "Question", name: f.question, acceptedAnswer: { "@type": "Answer", text: f.answer } })) } : null;
  return (
    <div className="wrap">
      <header className="page-head">
        <h1>Help</h1>
        <p>
          How ordering online works, and answers to common questions. Can&apos;t find what you need?{" "}
          <Link href="/contact" className="link">
            Contact us
          </Link>
          .
        </p>
      </header>
      <section className="split" id="ordering" aria-labelledby="h-ordering" style={{ scrollMarginTop: 90 }}>
        <div className="split__aside">
          <h2 id="h-ordering">Ordering &amp; pickup</h2>
          <p style={{ marginTop: 12 }}>
            <Link href="/order" className="arrow-link">
              Track an order
            </Link>
          </p>
        </div>
        <div className="accordion">
          {ORDERING_HELP.map((h) => (
            <details key={h.id} id={h.id}>
              <summary>{h.question}</summary>
              <div className="accordion__body">{h.answer}</div>
            </details>
          ))}
        </div>
      </section>
      {faqs.length ? (
        <section className="split home-section" aria-labelledby="h-faq">
          <div className="split__aside">
            <h2 id="h-faq">Questions</h2>
          </div>
          <div className="accordion">
            {faqs.map((f) => (
              <details key={f.question}>
                <summary>{f.question}</summary>
                <div className="accordion__body">{f.answer}</div>
              </details>
            ))}
          </div>
        </section>
      ) : null}
      {demo ? (
        <section className="split home-section" id="demo" aria-labelledby="h-demo" style={{ scrollMarginTop: 90 }}>
          <div className="split__aside">
            <h2 id="h-demo">About this demo store</h2>
          </div>
          <div className="prose">
            <p>{DEMO_NOTICE.long}</p>
            <p>To try the card step, use the test card 4242 4242 4242 4242 with any future expiry date and any three-digit code.</p>
          </div>
        </section>
      ) : null}
      {faqLd ? <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqLd).replace(/</g, "\\u003c") }} /> : null}
    </div>
  );
}
