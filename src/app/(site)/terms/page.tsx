import type { Metadata } from "next";
import { Suspense } from "react";
import { LegalPage } from "../legal";
import { getSite } from "../site-data";

export const metadata: Metadata = { title: "Terms of service" };

async function Terms() {
  const site = await getSite();
  if (!site) return null;
  const { biz } = site;
  const name = biz.legalName ?? biz.name;
  return (
    <LegalPage
      eyebrow="Terms"
      title="Terms of service"
      intro={<p>These terms cover appointments, orders and purchases with {name}, in branch and through this website.</p>}
      sections={[
        {
          heading: "Appointments",
          body: <p>Online bookings are requests held for you until we confirm them. Please let us know as early as possible if you need to reschedule or cancel so we can offer the slot to someone else.</p>,
        },
        {
          heading: "Prices",
          body: (
            <p>
              Prices on this website are in {biz.currency} and {biz.pricesIncludeTax ? `include ${biz.taxName}` : `exclude ${biz.taxName}`} where applicable. Prescription lens prices depend on your prescription and options; we&apos;ll quote before ordering. Prices and availability may change without notice.
            </p>
          ),
        },
        {
          heading: "Orders and deposits",
          body: (
            <p>
              Made-to-order eyewear may require a deposit. The remaining balance is due when you collect your order. Estimated ready dates are guides; lens laboratories occasionally need more time and we&apos;ll keep you informed.
            </p>
          ),
        },
        {
          heading: "Returns, refunds and warranty",
          body: (
            <p>
              Lenses made to your prescription are custom products. If something isn&apos;t right — the fit, the prescription or a defect — bring it back and we&apos;ll assess, adjust, remake or refund in line with our policy and your statutory rights. Frames carry a warranty against manufacturing defects; adjustments are free.
            </p>
          ),
        },
        {
          heading: "Payments",
          body: <p>We accept the payment methods listed in branch. Payments recorded at the counter are confirmed on your receipt; keep it for warranty claims.</p>,
        },
        {
          heading: "Contact",
          body: <p>Questions about these terms? Contact us{biz.email ? ` at ${biz.email}` : ""}{biz.phone ? ` or call ${biz.phone}` : ""}.</p>,
        },
      ]}
    />
  );
}

export default function TermsPage() {
  return (
    <Suspense fallback={<div className="h-[70vh]" />}>
      <Terms />
    </Suspense>
  );
}
