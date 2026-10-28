import Link from "next/link";
import { BranchCell, Media, Unavailable } from "@/components/Sections";
import { getSite } from "@/lib/api";
import { pageMetadata } from "@/lib/seo";

export const metadata = pageMetadata({ title: "Stores & hours", description: "Branch addresses, opening hours and directions.", path: "/stores" });
export const revalidate = 60;

export default async function StoresPage() {
  const site = await getSite();
  if (!site.ok) return <Unavailable reason={site.reason} what="Our branches" />;
  const { business: b, branches } = site.data;
  const now = new Date();
  return (
    <>
      <div className="wrap">
        <header className="page-head">
          <h1>Stores &amp; hours</h1>
          <p>
            Try frames on, collect online orders and book eye exams at {branches.length === 1 ? "our branch" : `any of our ${branches.length} branches`}. {b.phone ? `For anything else, call ${b.phone}.` : ""}
          </p>
        </header>
        <div className={`cells cells--${branches.length >= 3 ? 3 : 2}`}>
          {branches.map((br) => (
            <BranchCell key={br.id} branch={br} timezone={b.timezone} now={now} />
          ))}
        </div>
      </div>
      <section className="band band--flip" aria-labelledby="stores-visit">
        <div className="band__media">
          <Media name="store-wall" alt="" sizes="(min-width: 900px) 50vw, 100vw" />
        </div>
        <div className="band__panel">
          <h2 id="stores-visit">In branch</h2>
          <p>See and try the full range, have your frames fitted and adjusted, and pick up orders you placed online. Optometrists see appointments first and walk-ins when they&apos;re free.</p>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <Link href="/eye-exam" className="btn btn--accent">
              Book an eye exam
            </Link>
            <Link href="/glasses" className="btn btn--secondary">
              Shop online, collect in branch
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
