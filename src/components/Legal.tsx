import type { ReactNode } from "react";
import { LEGAL, LEGAL_DRAFT } from "@/lib/site-settings";

/* Shared layout for the Privacy and Terms pages (oc-legal). The text is DRAFT until LEGAL_DRAFT is false. */

export function LegalPage({ eyebrow, title, toc, intro, children }: { eyebrow: string; title: string; toc: { id: string; label: string }[]; intro: ReactNode; children: ReactNode }) {
  return (
    <section>
      <div className="oc-container oc-legal">
        <div className="oc-legal__grid">
          <nav className="oc-legal__toc" aria-label="On this page">
            <ol>
              {toc.map((t) => (
                <li key={t.id}>
                  <a href={`#${t.id}`}>{t.label}</a>
                </li>
              ))}
            </ol>
          </nav>
          <article className="oc-legal__article">
            <p className="oc-eyebrow">{eyebrow}</p>
            <h1 className="oc-legal__title">{title}</h1>
            {LEGAL_DRAFT ? (
              <p className="oc-notice oc-legal__draft" data-legal-draft>
                <span>
                  <strong>Draft — needs legal review.</strong> Sample text for layout. Have it reviewed for your business and jurisdiction, then set{" "}
                  <code>LEGAL_DRAFT</code> to false.
                </span>
              </p>
            ) : null}
            <p className="oc-legal__intro">{intro}</p>
            {children}
            <p className="oc-legal__updated">Last updated {LEGAL.lastUpdated}.</p>
          </article>
        </div>
      </div>
    </section>
  );
}

export function LegalSection({ id, num, title, children }: { id: string; num: number; title: string; children: ReactNode }) {
  return (
    <section className="oc-legal__section" id={id}>
      <h2 className="oc-legal__heading">
        <span className="oc-legal__num">{String(num).padStart(2, "0")}</span>
        {title}
      </h2>
      <div className="oc-legal__body">{children}</div>
    </section>
  );
}
