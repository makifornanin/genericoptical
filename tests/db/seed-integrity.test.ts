import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { resolveRange } from "@/lib/dates";
import { getDb } from "@/server/db";
import { removeDemoData, seedDemo, verifyIntegrity } from "@/server/demo/seed";
import { authenticate, resolveSession } from "@/server/services/auth";
import { dashboard, financials } from "@/server/services/reports";

describe("demo data", () => {
  it("is generated through the real services and reconciles completely", { timeout: 240_000 }, async () => {
    const { businessId, stats } = await seedDemo({ days: 21, log: () => {} });
    expect(stats.sales).toBeGreaterThan(50);
    expect(await verifyIntegrity(businessId)).toEqual([]);

    // Dashboard totals equal a direct aggregate over the underlying rows.
    const session = await authenticate("owner@lensmere.example", "Lensmere-demo-2026");
    const ctx = (await resolveSession(session.token))!.ctx;
    const range = resolveRange("30d", "Asia/Manila");
    const dash = await dashboard(ctx, range);
    const direct = await getDb().execute<{ net: number; tx: number }>(sql`
      select coalesce(sum(si.net_cents), 0)::bigint
               - coalesce((select sum(r.amount_cents - r.tax_cents) from refunds r
                           where r.business_id = ${businessId} and r.affects_revenue and r.created_at >= ${range.from} and r.created_at < ${range.to}), 0)::bigint as net,
             count(distinct s.id)::int as tx
      from sales s join sale_items si on si.sale_id = s.id
      where s.business_id = ${businessId} and s.status = 'completed' and s.completed_at >= ${range.from} and s.completed_at < ${range.to}`);
    expect(dash.financials!.netSalesCents).toBe(Number(direct.rows[0].net));
    expect(dash.financials!.transactions).toBe(Number(direct.rows[0].tx));
    const f = await financials(ctx, range.from, range.to, range.fromDay, range.toDay);
    expect(f.grossProfitCents).toBe(f.netSalesCents - f.cogsCents);

    // Reset removes only demo data.
    expect(await removeDemoData()).toBe(1);
    const [{ n }] = (await getDb().execute<{ n: number }>(sql`select count(*)::int as n from sales`)).rows;
    expect(Number(n)).toBe(0);
  });
});
