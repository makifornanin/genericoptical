import { Boxes, ClipboardList, Download } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";
import { DateRangeFilter, ParamSelect, SearchInput } from "@/components/app/filters";
import { Kpi } from "@/components/app/kpi";
import { Forbidden, PageBody, PageHeader, TableSkeleton, Toolbar } from "@/components/app/page";
import { StockPill } from "@/components/app/status";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState, Segmented } from "@/components/ui/misc";
import { EmptyRow, Pagination, SortTH, Table, TableWrap, TD, TH, THead, TR, type SearchParams } from "@/components/ui/table";
import { resolveRange } from "@/lib/dates";
import { formatter } from "@/lib/format";
import { getBranchContext, requireSession } from "@/server/auth/session";
import { listCategories } from "@/server/services/catalog";
import { can } from "@/server/services/core";
import { listLocations, listMovements, listStock, MOVEMENT_LABELS, stockSummary } from "@/server/services/inventory";

const PATH = "/app/inventory";
const str = (v: unknown) => (typeof v === "string" ? v : undefined);

async function Content({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const session = await requireSession();
  const ctx = session.ctx;
  if (!can(ctx, "inventory.view")) return <Forbidden what="inventory" />;
  const sp = await searchParams;
  const f = formatter(session.business);
  const tab = str(sp.tab) ?? "levels";
  const [locations, categories, { selectedBranchId }] = await Promise.all([listLocations(ctx), listCategories(ctx), getBranchContext(session.business.id)]);
  const branchLocation = selectedBranchId ? locations.find((l) => l.branchId === selectedBranchId)?.id : undefined;
  const locationId = str(sp.location) ?? branchLocation ?? null;
  const summary = await stockSummary(ctx, locationId);
  const showValue = can(ctx, "products.costs");

  return (
    <PageBody>
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Kpi inverted label="Units on hand" value={f.number(summary.units)} caption={`${summary.tracked} stocked variants`} />
        {showValue ? <Kpi label="Stock value (at cost)" value={f.money(summary.valueCents)} caption="moving weighted-average cost" definition="Σ on-hand units × each variant's weighted-average unit cost." /> : null}
        <Kpi label="Low stock" value={f.number(summary.low)} caption="at or below reorder point" />
        <Kpi label="Out of stock" value={f.number(summary.out)} caption="none available to sell" />
      </div>
      <Toolbar
        actions={
          can(ctx, "purchasing.view") ? (
            <ButtonLink href="/app/purchase-orders">
              <ClipboardList /> Purchase orders
            </ButtonLink>
          ) : null
        }
      >
        <Segmented
          pathname={PATH}
          params={sp}
          param="tab"
          options={[
            { value: "levels", label: "Stock levels" },
            { value: "movements", label: "Movement history" },
          ]}
        />
        <ParamSelect param="location" label="Location" options={[{ value: "", label: branchLocation ? "Selected branch" : "All locations" }, ...locations.map((l) => ({ value: l.id, label: l.name }))]} />
      </Toolbar>
      {tab === "movements" ? <Movements ctxSearch={sp} locationId={locationId} f={f} session={session} /> : <Levels sp={sp} locationId={locationId} categories={categories} f={f} showValue={showValue} session={session} />}
    </PageBody>
  );
}

async function Levels({ sp, locationId, categories, f, showValue, session }: { sp: SearchParams; locationId: string | null; categories: { id: string; name: string }[]; f: ReturnType<typeof formatter>; showValue: boolean; session: Awaited<ReturnType<typeof requireSession>> }) {
  const data = await listStock(session.ctx, {
    q: str(sp.q),
    locationId,
    status: (str(sp.status) ?? "all") as "all",
    categoryId: str(sp.category),
    page: Number(sp.page ?? 1),
    sort: str(sp.sort) ?? "name",
    dir: sp.dir === "desc" ? "desc" : "asc",
  });
  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <SearchInput placeholder="Search product, SKU or brand" />
        <ParamSelect param="status" label="Stock status" options={[{ value: "", label: "Any status" }, { value: "low", label: "Low stock" }, { value: "out", label: "Out of stock" }, { value: "in", label: "Healthy" }]} />
        <ParamSelect param="category" label="Category" options={[{ value: "", label: "All categories" }, ...categories.map((c) => ({ value: c.id, label: c.name }))]} />
      </div>
      <Card>
        {data.total === 0 ? (
          <EmptyState icon={<Boxes />} title="No stocked items match">Services and made-to-order lenses aren&apos;t stock-tracked, so they don&apos;t appear here.</EmptyState>
        ) : (
          <>
            <TableWrap>
              <Table>
                <THead>
                  <SortTH label="Product" column="name" pathname={PATH} params={sp} />
                  <SortTH label="SKU" column="sku" pathname={PATH} params={sp} />
                  <TH>Category</TH>
                  <SortTH label="On hand" column="on_hand" pathname={PATH} params={sp} align="right" defaultDir="desc" />
                  <TH align="right">Reserved</TH>
                  <SortTH label="Available" column="available" pathname={PATH} params={sp} align="right" />
                  <SortTH label="Reorder at" column="reorder" pathname={PATH} params={sp} align="right" />
                  {showValue ? <SortTH label="Value" column="value" pathname={PATH} params={sp} align="right" defaultDir="desc" /> : null}
                  <TH>Status</TH>
                </THead>
                <tbody>
                  {data.rows.map((r) => (
                    <TR key={r.variantId}>
                      <TD>
                        <Link href={`/app/products/${r.productId}`} className="font-medium hover:underline">
                          {r.productName}
                        </Link>
                        <div className="text-[11.5px] text-text-3">{r.label}</div>
                      </TD>
                      <TD className="font-mono text-[12px] text-text-2">{r.sku}</TD>
                      <TD className="text-text-2">{r.categoryName}</TD>
                      <TD align="right">{r.onHand}</TD>
                      <TD align="right" className="text-text-2">{r.reserved || "—"}</TD>
                      <TD align="right" className="font-medium">{r.available}</TD>
                      <TD align="right" className="text-text-2">{r.reorderPoint}</TD>
                      {showValue ? <TD align="right">{f.money(r.stockValueCents)}</TD> : null}
                      <TD>
                        <StockPill available={r.available} reorderPoint={r.reorderPoint} />
                      </TD>
                    </TR>
                  ))}
                </tbody>
              </Table>
            </TableWrap>
            <Pagination pathname={PATH} params={sp} page={data.page} pageCount={data.pageCount} total={data.total} pageSize={data.pageSize} />
          </>
        )}
      </Card>
    </>
  );
}

async function Movements({ ctxSearch: sp, locationId, f, session }: { ctxSearch: SearchParams; locationId: string | null; f: ReturnType<typeof formatter>; session: Awaited<ReturnType<typeof requireSession>> }) {
  const range = sp.range ? resolveRange(str(sp.range), session.business.timezone, { from: str(sp.from), to: str(sp.to) }) : null;
  const data = await listMovements(session.ctx, {
    q: str(sp.q),
    locationId,
    type: str(sp.type),
    productId: str(sp.product),
    from: range?.from,
    to: range?.to,
    page: Number(sp.page ?? 1),
    pageSize: 40,
  });
  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <SearchInput placeholder="Search product, SKU or reason" />
        <ParamSelect param="type" label="Movement type" options={[{ value: "", label: "All types" }, ...Object.entries(MOVEMENT_LABELS).map(([value, label]) => ({ value, label }))]} />
        <DateRangeFilter label={range?.label ?? "Any date"} />
        <ButtonLink href={`/api/export/movements${range ? `?range=${range.preset}${range.preset === "custom" ? `&from=${range.fromDay}&to=${range.toDay}` : ""}` : ""}`} prefetch={false} size="md">
          <Download /> Export
        </ButtonLink>
      </div>
      <Card>
        <TableWrap>
          <Table>
            <THead>
              <TH>When</TH>
              <TH>Product</TH>
              <TH>Type</TH>
              <TH>Location</TH>
              <TH align="right">Change</TH>
              <TH align="right">After</TH>
              <TH>Reason / reference</TH>
            </THead>
            <tbody>
              {data.rows.length === 0 ? <EmptyRow colSpan={7}>No stock movements match these filters.</EmptyRow> : null}
              {data.rows.map((m) => (
                <TR key={m.id}>
                  <TD className="whitespace-nowrap text-text-2">{f.dateTime(m.createdAt)}</TD>
                  <TD>
                    <Link href={`/app/products/${m.productId}`} className="font-medium hover:underline">
                      {m.productName}
                    </Link>
                    <div className="font-mono text-[11px] text-text-3">{m.sku}</div>
                  </TD>
                  <TD>{MOVEMENT_LABELS[m.type] ?? m.type}</TD>
                  <TD className="text-text-2">{m.locationName}</TD>
                  <TD align="right" className={m.quantity > 0 ? "font-medium text-pos" : "font-medium"}>
                    {m.quantity > 0 ? `+${m.quantity}` : m.quantity}
                  </TD>
                  <TD align="right">{m.onHandAfter}</TD>
                  <TD className="max-w-[320px] truncate text-text-2">
                    {m.referenceType === "sale" && m.referenceId ? (
                      <Link href={`/app/sales/${m.referenceId}`} className="underline-offset-2 hover:underline">
                        {m.reason}
                      </Link>
                    ) : (
                      m.reason ?? "—"
                    )}
                  </TD>
                </TR>
              ))}
            </tbody>
          </Table>
        </TableWrap>
        <Pagination pathname={PATH} params={sp} page={data.page} pageCount={data.pageCount} total={data.total} pageSize={data.pageSize} />
      </Card>
    </>
  );
}

export default function InventoryPage(props: PageProps<"/app/inventory">) {
  return (
    <>
      <PageHeader title="Stock" subtitle="On-hand, reserved and available stock per branch, with a full movement history." />
      <Suspense fallback={<TableSkeleton />}>
        <Content searchParams={props.searchParams} />
      </Suspense>
    </>
  );
}
