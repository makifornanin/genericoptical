import { CollectionPage } from "@/components/CollectionPage";
import { pageMetadata } from "@/lib/seo";

export const metadata = pageMetadata({ title: "Contact lenses", description: "Shop contact lenses online and collect in branch.", path: "/contact-lenses" });

export default function Page(props: PageProps<"/contact-lenses">) {
  return <CollectionPage collectionKey="contact-lenses" searchParams={props.searchParams} />;
}
