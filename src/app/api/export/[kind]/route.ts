import { and, asc, eq, gte, lt, lte, sql } from "drizzle-orm";
import type { NextRequest } from "next/server";
import { toCsv } from "@/lib/csv";
import { resolveRange } from "@/lib/dates";
import { formatInZone } from "@/lib/dates";
import { getSession } from "@/server/auth/session";
import { getDb } from "@/server/db";
import { branches, customers, expenseCategories, expenses, inventoryLocations, products, productVariants, sales, stockMovements, users, businessMemberships } from "@/server/db/schema";
import { exportProductsCsvRows, PRODUCT_CSV_COLUMNS } from "@/server/services/catalog";
import { can } from "@/server/services/core";
import { financialReport } from "@/server/services/reports";

const money = (c: number) => (c / 100).toFixed(2);

/** CSV exports. Every export re-checks the session and permission server-side and is business-scoped. */
export async function GET(request: NextRequest, ctx: RouteContext<"/api/export/[kind]">) {
  const session = await getSession();
  if (!session) return new Response("Sign in required", { status: 401 });
  const { kind } = await ctx.params;
  const c = session.ctx;
  const biz = session.business;
  const sp = request.nextUrl.searchParams;
  const range = resolveRange(sp.get("range") ?? "30d", biz.timezone, { from: sp.get("from") ?? undefined, to: sp.get("to") ?? undefined });
  const db = getDb();
  let header: string[] = [];
  let rows: unknown[][] = [];

  switch (kind) {
    case "products": {
      if (!can(c, "products.view")) return forbidden();
      header = [...PRODUCT_CSV_COLUMNS];
      rows = await exportProductsCsvRows(c);
      break;
    }
    case "customers": {
      if (!can(c, "customers.view")) return forbidden();
      header = ["code", "first_name", "last_name", "email", "phone", "city", "home_branch", "status", "sms_consent", "marketing_consent", "lifetime_value", "balance_due", "created_at"];
      const r = await db.execute<Record<string, unknown>>(sql`
        select c.code, c.first_name, c.last_name, c.email, c.phone, c.city, b.name as branch, c.status, c.sms_consent, c.marketing_consent, c.created_at,
               coalesce((select sum(s.total_cents - s.refunded_cents) from sales s where s.customer_id = c.id and s.status = 'completed'), 0)::bigint as lifetime,
               coalesce((select sum(s.balance_due_cents) from sales s where s.customer_id = c.id and s.status <> 'cancelled'), 0)::bigint as balance
        from customers c left join branches b on b.id = c.home_branch_id
        where c.business_id = ${biz.id} and c.archived_at is null order by c.last_name, c.first_name`);
      rows = r.rows.map((x) => [x.code, x.first_name, x.last_name, x.email, x.phone, x.city, x.branch, x.status, x.sms_consent ? "yes" : "no", x.marketing_consent ? "yes" : "no", money(Number(x.lifetime)), money(Number(x.balance)), formatInZone(x.created_at as Date, biz.timezone, "yyyy-MM-dd")]);
      break;
    }
    case "sales": {
      if (!can(c, "sales.view")) return forbidden();
      header = ["number", "type", "created_at", "completed_at", "status", "fulfilment", "payment_status", "branch", "customer", "sold_by", "subtotal", "discounts", "tax", "total", "paid", "refunded", "balance_due"];
      const r = await db
        .select({ s: sales, branch: branches.name, first: customers.firstName, last: customers.lastName, seller: users.name })
        .from(sales)
        .innerJoin(branches, eq(branches.id, sales.branchId))
        .leftJoin(customers, eq(customers.id, sales.customerId))
        .leftJoin(businessMemberships, eq(businessMemberships.id, sales.soldByMembershipId))
        .leftJoin(users, eq(users.id, businessMemberships.userId))
        .where(and(eq(sales.businessId, biz.id), gte(sales.createdAt, range.from), lt(sales.createdAt, range.to)))
        .orderBy(asc(sales.createdAt))
        .limit(20000);
      rows = r.map(({ s, branch, first, last, seller }) => [
        s.number,
        s.kind === "order" ? "order" : "pos",
        formatInZone(s.createdAt, biz.timezone, "yyyy-MM-dd HH:mm"),
        s.completedAt ? formatInZone(s.completedAt, biz.timezone, "yyyy-MM-dd HH:mm") : "",
        s.status,
        s.fulfillmentStatus,
        s.paymentStatus,
        branch,
        first ? `${first} ${last}` : "",
        seller ?? "",
        money(s.subtotalCents),
        money(s.discountCents),
        money(s.taxCents),
        money(s.totalCents),
        money(s.paidCents),
        money(s.refundedCents),
        money(s.balanceDueCents),
      ]);
      break;
    }
    case "expenses": {
      if (!can(c, "expenses.view")) return forbidden();
      header = ["date", "category", "description", "payee", "reference", "branch", "payment_method", "amount", "status"];
      const r = await db
        .select({ e: expenses, cat: expenseCategories.name, branch: branches.name })
        .from(expenses)
        .innerJoin(expenseCategories, eq(expenseCategories.id, expenses.categoryId))
        .leftJoin(branches, eq(branches.id, expenses.branchId))
        .where(and(eq(expenses.businessId, biz.id), gte(expenses.expenseDate, range.fromDay), lte(expenses.expenseDate, range.toDay)))
        .orderBy(asc(expenses.expenseDate));
      rows = r.map(({ e, cat, branch }) => [e.expenseDate, cat, e.description, e.payee ?? "", e.reference ?? "", branch ?? "Business-wide", e.paymentMethod ?? "", money(e.amountCents), e.status]);
      break;
    }
    case "movements": {
      if (!can(c, "inventory.view")) return forbidden();
      header = ["when", "product", "sku", "location", "type", "quantity", "on_hand_after", "unit_cost", "reason"];
      const conds = [eq(stockMovements.businessId, biz.id)];
      if (sp.get("range")) conds.push(gte(stockMovements.createdAt, range.from), lt(stockMovements.createdAt, range.to));
      const r = await db
        .select({ m: stockMovements, name: products.name, sku: productVariants.sku, loc: inventoryLocations.name })
        .from(stockMovements)
        .innerJoin(productVariants, eq(productVariants.id, stockMovements.variantId))
        .innerJoin(products, eq(products.id, productVariants.productId))
        .innerJoin(inventoryLocations, eq(inventoryLocations.id, stockMovements.locationId))
        .where(and(...conds))
        .orderBy(asc(stockMovements.createdAt))
        .limit(50000);
      const showCost = can(c, "products.costs");
      rows = r.map(({ m, name, sku, loc }) => [formatInZone(m.createdAt, biz.timezone, "yyyy-MM-dd HH:mm"), name, sku, loc, m.type, m.quantity, m.onHandAfter, showCost ? money(m.unitCostCents) : "", m.reason ?? ""]);
      break;
    }
    case "report": {
      if (!can(c, "analytics.view")) return forbidden();
      const branchId = sp.get("branch") || null;
      const r = await financialReport(c, range, branchId);
      const cur = r.current;
      header = ["metric", "amount", "notes"];
      rows = [
        ["Period", `${range.fromDay} to ${range.toDay}`, range.label],
        ["Gross sales (shelf prices)", money(cur.grossSalesCents), "Σ quantity × unit price on completed sales"],
        ["Discounts", money(cur.discountsCents), ""],
        ["Refunds", money(cur.refundsCents), "Returns and credits dated in the period"],
        [`Tax (${biz.taxName})`, money(cur.taxCents), "Net of refunded tax"],
        ["Net sales (excl. tax)", money(cur.netSalesCents), ""],
        ["Cost of goods sold", money(cur.cogsCents), "Unit costs at time of sale, less restocked returns"],
        ["Gross profit", money(cur.grossProfitCents), ""],
        ["Operating expenses", money(cur.expensesCents), ""],
        ["Estimated operating profit", money(cur.operatingProfitCents), "Operational estimate, not accounting net income"],
        ["Payments collected", money(cur.collectedCents), "Cash basis"],
        ["Refunds paid out", money(cur.refundsPaidOutCents), ""],
        ["Net cash collected", money(cur.netCollectedCents), ""],
        ["Outstanding receivables (now)", money(r.outstanding.receivableCents), ""],
        ["Open order balances (now)", money(r.outstanding.openOrderBalanceCents), "Not yet revenue"],
        [],
        ["Period", "Net sales", "Gross profit", "Expenses", "Transactions"],
        ...r.trend.map((t) => [t.key, money(t.netSalesCents), money(t.grossProfitCents), money(t.expensesCents), t.transactions]),
      ];
      break;
    }
    default:
      return new Response("Unknown export", { status: 404 });
  }

  const csv = toCsv(header, rows);
  const file = `${biz.slug}-${kind}-${new Date().toISOString().slice(0, 10)}.csv`;
  return new Response("﻿" + csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${file}"`,
      "Cache-Control": "no-store",
    },
  });
}

function forbidden() {
  return new Response("You don't have permission to export this data.", { status: 403 });
}
