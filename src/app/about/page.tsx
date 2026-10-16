import "@/styles/pages/about.css";
import type { Metadata } from "next";
import Link from "next/link";
import { ApiState } from "@/components/ApiState";
import { HoursRows } from "@/components/HoursRows";
import { SectionHead } from "@/components/SectionHead";
import { getSite } from "@/lib/api";
import { telHref } from "@/lib/format";
import { pageMetadata } from "@/lib/seo";
import { DEFAULT_COPY } from "@/lib/site-settings";

export const revalidate = 60;

export const metadata: Metadata = pageMetadata({
  title: "About us",
  description: "How we work: thorough exams, honest guidance, made-to-measure lenses and aftercare included.",
  path: "/about",
});

export default async function AboutPage() {
  const result = await getSite();
  const site = result.ok ? result.data : null;
  const c = site?.content;
  const paragraphs = (c?.aboutBody ?? DEFAULT_COPY.aboutBody).split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
  const values = c?.values.length ? c.values : DEFAULT_COPY.values;

  return (
    <>
      <section className="oc-about-hero">
        <div className="oc-container oc-about-hero__inner">
          <div>
            <p className="oc-eyebrow">About {site?.business.name ?? "us"}</p>
            <h1 className="oc-intro__title">{c?.aboutTitle ?? DEFAULT_COPY.aboutTitle}</h1>
          </div>
          <div className="oc-about-hero__copy">
            {paragraphs.map((p, i) => (
              <p key={i}>{p}</p>
            ))}
          </div>
        </div>
      </section>

      <section>
        <div className="oc-container oc-section">
          <SectionHead index={1} eyebrow="What to expect" title="How we work" />
          <ol className="oc-how">
            {values.map((v, i) => (
              <li key={v.title}>
                <span className="oc-how__num">{String(i + 1).padStart(2, "0")}</span>
                <div>
                  <h3 className="oc-how__title">{v.title}</h3>
                  {v.body ? <p className="oc-how__body">{v.body}</p> : null}
                </div>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section>
        <div className="oc-container oc-section oc-section--tight-top">
          <SectionHead
            index={2}
            eyebrow="Where to find us"
            title="Our branches"
            action={
              <Link className="oc-btn oc-btn--brand" href="/book">
                Book a visit
              </Link>
            }
          />
          {site && site.branches.length ? (
            <ul className="oc-branch-strip">
              {site.branches.map((b) => (
                <li key={b.id}>
                  <h3 className="oc-branch-strip__name">{b.name}</h3>
                  {b.address.length ? <p className="oc-branch-strip__address">{b.address.join(", ")}</p> : null}
                  {b.phone ? (
                    <p className="oc-branch-strip__address">
                      <a href={telHref(b.phone)}>{b.phone}</a>
                    </p>
                  ) : null}
                  <ul className="oc-branch-strip__hours">
                    <HoursRows hours={b.hours} />
                  </ul>
                </li>
              ))}
            </ul>
          ) : !result.ok ? (
            <ApiState reason={result.reason} what="Our branch list" className="" />
          ) : null}
        </div>
      </section>
    </>
  );
}
