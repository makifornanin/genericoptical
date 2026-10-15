import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { cn } from "@/lib/cn";
import { formatter } from "@/lib/format";
import { getShowcase, getSite } from "../site-data";
import { Container, PageIntro, ProductArt } from "../site-ui";

export const metadata: Metadata = {
  title: "Eyewear",
  description: "Prescription frames, sunglasses, contact lenses and eye-care essentials.",
};

async function Catalogue({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const site = await getSite();
  if (!site) return null;
  const f = formatter(site.biz);
  const items = await getShowcase(site.biz.id);
  const sp = await searchParams;
  const categories = [...new Set(items.map((p) => p.category))];
  const active = typeof sp.category === "string" && categories.includes(sp.category) ? sp.category : null;
  const shown = active ? items.filter((p) => p.category === active) : items;

  return (
    <Container className="py-12">
      <nav aria-label="Categories" className="-mx-1 mb-10 flex gap-2 overflow-x-auto px-1 pb-1">
        {[null, ...categories].map((c) => (
          <Link
            key={c ?? "all"}
            href={c ? `/eyewear?category=${encodeURIComponent(c)}` : "/eyewear"}
            aria-current={active === c ? "page" : undefined}
            className={cn(
              "shrink-0 rounded-full border px-4 py-2 text-[13.5px] transition-colors",
              active === c ? "border-ink bg-ink text-white" : "border-line-strong bg-surface text-text-2 hover:text-text",
            )}
          >
            {c ?? "Everything"}
            <span className="ml-1.5 tabular opacity-60">{c ? items.filter((p) => p.category === c).length : items.length}</span>
          </Link>
        ))}
      </nav>

      {shown.length ? (
        <ul className="grid grid-cols-2 gap-x-4 gap-y-10 md:grid-cols-3 lg:grid-cols-4">
          {shown.map((p) => (
            <li key={p.id}>
              <Link href={`/eyewear/${p.id}`} className="group block">
                <ProductArt src={p.imageUrl} alt={p.name} />
                <div className="mt-3 flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-[14.5px] font-medium text-text group-hover:underline">{p.name}</p>
                    <p className="truncate text-[13px] text-text-3">{[p.brand, p.category].filter(Boolean).join(" · ")}</p>
                  </div>
                  <p className="shrink-0 text-[14px] text-text tabular">
                    {p.options.length > 1 ? <span className="text-text-3">from </span> : null}
                    {f.money(p.minPrice)}
                  </p>
                </div>
                {p.options.length > 1 ? <p className="mt-1 text-[12.5px] text-text-3">{p.options.length} options</p> : null}
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className="py-20 text-center text-[15px] text-text-2">Nothing in this category is listed online yet — ask us in branch.</p>
      )}

      <p className="mt-16 max-w-[620px] text-[13.5px] leading-relaxed text-text-3">
        Prices include {site.biz.taxName} where applicable. Prescription lenses are priced separately based on your prescription and lens options; availability varies by branch.
      </p>
    </Container>
  );
}

export default function EyewearPage(props: PageProps<"/eyewear">) {
  return (
    <>
      <PageIntro eyebrow="Eyewear" title="Frames, sunglasses and lenses." body="Browse what we carry, then try it on in branch. Every pair is fitted and adjusted by our opticians." />
      <Suspense fallback={<div className="h-[60vh]" />}>
        <Catalogue searchParams={props.searchParams} />
      </Suspense>
    </>
  );
}
