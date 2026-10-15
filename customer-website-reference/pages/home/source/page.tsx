import { ArrowRight, ArrowUpRight, Clock, MapPin, Phone } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";
import { cn } from "@/lib/cn";
import { formatter } from "@/lib/format";
import { getShowcase, getSite } from "./site-data";
import { Container, Eyebrow, groupedHours, openStatus, ProductArt, SectionHead, siteButton } from "./site-ui";

async function Home() {
  const site = await getSite();
  if (!site) return null;
  const { biz, branches, types } = site;
  const w = biz.websiteContent;
  const f = formatter(biz);
  const showcase = await getShowcase(biz.id);
  const featured = pickFeatured(showcase, 8);
  const heroArt = pickHero(featured);
  const examType = types.find((t) => t.requiresPractitioner) ?? types[0];

  return (
    <>
      {/* Hero */}
      <section className="border-b border-line">
        <Container className="grid gap-12 py-14 sm:py-20 lg:grid-cols-[1.15fr_1fr] lg:items-center lg:gap-16">
          <div>
            <Eyebrow>{w.heroEyebrow ?? biz.tagline ?? "Eye care & eyewear"}</Eyebrow>
            <h1 className="mt-5 font-display text-[44px] font-semibold leading-[1.02] text-text sm:text-[64px]">{w.heroTitle ?? biz.name}</h1>
            {w.heroBody ? <p className="mt-6 max-w-[560px] text-[17px] leading-relaxed text-text-2">{w.heroBody}</p> : null}
            <div className="mt-9 flex flex-wrap gap-3">
              <Link href="/book" className={siteButton("brand", "lg")}>
                Book an eye exam <ArrowRight />
              </Link>
              <Link href="/eyewear" className={siteButton("outline", "lg")}>
                Browse eyewear
              </Link>
            </div>
            <dl className="mt-12 grid max-w-[560px] grid-cols-3 gap-px overflow-hidden rounded-[16px] border border-line bg-line">
              <div className="bg-surface px-4 py-4">
                <dt className="text-[12px] text-text-3">Branches</dt>
                <dd className="mt-1 font-display text-[26px] font-semibold tabular">{branches.length}</dd>
              </div>
              <div className="bg-surface px-4 py-4">
                <dt className="text-[12px] text-text-3">Frames & eyewear</dt>
                <dd className="mt-1 font-display text-[26px] font-semibold tabular">{showcase.filter((p) => p.categoryKind === "frames" || p.categoryKind === "sunglasses").length}</dd>
              </div>
              <div className="bg-surface px-4 py-4">
                <dt className="text-[12px] text-text-3">{examType ? "Eye exam" : "Services online"}</dt>
                <dd className="mt-1 font-display text-[26px] font-semibold tabular">{examType ? `${examType.durationMinutes} min` : types.length}</dd>
              </div>
            </dl>
          </div>

          <div className="relative grid grid-cols-2 gap-3 sm:gap-4">
            {heroArt[0] ? (
              <Link href={`/eyewear/${heroArt[0].id}`} className="group col-span-2">
                <ProductArt src={heroArt[0].imageUrl} alt={heroArt[0].name} className="aspect-[16/10] rounded-[24px]" />
              </Link>
            ) : null}
            {heroArt.slice(1).map((p) => (
              <Link key={p.id} href={`/eyewear/${p.id}`} className="group">
                <ProductArt src={p.imageUrl} alt={p.name} className="rounded-[20px]" />
                <p className="mt-2 text-[13px] font-medium text-text">{p.name}</p>
                <p className="text-[12.5px] text-text-3">from {f.money(p.minPrice)}</p>
              </Link>
            ))}
          </div>
        </Container>
      </section>

      {/* Services */}
      {types.length ? (
        <section>
          <Container className="py-20">
            <SectionHead
              index="01"
              eyebrow="Services"
              title="Care that starts with a proper examination."
              body="Every service below can be booked online. Durations are what we actually schedule, so you'll never be rushed."
              action={
                <Link href="/services" className="inline-flex items-center gap-1.5 text-[14px] font-medium text-text hover:underline">
                  All services <ArrowRight className="size-4" />
                </Link>
              }
            />
            <ol className="divide-y divide-line border-y border-line">
              {types.map((t, i) => (
                <li key={t.id} className="grid gap-2 py-5 sm:grid-cols-[60px_1fr_140px_140px_auto] sm:items-center sm:gap-6">
                  <span className="font-mono text-[13px] text-text-3">{String(i + 1).padStart(2, "0")}</span>
                  <div>
                    <p className="font-display text-[20px] font-semibold text-text">{t.name}</p>
                    {t.description ? <p className="mt-1 max-w-[520px] text-[14px] leading-relaxed text-text-2">{t.description}</p> : null}
                  </div>
                  <p className="flex items-center gap-1.5 text-[14px] text-text-2">
                    <Clock className="size-4 text-text-3" aria-hidden /> {t.durationMinutes} minutes
                  </p>
                  <p className="text-[14px] font-medium text-text tabular">{t.priceCents ? f.money(t.priceCents) : t.priceCents === 0 ? "Free" : "Price on request"}</p>
                  <Link href={`/book?type=${t.id}`} className="inline-flex items-center gap-1 text-[14px] font-medium text-text underline decoration-line-strong underline-offset-4 hover:decoration-text">
                    Book <ArrowUpRight className="size-3.5" />
                  </Link>
                </li>
              ))}
            </ol>
          </Container>
        </section>
      ) : null}

      {/* Eyewear */}
      {featured.length ? (
        <section className="bg-surface">
          <Container className="py-20">
            <SectionHead
              index="02"
              eyebrow="Eyewear"
              title="Frames chosen for fit, not just fashion."
              body="A considered selection across shapes and materials. Try anything on in branch — our opticians will check the fit to your face and prescription."
              action={
                <Link href="/eyewear" className="inline-flex items-center gap-1.5 text-[14px] font-medium text-text hover:underline">
                  See all eyewear <ArrowRight className="size-4" />
                </Link>
              }
            />
            <ul className="grid grid-cols-2 gap-x-4 gap-y-10 md:grid-cols-4">
              {featured.map((p) => (
                <li key={p.id}>
                  <Link href={`/eyewear/${p.id}`} className="group block">
                    <ProductArt src={p.imageUrl} alt={p.name} />
                    <div className="mt-3 flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-[14.5px] font-medium text-text">{p.name}</p>
                        <p className="truncate text-[13px] text-text-3">{[p.brand, p.category].filter(Boolean).join(" · ")}</p>
                      </div>
                      <p className="shrink-0 text-[14px] text-text tabular">{f.money(p.minPrice)}</p>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          </Container>
        </section>
      ) : null}

      {/* About */}
      <section>
        <Container className="py-20">
          <SectionHead index="03" eyebrow="Our approach" title={w.aboutTitle ?? `About ${biz.name}`} body={w.aboutBody ?? biz.description ?? undefined} />
          {w.values?.length ? (
            <ul className="grid gap-px overflow-hidden rounded-[20px] border border-line bg-line sm:grid-cols-2 lg:grid-cols-4">
              {w.values.map((v, i) => (
                <li key={v.title} className="bg-surface p-6">
                  <span className="font-mono text-[12px] text-text-3">{String(i + 1).padStart(2, "0")}</span>
                  <p className="mt-6 font-display text-[19px] font-semibold text-text">{v.title}</p>
                  <p className="mt-2 text-[14px] leading-relaxed text-text-2">{v.body}</p>
                </li>
              ))}
            </ul>
          ) : null}
        </Container>
      </section>

      {/* Branches */}
      {branches.length ? (
        <section>
          <Container className="pb-20">
            <SectionHead index="04" eyebrow="Visit us" title={branches.length > 1 ? `${branches.length} branches, one standard of care.` : "Visit the clinic."} />
            <ul className={cn("grid gap-4", branches.length > 1 && "md:grid-cols-2 lg:grid-cols-3")}>
              {branches.map((br) => {
                const hours = br.businessHours ?? biz.businessHours;
                const status = openStatus(hours, biz.timezone);
                return (
                  <li key={br.id} className="flex flex-col rounded-[20px] border border-line bg-surface p-6">
                    <div className="flex items-center justify-between gap-3">
                      <p className="font-display text-[22px] font-semibold text-text">{br.name}</p>
                      <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] font-medium", status.open ? "bg-pos-soft text-pos" : "bg-muted-soft text-text-2")}>
                        <span aria-hidden className={cn("size-1.5 rounded-full", status.open ? "bg-pos" : "bg-text-3")} />
                        {status.open ? "Open" : "Closed"}
                      </span>
                    </div>
                    <p className="mt-1 text-[13px] text-text-3">{status.label}</p>
                    <div className="mt-5 space-y-2 text-[14px] text-text-2">
                      <p className="flex gap-2">
                        <MapPin className="mt-0.5 size-4 shrink-0 text-text-3" aria-hidden />
                        <span>{[br.addressLine1, br.addressLine2, br.city].filter(Boolean).join(", ")}</span>
                      </p>
                      {br.phone ? (
                        <p className="flex gap-2">
                          <Phone className="mt-0.5 size-4 shrink-0 text-text-3" aria-hidden />
                          <a href={`tel:${br.phone.replace(/\s/g, "")}`} className="hover:underline">
                            {br.phone}
                          </a>
                        </p>
                      ) : null}
                    </div>
                    <ul className="mt-5 space-y-1 border-t border-line pt-4 text-[13px] text-text-2">
                      {groupedHours(hours).map((g) => (
                        <li key={g.days} className="flex justify-between gap-4">
                          <span>{g.days}</span>
                          <span className="tabular text-text">{g.text}</span>
                        </li>
                      ))}
                    </ul>
                    <div className="mt-auto flex gap-2 pt-6">
                      <Link href={`/book?branch=${br.id}`} className={cn(siteButton("brand"), "flex-1")}>
                        Book here
                      </Link>
                      {br.mapUrl ? (
                        <a href={br.mapUrl} target="_blank" rel="noreferrer" className={siteButton("outline")}>
                          Map
                        </a>
                      ) : null}
                    </div>
                  </li>
                );
              })}
            </ul>
          </Container>
        </section>
      ) : null}

      {/* FAQ teaser + CTA */}
      <section>
        <Container>
          <div className="grid overflow-hidden rounded-[28px] bg-brand text-brand-ink lg:grid-cols-[1fr_1.1fr]">
            <div className="p-8 sm:p-12">
              <Eyebrow className="text-current opacity-60">Ready when you are</Eyebrow>
              <h2 className="mt-4 font-display text-[34px] font-semibold leading-[1.08] sm:text-[44px]">Book your next eye exam online.</h2>
              <p className="mt-4 max-w-[440px] text-[16px] leading-relaxed opacity-80">Pick a branch, a service and a time that suits you. We&apos;ll confirm by phone or email.</p>
              <div className="mt-8 flex flex-wrap gap-3">
                <Link href="/book" className={siteButton("accent", "lg")}>
                  Book an appointment <ArrowRight />
                </Link>
                <Link href="/contact" className={siteButton("light", "lg")}>
                  Ask a question
                </Link>
              </div>
            </div>
            {w.faqs?.length ? (
              <div className="border-t border-current/15 p-8 sm:p-12 lg:border-l lg:border-t-0">
                <Eyebrow className="text-current opacity-60">Common questions</Eyebrow>
                <div className="mt-4 divide-y divide-current/15">
                  {w.faqs.slice(0, 4).map((q) => (
                    <details key={q.question} className="group py-4">
                      <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-[15.5px] font-medium [&::-webkit-details-marker]:hidden">
                        {q.question}
                        <span aria-hidden className="text-[20px] leading-none opacity-60 transition-transform group-open:rotate-45">
                          +
                        </span>
                      </summary>
                      <p className="mt-3 text-[14.5px] leading-relaxed opacity-80">{q.answer}</p>
                    </details>
                  ))}
                </div>
                <Link href="/faq" className="mt-4 inline-flex items-center gap-1.5 text-[14px] font-medium hover:underline">
                  All questions <ArrowRight className="size-4" />
                </Link>
              </div>
            ) : null}
          </div>
        </Container>
      </section>

    </>
  );
}

/**
 * A varied selection: one product per shape, interleaving frames and sunglasses, so the grid shows
 * range rather than eight similar frames.
 */
function pickFeatured<T extends { id: string; categoryKind: string; shape?: string; imageUrl: string | null }>(items: T[], n: number) {
  const byKind = (kind: string) => {
    const seen = new Set<string>();
    return items.filter((p) => p.categoryKind === kind && p.imageUrl && !seen.has(p.shape ?? p.id) && seen.add(p.shape ?? p.id));
  };
  const frames = byKind("frames");
  const sun = byKind("sunglasses");
  const out: T[] = [];
  // Roughly three frames for every sunglass.
  while (out.length < n && (frames.length || sun.length)) {
    const takeSun = sun.length && (out.length % 4 === 3 || !frames.length);
    const next = takeSun ? sun.shift() : frames.shift();
    if (next) out.push(next);
  }
  return out;
}

/** Three hero images in different colourways (image names end in the colourway). */
function pickHero<T extends { imageUrl: string | null }>(items: T[]) {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const p of items) {
    const colour = p.imageUrl?.match(/-([a-z]+)\.\w+$/)?.[1] ?? p.imageUrl ?? "";
    if (!p.imageUrl || seen.has(colour)) continue;
    seen.add(colour);
    out.push(p);
    if (out.length === 3) break;
  }
  return out;
}

export default function HomePage() {
  return (
    <Suspense>
      <Home />
    </Suspense>
  );
}
