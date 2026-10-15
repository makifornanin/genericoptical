import type { ReactNode } from "react";
import { Container, Eyebrow } from "./site-ui";

/**
 * Plain-language starting point for legal pages. Businesses must have these reviewed for their
 * jurisdiction (for example the Philippine Data Privacy Act of 2012) before going live.
 */
export function LegalPage({ eyebrow, title, intro, sections }: { eyebrow: string; title: string; intro: ReactNode; sections: { heading: string; body: ReactNode }[] }) {
  return (
    <Container className="py-14 sm:py-20">
      <div className="grid gap-10 lg:grid-cols-[240px_1fr]">
        <nav aria-label="On this page" className="hidden lg:block">
          <ol className="sticky top-24 space-y-2 text-[13.5px] text-text-2">
            {sections.map((s, i) => (
              <li key={s.heading}>
                <a href={`#s${i + 1}`} className="hover:text-text">
                  {s.heading}
                </a>
              </li>
            ))}
          </ol>
        </nav>
        <article className="max-w-[700px]">
          <Eyebrow>{eyebrow}</Eyebrow>
          <h1 className="mt-4 font-display text-[40px] font-semibold leading-[1.05] sm:text-[50px]">{title}</h1>
          <div className="mt-6 text-[16.5px] leading-relaxed text-text-2">{intro}</div>
          {sections.map((s, i) => (
            <section key={s.heading} id={`s${i + 1}`} className="mt-12 scroll-mt-24">
              <h2 className="font-display text-[22px] font-semibold text-text">
                <span className="mr-3 font-mono text-[13px] font-normal text-text-3">{String(i + 1).padStart(2, "0")}</span>
                {s.heading}
              </h2>
              <div className="mt-3 space-y-3 text-[15.5px] leading-relaxed text-text-2 [&_li]:ml-5 [&_li]:list-disc [&_ul]:space-y-1.5">{s.body}</div>
            </section>
          ))}
        </article>
      </div>
    </Container>
  );
}
