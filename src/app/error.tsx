"use client";

import Link from "next/link";

/* Last-resort boundary. Data failures are handled in the pages (friendly states); this only
   catches unexpected rendering errors so visitors never see a blank page. */
export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <section>
      <div className="oc-container oc-confirm">
        <div className="oc-confirm__card">
          <p className="oc-eyebrow">Something went wrong</p>
          <h1 className="oc-confirm__title">This page didn&apos;t load properly.</h1>
          <p className="oc-confirm__body">Please try again in a moment. If it keeps happening, call or message us and we&apos;ll help.</p>
          <div className="oc-confirm__actions">
            <button type="button" className="oc-btn oc-btn--brand" onClick={() => reset()}>
              Try again
            </button>
            <Link className="oc-btn oc-btn--outline" href="/contact">
              Contact us
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
