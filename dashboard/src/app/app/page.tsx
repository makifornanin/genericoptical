import { CalendarDays, CircleAlert, PackageCheck, UserPlus } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";
import { BarList, RevenueChart } from "@/components/app/charts";
import { DateRangeFilter } from "@/components/app/filters";
import { Kpi, MetricStrip } from "@/components/app/kpi";
import { CardsSkeleton, Forbidden, PageBody, PageHeader } from "@/components/app/page";
import { BranchSwitcher } from "@/components/app/shell-client";
import { AppointmentPill, FulfillmentPill, LeadStagePill, PaymentPill } from "@/components/app/status";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/misc";
import { EmptyRow, Table, TableWrap, TD, TH, THead, TR } from "@/components/ui/table";
import { bucketLabel, resolveRange } from "@/lib/dates";
import { formatter } from "@/lib/format";
import { getBranchContext, requireSession } from "@/server/auth/session";
import { listAppointments } from "@/server/services/appointments";
import { can } from "@/server/services/core";
import { listLeads } from "@/server/services/leads";
import { dashboard } from "@/server/services/reports";
import { listSales } from "@/server/services/sales";
import { recentActivity } from "@/server/services/staff";
import { setBranchAction } from "./shell-actions";

type SP = Promise<Record<string, string | string[] | undefined>>;
const str = (v: string | string[] | undefined) => (typeof v === "string" ? v : undefined);

async function DashboardContent({ searchParams }: { searchParams: SP }) {
  const session = await requireSession();
  const ctx = session.ctx;
  if (!can(ctx, "dashboard.view")) return <Forbidden what="the dashboard" />;
  const sp = await searchParams;
  const biz = session.business;
  const f = formatter(biz);
  const range = resolveRange(str(sp.range), biz.timezone, { from: str(sp.from), to: str(sp.to) });
  const { branches, selectedBranchId, selectedBranch } = await getBranchContext(biz.id);
  const now = new Date();

  const [d, recent, upcoming, pendingOrders, followUps, activity, overdue] = await Promise.all([
    dashboard(ctx, range, selectedBranchId),
    can(ctx, "sales.view") ? listSales(ctx, { branchId: selectedBranchId, status: "completed", pageSize: 7, sort: "date" }) : null,
    can(ctx, "appointments.view") ? listAppointments(ctx, { from: now, to: new Date(now.getTime() + 7 * 86400000), branchId: selectedBranchId, limit: 60 }) : null,
    can(ctx, "orders.view") ? listSales(ctx, { kind: "order", openOnly: true, branchId: selectedBranchId, pageSize: 6, sort: "due", dir: "asc" }) : null,
    can(ctx, "leads.view") ? listLeads(ctx, { followUp: "due", pageSize: 6, sort: "follow_up", dir: "asc" }) : null,
    can(ctx, "audit.view") ? recentActivity(ctx, 7) : null,
    can(ctx, "sales.view") ? listSales(ctx, { status: "completed", withBalance: true, branchId: selectedBranchId, pageSize: 5, sort: "date", dir: "asc" }) : null,
  ]);
  const fin = d.financials;
  const upcomingActive = upcoming?.filter((a) => a.status === "scheduled" || a.status === "confirmed") ?? [];
  const series = d.series?.map((s) => ({ label: bucketLabel(s.key, range.bucket), current: s.netSalesCents, previous: s.previousNetSalesCents, profit: s.grossProfitCents, transactions: s.transactions })) ?? [];
  const totalCategory = d.categories?.reduce((a, c) => a + c.netCents, 0) ?? 0;

  return (
    <>
      <PageHeader title="Dashboard" subtitle={`${selectedBranch ? selectedBranch.name : "All branches"} · ${range.label} · ${f.date(range.from)} – ${f.date(range.toDay)}`}>
        <BranchSwitcher branches={branches} selectedId={selectedBranchId} setBranch={setBranchAction} />
        <DateRangeFilter label={range.label} />
      </PageHeader>
      <PageBody>
        {fin ? (
          <section aria-label="Key figures" className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Kpi
              inverted
              label="Net sales"
              value={f.money(fin.netSalesCents)}
              delta={d.changes?.netSales}
              caption="vs previous period"
              definition="Completed sales after discounts and refunds, excluding tax. Orders count when they're handed over."
            />
            <Kpi
              label="Gross profit"
              value={f.money(fin.grossProfitCents)}
              delta={d.changes?.grossProfit}
              caption={`${(fin.grossMarginBps / 100).toFixed(1)}% margin`}
              definition="Net sales minus cost of goods sold (unit costs recorded at the time of sale, less restocked returns)."
            />
            <Kpi
              label="Transactions"
              value={f.number(fin.transactions)}
              delta={d.changes?.transactions}
              caption={`avg ${f.money(fin.avgTransactionCents)}`}
              definition="Completed POS sales plus customer orders handed over in the period. Average = total charged ÷ transactions."
            />
            <Kpi
              label="Outstanding receivables"
              value={f.money(d.outstanding?.receivableCents ?? 0)}
              caption={`${d.outstanding?.receivableCount ?? 0} sale(s) · ${f.money(d.outstanding?.overdueCents ?? 0)} over 14 days`}
              definition="Balances still owed on completed sales and handed-over orders. Open order balances are tracked separately."
            />
          </section>
        ) : null}

        <MetricStrip
          items={[
            ...(fin ? [{ label: "Gross sales", value: f.compact(fin.grossSalesCents), caption: `${f.compact(fin.discountsCents)} discounts · ${f.compact(fin.refundsCents)} refunds` }] : []),
            ...(d.leads
              ? [
                  { label: "New leads", value: f.number(d.leads.newLeads), caption: `${d.leads.previousNewLeads} previous period`, href: "/app/leads" },
                  { label: "Lead conversion", value: f.pct(d.leads.conversionRate), caption: `${d.leads.converted} converted from this period` },
                ]
              : []),
            ...(fin ? [{ label: "Active customers", value: f.number(fin.buyingCustomers), caption: "bought in this period" }] : []),
            ...(d.customers ? [{ label: "New customers", value: f.number(d.customers.newCustomers), caption: `${d.customers.previousNewCustomers} previous period`, href: "/app/customers?sort=created" }] : []),
            ...(d.appointments ? [{ label: "Upcoming appointments", value: f.number(d.appointments.upcoming7d), caption: "next 7 days", href: "/app/appointments" }] : []),
            ...(d.fulfillment ? [{ label: "Pending orders", value: f.number(d.fulfillment.openTotal), caption: `${d.fulfillment.openByStage.find((s) => s.stage === "ready_for_pickup")?.count ?? 0} ready for pickup`, href: "/app/orders" }] : []),
            ...(d.stock
              ? [
                  { label: "Low-stock items", value: f.number(d.stock.low + d.stock.out), caption: `${d.stock.out} out of stock`, href: "/app/inventory?status=low", tone: d.stock.out ? ("negative" as const) : d.stock.low ? ("warning" as const) : undefined },
                ]
              : []),
            ...(fin ? [{ label: "Payments collected", value: f.compact(fin.netCollectedCents), caption: "cash basis, after refunds", href: "/app/payments" }] : []),
            ...(d.outstanding ? [{ label: "Open order balances", value: f.compact(d.outstanding.openOrderBalanceCents), caption: `${d.outstanding.openOrderCount} order(s) not yet handed over` }] : []),
          ].slice(0, 10)}
        />

        {fin ? (
          <div className="grid gap-4 xl:grid-cols-3">
            <Card className="xl:col-span-2">
              <CardHeader title="Net sales over time" subtitle={`${range.bucket === "day" ? "Daily" : range.bucket === "week" ? "Weekly" : "Monthly"} · excluding tax`} actions={<ButtonLink href="/app/analytics" variant="ghost" size="sm">Analytics</ButtonLink>} />
              <CardBody>
                <RevenueChart data={series} money={f.moneyMeta} />
              </CardBody>
            </Card>
            <Card>
              <CardHeader title="Sales by category" subtitle="Net of discounts and item returns" />
              <CardBody>
                <BarList
                  items={(d.categories ?? []).slice(0, 7).map((c) => ({ label: c.name, value: c.netCents, sub: totalCategory ? `${Math.round((c.netCents / totalCategory) * 100)}%` : undefined }))}
                  valueFormat="compactMoney"
                  money={f.moneyMeta}
                />
              </CardBody>
            </Card>
          </div>
        ) : null}

        <div className="grid gap-4 xl:grid-cols-3">
          {recent ? (
            <Card className="xl:col-span-2">
              <CardHeader title="Recent transactions" subtitle="Latest completed sales and handed-over orders" actions={<ButtonLink href="/app/sales" variant="ghost" size="sm">View all</ButtonLink>} />
              <TableWrap>
                <Table>
                  <THead>
                    <TH>Number</TH>
                    <TH>Customer</TH>
                    <TH>Branch</TH>
                    <TH align="right">Total</TH>
                    <TH>Payment</TH>
                    <TH align="right">When</TH>
                  </THead>
                  <tbody>
                    {recent.rows.length === 0 ? <EmptyRow colSpan={6}>No sales yet. Completed sales from the point of sale appear here.</EmptyRow> : null}
                    {recent.rows.map((s) => (
                      <TR key={s.id}>
                        <TD className="font-medium">
                          <Link href={`/app/sales/${s.id}`} className="hover:underline">
                            {s.number}
                          </Link>
                        </TD>
                        <TD className="max-w-[180px] truncate">{s.customerName ?? <span className="text-text-3">Walk-in</span>}</TD>
                        <TD className="text-text-2">{s.branchName}</TD>
                        <TD align="right" className="font-medium">
                          {f.money(s.totalCents)}
                        </TD>
                        <TD>
                          <PaymentPill status={s.paymentStatus} refunded={s.refundedCents} total={s.totalCents} />
                        </TD>
                        <TD align="right" className="text-text-3">
                          {f.relative(s.completedAt ?? s.createdAt)}
                        </TD>
                      </TR>
                    ))}
                  </tbody>
                </Table>
              </TableWrap>
            </Card>
          ) : null}
          {d.topProducts ? (
            <Card>
              <CardHeader title="Top products" subtitle={`Units sold · ${range.label.toLowerCase()}`} />
              <CardBody>
                <BarList items={d.topProducts.map((p) => ({ label: p.productName, value: p.quantity, sub: p.netCents == null ? undefined : f.compact(p.netCents), href: `/app/products/${p.productId}` }))} />
              </CardBody>
            </Card>
          ) : null}
        </div>

        <div className="grid gap-4 lg:grid-cols-3">
          {upcoming ? (
            <Card>
              <CardHeader title="Upcoming appointments" subtitle="Next 7 days" actions={<ButtonLink href="/app/appointments" variant="ghost" size="sm">Calendar</ButtonLink>} />
              {upcomingActive.length ? (
                <ul className="divide-y divide-line border-t border-line">
                  {upcomingActive.slice(0, 6).map((a) => (
                    <li key={a.id} className="flex items-center gap-3 px-5 py-2.5">
                      <div className="w-[68px] shrink-0 text-center whitespace-nowrap">
                        <p className="text-[11px] text-text-3 uppercase">{f.date(a.startsAt, "EEE d")}</p>
                        <p className="text-[13px] font-semibold tabular">{f.time(a.startsAt)}</p>
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[13.5px] font-medium">{a.customerName ?? a.leadName ?? a.guestName ?? "Guest"}</p>
                        <p className="truncate text-[12px] text-text-3">
                          {a.typeName} · {a.branchName}
                          {a.practitionerName ? ` · ${a.practitionerName}` : ""}
                        </p>
                      </div>
                      <AppointmentPill status={a.status} />
                    </li>
                  ))}
                </ul>
              ) : (
                <EmptyState icon={<CalendarDays />} title="No upcoming appointments" />
              )}
            </Card>
          ) : null}
          {pendingOrders ? (
            <Card>
              <CardHeader title="Pending orders" subtitle="Open customer orders by due date" actions={<ButtonLink href="/app/orders" variant="ghost" size="sm">Orders</ButtonLink>} />
              {pendingOrders.rows.length ? (
                <ul className="divide-y divide-line border-t border-line">
                  {pendingOrders.rows.map((o) => (
                    <li key={o.id}>
                      <Link href={`/app/orders/${o.id}`} className="flex items-center gap-3 px-5 py-2.5 hover:bg-surface-2">
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-[13.5px] font-medium">
                            {o.number} <span className="font-normal text-text-2">· {o.customerName}</span>
                          </p>
                          <p className="text-[12px] text-text-3">
                            {o.dueOn ? `Due ${f.date(o.dueOn, "MMM d")}` : "No due date"}
                            {o.balanceDueCents > 0 ? ` · ${f.money(o.balanceDueCents)} due` : " · paid"}
                          </p>
                        </div>
                        <FulfillmentPill stage={o.fulfillmentStatus} />
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : (
                <EmptyState icon={<PackageCheck />} title="No open orders" />
              )}
            </Card>
          ) : null}
          {followUps ? (
            <Card>
              <CardHeader title="Leads to follow up" subtitle="Due today or overdue" actions={<ButtonLink href="/app/leads?followUp=due" variant="ghost" size="sm">Leads</ButtonLink>} />
              {followUps.rows.length ? (
                <ul className="divide-y divide-line border-t border-line">
                  {followUps.rows.map((l) => {
                    const overdueLead = l.followUpAt && new Date(l.followUpAt) < now;
                    return (
                      <li key={l.id}>
                        <Link href={`/app/leads/${l.id}`} className="flex items-center gap-3 px-5 py-2.5 hover:bg-surface-2">
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-[13.5px] font-medium">
                              {l.firstName} {l.lastName}
                            </p>
                            <p className={overdueLead ? "text-[12px] text-neg" : "text-[12px] text-text-3"}>
                              {l.followUpAt ? `${overdueLead ? "Overdue · " : ""}${f.dateTime(l.followUpAt)}` : ""}
                              {l.assignedName ? ` · ${l.assignedName}` : ""}
                            </p>
                          </div>
                          <LeadStagePill stage={l.stage} />
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <EmptyState icon={<UserPlus />} title="Nothing to follow up" >No leads have a follow-up due.</EmptyState>
              )}
            </Card>
          ) : null}
        </div>

        <div className="grid gap-4 lg:grid-cols-3">
          {d.lowStock ? (
            <Card>
              <CardHeader title="Inventory alerts" subtitle="At or below reorder point" actions={<ButtonLink href="/app/inventory?status=low" variant="ghost" size="sm">Stock</ButtonLink>} />
              {d.lowStock.length ? (
                <ul className="divide-y divide-line border-t border-line">
                  {d.lowStock.slice(0, 6).map((a) => (
                    <li key={`${a.variantId}-${a.locationId}`} className="flex items-center gap-3 border-l-2 px-5 py-2.5" style={{ borderLeftColor: a.available <= 0 ? "var(--neg)" : "#c48a12" }}>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[13.5px] font-medium">{a.productName}</p>
                        <p className="truncate text-[12px] text-text-3">
                          {a.label} · {a.locationName}
                        </p>
                      </div>
                      <span className={a.available <= 0 ? "text-[12.5px] font-semibold text-neg" : "text-[12.5px] font-semibold text-warn"}>{a.available <= 0 ? "Out" : `${a.available} left`}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <EmptyState title="Stock levels are healthy" />
              )}
            </Card>
          ) : null}
          {overdue ? (
            <Card>
              <CardHeader title="Payment alerts" subtitle="Oldest balances still owed" actions={<ButtonLink href="/app/payments?view=balances" variant="ghost" size="sm">Balances</ButtonLink>} />
              {overdue.rows.length ? (
                <ul className="divide-y divide-line border-t border-line">
                  {overdue.rows.map((s) => {
                    const days = Math.floor((now.getTime() - new Date(s.completedAt ?? s.createdAt).getTime()) / 86400000);
                    return (
                      <li key={s.id}>
                        <Link href={`/app/sales/${s.id}`} className="flex items-center gap-3 px-5 py-2.5 hover:bg-surface-2">
                          <CircleAlert className={days > 14 ? "size-4 shrink-0 text-neg" : "size-4 shrink-0 text-warn"} aria-hidden="true" />
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-[13.5px] font-medium">{s.customerName ?? s.number}</p>
                            <p className="text-[12px] text-text-3">
                              {s.number} · {days} day(s) ago
                            </p>
                          </div>
                          <span className="text-[13px] font-semibold tabular">{f.money(s.balanceDueCents)}</span>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <EmptyState title="No outstanding balances" />
              )}
            </Card>
          ) : null}
          {activity ? (
            <Card>
              <CardHeader title="Recent activity" actions={<ButtonLink href="/app/activity" variant="ghost" size="sm">Log</ButtonLink>} />
              <ul className="divide-y divide-line border-t border-line">
                {activity.map((a) => (
                  <li key={a.id} className="px-5 py-2.5">
                    <p className="line-clamp-2 text-[13px]">{a.summary}</p>
                    <p className="mt-0.5 text-[11.5px] text-text-3">
                      {a.actorLabel} · {f.relative(a.createdAt)}
                    </p>
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}
        </div>
      </PageBody>
    </>
  );
}

export default function DashboardPage(props: PageProps<"/app">) {
  return (
    <Suspense
      fallback={
        <>
          <PageHeader title="Dashboard" subtitle="Loading figures…" />
          <CardsSkeleton />
        </>
      }
    >
      <DashboardContent searchParams={props.searchParams} />
    </Suspense>
  );
}
