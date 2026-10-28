import { CollectionPage } from "@/components/CollectionPage";
import { pageMetadata } from "@/lib/seo";

export const metadata = pageMetadata({ title: "Accessories & care", description: "Cases, cleaning and small parts for glasses and contact lenses. Order online and collect in branch.", path: "/accessories" });

export default function Page(props: PageProps<"/accessories">) {
  return <CollectionPage collectionKey="accessories" searchParams={props.searchParams} />;
}
