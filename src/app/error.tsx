"use client";

import Link from "next/link";

export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="wrap empty" style={{ paddingBlock: "var(--section)" }} role="alert">
      <h2>Something went wrong</h2>
      <p>Please try again. If it keeps happening, call your nearest branch.</p>
      <p style={{ marginTop: 20, display: "flex", gap: 10, justifyContent: "center", flexWrap: "wrap" }}>
        <button type="button" className="btn btn--primary" onClick={reset}>
          Try again
        </button>
        <Link href="/stores" className="btn btn--secondary">
          Find a branch
        </Link>
      </p>
    </div>
  );
}
