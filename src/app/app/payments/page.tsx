import { Wallet } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";
import { DateRangeFilter, ParamSelect, SearchInput } from "@/components/app/filters";
import { Kpi } from "@/components/app/kpi";
import { Forbidden, PageBody, PageHeader, TableSkeleton, Toolbar } from "@/components/app/page";
import { FulfillmentPill, PaymentPill } from "@/components/app/status";
import { Card } from "@/components/ui/card";
import { EmptyState, Segmented } from "@/components/ui/misc";
import { Pill } from "@/components/ui/pill";
import { Pagination, Table, TableWrap, TD, TH, THead, TR, type SearchParams } from "@/components/ui/table";
import { resolveRange } from "@/lib/dates";
import { formatter } from "@/lib/format";
import { PAYMENT_METHOD_LABELS, PAYMENT_METHODS } from "@/lib/schemas";
import { getBranchContext, requireSession } from "@/server/auth/session";
import { can } from "@/server/services/core";
import { paymentsByMethod } from "@/server/services/reports";
import { listPayments, listSales, outstandingSummary } from "@/server/services/sales";

const PATH = "/app/payments";
const str = (v: unknown) => (typeof v === "string" ? v : undefined);

async function Content({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const session = await requireSession();
  const ctx = session.ctx;
  if (!can(ctx, "sales.view")) return <Forbidden what="payments" />;
  const sp = await searchParams;
  const f = formatter(session.business);
  const view = str(sp.view) ?? "ledger";
  const { selectedBranchId } = await getBranchContext(session.business.id);
  const range = resolveRange(str(sp.range), session.business.timezone, { from: str(sp.from), to: str(sp.to) });
  const outstanding = await outstandingSummary(ctx, selectedBranchId);

  return (
    <PageBody>
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Kpi inverted label="Outstanding receivables" value={f.money(outstanding.receivableCents)} caption={`${outstanding.receivableCount} completed sale(s)`} definition="Owed on sales and orders that have been completed/handed over." />
        <Kpi label="Over 14 days" value={f.money(outstanding.overdueCents)} caption={`${outstanding.overdueCount} sale(s)`} />
        <Kpi label="Open order balances" value={f.money(outstanding.openOrderBalanceCents)} caption={`${outstanding.openOrderCount} order(s) not yet handed over`} definition="Still to be collected on orders in progress. Not yet revenue, so not a receivable." />
        <Kpi label="Owing customers" value={String(outstanding.receivableCount + outstanding.openOrderCount)} caption="sales and orders with a balance" />
      </div>
      <Toolbar>
        <Segmented
          pathname={PATH}
          params={sp}
          param="view"
          options={[
            { value: "ledger", label: "Payments received" },
            { value: "balances", label: "Outstanding balances" },
          ]}
        />
        {view === "ledger" ? (
          <>
            <DateRangeFilter label={range.label} />
            <SearchInput placeholder="Sale number, reference or customer" />
            <ParamSelect param="method" label="Method" options={[{ value: "", label: "All methods" }, ...[...PAYMENT_METHODS, "online_demo"].map((m) => ({ value: m, label: PAYMENT_METHOD_LABELS[m] }))]} />
          </>
        ) : null}
      </Toolbar>
      {view === "balances" ? <Balances sp={sp} f={f} session={session} branchId={selectedBranchId} /> : <Ledger sp={sp} f={f} session={session} range={range} branchId={selectedBranchId} />}
    </PageBody>
  );
}

async function Ledger({ sp, f, session, range, branchId }: { sp: SearchParams; f: ReturnType<typeof formatter>; session: Awaited<ReturnType<typeof requireSession>>; range: ReturnType<typeof resolveRange>; branchId: string | null }) {
  const [data, methods] = await Promise.all([
    listPayments(session.ctx, { method: str(sp.method), q: str(sp.q), from: range.from, to: range.to, branchId, page: Number(sp.page ?? 1), pageSize: 30 }),
    paymentsByMethod(session.ctx, range, branchId),
  ]);
  const total = methods.reduce((s, m) => s + m.totalCents, 0);
  return (
    <>
      {methods.length ? (
        <div className="flex flex-wrap gap-2">
          {methods.map((m) => (
            <span key={m.method} className="inline-flex items-center gap-2 rounded-full border border-line bg-surface px-3 py-1.5 text-[12.5px]">
              <span className="text-text-2">{PAYMENT_METHOD_LABELS[m.method]}</span>
              <span className="font-semibold tabular">{f.money(m.totalCents)}</span>
              <span className="text-text-3">{total ? Math.round((m.totalCents / total) * 100) : 0}%</span>
            </span>
          ))}
        </div>
      ) : null}
      <Card>
        {data.total === 0 ? (
          <EmptyState icon={<Wallet />} title="No payments in this period" />
        ) : (
          <>
            <TableWrap>
              <Table>
                <THead>
                  <TH>Received</TH>
                  <TH>Sale / order</TH>
                  <TH>Customer</TH>
                  <TH>Method</TH>
                  <TH>Reference</TH>
                  <TH>By</TH>
                  <TH align="right">Amount</TH>
                </THead>
                <tbody>
                  {data.rows.map((p) => (
                    <TR key={p.id} className={p.status === "voided" ? "opacity-60" : undefined}>
                      <TD className="whitespace-nowrap text-text-2">{f.dateTime(p.receivedAt)}</TD>
                      <TD className="font-medium">
                        <Link href={p.saleKind === "order" ? `/app/orders/${p.saleId}` : `/app/sales/${p.saleId}`} className="hover:underline">
                          {p.saleNumber}
                        </Link>
                      </TD>
                      <TD>{p.customerName ?? <span className="text-text-3">Walk-in</span>}</TD>
                      <TD>
                        {PAYMENT_METHOD_LABELS[p.method]}
                        {p.status === "voided" ? <Pill className="ml-2">Voided</Pill> : null}
                      </TD>
                      <TD className="font-mono text-[12px] text-text-2">{p.reference ?? "—"}</TD>
                      <TD className="text-text-2">{p.receivedByName ?? "—"}</TD>
                      <TD align="right" className={p.status === "voided" ? "line-through" : "font-medium"}>
                        {f.money(p.amountCents)}
                      </TD>
                    </TR>
                  ))}
                </tbody>
              </Table>
            </TableWrap>
            <div className="flex justify-between border-t border-line px-5 py-2.5 text-[13px]">
              <span className="text-text-2">Total received (excluding voided)</span>
              <span className="font-semibold tabular">{f.money(data.sumCents)}</span>
            </div>
            <Pagination pathname={PATH} params={sp} page={data.page} pageCount={data.pageCount} total={data.total} pageSize={data.pageSize} />
          </>
        )}
      </Card>
    </>
  );
}

async function Balances({ sp, f, session, branchId }: { sp: SearchParams; f: ReturnType<typeof formatter>; session: Awaited<ReturnType<typeof requireSession>>; branchId: string | null }) {
  const data = await listSales(session.ctx, { withBalance: true, branchId, page: Number(sp.page ?? 1), pageSize: 30, sort: "date", dir: "asc" });
  // eslint-disable-next-line react-hooks/purity -- server component: rendered once per request
  const now = Date.now();
  return (
    <Card>
      {data.total === 0 ? (
        <EmptyState icon={<Wallet />} title="Nothing outstanding">Every sale and order is fully paid.</EmptyState>
      ) : (
        <>
          <TableWrap>
            <Table>
              <THead>
                <TH>Sale / order</TH>
                <TH>Customer</TH>
                <TH>Type</TH>
                <TH>Status</TH>
                <TH align="right">Total</TH>
                <TH align="right">Paid</TH>
                <TH align="right">Balance</TH>
                <TH align="right">Age</TH>
              </THead>
              <tbody>
                {data.rows.map((s) => {
                  const days = Math.floor((now - new Date(s.completedAt ?? s.createdAt).getTime()) / 86400000);
                  return (
                    <TR key={s.id}>
                      <TD className="font-medium">
                        <Link href={s.kind === "order" ? `/app/orders/${s.id}` : `/app/sales/${s.id}`} className="hover:underline">
                          {s.number}
                        </Link>
                      </TD>
                      <TD>{s.customerName ?? "—"}</TD>
                      <TD className="text-text-2">{s.kind === "order" ? (s.status === "open" ? "Open order" : "Order (handed over)") : "POS sale"}</TD>
                      <TD>{s.status === "open" ? <FulfillmentPill stage={s.fulfillmentStatus} /> : <PaymentPill status={s.paymentStatus} />}</TD>
                      <TD align="right">{f.money(s.totalCents)}</TD>
                      <TD align="right" className="text-text-2">{f.money(s.paidCents)}</TD>
                      <TD align="right" className="font-semibold text-warn">{f.money(s.balanceDueCents)}</TD>
                      <TD align="right" className={s.status === "completed" && days > 14 ? "font-medium text-neg" : "text-text-2"}>
                        {days} d
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
  );
}

export default function PaymentsPage(props: PageProps<"/app/payments">) {
  return (
    <>
      <PageHeader title="Payments" subtitle="Money received by method, and every balance still owed." />
      <Suspense fallback={<TableSkeleton />}>
        <Content searchParams={props.searchParams} />
      </Suspense>
    </>
  );
}
