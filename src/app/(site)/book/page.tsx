import type { Metadata } from "next";
import { Suspense } from "react";
import { todayIn } from "@/lib/dates";
import { formatter } from "@/lib/format";
import { getSite } from "../site-data";
import { Container, Eyebrow, groupedHours } from "../site-ui";
import { BookingForm } from "./booking-form";

export const metadata: Metadata = { title: "Book an appointment", description: "Book an eye examination or contact lens fitting online." };

async function Booking({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const site = await getSite();
  if (!site) return null;
  const { biz, branches, types } = site;
  const f = formatter(biz);
  const sp = await searchParams;
  if (!branches.length || !types.length) {
    return <p className="text-[15px] text-text-2">Online booking isn&apos;t available right now. Please call us to book.</p>;
  }
  return (
    <div className="grid gap-10 lg:grid-cols-[1fr_320px]">
      <BookingForm
        today={todayIn(biz.timezone)}
        initialBranch={typeof sp.branch === "string" ? sp.branch : undefined}
        initialType={typeof sp.type === "string" ? sp.type : undefined}
        branches={branches.map((b) => ({ id: b.id, name: b.name, address: [b.addressLine1, b.city].filter(Boolean).join(", "), hours: b.businessHours ?? biz.businessHours }))}
        types={types.map((t) => ({ id: t.id, name: t.name, description: t.description, durationMinutes: t.durationMinutes, price: t.priceCents ? f.money(t.priceCents) : null }))}
      />
      <aside className="space-y-8 lg:pt-2">
        <div>
          <Eyebrow>How it works</Eyebrow>
          <ol className="mt-4 space-y-3 text-[14px] leading-relaxed text-text-2">
            <li>1. Request a time that suits you — slots reflect real availability.</li>
            <li>2. We hold it straight away and confirm by phone or email.</li>
            <li>3. Bring your current glasses or contact lenses, and any old prescriptions.</li>
          </ol>
        </div>
        <div>
          <Eyebrow>Opening hours</Eyebrow>
          <ul className="mt-4 space-y-1 text-[14px] text-text-2">
            {groupedHours(biz.businessHours).map((g) => (
              <li key={g.days} className="flex justify-between gap-4">
                <span>{g.days}</span>
                <span className="tabular text-text">{g.text}</span>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-[12.5px] text-text-3">Times shown in {biz.timezone.replace("_", " ")} time. Some branches keep different hours.</p>
        </div>
        {biz.phone ? (
          <div>
            <Eyebrow>Prefer to call?</Eyebrow>
            <a href={`tel:${biz.phone.replace(/\s/g, "")}`} className="mt-3 block font-display text-[22px] font-semibold text-text hover:underline">
              {biz.phone}
            </a>
          </div>
        ) : null}
      </aside>
    </div>
  );
}

export default function BookPage(props: PageProps<"/book">) {
  return (
    <>
      <section className="border-b border-line">
        <Container className="py-12 sm:py-16">
          <Eyebrow>Online booking</Eyebrow>
          <h1 className="mt-4 max-w-[760px] font-display text-[40px] font-semibold leading-[1.04] sm:text-[52px]">Book an appointment.</h1>
          <p className="mt-4 max-w-[560px] text-[17px] leading-relaxed text-text-2">Choose a branch, a service and a time. It takes about a minute.</p>
        </Container>
      </section>
      <Container className="py-12">
        <Suspense fallback={<div className="h-[600px] animate-pulse rounded-[24px] bg-muted-soft" />}>
          <Booking searchParams={props.searchParams} />
        </Suspense>
      </Container>
    </>
  );
}
