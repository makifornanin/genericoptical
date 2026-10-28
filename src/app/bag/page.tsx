import { BagView } from "@/components/BagView";
import { getSite } from "@/lib/api";
import { pageMetadata } from "@/lib/seo";

export const metadata = pageMetadata({ title: "Your bag", description: "Review your bag and check out for pickup in branch.", path: "/bag", noindex: true });

export default async function BagPage() {
  const site = await getSite();
  const b = site.ok ? site.data.business : null;
  return (
    <div className="wrap">
      <header className="page-head">
        <h1>Your bag</h1>
      </header>
      <BagView fmt={{ currency: b?.currency ?? "PHP", locale: b?.locale ?? "en-PH" }} orderingEnabled={site.ok && site.data.ordering.enabled} demo={site.ok && site.data.ordering.demoPayments} />
    </div>
  );
}
