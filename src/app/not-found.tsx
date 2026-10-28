import Link from "next/link";

export default function NotFound() {
  return (
    <div className="wrap empty" style={{ paddingBlock: "var(--section)" }}>
      <h2>We couldn&apos;t find that page</h2>
      <p>It may have moved, or the product may no longer be available online.</p>
      <p style={{ marginTop: 20, display: "flex", gap: 10, justifyContent: "center", flexWrap: "wrap" }}>
        <Link href="/glasses" className="btn btn--primary">
          Shop glasses
        </Link>
        <Link href="/" className="btn btn--secondary">
          Home
        </Link>
      </p>
    </div>
  );
}
