import "@/styles/pages/faq.css";
import type { Metadata } from "next";
import Link from "next/link";
import { ApiState } from "@/components/ApiState";
import { PageIntro } from "@/components/SectionHead";
import { getSite } from "@/lib/api";
import { pageMetadata } from "@/lib/seo";
import { REPLY_TIME } from "@/lib/site-settings";

export const revalidate = 60;

export const metadata: Metadata = pageMetadata({
  title: "Frequently asked questions",
  description: "Appointments, prescription turnaround, payment methods, contact lenses and frame warranty — answered.",
  path: "/faq",
});

/** Serialise JSON-LD safely inside a <script> element. */
function jsonLd(data: unknown): string {
  return JSON.stringify(data).replace(/</g, "\\u003c").replace(/>/g, "\\u003e").replace(/&/g, "\\u0026");
}

export default async function FaqPage() {
  const result = await getSite();
  const faqs = result.ok ? result.data.content.faqs : [];

  return (
    <>
      <PageIntro eyebrow="FAQ" title="Questions, answered." />
      {!result.ok ? <ApiState reason={result.reason} what="Our frequently asked questions" /> : null}
      {result.ok ? (
        <section>
          <div className="oc-container oc-faq">
            <div className="oc-faq__list">
              {faqs.length ? (
                faqs.map((f, i) => (
                  <details key={f.question} open={i === 0}>
                    <summary>
                      {f.question}{" "}
                      <span className="oc-plus" aria-hidden="true">
                        +
                      </span>
                    </summary>
                    <p className="oc-faq__answer">{f.answer}</p>
                  </details>
                ))
              ) : (
                <p className="oc-faq__answer">
                  No questions published yet —{" "}
                  <Link className="oc-text-link" href="/contact">
                    ask us directly
                  </Link>
                  .
                </p>
              )}
            </div>
            <aside className="oc-aside-card" aria-labelledby="oc-faq-aside-title">
              <h2 className="oc-aside-card__title" id="oc-faq-aside-title">
                Still have a question?
              </h2>
              <p className="oc-aside-card__body">Send us a message and we&apos;ll get back to you, {REPLY_TIME}.</p>
              <Link className="oc-btn oc-btn--brand" href="/contact">
                Contact us
              </Link>
            </aside>
          </div>
          {faqs.length ? (
            <script
              type="application/ld+json"
              id="oc-faq-jsonld"
              dangerouslySetInnerHTML={{
                __html: jsonLd({
                  "@context": "https://schema.org",
                  "@type": "FAQPage",
                  mainEntity: faqs.map((f) => ({ "@type": "Question", name: f.question, acceptedAnswer: { "@type": "Answer", text: f.answer } })),
                }),
              }}
            />
          ) : null}
        </section>
      ) : null}
    </>
  );
}
