import { PackageCheck, Plus } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";
import { SearchInput } from "@/components/app/filters";
import { Forbidden, PageBody, PageHeader, TableSkeleton, Toolbar } from "@/components/app/page";
import { FulfillmentPill, PaymentPill, SaleStatusPill } from "@/components/app/status";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState, Segmented } from "@/components/ui/misc";
import { Pagination, SortTH, Table, TableWrap, TD, TH, THead, TR, type SearchParams } from "@/components/ui/table";
import { formatter } from "@/lib/format";
import { getBranchContext, requireSession } from "@/server/auth/session";
import { can } from "@/server/services/core";
import { fulfillmentMetrics } from "@/server/services/reports";
import { listSales } from "@/server/services/sales";
import { resolveRange } from "@/lib/dates";

const PATH = "/app/orders";
const str = (v: unknown) => (typeof v === "string" ? v : undefined);

async function Content({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const session = await requireSession();
  const ctx = session.ctx;
  if (!can(ctx, "orders.view")) return <Forbidden what="orders" />;
  const sp = await searchParams;
  const f = formatter(session.business);
  const { selectedBranchId } = await getBranchContext(session.business.id);
  const stage = str(sp.stage) ?? "open";
  const [data, metrics] = await Promise.all([
    listSales(ctx, {
      kind: "order",
      q: str(sp.q),
      openOnly: stage === "open",
      fulfillmentStatus: stage !== "open" && stage !== "all" ? stage : null,
      branchId: selectedBranchId,
      page: Number(sp.page ?? 1),
      sort: str(sp.sort) ?? (stage === "open" ? "due" : "date"),
      dir: sp.dir === "desc" ? "desc" : sp.dir === "asc" ? "asc" : stage === "open" ? "asc" : "desc",
    }),
    fulfillmentMetrics(ctx, resolveRange("30d", session.business.timezone), selectedBranchId),
  ]);
  const count = (s: string) => metrics.openByStage.find((x) => x.stage === s)?.count ?? 0;
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: session.business.timezone }).format(new Date());
  return (
    <PageBody>
      <Toolbar
        actions={
          can(ctx, "orders.manage") ? (
            <ButtonLink href="/app/orders/new" variant="primary">
              <Plus /> New order
            </ButtonLink>
          ) : null
        }
      >
        <Segmented
          pathname={PATH}
          params={sp}
          param="stage"
          options={[
            { value: "open", label: "All open", count: metrics.openTotal },
            { value: "new", label: "New", count: count("new") },
            { value: "confirmed", label: "Confirmed", count: count("confirmed") },
            { value: "processing", label: "Processing", count: count("processing") },
            { value: "awaiting_lab", label: "At lab", count: count("awaiting_lab") },
            { value: "ready_for_pickup", label: "Ready", count: count("ready_for_pickup") },
            { value: "completed", label: "Completed" },
            { value: "cancelled", label: "Cancelled" },
            { value: "all", label: "All" },
          ]}
        />
        <SearchInput placeholder="Order number, customer or lab ref" />
      </Toolbar>
      <p className="-mt-1 text-[12.5px] text-text-3">
        Last 30 days: {metrics.completedInRange} handed over · average turnaround {metrics.avgTurnaroundDays ?? "—"} days · ready by due date {metrics.onTimeRate === null ? "—" : `${metrics.onTimeRate}%`}
      </p>
      <Card>
        {data.total === 0 ? (
          <EmptyState icon={<PackageCheck />} title="No orders here">Prescription eyewear and special orders appear here from creation to pickup.</EmptyState>
        ) : (
          <>
            <TableWrap>
              <Table>
                <THead>
                  <SortTH label="Order" column="number" pathname={PATH} params={sp} />
                  <SortTH label="Customer" column="customer" pathname={PATH} params={sp} />
                  <TH>Stage</TH>
                  <TH>Payment</TH>
                  <SortTH label="Total" column="total" pathname={PATH} params={sp} align="right" defaultDir="desc" />
                  <SortTH label="Balance" column="balance" pathname={PATH} params={sp} align="right" defaultDir="desc" />
                  <SortTH label="Due" column="due" pathname={PATH} params={sp} align="right" />
                  <SortTH label="Created" column="date" pathname={PATH} params={sp} align="right" defaultDir="desc" />
                </THead>
                <tbody>
                  {data.rows.map((o) => {
                    const late = o.status === "open" && o.dueOn && o.dueOn < today;
                    return (
                      <TR key={o.id}>
                        <TD className="font-medium">
                          <Link href={`/app/orders/${o.id}`} className="hover:underline">
                            {o.number}
                          </Link>
                          <div className="text-[11.5px] font-normal text-text-3">{o.branchName}</div>
                        </TD>
                        <TD>{o.customerName}</TD>
                        <TD>{o.status === "open" ? <FulfillmentPill stage={o.fulfillmentStatus} /> : <SaleStatusPill status={o.status} />}</TD>
                        <TD>{o.status !== "cancelled" ? <PaymentPill status={o.paymentStatus} refunded={o.refundedCents} total={o.totalCents} /> : null}</TD>
                        <TD align="right" className="font-medium">
                          {f.money(o.totalCents)}
                        </TD>
                        <TD align="right" className={o.balanceDueCents > 0 ? "text-warn" : "text-text-3"}>
                          {o.balanceDueCents > 0 ? f.money(o.balanceDueCents) : "—"}
                        </TD>
                        <TD align="right" className={late ? "font-medium text-neg" : "text-text-2"}>
                          {o.dueOn ? `${late ? "Late · " : ""}${f.date(o.dueOn, "MMM d")}` : "—"}
                        </TD>
                        <TD align="right" className="text-text-2">
                          {f.date(o.createdAt)}
                        </TD>
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

export default function OrdersPage(props: PageProps<"/app/orders">) {
  return (
    <>
      <PageHeader title="Orders" subtitle="Prescription eyewear and special orders — fulfilment and payment tracked separately." />
      <Suspense fallback={<TableSkeleton />}>
        <Content searchParams={props.searchParams} />
      </Suspense>
    </>
  );
}
