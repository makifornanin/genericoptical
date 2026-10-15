import { Suspense } from "react";
import { BarList, CountColumns, Funnel, RevenueChart, SegmentBar } from "@/components/app/charts";
import { DateRangeFilter } from "@/components/app/filters";
import { Kpi } from "@/components/app/kpi";
import { CardsSkeleton, Forbidden, PageBody, PageHeader } from "@/components/app/page";
import { BranchSwitcher } from "@/components/app/shell-client";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { bucketLabel, resolveRange } from "@/lib/dates";
import { formatter } from "@/lib/format";
import { FULFILLMENT_LABELS, LEAD_SOURCE_LABELS, type FulfillmentStage } from "@/lib/schemas";
import { getBranchContext, requireSession } from "@/server/auth/session";
import { can } from "@/server/services/core";
import { dashboard, salesByStaff } from "@/server/services/reports";
import { setBranchAction } from "../shell-actions";

type SP = Promise<Record<string, string | string[] | undefined>>;
const str = (v: unknown) => (typeof v === "string" ? v : undefined);

async function Content({ searchParams }: { searchParams: SP }) {
  const session = await requireSession();
  const ctx = session.ctx;
  if (!can(ctx, "analytics.view")) return <Forbidden what="analytics" />;
  const sp = await searchParams;
  const biz = session.business;
  const f = formatter(biz);
  const range = resolveRange(str(sp.range) ?? "30d", biz.timezone, { from: str(sp.from), to: str(sp.to) });
  const { branches, selectedBranchId, selectedBranch } = await getBranchContext(biz.id);
  const [d, staff] = await Promise.all([dashboard(ctx, range, selectedBranchId), salesByStaff(ctx, range, selectedBranchId)]);
  const fin = d.financials!;
  const series = (d.series ?? []).map((s) => ({ label: bucketLabel(s.key, range.bucket), current: s.netSalesCents, previous: s.previousNetSalesCents, profit: s.grossProfitCents, transactions: s.transactions }));
  const profitSeries = (d.series ?? []).map((s) => ({ label: bucketLabel(s.key, range.bucket), current: s.grossProfitCents, previous: s.previousGrossProfitCents, profit: s.grossProfitCents, transactions: s.transactions }));
  const growth = (d.customers?.growth ?? []).map((g) => ({ label: bucketLabel(g.key, range.bucket), value: g.newCustomers }));
  const appts = d.appointments;
  const stock = d.stock;
  const fulfil = d.fulfillment;

  return (
    <>
      <PageHeader title="Analytics" subtitle={`${selectedBranch?.name ?? "All branches"} · ${range.label} · trends across sales, customers, leads, appointments and stock`}>
        <BranchSwitcher branches={branches} selectedId={selectedBranchId} setBranch={setBranchAction} />
        <DateRangeFilter label={range.label} />
      </PageHeader>
      <PageBody>
        <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
          <Kpi inverted label="Revenue growth" value={d.changes?.netSales === null || d.changes?.netSales === undefined ? "—" : `${d.changes.netSales > 0 ? "+" : ""}${d.changes.netSales}%`} caption={`${f.money(fin.netSalesCents)} net sales vs ${f.money(d.previous?.netSalesCents ?? 0)}`} definition="Change in net sales (ex-tax) against the previous period of the same length." />
          <Kpi label="Average transaction" value={f.money(fin.avgTransactionCents)} delta={d.changes?.avgTransaction} caption="vs previous" />
          <Kpi label="Lead conversion" value={f.pct(d.leads?.conversionRate)} caption={`${d.leads?.converted ?? 0} of ${d.leads?.newLeads ?? 0} new leads`} definition="Share of leads created in this period that have converted to customers." />
          <Kpi label="Appointment show rate" value={appts?.showRate === null || appts?.showRate === undefined ? "—" : `${appts.showRate}%`} caption={`${appts?.total ?? 0} appointments in period`} definition="Completed ÷ (completed + no-shows) for appointments starting in the period." />
        </div>

        <div className="grid gap-4 xl:grid-cols-2">
          <Card>
            <CardHeader title="Net sales" subtitle="Against the previous period" />
            <CardBody>
              <RevenueChart data={series} money={f.moneyMeta} height={240} />
            </CardBody>
          </Card>
          <Card>
            <CardHeader title="Gross profit" subtitle={`${(fin.grossMarginBps / 100).toFixed(1)}% margin over the period`} />
            <CardBody>
              <RevenueChart data={profitSeries} money={f.moneyMeta} height={240} label="Gross profit" />
            </CardBody>
          </Card>
        </div>

        <div className="grid gap-4 lg:grid-cols-3">
          <Card>
            <CardHeader title="Customer growth" subtitle={`${d.customers?.newCustomers ?? 0} new · ${d.customers?.totalCustomers ?? 0} total`} />
            <CardBody>
              <CountColumns data={growth} label="New customers" />
            </CardBody>
          </Card>
          <Card>
            <CardHeader title="Lead sources" subtitle="Leads created in the period" />
            <CardBody>
              <BarList items={(d.leads?.sources ?? []).map((s) => ({ label: LEAD_SOURCE_LABELS[s.source] ?? s.source, value: s.count, sub: s.count ? `${Math.round((s.converted / s.count) * 100)}% converted` : undefined }))} emptyText="No new leads in this period." />
            </CardBody>
          </Card>
          <Card>
            <CardHeader title="Lead funnel" subtitle="How far this period's leads have progressed" />
            <CardBody>
              <Funnel stages={d.leads?.funnel ?? []} />
            </CardBody>
          </Card>
        </div>

        <div className="grid gap-4 lg:grid-cols-3">
          {appts ? (
            <Card>
              <CardHeader title="Appointment performance" subtitle={`${appts.upcoming7d} upcoming in the next 7 days`} />
              <CardBody>
                <SegmentBar
                  segments={[
                    { label: "Completed", value: appts.byStatus.find((s) => s.status === "completed")?.count ?? 0, color: "#2e6b35" },
                    { label: "Scheduled / confirmed", value: (appts.byStatus.find((s) => s.status === "scheduled")?.count ?? 0) + (appts.byStatus.find((s) => s.status === "confirmed")?.count ?? 0), color: "#4d3fb0" },
                    { label: "No-show", value: appts.byStatus.find((s) => s.status === "no_show")?.count ?? 0, color: "#b42318" },
                    { label: "Cancelled", value: appts.byStatus.find((s) => s.status === "cancelled")?.count ?? 0, color: "#c9cbc4" },
                  ]}
                />
              </CardBody>
            </Card>
          ) : null}
          {fulfil ? (
            <Card>
              <CardHeader title="Order fulfilment" subtitle={`${fulfil.completedInRange} handed over · ${fulfil.avgTurnaroundDays ?? "—"} days average · ${fulfil.onTimeRate === null ? "—" : `${fulfil.onTimeRate}%`} ready by due date`} />
              <CardBody>
                <BarList items={fulfil.openByStage.map((s) => ({ label: FULFILLMENT_LABELS[s.stage as FulfillmentStage], value: s.count, sub: s.balanceCents ? `${f.compact(s.balanceCents)} due` : undefined }))} max={Math.max(1, ...fulfil.openByStage.map((s) => s.count))} emptyText="No open orders." />
              </CardBody>
            </Card>
          ) : null}
          {stock ? (
            <Card>
              <CardHeader title="Inventory status" subtitle={`${stock.units.toLocaleString()} units · ${can(ctx, "products.costs") ? f.money(stock.valueCents) + " at cost" : "valuation hidden"}`} />
              <CardBody>
                <SegmentBar
                  segments={[
                    { label: "Healthy", value: stock.healthy, color: "#2e6b35" },
                    { label: "Low", value: stock.low, color: "#c48a12" },
                    { label: "Out of stock", value: stock.out, color: "#b42318" },
                  ]}
                />
                <p className="mt-3 text-[12px] text-text-3">Counted per variant per branch stockroom.</p>
              </CardBody>
            </Card>
          ) : null}
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader title="Top products" subtitle="Units sold, net of returns" />
            <CardBody>
              <BarList items={(d.topProducts ?? []).map((p) => ({ label: p.productName, value: p.quantity, sub: f.compact(p.netCents), href: `/app/products/${p.productId}` }))} />
            </CardBody>
          </Card>
          <Card>
            <CardHeader title="Sales by staff" subtitle="Total charged on completed sales" />
            <CardBody>
              <BarList items={staff.map((s) => ({ label: s.name, value: s.totalCents, sub: `${s.transactions} sales` }))} valueFormat="money" money={f.moneyMeta} />
            </CardBody>
          </Card>
        </div>
      </PageBody>
    </>
  );
}

export default function AnalyticsPage(props: PageProps<"/app/analytics">) {
  return (
    <Suspense fallback={<><PageHeader title="Analytics" subtitle="Loading…" /><CardsSkeleton /></>}>
      <Content searchParams={props.searchParams} />
    </Suspense>
  );
}
