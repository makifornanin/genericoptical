import type { Metadata } from "next";
import { LegalPage, LegalSection } from "@/components/Legal";
import { getSite } from "@/lib/api";
import { telHref } from "@/lib/format";
import { pageMetadata } from "@/lib/seo";

export const revalidate = 60;

export const metadata: Metadata = pageMetadata({
  title: "Terms of service",
  description: "Terms for using this website, booking appointments and ordering eyewear.",
  path: "/terms",
});

const TOC = [
  { id: "appointments", label: "Appointments" },
  { id: "prices", label: "Prices" },
  { id: "orders", label: "Orders and deposits" },
  { id: "online", label: "Online enquiries and reservations" },
  { id: "returns", label: "Returns, refunds and warranty" },
  { id: "payments", label: "Payments" },
  { id: "contact", label: "Contact" },
];

export default async function TermsPage() {
  const result = await getSite();
  const b = result.ok ? result.data.business : null;
  const legalName = b?.legalName ?? b?.name ?? "us";
  const tax = b?.taxName ? (b.pricesIncludeTax ? ` and include ${b.taxName} where applicable` : ` and exclude ${b.taxName}`) : "";

  return (
    <LegalPage
      eyebrow="Terms"
      title="Terms of service"
      toc={TOC}
      intro={<>These terms cover appointments, orders and purchases with {legalName}, in branch and through this website.</>}
    >
      <LegalSection id="appointments" num={1} title="Appointments">
        <p>
          Online bookings are made through our booking calendar and confirmed by email or text. An appointment request sent with a form is not a booking until we
          confirm a time with you. Please let us know as early as possible if you need to reschedule or cancel so we can offer the slot to someone else.
        </p>
      </LegalSection>
      <LegalSection id="prices" num={2} title="Prices">
        <p>
          Prices on this website are in {b?.currency ?? "local currency"}
          {tax}. Prescription lens prices depend on your prescription and options; we&apos;ll quote before ordering. Prices and availability may change without notice,
          and stock differs by branch.
        </p>
      </LegalSection>
      <LegalSection id="orders" num={3} title="Orders and deposits">
        <p>
          Made-to-order eyewear may require a deposit. The remaining balance is due when you collect your order. Estimated ready dates are guides; lens laboratories
          occasionally need more time and we&apos;ll keep you informed.
        </p>
      </LegalSection>
      <LegalSection id="online" num={4} title="Online enquiries and reservations">
        <p>
          Products can&apos;t be bought on this website. When you ask about an item we&apos;ll confirm its availability and can reserve it for you to try in branch; the
          sale happens in branch. Availability shown online is updated regularly but can change at any moment.
        </p>
      </LegalSection>
      <LegalSection id="returns" num={5} title="Returns, refunds and warranty">
        <p>
          Lenses made to your prescription are custom products. If something isn&apos;t right — the fit, the prescription or a defect — bring it back and we&apos;ll
          assess, adjust, remake or refund in line with our policy and your statutory rights. Frames carry a warranty against manufacturing defects; adjustments are
          free.
        </p>
      </LegalSection>
      <LegalSection id="payments" num={6} title="Payments">
        <p>We accept the payment methods listed in branch. Payments made at the counter are confirmed on your receipt; keep it for warranty claims.</p>
      </LegalSection>
      <LegalSection id="contact" num={7} title="Contact">
        <p>
          Questions about these terms?
          {b?.email ? (
            <>
              {" "}
              Email <a href={`mailto:${b.email}`}>{b.email}</a>
            </>
          ) : null}
          {b?.email && b?.phone ? " or call " : b?.phone ? " Call " : ""}
          {b?.phone ? <a href={telHref(b.phone)}>{b.phone}</a> : null}
          {b?.email || b?.phone ? "." : " Contact us through this website."}
        </p>
      </LegalSection>
    </LegalPage>
  );
}
