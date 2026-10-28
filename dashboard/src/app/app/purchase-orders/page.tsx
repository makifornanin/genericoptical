import { ClipboardList, Plus } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";
import { ParamSelect, SearchInput } from "@/components/app/filters";
import { Forbidden, PageBody, PageHeader, TableSkeleton, Toolbar } from "@/components/app/page";
import { PoStatusPill } from "@/components/app/status";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState, Segmented } from "@/components/ui/misc";
import { Pagination, Table, TableWrap, TD, TH, THead, TR, type SearchParams } from "@/components/ui/table";
import { formatter } from "@/lib/format";
import { requireSession } from "@/server/auth/session";
import { can } from "@/server/services/core";
import { listPurchaseOrders, listSuppliers } from "@/server/services/purchasing";

const PATH = "/app/purchase-orders";
const str = (v: unknown) => (typeof v === "string" ? v : undefined);

async function Content({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const session = await requireSession();
  const ctx = session.ctx;
  if (!can(ctx, "purchasing.view")) return <Forbidden what="purchase orders" />;
  const sp = await searchParams;
  const f = formatter(session.business);
  const view = str(sp.view) ?? "open";
  const [data, suppliers] = await Promise.all([
    listPurchaseOrders(ctx, { q: str(sp.q), status: view === "open" ? "open" : str(sp.status) ?? null, supplierId: str(sp.supplier), page: Number(sp.page ?? 1) }),
    can(ctx, "suppliers.view") ? listSuppliers(ctx, { pageSize: 100 }) : Promise.resolve({ rows: [] as { id: string; name: string }[] }),
  ]);
  return (
    <PageBody>
      <Toolbar
        actions={
          can(ctx, "purchasing.manage") ? (
            <ButtonLink href="/app/purchase-orders/new" variant="primary">
              <Plus /> New purchase order
            </ButtonLink>
          ) : null
        }
      >
        <Segmented
          pathname={PATH}
          params={sp}
          param="view"
          options={[
            { value: "open", label: "Open" },
            { value: "all", label: "All" },
          ]}
        />
        <SearchInput placeholder="Search PO number or supplier" />
        {view === "all" ? (
          <ParamSelect param="status" label="Status" options={[{ value: "", label: "Any status" }, { value: "draft", label: "Draft" }, { value: "ordered", label: "Ordered" }, { value: "partially_received", label: "Partially received" }, { value: "received", label: "Received" }, { value: "cancelled", label: "Cancelled" }]} />
        ) : null}
        <ParamSelect param="supplier" label="Supplier" options={[{ value: "", label: "All suppliers" }, ...suppliers.rows.map((s) => ({ value: s.id, label: s.name }))]} />
      </Toolbar>
      <Card>
        {data.total === 0 ? (
          <EmptyState icon={<ClipboardList />} title={view === "open" ? "No open purchase orders" : "No purchase orders"}>
            Create a purchase order to restock; receiving it adds the units to inventory.
          </EmptyState>
        ) : (
          <>
            <TableWrap>
              <Table>
                <THead>
                  <TH>PO</TH>
                  <TH>Supplier</TH>
                  <TH>Deliver to</TH>
                  <TH>Status</TH>
                  <TH align="right">Received</TH>
                  <TH align="right">Value</TH>
                  <TH align="right">Expected</TH>
                  <TH align="right">Created</TH>
                </THead>
                <tbody>
                  {data.rows.map((po) => (
                    <TR key={po.id}>
                      <TD className="font-medium">
                        <Link href={`/app/purchase-orders/${po.id}`} className="hover:underline">
                          {po.number}
                        </Link>
                      </TD>
                      <TD>{po.supplierName}</TD>
                      <TD className="text-text-2">{po.locationName}</TD>
                      <TD>
                        <PoStatusPill status={po.status} />
                      </TD>
                      <TD align="right" className="text-text-2">
                        {po.units.received} / {po.units.ordered}
                      </TD>
                      <TD align="right" className="font-medium">
                        {f.money(po.subtotalCents)}
                      </TD>
                      <TD align="right" className="text-text-2">
                        {po.expectedOn ? f.date(po.expectedOn, "MMM d") : "—"}
                      </TD>
                      <TD align="right" className="text-text-2">
                        {f.date(po.createdAt)}
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
    </PageBody>
  );
}

export default function PurchaseOrdersPage(props: PageProps<"/app/purchase-orders">) {
  return (
    <>
      <PageHeader title="Purchase orders" subtitle="Restock from suppliers. Receiving a delivery updates stock and records the movement." />
      <Suspense fallback={<TableSkeleton />}>
        <Content searchParams={props.searchParams} />
      </Suspense>
    </>
  );
}
