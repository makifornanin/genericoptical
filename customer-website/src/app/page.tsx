import Link from "next/link";
import { ProductTile } from "@/components/ProductTile";
import { BranchCell, Media, Unavailable } from "@/components/Sections";
import { getLenses, getProducts, getSite } from "@/lib/api";
import { COLLECTIONS, inCollection, label, SHAPE_LABELS } from "@/lib/catalog";
import { money, plural, servicePrice } from "@/lib/format";
import { productImage } from "@/lib/media";
import { byShape, minPrice, varied } from "@/lib/merch";
import { Picture } from "@/components/Picture";

export const revalidate = 60;

export default async function HomePage() {
  const [siteRes, productsRes, lensesRes] = await Promise.all([getSite(), getProducts(), getLenses()]);
  if (!siteRes.ok) return <Unavailable reason={siteRes.reason} what="Our website" />;
  const site = siteRes.data;
  const b = site.business;
  const fmt = { currency: b.currency, locale: b.locale };
  const products = productsRes.ok ? productsRes.data : [];
  const frames = products.filter((p) => inCollection(p, COLLECTIONS.glasses));
  const sun = products.filter((p) => inCollection(p, COLLECTIONS.sunglasses));
  const featured = varied(frames, 4);
  const shapes = byShape(frames, ["rectangle", "round", "square", "cateye", "aviator", "oval"]);
  const frameFrom = minPrice(frames);
  const lensFrom = lensesRes.ok && lensesRes.data.length ? Math.min(...lensesRes.data.map((l) => l.priceCents)) : null;
  const exam = site.services.find((s) => s.code.includes("exam")) ?? site.services[0] ?? null;
  const heroFrame = featured[0];
  const heroSun = varied(sun, 1)[0];
  const now = new Date();

  return (
    <>
      <section className="hero" aria-label="Collections">
        <Link href="/glasses" className="hero__panel">
          <Media name="hero-glasses" alt="" sizes="(min-width: 760px) 50vw, 100vw" product={heroFrame ? { slug: heroFrame.slug, view: "angle" } : undefined} priority />
          <div className="hero__caption is-dark">
            <h2>Prescription glasses</h2>
            <span className="btn btn--light">Shop glasses</span>
          </div>
        </Link>
        <Link href="/sunglasses" className="hero__panel">
          <Media name="hero-sunglasses" alt="" sizes="(min-width: 760px) 50vw, 100vw" product={heroSun ? { slug: heroSun.slug, view: "angle" } : undefined} priority />
          <div className="hero__caption is-dark">
            <h2>Sunglasses</h2>
            <span className="btn btn--light">Shop sunglasses</span>
          </div>
        </Link>
      </section>

      <section className="wrap intro">
        <p className="eyebrow">{b.tagline ?? b.name}</p>
        <div>
          <h1>{site.content.heroTitle ?? `${b.name}: eye exams and eyewear`}</h1>
          {site.content.heroBody ? <p style={{ marginTop: 18 }}>{site.content.heroBody}</p> : null}
          <div className="intro__actions" style={{ marginTop: 26 }}>
            <Link href="/eye-exam" className="btn btn--primary">
              Book an eye exam
            </Link>
            <Link href="/stores" className="btn btn--secondary">
              Find a branch
            </Link>
          </div>
        </div>
      </section>

      {featured.length ? (
        <section className="wrap home-section" aria-labelledby="home-glasses">
          <div className="section-head">
            <div>
              <h2 id="home-glasses">Glasses</h2>
              {frameFrom !== null ? (
                <p>
                  Frames from {money(frameFrom, fmt)}
                  {lensFrom !== null ? `, prescription lenses from ${money(lensFrom, fmt)}` : ""}. Order online and collect in branch, fitted for you.
                </p>
              ) : null}
            </div>
            <Link href="/glasses" className="arrow-link">
              All {plural(frames.length, ["frame", "frames"])}
            </Link>
          </div>
          <div className="grid grid--4">
            {featured.map((p) => (
              <ProductTile key={p.id} product={p} fmt={fmt} />
            ))}
          </div>
        </section>
      ) : null}

      <section className="duo" aria-label="More to shop">
        <Link href="/sunglasses" className="duo__cell">
          <Media name="duo-sunglasses" alt="" sizes="(min-width: 760px) 50vw, 100vw" product={heroSun ? { slug: heroSun.slug, view: "front" } : undefined} />
          <div className="hero__caption is-dark">
            <p>Sunglasses with UV400 lenses</p>
            <span className="btn btn--light">Shop sunglasses</span>
          </div>
        </Link>
        <Link href="/contact-lenses" className="duo__cell">
          <Media name="duo-contacts" alt="" sizes="(min-width: 760px) 50vw, 100vw" />
          <div className="hero__caption is-dark">
            <p>Contact lenses &amp; care</p>
            <span className="btn btn--light">Shop lenses</span>
          </div>
        </Link>
      </section>

      {shapes.length ? (
        <section className="best" aria-labelledby="home-shapes">
          <div className="best__grid">
            <div className="best__title">
              <h2 id="home-shapes">Find your shape</h2>
              <Link href="/glasses" className="btn btn--secondary" style={{ alignSelf: "flex-start" }}>
                See every frame
              </Link>
            </div>
            {shapes.slice(0, 5).map(({ shape, product, count }) => (
              <Link key={shape} href={`/glasses?shape=${shape}`} className="best__cell tile">
                <div className="tile__media">
                  <Picture image={productImage(product.slug, null, "front")} fallback={product.imageUrl} alt="" sizes="(min-width: 900px) 33vw, 50vw" />
                </div>
                <div className="tile__info">
                  <div className="tile__row">
                    <span>{label(SHAPE_LABELS, shape)}</span>
                  </div>
                  <div className="tile__sub">{plural(count, ["frame", "frames"])}</div>
                </div>
              </Link>
            ))}
            <div className="best__detail">
              <Media name="detail-hinge" alt="" sizes="(min-width: 900px) 66vw, 100vw" product={featured[1] ? { slug: featured[1].slug, view: "side" } : undefined} />
            </div>
            {shapes[5] ? (
              <Link href={`/glasses?shape=${shapes[5].shape}`} className="best__cell tile">
                <div className="tile__media">
                  <Picture image={productImage(shapes[5].product.slug, null, "front")} fallback={shapes[5].product.imageUrl} alt="" sizes="(min-width: 900px) 33vw, 50vw" />
                </div>
                <div className="tile__info">
                  <div className="tile__row">
                    <span>{label(SHAPE_LABELS, shapes[5].shape)}</span>
                  </div>
                  <div className="tile__sub">{plural(shapes[5].count, ["frame", "frames"])}</div>
                </div>
              </Link>
            ) : null}
          </div>
        </section>
      ) : null}

      <section className="band" aria-labelledby="home-exam">
        <div className="band__media">
          <Media name="eye-exam" alt="" sizes="(min-width: 900px) 50vw, 100vw" />
        </div>
        <div className="band__panel">
          <h2 id="home-exam">Eye exams</h2>
          <p>{exam?.description ?? "A full check of your vision and eye health, with your prescription explained."} Book online, or walk in when an optometrist is free.</p>
          {site.services.length ? (
            <ul className="price-list">
              {site.services.map((s) => (
                <li key={s.id}>
                  <span>
                    {s.name}
                    {s.durationMinutes ? <small>{s.durationMinutes} minutes</small> : null}
                  </span>
                  <span>{servicePrice(s.priceCents, fmt)}</span>
                </li>
              ))}
            </ul>
          ) : null}
          <div>
            <Link href="/eye-exam" className="btn btn--accent">
              Book an eye exam
            </Link>
          </div>
        </div>
      </section>

      <ul className="strip wrap" style={{ marginTop: "var(--section)", paddingInline: 0 }}>
        <li>
          Order online, collect in branch
          <span>We fit and adjust your glasses at pickup</span>
        </li>
        <li>
          Lenses made to your prescription
          <span>At our partner laboratory; your order shows the ready date</span>
        </li>
        <li>
          Your prescription, your way
          <span>Type it in, send it later or book an exam</span>
        </li>
        <li>
          Pay online or at pickup
          <span>{site.ordering.demoPayments ? "Online payment is simulated in this demo" : "Card, cash, GCash or Maya in branch"}</span>
        </li>
      </ul>

      {site.branches.length ? (
        <section className="wrap home-section" aria-labelledby="home-stores">
          <div className="section-head">
            <h2 id="home-stores">Visit us</h2>
            <Link href="/stores" className="arrow-link">
              Stores &amp; hours
            </Link>
          </div>
          <div className={`cells cells--${site.branches.length >= 3 ? 3 : 2}`}>
            {site.branches.slice(0, 3).map((br) => (
              <BranchCell key={br.id} branch={br} timezone={b.timezone} now={now} />
            ))}
          </div>
        </section>
      ) : null}
    </>
  );
}
