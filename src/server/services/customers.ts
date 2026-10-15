import { onCustomerChanged } from "@/server/integrations/ghl/triggers";
import { and, asc, desc, eq, isNotNull, isNull, or, sql, type SQL } from "drizzle-orm";
import { customerInput, prescriptionInput } from "@/lib/schemas";
import { getDb, type Executor } from "@/server/db";
import {
  appointments,
  appointmentTypes,
  auditLogs,
  branches,
  businessMemberships,
  customers,
  leads,
  payments,
  prescriptions,
  sales,
  users,
} from "@/server/db/schema";
import { audit, can, db, diff, invalid, likePattern, mapDbError, nextNumber, notFound, now, pageOf, paging, requirePermission, type Ctx, ref } from "./core";

export type CustomerFilter = {
  q?: string;
  status?: "active" | "inactive" | "archived" | "all";
  branchId?: string | null;
  withBalance?: boolean;
  page?: number;
  pageSize?: number;
  sort?: string;
  dir?: "asc" | "desc";
};

export async function listCustomers(ctx: Ctx, f: CustomerFilter) {
  requirePermission(ctx, "customers.view");
  const { page, pageSize, offset } = paging(f);
  const conds: SQL[] = [eq(customers.businessId, ctx.businessId)];
  const status = f.status ?? "active";
  if (status === "archived") conds.push(isNotNull(customers.archivedAt));
  else {
    conds.push(isNull(customers.archivedAt));
    if (status !== "all") conds.push(eq(customers.status, status));
  }
  if (f.branchId) conds.push(eq(customers.homeBranchId, f.branchId));
  if (f.q) {
    const p = likePattern(f.q);
    conds.push(
      sql`(${customers.firstName} || ' ' || ${customers.lastName} ilike ${p} or coalesce(${customers.email}, '') ilike ${p} or coalesce(${customers.phone}, '') ilike ${p} or ${customers.code} ilike ${p})`,
    );
  }
  const agg = sql`(select json_build_object(
      'lifetimeCents', coalesce(sum(s.total_cents - s.refunded_cents) filter (where s.status = 'completed'), 0)::bigint,
      'balanceCents', coalesce(sum(s.balance_due_cents) filter (where s.status <> 'cancelled'), 0)::bigint,
      'visits', count(*) filter (where s.status = 'completed')::int,
      'lastPurchase', max(s.completed_at) filter (where s.status = 'completed'),
      'openOrders', count(*) filter (where s.status = 'open')::int
    ) from sales s where s.customer_id = ${ref(customers.id)})`;
  if (f.withBalance) conds.push(sql`exists (select 1 from sales s where s.customer_id = ${ref(customers.id)} and s.balance_due_cents > 0 and s.status <> 'cancelled')`);
  const where = and(...conds);
  const sortMap: Record<string, SQL> = {
    name: sql`${customers.lastName} ${f.dir === "desc" ? sql`desc` : sql`asc`}, ${customers.firstName}`,
    created: sql`${customers.createdAt} ${f.dir === "asc" ? sql`asc` : sql`desc`}`,
    lifetime: sql`(${agg}->>'lifetimeCents')::bigint ${f.dir === "asc" ? sql`asc` : sql`desc`}`,
    last: sql`(${agg}->>'lastPurchase')::timestamptz ${f.dir === "asc" ? sql`asc nulls first` : sql`desc nulls last`}`,
  };
  const rows = await db()
    .select({
      id: customers.id,
      code: customers.code,
      firstName: customers.firstName,
      lastName: customers.lastName,
      email: customers.email,
      phone: customers.phone,
      status: customers.status,
      archivedAt: customers.archivedAt,
      createdAt: customers.createdAt,
      homeBranchName: branches.name,
      stats: sql<{ lifetimeCents: number; balanceCents: number; visits: number; lastPurchase: string | null; openOrders: number }>`${agg}`,
    })
    .from(customers)
    .leftJoin(branches, eq(branches.id, customers.homeBranchId))
    .where(where)
    .orderBy(sortMap[f.sort ?? "name"] ?? sortMap.name)
    .limit(pageSize)
    .offset(offset);
  const [{ count }] = await db().select({ count: sql<number>`count(*)::int` }).from(customers).where(where);
  return pageOf(rows, Number(count), page, pageSize);
}

/** Lightweight lookup for pickers (POS, orders, appointments). */
export async function searchCustomers(ctx: Ctx, q: string, limit = 12) {
  requirePermission(ctx, "customers.view");
  const conds: SQL[] = [eq(customers.businessId, ctx.businessId), isNull(customers.archivedAt)];
  if (q.trim()) {
    const p = likePattern(q);
    conds.push(sql`(${customers.firstName} || ' ' || ${customers.lastName} ilike ${p} or coalesce(${customers.email}, '') ilike ${p} or coalesce(${customers.phone}, '') ilike ${p} or ${customers.code} ilike ${p})`);
  }
  return db()
    .select({ id: customers.id, code: customers.code, firstName: customers.firstName, lastName: customers.lastName, email: customers.email, phone: customers.phone })
    .from(customers)
    .where(and(...conds))
    .orderBy(asc(customers.lastName), asc(customers.firstName))
    .limit(limit);
}

export async function getCustomer(ctx: Ctx, id: string) {
  requirePermission(ctx, "customers.view");
  const [row] = await db()
    .select({ customer: customers, homeBranchName: branches.name, leadCode: leads.code })
    .from(customers)
    .leftJoin(branches, eq(branches.id, customers.homeBranchId))
    .leftJoin(leads, eq(leads.id, customers.convertedFromLeadId))
    .where(and(eq(customers.businessId, ctx.businessId), eq(customers.id, id)))
    .limit(1);
  if (!row) throw notFound("Customer");

  const canSeeSales = can(ctx, "sales.view");
  const [saleRows, paymentRows, appointmentRows, rxRows, history, stats] = await Promise.all([
    canSeeSales
      ? db()
          .select({
            id: sales.id,
            number: sales.number,
            kind: sales.kind,
            status: sales.status,
            fulfillmentStatus: sales.fulfillmentStatus,
            paymentStatus: sales.paymentStatus,
            totalCents: sales.totalCents,
            refundedCents: sales.refundedCents,
            balanceDueCents: sales.balanceDueCents,
            createdAt: sales.createdAt,
            completedAt: sales.completedAt,
            dueOn: sales.dueOn,
            items: sql<string>`(select string_agg(si.product_name || case when si.quantity > 1 then ' ×' || si.quantity else '' end, ', ' order by si.sort_order) from sale_items si where si.sale_id = ${ref(sales.id)})`,
          })
          .from(sales)
          .where(and(eq(sales.businessId, ctx.businessId), eq(sales.customerId, id)))
          .orderBy(desc(sales.createdAt))
          .limit(100)
      : Promise.resolve([]),
    canSeeSales
      ? db()
          .select({
            id: payments.id,
            method: payments.method,
            amountCents: payments.amountCents,
            status: payments.status,
            receivedAt: payments.receivedAt,
            reference: payments.reference,
            saleId: sales.id,
            saleNumber: sales.number,
          })
          .from(payments)
          .innerJoin(sales, eq(sales.id, payments.saleId))
          .where(and(eq(payments.businessId, ctx.businessId), eq(sales.customerId, id)))
          .orderBy(desc(payments.receivedAt))
          .limit(100)
      : Promise.resolve([]),
    db()
      .select({
        id: appointments.id,
        startsAt: appointments.startsAt,
        endsAt: appointments.endsAt,
        status: appointments.status,
        typeName: appointmentTypes.name,
        branchName: branches.name,
        practitionerName: users.name,
      })
      .from(appointments)
      .innerJoin(appointmentTypes, eq(appointmentTypes.id, appointments.appointmentTypeId))
      .innerJoin(branches, eq(branches.id, appointments.branchId))
      .leftJoin(businessMemberships, eq(businessMemberships.id, appointments.practitionerMembershipId))
      .leftJoin(users, eq(users.id, businessMemberships.userId))
      .where(and(eq(appointments.businessId, ctx.businessId), eq(appointments.customerId, id)))
      .orderBy(desc(appointments.startsAt))
      .limit(100),
    can(ctx, "prescriptions.view") ? listPrescriptions(ctx, id) : Promise.resolve(null),
    db()
      .select()
      .from(auditLogs)
      .where(
        and(
          eq(auditLogs.businessId, ctx.businessId),
          or(
            and(eq(auditLogs.entityType, "customer"), eq(auditLogs.entityId, id)),
            sql`(${auditLogs.entityType} = 'sale' and ${auditLogs.entityId} in (select s.id from sales s where s.customer_id = ${id}))`,
            sql`(${auditLogs.entityType} = 'appointment' and ${auditLogs.entityId} in (select a.id from appointments a where a.customer_id = ${id}))`,
            row.customer.convertedFromLeadId ? and(eq(auditLogs.entityType, "lead"), eq(auditLogs.entityId, row.customer.convertedFromLeadId)) : sql`false`,
          ),
        ),
      )
      .orderBy(desc(auditLogs.createdAt))
      .limit(60),
    db().execute<{ lifetime: number; net_revenue: number; balance: number; visits: number; open_orders: number; avg_order: number; first_purchase: string | null; last_purchase: string | null }>(sql`
      select coalesce(sum(total_cents - refunded_cents) filter (where status = 'completed'), 0)::bigint as lifetime,
             coalesce(sum(balance_due_cents) filter (where status <> 'cancelled'), 0)::bigint as balance,
             count(*) filter (where status = 'completed')::int as visits,
             count(*) filter (where status = 'open')::int as open_orders,
             coalesce(round(avg(total_cents) filter (where status = 'completed')), 0)::bigint as avg_order,
             min(completed_at) filter (where status = 'completed') as first_purchase,
             max(completed_at) filter (where status = 'completed') as last_purchase
      from sales where business_id = ${ctx.businessId} and customer_id = ${id}`),
  ]);
  const s = stats.rows[0];
  return {
    ...row,
    sales: saleRows,
    payments: paymentRows,
    appointments: appointmentRows,
    prescriptions: rxRows,
    history,
    stats: {
      lifetimeCents: Number(s.lifetime),
      balanceCents: Number(s.balance),
      visits: Number(s.visits),
      openOrders: Number(s.open_orders),
      avgOrderCents: Number(s.avg_order),
      firstPurchase: s.first_purchase,
      lastPurchase: s.last_purchase,
    },
  };
}

async function assertBranch(ex: Executor, ctx: Ctx, branchId: string | null) {
  if (!branchId) return;
  const [b] = await ex.select({ id: branches.id }).from(branches).where(and(eq(branches.businessId, ctx.businessId), eq(branches.id, branchId))).limit(1);
  if (!b) throw invalid("Unknown branch.");
}

export async function createCustomer(ctx: Ctx, raw: unknown, ex?: Executor) {
  requirePermission(ctx, "customers.manage");
  const input = customerInput.parse(raw);
  const run = async (tx: Executor) => {
    await assertBranch(tx, ctx, input.homeBranchId);
    const code = await nextNumber(tx, ctx.businessId, "customer", "CUS-", 5);
    const at = now(ctx);
    const [row] = await tx
      .insert(customers)
      .values({ ...input, businessId: ctx.businessId, code, createdByMembershipId: ctx.membershipId, createdAt: at, updatedAt: at })
      .returning();
    await audit(tx, ctx, { action: "customer.created", entityType: "customer", entityId: row.id, summary: `Added customer ${row.firstName} ${row.lastName} (${row.code})` });
    await onCustomerChanged(tx, ctx.businessId, row.id);
    return row;
  };
  try {
    return ex ? await run(ex) : await getDb().transaction(run);
  } catch (error) {
    mapDbError(error);
  }
}

export async function updateCustomer(ctx: Ctx, id: string, raw: unknown) {
  requirePermission(ctx, "customers.manage");
  const input = customerInput.parse(raw);
  try {
    return await getDb().transaction(async (tx) => {
      const [existing] = await tx.select().from(customers).where(and(eq(customers.businessId, ctx.businessId), eq(customers.id, id))).for("update");
      if (!existing) throw notFound("Customer");
      await assertBranch(tx, ctx, input.homeBranchId);
      const [row] = await tx.update(customers).set({ ...input, updatedAt: now(ctx) }).where(eq(customers.id, id)).returning();
      await onCustomerChanged(tx, ctx.businessId, id);
      await audit(tx, ctx, {
        action: "customer.updated",
        entityType: "customer",
        entityId: id,
        summary: `Updated customer ${row.firstName} ${row.lastName}`,
        changes: diff(existing as unknown as Record<string, unknown>, input),
      });
      return row;
    });
  } catch (error) {
    mapDbError(error);
  }
}

export async function setCustomerArchived(ctx: Ctx, id: string, archived: boolean) {
  requirePermission(ctx, "customers.manage");
  return getDb().transaction(async (tx) => {
    const [existing] = await tx.select().from(customers).where(and(eq(customers.businessId, ctx.businessId), eq(customers.id, id))).for("update");
    if (!existing) throw notFound("Customer");
    if (archived) {
      const [{ open }] = await tx
        .select({ open: sql<number>`count(*)::int` })
        .from(sales)
        .where(and(eq(sales.customerId, id), or(eq(sales.status, "open"), sql`${sales.balanceDueCents} > 0 and ${sales.status} <> 'cancelled'`)));
      if (Number(open) > 0) throw invalid("This customer has open orders or an outstanding balance. Settle those before archiving.");
    }
    await tx.update(customers).set({ archivedAt: archived ? now(ctx) : null, updatedAt: now(ctx) }).where(eq(customers.id, id));
    await audit(tx, ctx, {
      action: archived ? "customer.archived" : "customer.restored",
      entityType: "customer",
      entityId: id,
      summary: `${archived ? "Archived" : "Restored"} customer ${existing.firstName} ${existing.lastName}`,
    });
    return { id };
  });
}

// ─── Prescriptions (clinical, permission-gated) ──────────────────────────────

export async function listPrescriptions(ctx: Ctx, customerId: string) {
  requirePermission(ctx, "prescriptions.view");
  return db()
    .select({ rx: prescriptions, practitionerName: users.name })
    .from(prescriptions)
    .leftJoin(businessMemberships, eq(businessMemberships.id, prescriptions.practitionerMembershipId))
    .leftJoin(users, eq(users.id, businessMemberships.userId))
    .where(and(eq(prescriptions.businessId, ctx.businessId), eq(prescriptions.customerId, customerId)))
    .orderBy(desc(prescriptions.examinedOn), desc(prescriptions.createdAt));
}

const num = (v: number | null) => (v === null ? null : v.toFixed(2));

export async function savePrescription(ctx: Ctx, id: string | null, raw: unknown) {
  requirePermission(ctx, "prescriptions.manage");
  const input = prescriptionInput.parse(raw);
  try {
    return await getDb().transaction(async (tx) => {
      const [c] = await tx.select({ id: customers.id, firstName: customers.firstName, lastName: customers.lastName }).from(customers).where(and(eq(customers.businessId, ctx.businessId), eq(customers.id, input.customerId))).limit(1);
      if (!c) throw notFound("Customer");
      if (input.practitionerMembershipId) {
        const [m] = await tx.select({ id: businessMemberships.id }).from(businessMemberships).where(and(eq(businessMemberships.businessId, ctx.businessId), eq(businessMemberships.id, input.practitionerMembershipId))).limit(1);
        if (!m) throw invalid("Unknown practitioner.");
      }
      const values = {
        customerId: input.customerId,
        kind: input.kind,
        examinedOn: input.examinedOn,
        expiresOn: input.expiresOn,
        practitionerMembershipId: input.practitionerMembershipId ?? ctx.membershipId,
        odSphere: num(input.odSphere),
        odCylinder: num(input.odCylinder),
        odAxis: input.odAxis,
        odAdd: num(input.odAdd),
        osSphere: num(input.osSphere),
        osCylinder: num(input.osCylinder),
        osAxis: input.osAxis,
        osAdd: num(input.osAdd),
        pdDistance: input.pdDistance === null ? null : input.pdDistance.toFixed(1),
        notes: input.notes,
      };
      const at = now(ctx);
      let rxId = id;
      if (id) {
        const [r] = await tx
          .update(prescriptions)
          .set({ ...values, updatedAt: at })
          .where(and(eq(prescriptions.businessId, ctx.businessId), eq(prescriptions.id, id), eq(prescriptions.customerId, input.customerId)))
          .returning({ id: prescriptions.id });
        if (!r) throw notFound("Prescription");
      } else {
        const [r] = await tx
          .insert(prescriptions)
          .values({ ...values, businessId: ctx.businessId, createdByMembershipId: ctx.membershipId, createdAt: at, updatedAt: at })
          .returning({ id: prescriptions.id });
        rxId = r.id;
      }
      // Clinical values are deliberately left out of the audit summary.
      await audit(tx, ctx, {
        action: id ? "prescription.updated" : "prescription.created",
        entityType: "customer",
        entityId: c.id,
        summary: `${id ? "Updated" : "Recorded"} ${input.kind === "contact_lens" ? "contact lens" : "spectacle"} prescription for ${c.firstName} ${c.lastName}`,
      });
      return { prescriptionId: rxId! };
    });
  } catch (error) {
    mapDbError(error);
  }
}
