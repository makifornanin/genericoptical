import type { ReactNode } from "react";

/* Section head on a hairline: eyebrow with index · title + body · optional action (oc-section-head). */
export function SectionHead({ index, eyebrow, title, body, action }: { index: number; eyebrow: string; title: string; body?: string | null; action?: ReactNode }) {
  return (
    <div className="oc-section-head">
      <p className="oc-eyebrow">
        <span className="oc-eyebrow__index">{String(index).padStart(2, "0")}</span>
        {eyebrow}
      </p>
      <div className="oc-section-head__text">
        <h2 className="oc-section-head__title">{title}</h2>
        {body ? <p className="oc-section-head__body">{body}</p> : null}
      </div>
      {action ? <div className="oc-section-head__action">{action}</div> : null}
    </div>
  );
}

/* Inner-page intro (oc-intro): eyebrow, the page's h1 and an optional lead paragraph. */
export function PageIntro({ eyebrow, title, children }: { eyebrow: string; title: string; children?: ReactNode }) {
  return (
    <section className="oc-intro">
      <div className="oc-container oc-intro__inner">
        <p className="oc-eyebrow">{eyebrow}</p>
        <h1 className="oc-intro__title">{title}</h1>
        {children ? <p className="oc-intro__body">{children}</p> : null}
      </div>
    </section>
  );
}
