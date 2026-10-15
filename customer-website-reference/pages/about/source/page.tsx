import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { getSite } from "../site-data";
import { Container, Eyebrow, groupedHours, SectionHead, siteButton } from "../site-ui";

export const metadata: Metadata = { title: "About us" };

async function About() {
  const site = await getSite();
  if (!site) return null;
  const { biz, branches } = site;
  const w = biz.websiteContent;
  const paragraphs = (w.aboutBody ?? biz.description ?? "").split(/\n{2,}/).filter(Boolean);

  return (
    <>
      <section className="border-b border-line">
        <Container className="grid gap-10 py-14 sm:py-20 lg:grid-cols-[1fr_1.1fr] lg:gap-16">
          <div>
            <Eyebrow>About {biz.name}</Eyebrow>
            <h1 className="mt-4 font-display text-[40px] font-semibold leading-[1.04] sm:text-[56px]">{w.aboutTitle ?? `About ${biz.name}`}</h1>
          </div>
          <div className="space-y-5 text-[17px] leading-relaxed text-text-2 lg:pt-12">
            {paragraphs.map((p, i) => (
              <p key={i}>{p}</p>
            ))}
          </div>
        </Container>
      </section>

      {w.values?.length ? (
        <Container className="py-20">
          <SectionHead index="01" eyebrow="What to expect" title="How we work" />
          <ul className="grid gap-x-10 gap-y-10 sm:grid-cols-2">
            {w.values.map((v, i) => (
              <li key={v.title} className="grid grid-cols-[48px_1fr] gap-4 border-t border-line pt-5">
                <span className="font-mono text-[13px] text-text-3">{String(i + 1).padStart(2, "0")}</span>
                <div>
                  <h3 className="font-display text-[21px] font-semibold text-text">{v.title}</h3>
                  <p className="mt-2 text-[15px] leading-relaxed text-text-2">{v.body}</p>
                </div>
              </li>
            ))}
          </ul>
        </Container>
      ) : null}

      {branches.length ? (
        <Container className="pb-8">
          <SectionHead index="02" eyebrow="Where to find us" title="Our branches" action={<Link href="/book" className={siteButton("brand")}>Book a visit</Link>} />
          <ul className="grid gap-px overflow-hidden rounded-[20px] border border-line bg-line md:grid-cols-3">
            {branches.map((b) => (
              <li key={b.id} className="bg-surface p-6">
                <p className="font-display text-[20px] font-semibold">{b.name}</p>
                <p className="mt-2 text-[14px] leading-relaxed text-text-2">{[b.addressLine1, b.addressLine2, b.city].filter(Boolean).join(", ")}</p>
                <ul className="mt-4 space-y-0.5 text-[13px] text-text-2">
                  {groupedHours(b.businessHours ?? biz.businessHours).map((g) => (
                    <li key={g.days} className="flex justify-between gap-3">
                      <span>{g.days}</span>
                      <span className="tabular text-text">{g.text}</span>
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        </Container>
      ) : null}
    </>
  );
}

export default function AboutPage() {
  return (
    <Suspense fallback={<div className="h-[70vh]" />}>
      <About />
    </Suspense>
  );
}
