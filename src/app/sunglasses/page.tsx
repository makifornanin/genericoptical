import { CollectionPage } from "@/components/CollectionPage";
import { pageMetadata } from "@/lib/seo";

export const metadata = pageMetadata({ title: "Sunglasses", description: "Shop sunglasses online and collect in branch.", path: "/sunglasses" });

export default function Page(props: PageProps<"/sunglasses">) {
  return <CollectionPage collectionKey="sunglasses" searchParams={props.searchParams} />;
}
