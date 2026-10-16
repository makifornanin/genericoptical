import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Page not found", robots: { index: false, follow: false } };

export default function NotFound() {
  return (
    <section>
      <div className="oc-container oc-confirm">
        <div className="oc-confirm__card">
          <p className="oc-eyebrow">Not found</p>
          <h1 className="oc-confirm__title">We couldn&apos;t find that page.</h1>
          <p className="oc-confirm__body">It may have moved, or a product may no longer be listed online. Try the eyewear page, or ask us — we may have it in branch.</p>
          <div className="oc-confirm__actions">
            <Link className="oc-btn oc-btn--brand" href="/eyewear">
              Browse eyewear
            </Link>
            <Link className="oc-btn oc-btn--outline" href="/">
              Back to home
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
