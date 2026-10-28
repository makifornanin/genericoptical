import { Download } from "lucide-react";
import { Suspense } from "react";
import { BarList, TwoSeriesChart } from "@/components/app/charts";
import { DateRangeFilter } from "@/components/app/filters";
import { CardsSkeleton, Forbidden, PageBody, PageHeader } from "@/components/app/page";
import { BranchSwitcher } from "@/components/app/shell-client";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Delta } from "@/components/ui/misc";
import { Table, TableWrap, TD, TH, THead, TR } from "@/components/ui/table";
import { cn } from "@/lib/cn";
import { bucketLabel, resolveRange } from "@/lib/dates";
import { formatter } from "@/lib/format";
import { PAYMENT_METHOD_LABELS } from "@/lib/schemas";
import { getBranchContext, requireSession } from "@/server/auth/session";
import { can } from "@/server/services/core";
import { financialReport } from "@/server/services/reports";
import { setBranchAction } from "../shell-actions";

type SP = Promise<Record<string, string | string[] | undefined>>;
const str = (v: unknown) => (typeof v === "string" ? v : undefined);
const pct = (a: number, b: number) => (b === 0 ? (a === 0 ? 0 : null) : Math.round(((a - b) / Math.abs(b)) * 1000) / 10);

async function Content({ searchParams }: { searchParams: SP }) {
  const session = await requireSession();
  const ctx = session.ctx;
  if (!can(ctx, "analytics.view")) return <Forbidden what="financial reports" />;
  const sp = await searchParams;
  const biz = session.business;
  const f = formatter(biz);
  const range = resolveRange(str(sp.range) ?? "this_month", biz.timezone, { from: str(sp.from), to: str(sp.to) });
  const { branches, selectedBranchId, selectedBranch } = await getBranchContext(biz.id);
  const r = await financialReport(ctx, range, selectedBranchId);
  const c = r.current;
  const p = r.previous;
  const taxLabel = `${biz.taxName}${biz.pricesIncludeTax ? " included in prices" : " added to prices"}`;

  const statement: { label: string; value: number; prev: number; kind?: "sub" | "total" | "neg"; note?: string; inverse?: boolean; neutral?: boolean }[] = [
    { label: "Gross sales", value: c.grossSalesCents, prev: p.grossSalesCents, note: "Quantity × shelf price on completed sales" },
    { label: "Discounts", value: -c.discountsCents, prev: -p.discountsCents, kind: "neg", inverse: true },
    { label: "Refunds & returns", value: -c.refundsCents, prev: -p.refundsCents, kind: "neg", note: "Dated when refunded", inverse: true },
    ...(biz.pricesIncludeTax ? [{ label: `${biz.taxName} collected`, value: -c.taxCents, prev: -p.taxCents, kind: "neg" as const, note: taxLabel, neutral: true }] : []),
    { label: "Net sales", value: c.netSalesCents, prev: p.netSalesCents, kind: "sub", note: "Excluding tax" },
    { label: "Cost of goods sold", value: -c.cogsCents, prev: -p.cogsCents, kind: "neg", note: "Unit cost recorded at sale, less restocked returns", inverse: true },
    { label: "Gross profit", value: c.grossProfitCents, prev: p.grossProfitCents, kind: "sub", note: `${(c.grossMarginBps / 100).toFixed(1)}% gross margin` },
    { label: "Operating expenses", value: -c.expensesCents, prev: -p.expensesCents, kind: "neg", inverse: true },
    { label: "Estimated operating profit", value: c.operatingProfitCents, prev: p.operatingProfitCents, kind: "total", note: "Operational estimate — not accounting net income" },
  ];
  const trend = r.trend.map((t) => ({ label: bucketLabel(t.key, range.bucket), a: t.netSalesCents, b: t.expensesCents }));
  const methodTotal = r.byMethod.reduce((s, m) => s + m.totalCents, 0);
  const exportHref = `/api/export/report?range=${range.preset}${range.preset === "custom" ? `&from=${range.fromDay}&to=${range.toDay}` : ""}${selectedBranchId ? `&branch=${selectedBranchId}` : ""}`;

  return (
    <>
      <PageHeader title="Reports" subtitle={`${selectedBranch?.name ?? "All branches"} · ${f.date(range.from)} – ${f.date(range.toDay)} · compared with ${f.date(range.previous.from)} – ${f.date(new Date(range.previous.to.getTime() - 1))}`}>
        <BranchSwitcher branches={branches} selectedId={selectedBranchId} setBranch={setBranchAction} />
        <DateRangeFilter label={range.label} />
        <ButtonLink href={exportHref} prefetch={false}>
          <Download /> Export CSV
        </ButtonLink>
      </PageHeader>
      <PageBody>
        <div className="grid gap-4 xl:grid-cols-5">
          <Card className="xl:col-span-3">
            <CardHeader title="Profit & loss (operational)" subtitle="Revenue is recognised when a sale completes or an order is handed over." />
            <TableWrap>
              <Table>
                <THead>
                  <TH>Line</TH>
                  <TH align="right">This period</TH>
                  <TH align="right">Previous</TH>
                  <TH align="right">Change</TH>
                </THead>
                <tbody>
                  {statement.map((row) => (
                    <TR key={row.label} className={cn(row.kind === "sub" && "bg-surface-2", row.kind === "total" && "bg-ink text-white hover:bg-ink")}>
                      <TD className={cn(row.kind === "neg" && "pl-9", row.kind === "sub" || row.kind === "total" ? "font-semibold" : "")}>
                        {row.label}
                        {row.note ? <div className={cn("text-[11.5px] font-normal", row.kind === "total" ? "text-white/60" : "text-text-3")}>{row.note}</div> : null}
                      </TD>
                      <TD align="right" className={cn(row.kind === "sub" || row.kind === "total" ? "font-semibold" : "", row.kind === "neg" && "text-text-2")}>
                        {f.money(row.value)}
                      </TD>
                      <TD align="right" className={row.kind === "total" ? "text-white/70" : "text-text-3"}>
                        {f.money(row.prev)}
                      </TD>
                      <TD align="right">
                        <Delta value={row.kind === "neg" ? pct(Math.abs(row.value), Math.abs(row.prev)) : pct(row.value, row.prev)} inverse={row.inverse} neutral={row.neutral} />
                      </TD>
                    </TR>
                  ))}
                </tbody>
              </Table>
            </TableWrap>
          </Card>
          <div className="flex flex-col gap-4 xl:col-span-2">
            <Card>
              <CardHeader title="Cash" subtitle="Money in and out, regardless of when revenue is recognised" />
              <CardBody>
                <dl className="divide-y divide-line text-[13.5px]">
                  {[
                    ["Payments collected", f.money(c.collectedCents), `${c.paymentCount} payments`],
                    ["…of which deposits on open orders", f.money(c.depositsCents), "not yet revenue"],
                    ["Refunds paid out", `−${f.money(c.refundsPaidOutCents)}`, ""],
                    ["Net cash collected", f.money(c.netCollectedCents), ""],
                  ].map(([k, v, n]) => (
                    <div key={k} className="flex items-baseline justify-between gap-3 py-2">
                      <dt className="text-text-2">
                        {k}
                        {n ? <span className="ml-1 text-[11.5px] text-text-3">· {n}</span> : null}
                      </dt>
                      <dd className="font-semibold tabular">{v}</dd>
                    </div>
                  ))}
                </dl>
              </CardBody>
            </Card>
            <Card>
              <CardHeader title="Still owed" subtitle="As of now" />
              <CardBody>
                <dl className="divide-y divide-line text-[13.5px]">
                  <div className="flex justify-between py-2">
                    <dt className="text-text-2">Receivables (completed sales)</dt>
                    <dd className="font-semibold tabular">{f.money(r.outstanding.receivableCents)}</dd>
                  </div>
                  <div className="flex justify-between py-2">
                    <dt className="text-text-2">…older than 14 days</dt>
                    <dd className="font-semibold text-warn tabular">{f.money(r.outstanding.overdueCents)}</dd>
                  </div>
                  <div className="flex justify-between py-2">
                    <dt className="text-text-2">Open order balances</dt>
                    <dd className="font-semibold tabular">{f.money(r.outstanding.openOrderBalanceCents)}</dd>
                  </div>
                </dl>
              </CardBody>
            </Card>
          </div>
        </div>

        <Card>
          <CardHeader title="Net sales vs operating expenses" subtitle={`${range.bucket === "day" ? "Daily" : range.bucket === "week" ? "Weekly" : "Monthly"} · net sales exclude tax`} />
          <CardBody>
            <TwoSeriesChart data={trend} money={f.moneyMeta} a="Net sales" b="Operating expenses" />
          </CardBody>
        </Card>

        <div className="grid gap-4 lg:grid-cols-3">
          <Card>
            <CardHeader title="Payments by method" />
            <CardBody>
              <BarList items={r.byMethod.map((m) => ({ label: PAYMENT_METHOD_LABELS[m.method] ?? m.method, value: m.totalCents, sub: methodTotal ? `${Math.round((m.totalCents / methodTotal) * 100)}% · ${m.count}` : undefined }))} valueFormat="money" money={f.moneyMeta} />
            </CardBody>
          </Card>
          <Card>
            <CardHeader title="Sales by category" subtitle="Net of discounts and item returns" />
            <CardBody>
              <BarList items={r.byCategory.map((x) => ({ label: x.name, value: x.netCents, sub: `${x.quantity} units` }))} valueFormat="money" money={f.moneyMeta} />
            </CardBody>
          </Card>
          <Card>
            <CardHeader title="Expenses by category" />
            <CardBody>
              <BarList items={r.byExpense.map((x) => ({ label: x.name, value: x.totalCents }))} valueFormat="money" money={f.moneyMeta} emptyText="No expenses recorded in this period." />
            </CardBody>
          </Card>
        </div>

        <Card>
          <CardHeader title="Sales by staff" subtitle="Completed sales attributed to the person who rang them up" />
          <TableWrap>
            <Table>
              <THead>
                <TH>Staff member</TH>
                <TH align="right">Transactions</TH>
                <TH align="right">Net sales</TH>
                <TH align="right">Total charged</TH>
                <TH align="right">Average</TH>
              </THead>
              <tbody>
                {r.byStaff.map((s) => (
                  <TR key={s.name}>
                    <TD className="font-medium">{s.name}</TD>
                    <TD align="right">{s.transactions}</TD>
                    <TD align="right">{f.money(s.netCents)}</TD>
                    <TD align="right" className="font-medium">{f.money(s.totalCents)}</TD>
                    <TD align="right" className="text-text-2">{f.money(s.transactions ? Math.round(s.totalCents / s.transactions) : 0)}</TD>
                  </TR>
                ))}
              </tbody>
            </Table>
          </TableWrap>
        </Card>
        <p className="text-[12px] text-text-3">
          Definitions: gross sales are at shelf prices ({taxLabel}); net sales exclude tax and subtract discounts and refunds; COGS uses each line&apos;s unit cost recorded at the time of sale (moving weighted average for stocked items, lab cost for made-to-order lenses). This report is for operational decisions and is not a substitute for accounting statements.
        </p>
      </PageBody>
    </>
  );
}

export default function ReportsPage(props: PageProps<"/app/reports">) {
  return (
    <Suspense fallback={<><PageHeader title="Reports" subtitle="Loading…" /><CardsSkeleton /></>}>
      <Content searchParams={props.searchParams} />
    </Suspense>
  );
}
