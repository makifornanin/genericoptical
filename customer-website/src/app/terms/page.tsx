import { getSite } from "@/lib/api";
import { pageMetadata } from "@/lib/seo";

export const metadata = pageMetadata({ title: "Terms", description: "Terms for orders placed on this website.", path: "/terms" });
export const revalidate = 3600;

export default async function TermsPage() {
  const site = await getSite();
  const b = site.ok ? site.data.business : null;
  return (
    <div className="wrap legal">
      <header className="page-head">
        <h1>Terms</h1>
      </header>
      <p className="notice notice--warn">Draft for review: have these terms checked by a lawyer before using them with real customers.</p>
      {b?.isDemo ? (
        <>
          <h2>Demonstration store</h2>
          <p>This website demonstrates online ordering for an optical shop. The business, branches and products are fictional. Orders are recorded in the shop&apos;s system, but the online card step is simulated: no payment is taken and no goods are supplied.</p>
        </>
      ) : null}
      <h2>Orders</h2>
      <p>When you place an order we set the items aside at your chosen branch. Prices are shown in {b?.currency ?? "local currency"} and include {b?.taxName ?? "tax"}. If a price changes before you check out, we show you the new total before you confirm.</p>
      <h2>Prescription lenses</h2>
      <p>Lenses are made to the prescription you give us. Our optometrist checks it before lenses are ordered and contacts you if anything is unclear, out of date or doesn&apos;t match the lenses you chose.</p>
      <h2>Collection</h2>
      <p>We contact you when your order is ready. Please bring a photo ID; we fit and adjust your glasses when you collect them.</p>
      <h2>Payment</h2>
      <p>Pay online at checkout or in branch at pickup. Orders paid at pickup can be cancelled from your order page until we start preparing them.</p>
      <h2>Contact</h2>
      <p>{b?.legalName ?? b?.name ?? "We"}{b?.address ? `, ${b.address}` : ""}{b?.email ? ` · ${b.email}` : ""}{b?.phone ? ` · ${b.phone}` : ""}</p>
    </div>
  );
}
