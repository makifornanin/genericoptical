import { sql, type SQL } from "drizzle-orm";
import { bucketKeys, type ResolvedRange } from "@/lib/dates";
import { db, requireAny, requirePermission, can, type Ctx } from "./core";
import { lowStockAlerts, stockSummary } from "./inventory";
import { outstandingSummary } from "./sales";

/**
 * Every figure here is aggregated from database records. Definitions (see docs/ARCHITECTURE.md):
 * - Revenue is recognised when a sale completes (POS checkout, or order handover).
 * - Net sales exclude tax and are reduced by refunds dated in the period.
 * - Payments collected is cash-basis: payments received − money refunded.
 */

type Bucket = ResolvedRange["bucket"];

const n = (v: unknown) => Number(v ?? 0);

function bucketExpr(col: SQL, bucket: Bucket, tz: string): SQL {
  const unit = sql.raw(`'${bucket}'`);
  return sql`to_char(date_trunc(${unit}, ${col} at time zone ${tz}), 'YYYY-MM-DD')`;
}

function branchCond(alias: string, branchId?: string | null): SQL {
  return branchId ? sql`and ${sql.raw(alias)}.branch_id = ${branchId}` : sql``;
}

export type Financials = Awaited<ReturnType<typeof financials>>;

/** Core money figures for [from, to). */
export async function financials(ctx: Ctx, from: Date, to: Date, fromDay: string, toDay: string, branchId?: string | null) {
  const b = branchCond("s", branchId);
  const res = await db().execute(sql`
    with s as (
      select s.* from sales s
      where s.business_id = ${ctx.businessId} and s.status = 'completed' and s.completed_at >= ${from} and s.completed_at < ${to} ${b}
    ),
    li as (
      select coalesce(sum(si.quantity * si.unit_price_cents), 0)::bigint as gross,
             coalesce(sum(si.discount_cents), 0)::bigint as discounts,
             coalesce(sum(si.tax_cents), 0)::bigint as tax,
             coalesce(sum(si.net_cents), 0)::bigint as net,
             coalesce(sum(si.quantity * si.unit_cost_cents), 0)::bigint as cogs
      from sale_items si join s on s.id = si.sale_id
    ),
    rf as (
      select coalesce(sum(r.amount_cents) filter (where r.affects_revenue), 0)::bigint as refunds,
             coalesce(sum(r.tax_cents) filter (where r.affects_revenue), 0)::bigint as refund_tax,
             coalesce(sum(r.cost_reversal_cents), 0)::bigint as cost_reversal,
             coalesce(sum(r.amount_cents) filter (where r.method <> 'balance_adjustment'), 0)::bigint as refunds_paid_out,
             count(*) filter (where r.affects_revenue)::int as refund_count
      from refunds r join sales s on s.id = r.sale_id
      where r.business_id = ${ctx.businessId} and r.created_at >= ${from} and r.created_at < ${to} ${b}
    ),
    pm as (
      select coalesce(sum(p.amount_cents), 0)::bigint as collected, count(*)::int as payment_count
      from payments p join sales s on s.id = p.sale_id
      where p.business_id = ${ctx.businessId} and p.status = 'completed' and p.received_at >= ${from} and p.received_at < ${to} ${b}
    ),
    dep as (
      select coalesce(sum(p.amount_cents), 0)::bigint as deposits
      from payments p join sales s on s.id = p.sale_id
      where p.business_id = ${ctx.businessId} and p.status = 'completed' and p.received_at >= ${from} and p.received_at < ${to}
        and s.kind = 'order' and (s.completed_at is null or s.completed_at > p.received_at) ${b}
    ),
    ex as (
      select coalesce(sum(e.amount_cents), 0)::bigint as expenses
      from expenses e
      where e.business_id = ${ctx.businessId} and e.status = 'recorded' and e.expense_date >= ${fromDay} and e.expense_date <= ${toDay} ${branchId ? sql`and e.branch_id = ${branchId}` : sql``}
    )
    select (select count(*)::int from s) as transactions,
           (select coalesce(sum(total_cents), 0)::bigint from s) as sales_total,
           (select count(distinct customer_id)::int from s where customer_id is not null) as buying_customers,
           li.*, rf.*, pm.*, dep.*, ex.*
    from li, rf, pm, dep, ex`);
  const r = res.rows[0] as Record<string, unknown>;
  const gross = n(r.gross);
  const discounts = n(r.discounts);
  const refunds = n(r.refunds);
  const refundTax = n(r.refund_tax);
  const tax = n(r.tax) - refundTax;
  const netSales = n(r.net) - (refunds - refundTax);
  const cogs = n(r.cogs) - n(r.cost_reversal);
  const grossProfit = netSales - cogs;
  const expenses = n(r.expenses);
  const transactions = n(r.transactions);
  return {
    transactions,
    salesTotalCents: n(r.sales_total),
    grossSalesCents: gross,
    discountsCents: discounts,
    refundsCents: refunds,
    refundCount: n(r.refund_count),
    taxCents: tax,
    netSalesCents: netSales,
    cogsCents: cogs,
    grossProfitCents: grossProfit,
    grossMarginBps: netSales > 0 ? Math.round((grossProfit / netSales) * 10000) : 0,
    expensesCents: expenses,
    operatingProfitCents: grossProfit - expenses,
    collectedCents: n(r.collected),
    refundsPaidOutCents: n(r.refunds_paid_out),
    netCollectedCents: n(r.collected) - n(r.refunds_paid_out),
    depositsCents: n(r.deposits),
    paymentCount: n(r.payment_count),
    buyingCustomers: n(r.buying_customers),
    avgTransactionCents: transactions > 0 ? Math.round(n(r.sales_total) / transactions) : 0,
  };
}

function pctChange(current: number, previous: number): number | null {
  if (previous === 0) return current === 0 ? 0 : null;
  return Math.round(((current - previous) / Math.abs(previous)) * 1000) / 10;
}

/** Net sales, gross profit and transaction counts per bucket (current and previous period). */
export async function revenueSeries(ctx: Ctx, range: ResolvedRange, branchId?: string | null) {
  const tz = range.timezone;
  const b = branchCond("s", branchId);
  const run = async (from: Date, to: Date) => {
    const bucketSale = bucketExpr(sql`s.completed_at`, range.bucket, tz);
    const bucketRefund = bucketExpr(sql`r.created_at`, range.bucket, tz);
    const res = await db().execute<{ k: string; net: number; cogs: number; tx: number; total: number }>(sql`
      with sl as (
        select ${bucketSale} as k, sum(si.net_cents)::bigint as net, sum(si.quantity * si.unit_cost_cents)::bigint as cogs
        from sales s join sale_items si on si.sale_id = s.id
        where s.business_id = ${ctx.businessId} and s.status = 'completed' and s.completed_at >= ${from} and s.completed_at < ${to} ${b}
        group by 1
      ),
      cnt as (
        select ${bucketSale} as k, count(*)::int as tx, sum(s.total_cents)::bigint as total
        from sales s
        where s.business_id = ${ctx.businessId} and s.status = 'completed' and s.completed_at >= ${from} and s.completed_at < ${to} ${b}
        group by 1
      ),
      rf as (
        select ${bucketRefund} as k,
               sum(r.amount_cents - r.tax_cents) filter (where r.affects_revenue)::bigint as net,
               sum(r.cost_reversal_cents)::bigint as cogs
        from refunds r join sales s on s.id = r.sale_id
        where r.business_id = ${ctx.businessId} and r.created_at >= ${from} and r.created_at < ${to} ${b}
        group by 1
      ),
      keys as (select k from sl union select k from cnt union select k from rf)
      select keys.k,
             (coalesce(sl.net, 0) - coalesce(rf.net, 0))::bigint as net,
             (coalesce(sl.cogs, 0) - coalesce(rf.cogs, 0))::bigint as cogs,
             coalesce(cnt.tx, 0)::int as tx,
             coalesce(cnt.total, 0)::bigint as total
      from keys left join sl on sl.k = keys.k left join cnt on cnt.k = keys.k left join rf on rf.k = keys.k`);
    return new Map(res.rows.map((r) => [r.k, { net: n(r.net), cogs: n(r.cogs), tx: n(r.tx), total: n(r.total) }]));
  };
  const keys = bucketKeys(range);
  const prevRange: ResolvedRange = { ...range, from: range.previous.from, to: range.previous.to };
  const prevKeys = bucketKeys(prevRange);
  const [cur, prev] = await Promise.all([run(range.from, range.to), run(range.previous.from, range.previous.to)]);
  return keys.map((k, i) => {
    const c = cur.get(k) ?? { net: 0, cogs: 0, tx: 0, total: 0 };
    const p = prevKeys[i] ? prev.get(prevKeys[i]) : undefined;
    return { key: k, netSalesCents: c.net, grossProfitCents: c.net - c.cogs, transactions: c.tx, previousNetSalesCents: p?.net ?? 0, previousGrossProfitCents: p ? p.net - p.cogs : 0 };
  });
}

export async function salesByCategory(ctx: Ctx, range: ResolvedRange, branchId?: string | null) {
  const res = await db().execute<{ name: string; net: number; qty: number }>(sql`
    select coalesce(c.name, 'Uncategorised') as name, sum(si.net_cents)::bigint as net, sum(si.quantity)::int as qty
    from sales s
    join sale_items si on si.sale_id = s.id
    left join product_categories c on c.id = si.category_id
    where s.business_id = ${ctx.businessId} and s.status = 'completed' and s.completed_at >= ${range.from} and s.completed_at < ${range.to} ${branchCond("s", branchId)}
    group by 1 order by 2 desc`);
  return res.rows.map((r) => ({ name: r.name, netCents: n(r.net), quantity: n(r.qty) }));
}

export async function topProducts(ctx: Ctx, range: ResolvedRange, branchId?: string | null, limit = 8) {
  const res = await db().execute<{ product_name: string; product_id: string; qty: number; net: number }>(sql`
    select si.product_name, p.id as product_id,
           sum(si.quantity - si.refunded_quantity)::int as qty,
           sum(si.net_cents)::bigint as net
    from sales s
    join sale_items si on si.sale_id = s.id
    join product_variants v on v.id = si.variant_id
    join products p on p.id = v.product_id
    where s.business_id = ${ctx.businessId} and s.status = 'completed' and s.completed_at >= ${range.from} and s.completed_at < ${range.to}
      and si.product_type <> 'service' ${branchCond("s", branchId)}
    group by si.product_name, p.id
    order by qty desc, net desc
    limit ${limit}`);
  return res.rows.map((r) => ({ productName: r.product_name, productId: r.product_id, quantity: n(r.qty), netCents: n(r.net) }));
}

export async function salesByStaff(ctx: Ctx, range: ResolvedRange, branchId?: string | null) {
  const res = await db().execute<{ name: string; tx: number; total: number; net: number }>(sql`
    with s as (
      select s.id, s.sold_by_membership_id, s.total_cents from sales s
      where s.business_id = ${ctx.businessId} and s.status = 'completed' and s.completed_at >= ${range.from} and s.completed_at < ${range.to} ${branchCond("s", branchId)}
    ),
    lines as (select si.sale_id, sum(si.net_cents) as net from sale_items si join s on s.id = si.sale_id group by si.sale_id)
    select coalesce(u.name, 'Unassigned') as name, count(*)::int as tx, sum(s.total_cents)::bigint as total, sum(coalesce(lines.net, 0))::bigint as net
    from s
    left join lines on lines.sale_id = s.id
    left join business_memberships m on m.id = s.sold_by_membership_id
    left join users u on u.id = m.user_id
    group by u.name order by 3 desc`);
  return res.rows.map((r) => ({ name: r.name, transactions: n(r.tx), totalCents: n(r.total), netCents: n(r.net) }));
}

export async function paymentsByMethod(ctx: Ctx, range: ResolvedRange, branchId?: string | null) {
  const res = await db().execute<{ method: string; total: number; count: number }>(sql`
    select p.method, sum(p.amount_cents)::bigint as total, count(*)::int as count
    from payments p join sales s on s.id = p.sale_id
    where p.business_id = ${ctx.businessId} and p.status = 'completed' and p.received_at >= ${range.from} and p.received_at < ${range.to} ${branchCond("s", branchId)}
    group by 1 order by 2 desc`);
  return res.rows.map((r) => ({ method: r.method, totalCents: n(r.total), count: n(r.count) }));
}

export async function expensesByCategory(ctx: Ctx, range: ResolvedRange, branchId?: string | null) {
  const res = await db().execute<{ name: string; total: number }>(sql`
    select c.name, sum(e.amount_cents)::bigint as total
    from expenses e join expense_categories c on c.id = e.category_id
    where e.business_id = ${ctx.businessId} and e.status = 'recorded' and e.expense_date >= ${range.fromDay} and e.expense_date <= ${range.toDay}
      ${branchId ? sql`and e.branch_id = ${branchId}` : sql``}
    group by 1 order by 2 desc`);
  return res.rows.map((r) => ({ name: r.name, totalCents: n(r.total) }));
}

export async function expenseSeries(ctx: Ctx, range: ResolvedRange, branchId?: string | null) {
  const unit = sql.raw(`'${range.bucket}'`);
  const res = await db().execute<{ k: string; total: number }>(sql`
    select to_char(date_trunc(${unit}, e.expense_date::timestamp), 'YYYY-MM-DD') as k, sum(e.amount_cents)::bigint as total
    from expenses e
    where e.business_id = ${ctx.businessId} and e.status = 'recorded' and e.expense_date >= ${range.fromDay} and e.expense_date <= ${range.toDay}
      ${branchId ? sql`and e.branch_id = ${branchId}` : sql``}
    group by 1`);
  const map = new Map(res.rows.map((r) => [r.k, n(r.total)]));
  return bucketKeys(range).map((k) => ({ key: k, expensesCents: map.get(k) ?? 0 }));
}

// ─── CRM metrics ─────────────────────────────────────────────────────────────

export async function leadMetrics(ctx: Ctx, range: ResolvedRange, branchId?: string | null) {
  const branch = branchId ? sql`and l.preferred_branch_id = ${branchId}` : sql``;
  const scope = can(ctx, "leads.view_all") ? sql`` : sql`and l.assigned_membership_id = ${ctx.membershipId}`;
  const counts = await db().execute<{ created: number; converted: number; prev_created: number; prev_converted: number }>(sql`
    select count(*) filter (where l.created_at >= ${range.from} and l.created_at < ${range.to})::int as created,
           count(*) filter (where l.created_at >= ${range.from} and l.created_at < ${range.to} and l.converted_at is not null)::int as converted,
           count(*) filter (where l.created_at >= ${range.previous.from} and l.created_at < ${range.previous.to})::int as prev_created,
           count(*) filter (where l.created_at >= ${range.previous.from} and l.created_at < ${range.previous.to} and l.converted_at is not null)::int as prev_converted
    from leads l where l.business_id = ${ctx.businessId} and l.archived_at is null ${branch} ${scope}`);
  const sources = await db().execute<{ source: string; count: number; converted: number }>(sql`
    select l.source, count(*)::int as count, count(*) filter (where l.converted_at is not null)::int as converted
    from leads l
    where l.business_id = ${ctx.businessId} and l.archived_at is null and l.created_at >= ${range.from} and l.created_at < ${range.to} ${branch} ${scope}
    group by 1 order by 2 desc`);
  // Funnel: how many leads created in the period reached each stage (from their stage history).
  const funnel = await db().execute<Record<string, number>>(sql`
    with cohort as (
      select l.id, l.stage from leads l
      where l.business_id = ${ctx.businessId} and l.archived_at is null and l.created_at >= ${range.from} and l.created_at < ${range.to} ${branch} ${scope}
    ),
    reached as (
      select c.id,
             greatest(
               case c.stage when 'new' then 0 when 'contacted' then 1 when 'follow_up' then 1 when 'qualified' then 2 when 'appointment_scheduled' then 3 when 'converted' then 4 else 0 end,
               coalesce((select max(case a.to_stage when 'contacted' then 1 when 'follow_up' then 1 when 'qualified' then 2 when 'appointment_scheduled' then 3 when 'converted' then 4 else 0 end)
                         from lead_activities a where a.lead_id = c.id), 0)
             ) as lvl
      from cohort c
    )
    select count(*)::int as new,
           count(*) filter (where lvl >= 1)::int as contacted,
           count(*) filter (where lvl >= 2)::int as qualified,
           count(*) filter (where lvl >= 3)::int as appointment,
           count(*) filter (where lvl >= 4)::int as converted
    from reached`);
  const c = counts.rows[0];
  const f = funnel.rows[0];
  const rate = (conv: number, created: number) => (created > 0 ? Math.round((conv / created) * 1000) / 10 : 0);
  return {
    newLeads: n(c.created),
    previousNewLeads: n(c.prev_created),
    converted: n(c.converted),
    conversionRate: rate(n(c.converted), n(c.created)),
    previousConversionRate: rate(n(c.prev_converted), n(c.prev_created)),
    sources: sources.rows.map((r) => ({ source: r.source, count: n(r.count), converted: n(r.converted) })),
    funnel: [
      { stage: "New", count: n(f.new) },
      { stage: "Contacted", count: n(f.contacted) },
      { stage: "Qualified", count: n(f.qualified) },
      { stage: "Appointment", count: n(f.appointment) },
      { stage: "Converted", count: n(f.converted) },
    ],
  };
}

export async function customerMetrics(ctx: Ctx, range: ResolvedRange, branchId?: string | null) {
  const branch = branchId ? sql`and c.home_branch_id = ${branchId}` : sql``;
  const bucket = bucketExpr(sql`c.created_at`, range.bucket, range.timezone);
  const [counts, series, base] = await Promise.all([
    db().execute<{ new_count: number; prev_new: number; total: number }>(sql`
      select count(*) filter (where c.created_at >= ${range.from} and c.created_at < ${range.to})::int as new_count,
             count(*) filter (where c.created_at >= ${range.previous.from} and c.created_at < ${range.previous.to})::int as prev_new,
             count(*) filter (where c.created_at < ${range.to})::int as total
      from customers c where c.business_id = ${ctx.businessId} and c.archived_at is null ${branch}`),
    db().execute<{ k: string; count: number }>(sql`
      select ${bucket} as k, count(*)::int as count from customers c
      where c.business_id = ${ctx.businessId} and c.archived_at is null and c.created_at >= ${range.from} and c.created_at < ${range.to} ${branch}
      group by 1`),
    db().execute<{ count: number }>(sql`
      select count(*)::int as count from customers c
      where c.business_id = ${ctx.businessId} and c.archived_at is null and c.created_at < ${range.from} ${branch}`),
  ]);
  const map = new Map(series.rows.map((r) => [r.k, n(r.count)]));
  let running = n(base.rows[0].count);
  const growth = bucketKeys(range).map((k) => {
    const added = map.get(k) ?? 0;
    running += added;
    return { key: k, newCustomers: added, totalCustomers: running };
  });
  return { newCustomers: n(counts.rows[0].new_count), previousNewCustomers: n(counts.rows[0].prev_new), totalCustomers: n(counts.rows[0].total), growth };
}

export async function appointmentMetrics(ctx: Ctx, range: ResolvedRange, branchId?: string | null) {
  const branch = branchId ? sql`and a.branch_id = ${branchId}` : sql``;
  const scope = can(ctx, "appointments.view_all") ? sql`` : sql`and a.practitioner_membership_id = ${ctx.membershipId}`;
  const res = await db().execute<{ status: string; count: number }>(sql`
    select a.status, count(*)::int as count from appointments a
    where a.business_id = ${ctx.businessId} and a.starts_at >= ${range.from} and a.starts_at < ${range.to} ${branch} ${scope}
    group by 1`);
  const upcoming = await db().execute<{ count: number }>(sql`
    select count(*)::int as count from appointments a
    where a.business_id = ${ctx.businessId} and a.status in ('scheduled', 'confirmed') and a.starts_at >= now() and a.starts_at < now() + interval '7 days' ${branch} ${scope}`);
  const by = Object.fromEntries(res.rows.map((r) => [r.status, n(r.count)])) as Record<string, number>;
  const completed = by.completed ?? 0;
  const noShow = by.no_show ?? 0;
  return {
    byStatus: ["scheduled", "confirmed", "completed", "no_show", "cancelled"].map((s) => ({ status: s, count: by[s] ?? 0 })),
    total: Object.values(by).reduce((a, b) => a + b, 0),
    showRate: completed + noShow > 0 ? Math.round((completed / (completed + noShow)) * 1000) / 10 : null,
    upcoming7d: n(upcoming.rows[0].count),
  };
}

export async function fulfillmentMetrics(ctx: Ctx, range: ResolvedRange, branchId?: string | null) {
  const branch = branchCond("s", branchId);
  const [open, done] = await Promise.all([
    db().execute<{ stage: string; count: number; balance: number }>(sql`
      select s.fulfillment_status as stage, count(*)::int as count, sum(s.balance_due_cents)::bigint as balance
      from sales s where s.business_id = ${ctx.businessId} and s.kind = 'order' and s.status = 'open' ${branch}
      group by 1`),
    db().execute<{ completed: number; avg_days: number | null; on_time: number; with_due: number }>(sql`
      select count(*)::int as completed,
             avg(extract(epoch from (s.completed_at - s.created_at)) / 86400)::float as avg_days,
             count(*) filter (where s.due_on is not null and (coalesce(s.ready_at, s.completed_at) at time zone ${range.timezone})::date <= s.due_on)::int as on_time,
             count(*) filter (where s.due_on is not null)::int as with_due
      from sales s
      where s.business_id = ${ctx.businessId} and s.kind = 'order' and s.status = 'completed' and s.completed_at >= ${range.from} and s.completed_at < ${range.to} ${branch}`),
  ]);
  const order = ["new", "confirmed", "processing", "awaiting_lab", "ready_for_pickup"];
  const map = new Map(open.rows.map((r) => [r.stage, { count: n(r.count), balance: n(r.balance) }]));
  const d = done.rows[0];
  return {
    openByStage: order.map((s) => ({ stage: s, count: map.get(s)?.count ?? 0, balanceCents: map.get(s)?.balance ?? 0 })),
    openTotal: open.rows.reduce((a, r) => a + n(r.count), 0),
    completedInRange: n(d.completed),
    avgTurnaroundDays: d.avg_days === null ? null : Math.round(Number(d.avg_days) * 10) / 10,
    onTimeRate: n(d.with_due) > 0 ? Math.round((n(d.on_time) / n(d.with_due)) * 1000) / 10 : null,
  };
}

// ─── Dashboard bundle ────────────────────────────────────────────────────────

export async function dashboard(ctx: Ctx, range: ResolvedRange, branchId?: string | null) {
  requirePermission(ctx, "dashboard.view");
  const showMoney = can(ctx, "analytics.view");
  const locationId = branchId
    ? (await db().execute<{ id: string }>(sql`select id from inventory_locations where business_id = ${ctx.businessId} and branch_id = ${branchId} limit 1`)).rows[0]?.id ?? null
    : null;

  const [cur, prev, series, categories, products, leadsM, customersM, apptM, fulfil, stock, alerts, outstanding] = await Promise.all([
    showMoney ? financials(ctx, range.from, range.to, range.fromDay, range.toDay, branchId) : null,
    showMoney
      ? financials(ctx, range.previous.from, range.previous.to, isoDay(range.previous.from, range.timezone), isoDay(new Date(range.previous.to.getTime() - 1), range.timezone), branchId)
      : null,
    showMoney ? revenueSeries(ctx, range, branchId) : null,
    showMoney ? salesByCategory(ctx, range, branchId) : null,
    can(ctx, "sales.view") || can(ctx, "products.view") ? topProducts(ctx, range, branchId) : null,
    can(ctx, "leads.view") ? leadMetrics(ctx, range, branchId) : null,
    can(ctx, "customers.view") ? customerMetrics(ctx, range, branchId) : null,
    can(ctx, "appointments.view") ? appointmentMetrics(ctx, range, branchId) : null,
    can(ctx, "orders.view") ? fulfillmentMetrics(ctx, range, branchId) : null,
    can(ctx, "inventory.view") ? stockSummary(ctx, locationId) : null,
    can(ctx, "inventory.view") ? lowStockAlerts(ctx, { locationId, limit: 8 }) : null,
    can(ctx, "sales.view") ? outstandingSummary(ctx, branchId) : null,
  ]);

  return {
    range,
    financials: cur,
    previous: prev,
    changes: cur && prev
      ? {
          grossSales: pctChange(cur.grossSalesCents, prev.grossSalesCents),
          netSales: pctChange(cur.netSalesCents, prev.netSalesCents),
          grossProfit: pctChange(cur.grossProfitCents, prev.grossProfitCents),
          transactions: pctChange(cur.transactions, prev.transactions),
          avgTransaction: pctChange(cur.avgTransactionCents, prev.avgTransactionCents),
          buyingCustomers: pctChange(cur.buyingCustomers, prev.buyingCustomers),
        }
      : null,
    series,
    categories,
    topProducts: products,
    leads: leadsM,
    customers: customersM,
    appointments: apptM,
    fulfillment: fulfil,
    stock,
    lowStock: alerts,
    outstanding,
  };
}

function isoDay(date: Date, tz: string) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}

/** Full financial report for the Reports page and CSV export. */
export async function financialReport(ctx: Ctx, range: ResolvedRange, branchId?: string | null) {
  requireAny(ctx, "analytics.view");
  const prevFromDay = isoDay(range.previous.from, range.timezone);
  const prevToDay = isoDay(new Date(range.previous.to.getTime() - 1), range.timezone);
  const [current, previous, series, expSeries, byMethod, byExpense, byCategory, byStaff, outstanding] = await Promise.all([
    financials(ctx, range.from, range.to, range.fromDay, range.toDay, branchId),
    financials(ctx, range.previous.from, range.previous.to, prevFromDay, prevToDay, branchId),
    revenueSeries(ctx, range, branchId),
    expenseSeries(ctx, range, branchId),
    paymentsByMethod(ctx, range, branchId),
    expensesByCategory(ctx, range, branchId),
    salesByCategory(ctx, range, branchId),
    salesByStaff(ctx, range, branchId),
    outstandingSummary(ctx, branchId),
  ]);
  const trend = series.map((s, i) => ({ ...s, expensesCents: expSeries[i]?.expensesCents ?? 0 }));
  return { current, previous, trend, byMethod, byExpense, byCategory, byStaff, outstanding };
}
