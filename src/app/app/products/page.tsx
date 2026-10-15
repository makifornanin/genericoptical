import { Download, Glasses, Plus } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";
import { ParamSelect, SearchInput } from "@/components/app/filters";
import { Forbidden, PageBody, PageHeader, TableSkeleton, Toolbar } from "@/components/app/page";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState, Segmented } from "@/components/ui/misc";
import { Pill } from "@/components/ui/pill";
import { Pagination, SortTH, Table, TableWrap, TD, TH, THead, TR, type SearchParams } from "@/components/ui/table";
import { formatter } from "@/lib/format";
import { PRODUCT_TYPE_LABELS } from "@/lib/schemas";
import { requireSession } from "@/server/auth/session";
import { listCategories, listProducts, PRODUCT_CSV_COLUMNS } from "@/server/services/catalog";
import { can } from "@/server/services/core";
import { ImportProductsDialog } from "./import-dialog";

const PATH = "/app/products";
const str = (v: unknown) => (typeof v === "string" ? v : undefined);

async function Content({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const session = await requireSession();
  const ctx = session.ctx;
  if (!can(ctx, "products.view")) return <Forbidden what="products" />;
  const sp = await searchParams;
  const f = formatter(session.business);
  const [data, categories] = await Promise.all([
    listProducts(ctx, {
      q: str(sp.q),
      categoryId: str(sp.category),
      type: str(sp.type),
      status: (str(sp.status) ?? "active") as "active",
      page: Number(sp.page ?? 1),
      sort: str(sp.sort) ?? "name",
      dir: sp.dir === "desc" ? "desc" : "asc",
    }),
    listCategories(ctx),
  ]);
  const manage = can(ctx, "products.manage");
  return (
    <PageBody>
      <Toolbar
        actions={
          <>
            <ButtonLink href="/api/export/products" prefetch={false}>
              <Download /> Export
            </ButtonLink>
            {manage ? <ImportProductsDialog columns={PRODUCT_CSV_COLUMNS} /> : null}
            {manage ? (
              <ButtonLink href="/app/products/new" variant="primary">
                <Plus /> New product
              </ButtonLink>
            ) : null}
          </>
        }
      >
        <Segmented
          pathname={PATH}
          params={sp}
          param="status"
          options={[
            { value: "active", label: "Active" },
            { value: "inactive", label: "Inactive" },
            { value: "archived", label: "Archived" },
          ]}
        />
        <SearchInput placeholder="Search name, brand, SKU or barcode" />
        <ParamSelect param="category" label="Category" options={[{ value: "", label: "All categories" }, ...categories.map((c) => ({ value: c.id, label: c.name }))]} />
        <ParamSelect param="type" label="Type" options={[{ value: "", label: "All types" }, ...Object.entries(PRODUCT_TYPE_LABELS).map(([value, label]) => ({ value, label }))]} />
      </Toolbar>
      <Card>
        {data.total === 0 ? (
          <EmptyState icon={<Glasses />} title="No products found" action={manage ? <ButtonLink href="/app/products/new" variant="primary"><Plus /> New product</ButtonLink> : undefined}>
            Frames, lenses, contact lenses, accessories and services all live here.
          </EmptyState>
        ) : (
          <>
            <TableWrap>
              <Table>
                <THead>
                  <SortTH label="Product" column="name" pathname={PATH} params={sp} />
                  <TH>Category</TH>
                  <TH>Type</TH>
                  <TH align="right">Variants</TH>
                  <TH align="right">Price</TH>
                  {can(ctx, "products.costs") ? <TH align="right">Avg. cost</TH> : null}
                  <TH align="right">Available</TH>
                  <TH>Supplier</TH>
                </THead>
                <tbody>
                  {data.rows.map((p) => {
                    const s = p.stats;
                    const range = s.minPrice === null ? "—" : s.minPrice === s.maxPrice ? f.money(Number(s.minPrice)) : `${f.money(Number(s.minPrice))} – ${f.money(Number(s.maxPrice))}`;
                    return (
                      <TR key={p.id}>
                        <TD>
                          <div className="flex items-center gap-3">
                            <span className="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-[8px] border border-line bg-[#efeee8]">
                              {p.imageUrl ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img src={p.imageUrl} alt="" className="h-full w-full object-cover" />
                              ) : null}
                            </span>
                            <div className="min-w-0">
                              <Link href={`/app/products/${p.id}`} className="font-medium hover:underline">
                                {p.name}
                              </Link>
                              <div className="max-w-[280px] truncate text-[11.5px] text-text-3">
                                {p.brand ? `${p.brand} · ` : ""}
                                {s.skus}
                              </div>
                            </div>
                          </div>
                        </TD>
                        <TD className="text-text-2">{p.categoryName}</TD>
                        <TD>
                          <Pill tone={p.productType === "stock" ? "neutral" : p.productType === "service" ? "info" : "warning"}>{p.productType === "stock" ? "Stocked" : p.productType === "service" ? "Service" : "Made to order"}</Pill>
                        </TD>
                        <TD align="right">{s.variants}</TD>
                        <TD align="right">{range}</TD>
                        {can(ctx, "products.costs") ? <TD align="right" className="text-text-2">{s.avgCost === null ? "—" : f.money(Number(s.avgCost))}</TD> : null}
                        <TD align="right" className={p.productType === "stock" && s.available <= 0 ? "font-medium text-neg" : undefined}>
                          {p.productType === "stock" ? s.available : <span className="text-text-3">n/a</span>}
                        </TD>
                        <TD className="text-text-2">{p.supplierName ?? "—"}</TD>
                      </TR>
                    );
                  })}
                </tbody>
              </Table>
            </TableWrap>
            <Pagination pathname={PATH} params={sp} page={data.page} pageCount={data.pageCount} total={data.total} pageSize={data.pageSize} />
          </>
        )}
      </Card>
    </PageBody>
  );
}

export default function ProductsPage(props: PageProps<"/app/products">) {
  return (
    <>
      <PageHeader title="Products" subtitle="Frames, sunglasses, lenses, contact lenses, care products and services." />
      <Suspense fallback={<TableSkeleton />}>
        <Content searchParams={props.searchParams} />
      </Suspense>
    </>
  );
}
