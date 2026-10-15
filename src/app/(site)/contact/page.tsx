import { Mail, MapPin, Phone } from "lucide-react";
import type { Metadata } from "next";
import { Suspense } from "react";
import { InquiryForm } from "../inquiry-form";
import { getSite } from "../site-data";
import { Container, Eyebrow, PageIntro } from "../site-ui";

export const metadata: Metadata = { title: "Contact us", description: "Questions about eye exams, glasses, contact lenses or an order? Send us a message." };

async function Contact() {
  const site = await getSite();
  if (!site) return null;
  const { biz, branches } = site;
  return (
    <Container className="grid gap-12 py-14 lg:grid-cols-[1.3fr_1fr]">
      <InquiryForm branches={branches.map((b) => ({ id: b.id, name: b.name }))} />
      <aside className="space-y-10">
        <div className="space-y-3 text-[15px]">
          <Eyebrow>Reach us directly</Eyebrow>
          {biz.phone ? (
            <p className="flex items-center gap-2.5">
              <Phone className="size-4 text-text-3" aria-hidden />
              <a href={`tel:${biz.phone.replace(/\s/g, "")}`} className="hover:underline">
                {biz.phone}
              </a>
            </p>
          ) : null}
          {biz.email ? (
            <p className="flex items-center gap-2.5">
              <Mail className="size-4 text-text-3" aria-hidden />
              <a href={`mailto:${biz.email}`} className="hover:underline">
                {biz.email}
              </a>
            </p>
          ) : null}
        </div>
        {branches.map((b) => (
          <div key={b.id} className="border-t border-line pt-5">
            <p className="font-display text-[19px] font-semibold">{b.name}</p>
            <p className="mt-2 flex gap-2.5 text-[14px] leading-relaxed text-text-2">
              <MapPin className="mt-1 size-4 shrink-0 text-text-3" aria-hidden />
              {[b.addressLine1, b.addressLine2, b.city].filter(Boolean).join(", ")}
            </p>
            {b.phone ? (
              <p className="mt-1.5 flex gap-2.5 text-[14px] text-text-2">
                <Phone className="mt-0.5 size-4 shrink-0 text-text-3" aria-hidden />
                <a href={`tel:${b.phone.replace(/\s/g, "")}`} className="hover:underline">
                  {b.phone}
                </a>
              </p>
            ) : null}
          </div>
        ))}
      </aside>
    </Container>
  );
}

export default function ContactPage() {
  return (
    <>
      <PageIntro eyebrow="Contact" title="Ask us anything." body="Questions about an exam, a frame you saw, an order in progress or your contact lenses — send a message and we'll reply within one business day." />
      <Suspense fallback={<div className="h-[60vh]" />}>
        <Contact />
      </Suspense>
    </>
  );
}
