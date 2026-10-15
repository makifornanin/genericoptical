import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { getSite } from "../site-data";
import { Container, PageIntro, siteButton } from "../site-ui";

export const metadata: Metadata = { title: "Frequently asked questions" };

async function Faqs() {
  const site = await getSite();
  if (!site) return null;
  const faqs = site.biz.websiteContent.faqs ?? [];
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqs.map((q) => ({ "@type": "Question", name: q.question, acceptedAnswer: { "@type": "Answer", text: q.answer } })),
  };
  return (
    <Container className="grid gap-12 py-14 lg:grid-cols-[1fr_320px]">
      {faqs.length ? (
        <>
          <div className="divide-y divide-line border-y border-line">
            {faqs.map((q, i) => (
              <details key={q.question} className="group py-5" open={i === 0}>
                <summary className="flex cursor-pointer list-none items-start justify-between gap-6 font-display text-[19px] font-semibold text-text [&::-webkit-details-marker]:hidden">
                  {q.question}
                  <span aria-hidden className="mt-0.5 text-[22px] font-normal leading-none text-text-3 transition-transform group-open:rotate-45">
                    +
                  </span>
                </summary>
                <p className="mt-3 max-w-[680px] text-[15.5px] leading-relaxed text-text-2">{q.answer}</p>
              </details>
            ))}
          </div>
          <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />
        </>
      ) : (
        <p className="text-[15px] text-text-2">No questions published yet.</p>
      )}
      <aside className="h-fit rounded-[20px] border border-line bg-surface p-6">
        <p className="font-display text-[20px] font-semibold">Still have a question?</p>
        <p className="mt-2 text-[14px] leading-relaxed text-text-2">Send us a message and we&apos;ll get back to you, usually within one business day.</p>
        <Link href="/contact" className={`${siteButton("brand")} mt-5`}>
          Contact us
        </Link>
      </aside>
    </Container>
  );
}

export default function FaqPage() {
  return (
    <>
      <PageIntro eyebrow="FAQ" title="Questions, answered." />
      <Suspense fallback={<div className="h-[60vh]" />}>
        <Faqs />
      </Suspense>
    </>
  );
}
