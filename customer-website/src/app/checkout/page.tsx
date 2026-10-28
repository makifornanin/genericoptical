import Link from "next/link";
import { CheckoutForm } from "@/components/CheckoutForm";
import { Unavailable } from "@/components/Sections";
import { getSite } from "@/lib/api";
import { pageMetadata } from "@/lib/seo";

export const metadata = pageMetadata({ title: "Checkout", description: "Collect in branch. Pay online or at pickup.", path: "/checkout", noindex: true });

export default async function CheckoutPage() {
  const site = await getSite();
  if (!site.ok) return <Unavailable reason={site.reason} what="Checkout" />;
  const b = site.data.business;
  if (!site.data.ordering.enabled) {
    return (
      <div className="wrap empty">
        <h2>Online ordering is paused</h2>
        <p>Please visit a branch or send us a message, and we&apos;ll help you there.</p>
        <p style={{ marginTop: 20 }}>
          <Link href="/stores" className="btn btn--primary">
            Find a branch
          </Link>
        </p>
      </div>
    );
  }
  return (
    <div className="wrap">
      <header className="page-head" style={{ paddingBottom: 24 }}>
        <h1>Checkout</h1>
        <p>Collect in branch, fitted for you. {site.data.ordering.demoPayments ? "This is a demo store: the card step is simulated and nothing is charged." : ""}</p>
      </header>
      <CheckoutForm fmt={{ currency: b.currency, locale: b.locale }} branches={site.data.branches} demoPayments={site.data.ordering.demoPayments && site.data.ordering.paymentOptions.includes("demo_card")} businessName={b.name} />
    </div>
  );
}
