import { ArrowUpRight, Clock } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { formatter } from "@/lib/format";
import { getShowcase, getSite } from "../site-data";
import { Container, PageIntro, SectionHead, siteButton } from "../site-ui";

export const metadata: Metadata = { title: "Services", description: "Eye examinations, contact lens fittings, eyewear fitting and aftercare." };

async function Services() {
  const site = await getSite();
  if (!site) return null;
  const { biz, types } = site;
  const f = formatter(biz);
  const extras = (await getShowcase(biz.id)).filter((p) => p.categoryKind === "services" || p.categoryKind === "rx_lenses");
  const services = extras.filter((p) => p.categoryKind === "services");
  const lenses = extras.filter((p) => p.categoryKind === "rx_lenses");

  return (
    <Container className="py-16">
      <SectionHead index="01" eyebrow="Book online" title="Appointments" body="Bookable online at any branch. Each slot is reserved for you and an optometrist." />
      <ul className="grid gap-4 md:grid-cols-2">
        {types.map((t) => (
          <li key={t.id} className="flex flex-col rounded-[20px] border border-line bg-surface p-6">
            <div className="flex items-start justify-between gap-4">
              <h3 className="font-display text-[22px] font-semibold leading-tight text-text">{t.name}</h3>
              <p className="shrink-0 font-display text-[18px] text-text tabular">{t.priceCents ? f.money(t.priceCents) : t.priceCents === 0 ? "Free" : ""}</p>
            </div>
            <p className="mt-1 flex items-center gap-1.5 text-[13px] text-text-3">
              <Clock className="size-3.5" aria-hidden /> {t.durationMinutes} minutes
            </p>
            {t.description ? <p className="mt-4 text-[14.5px] leading-relaxed text-text-2">{t.description}</p> : null}
            <div className="mt-auto pt-6">
              <Link href={`/book?type=${t.id}`} className={siteButton("brand")}>
                Book this <ArrowUpRight />
              </Link>
            </div>
          </li>
        ))}
      </ul>

      {lenses.length ? (
        <div className="mt-24">
          <SectionHead index="02" eyebrow="Lenses" title="Prescription lenses" body="Made to your prescription by our partner laboratory. Your optician will recommend options after your exam." />
          <PriceList items={lenses.map((l) => ({ id: l.id, name: l.name, description: l.description, price: f.money(l.minPrice), from: l.options.length > 1 }))} />
        </div>
      ) : null}

      {services.length ? (
        <div className="mt-24">
          <SectionHead index={lenses.length ? "03" : "02"} eyebrow="In branch" title="Fitting, repairs and aftercare" />
          <PriceList items={services.map((l) => ({ id: l.id, name: l.name, description: l.description, price: l.minPrice ? f.money(l.minPrice) : "Free", from: false }))} />
        </div>
      ) : null}
    </Container>
  );
}

function PriceList({ items }: { items: { id: string; name: string; description: string | null; price: string; from: boolean }[] }) {
  return (
    <ul className="divide-y divide-line border-y border-line">
      {items.map((i) => (
        <li key={i.id} className="grid gap-1 py-4 sm:grid-cols-[1fr_auto] sm:gap-8">
          <div>
            <p className="text-[15.5px] font-medium text-text">{i.name}</p>
            {i.description ? <p className="mt-0.5 max-w-[640px] text-[13.5px] leading-relaxed text-text-2">{i.description}</p> : null}
          </div>
          <p className="text-[15px] text-text tabular sm:text-right">
            {i.from ? <span className="text-text-3">from </span> : null}
            {i.price}
          </p>
        </li>
      ))}
    </ul>
  );
}

export default function ServicesPage() {
  return (
    <>
      <PageIntro eyebrow="Services" title="Thorough eye care, explained clearly." body="From comprehensive examinations to the final fitting of your glasses, here's what we offer and what it costs." />
      <Suspense fallback={<div className="h-[60vh]" />}>
        <Services />
      </Suspense>
    </>
  );
}
