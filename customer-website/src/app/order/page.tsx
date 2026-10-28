import { OrderLookup } from "@/components/OrderLookup";
import { pageMetadata } from "@/lib/seo";

export const metadata = pageMetadata({ title: "Find my order", description: "Check the status of an order with your order number and email.", path: "/order", noindex: true });

export default function OrderLookupPage() {
  return (
    <div className="wrap">
      <header className="page-head">
        <h1>Find my order</h1>
        <p>Enter the order number from your confirmation and the email you used at checkout.</p>
      </header>
      <OrderLookup />
    </div>
  );
}
