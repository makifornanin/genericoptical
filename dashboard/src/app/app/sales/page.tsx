import { Download, Receipt } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";
import { DateRangeFilter, ParamSelect, SearchInput } from "@/components/app/filters";
import { Forbidden, PageBody, PageHeader, TableSkeleton, Toolbar } from "@/components/app/page";
import { PaymentPill, SaleStatusPill } from "@/components/app/status";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState, Segmented } from "@/components/ui/misc";
import { Pagination, SortTH, Table, TableWrap, TD, TH, THead, TR, type SearchParams } from "@/components/ui/table";
import { resolveRange } from "@/lib/dates";
import { formatter } from "@/lib/format";
import { getBranchContext, requireSession } from "@/server/auth/session";
import { can } from "@/server/services/core";
import { staffForAssignment } from "@/server/services/leads";
import { listSales } from "@/server/services/sales";

const PATH = "/app/sales";
const str = (v: unknown) => (typeof v === "string" ? v : undefined);

async function Content({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const session = await requireSession();
  const ctx = session.ctx;
  if (!can(ctx, "sales.view")) return <Forbidden what="transactions" />;
  const sp = await searchParams;
  const f = formatter(session.business);
  const range = resolveRange(str(sp.range), session.business.timezone, { from: str(sp.from), to: str(sp.to) });
  const { branches, selectedBranchId } = await getBranchContext(session.business.id);
  const kind = str(sp.kind) ?? "all";
  const [data, staff] = await Promise.all([
    listSales(ctx, {
      kind: kind === "pos" ? "pos" : kind === "order" ? "order" : null,
      q: str(sp.q),
      status: str(sp.status) ?? null,
      paymentStatus: str(sp.payment) ?? null,
      branchId: str(sp.branch) ?? selectedBranchId,
      soldBy: str(sp.staff) ?? null,
      from: range.from,
      to: range.to,
      page: Number(sp.page ?? 1),
      sort: str(sp.sort) ?? "date",
      dir: sp.dir === "asc" ? "asc" : "desc",
    }),
    staffForAssignment(ctx),
  ]);
  const exportHref = `/api/export/sales?range=${range.preset}${range.preset === "custom" ? `&from=${range.fromDay}&to=${range.toDay}` : ""}`;
  return (
    <PageBody>
      <Toolbar
        actions={
          <ButtonLink href={exportHref} prefetch={false}>
            <Download /> Export CSV
          </ButtonLink>
        }
      >
        <Segmented
          pathname={PATH}
          params={sp}
          param="kind"
          options={[
            { value: "all", label: "All" },
            { value: "pos", label: "POS sales" },
            { value: "order", label: "Orders" },
          ]}
        />
        <DateRangeFilter label={range.label} />
        <SearchInput placeholder="Number, customer, phone or lab ref" />
        <ParamSelect param="payment" label="Payment status" options={[{ value: "", label: "Any payment" }, { value: "paid", label: "Paid" }, { value: "partially_paid", label: "Partially paid" }, { value: "unpaid", label: "Unpaid" }]} />
        <ParamSelect param="status" label="Status" options={[{ value: "", label: "Any status" }, { value: "completed", label: "Completed" }, { value: "open", label: "Open orders" }, { value: "cancelled", label: "Cancelled" }]} />
        <ParamSelect param="branch" label="Branch" options={[{ value: "", label: selectedBranchId ? "Selected branch" : "All branches" }, ...branches.map((b) => ({ value: b.id, label: b.name }))]} />
        <ParamSelect param="staff" label="Sold by" options={[{ value: "", label: "Anyone" }, ...staff.map((s) => ({ value: s.id, label: s.name }))]} />
      </Toolbar>
      <Card>
        {data.total === 0 ? (
          <EmptyState icon={<Receipt />} title="No transactions in this period">Try another date range or clear the filters.</EmptyState>
        ) : (
          <>
            <TableWrap>
              <Table>
                <THead>
                  <SortTH label="Number" column="number" pathname={PATH} params={sp} />
                  <SortTH label="Date" column="date" pathname={PATH} params={sp} defaultDir="desc" />
                  <SortTH label="Customer" column="customer" pathname={PATH} params={sp} />
                  <TH>Branch</TH>
                  <TH>Sold by</TH>
                  <TH align="right">Items</TH>
                  <SortTH label="Total" column="total" pathname={PATH} params={sp} align="right" defaultDir="desc" />
                  <SortTH label="Balance" column="balance" pathname={PATH} params={sp} align="right" defaultDir="desc" />
                  <TH>Status</TH>
                </THead>
                <tbody>
                  {data.rows.map((s) => (
                    <TR key={s.id}>
                      <TD className="font-medium">
                        <Link href={s.kind === "order" ? `/app/orders/${s.id}` : `/app/sales/${s.id}`} className="hover:underline">
                          {s.number}
                        </Link>
                      </TD>
                      <TD className="whitespace-nowrap text-text-2">{f.dateTime(s.createdAt)}</TD>
                      <TD className="max-w-[180px] truncate">{s.customerName ?? <span className="text-text-3">Walk-in</span>}</TD>
                      <TD className="text-text-2">{s.branchName}</TD>
                      <TD className="text-text-2">{s.soldByName ?? "—"}</TD>
                      <TD align="right">{s.itemCount}</TD>
                      <TD align="right" className="font-medium">
                        {f.money(s.totalCents)}
                      </TD>
                      <TD align="right" className={s.balanceDueCents > 0 ? "font-medium text-warn" : "text-text-3"}>
                        {s.balanceDueCents > 0 ? f.money(s.balanceDueCents) : "—"}
                      </TD>
                      <TD>{s.status === "completed" ? <PaymentPill status={s.paymentStatus} refunded={s.refundedCents} total={s.totalCents} /> : <SaleStatusPill status={s.status} />}</TD>
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

export default function SalesPage(props: PageProps<"/app/sales">) {
  return (
    <>
      <PageHeader title="Transactions" subtitle="Every POS sale and customer order, with payment status and balances." />
      <Suspense fallback={<TableSkeleton />}>
        <Content searchParams={props.searchParams} />
      </Suspense>
    </>
  );
}
