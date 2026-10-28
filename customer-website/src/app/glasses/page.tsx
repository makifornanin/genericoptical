import { CollectionPage } from "@/components/CollectionPage";
import { pageMetadata } from "@/lib/seo";

export const metadata = pageMetadata({ title: "Glasses", description: "Shop glasses online and collect in branch.", path: "/glasses" });

export default function Page(props: PageProps<"/glasses">) {
  return <CollectionPage collectionKey="glasses" searchParams={props.searchParams} />;
}
