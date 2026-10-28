import Link from "next/link";
import { Media, Unavailable } from "@/components/Sections";
import { getSite } from "@/lib/api";
import { DEMO_NOTICE } from "@/lib/content";
import { pageMetadata } from "@/lib/seo";

export const metadata = pageMetadata({ title: "About us", description: "Who we are and how we work.", path: "/about" });
export const revalidate = 60;

export default async function AboutPage() {
  const site = await getSite();
  if (!site.ok) return <Unavailable reason={site.reason} what="This page" />;
  const { business: b, content, branches } = site.data;
  return (
    <>
      <section className="band" style={{ marginTop: 0 }} aria-labelledby="about-title">
        <div className="band__panel" style={{ background: "var(--paper)" }}>
          <p className="eyebrow">About {b.name}</p>
          <h1 id="about-title" style={{ fontSize: "var(--t-3xl)" }}>
            {content.aboutTitle ?? `About ${b.name}`}
          </h1>
          {content.aboutBody ? <p style={{ fontSize: 17 }}>{content.aboutBody}</p> : null}
          <p className="muted">
            {branches.length} {branches.length === 1 ? "branch" : "branches"}: {branches.map((x) => x.name).join(", ")}.
          </p>
        </div>
        <div className="band__media">
          <Media name="about-bench" alt="" sizes="(min-width: 900px) 50vw, 100vw" priority />
        </div>
      </section>
      {content.values.length ? (
        <section className="wrap home-section" aria-labelledby="values-title">
          <h2 id="values-title" className="sr-only">
            How we work
          </h2>
          <ul className="strip" style={{ borderBottom: "1px solid var(--line)" }}>
            {content.values.slice(0, 4).map((v) => (
              <li key={v.title}>
                {v.title}
                <span>{v.body}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      <section className="wrap home-section" aria-labelledby="demo-title">
        <div className="split">
          <div className="split__aside">
            <h2 id="demo-title">{b.isDemo ? "About this website" : "Visit us"}</h2>
          </div>
          <div className="prose">
            {b.isDemo ? <p>{DEMO_NOTICE.long}</p> : null}
            <p>
              <Link href="/stores" className="link">
                Find a branch
              </Link>{" "}
              or{" "}
              <Link href="/contact" className="link">
                send us a message
              </Link>
              .
            </p>
          </div>
        </div>
      </section>
    </>
  );
}
