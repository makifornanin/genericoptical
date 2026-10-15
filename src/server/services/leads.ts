import { and, asc, desc, eq, gte, inArray, isNull, lte, notInArray, or, sql, type SQL } from "drizzle-orm";
import { LEAD_INTEREST_LABELS, LEAD_STAGE_LABELS, LEAD_STAGES, leadInput, publicLeadInput, type LeadStage } from "@/lib/schemas";
import { getDb, type Executor, type Tx } from "@/server/db";
import { appointments, branches, businessMemberships, customers, leadActivities, leads, users } from "@/server/db/schema";
import {
  audit,
  can,
  db,
  diff,
  forbidden,
  invalid,
  isUuid,
  likePattern,
  mapDbError,
  nextNumber,
  notFound,
  now,
  pageOf,
  paging,
  requirePermission,
  systemCtx,
  type Ctx,
} from "./core";
import { onLeadChanged } from "@/server/integrations/ghl/triggers";

type LeadRow = typeof leads.$inferSelect;

/** Sales staff only see leads assigned to them; managers and owners see everything. */
function scope(ctx: Ctx): SQL {
  if (can(ctx, "leads.view_all")) return sql`true`;
  return ctx.membershipId ? eq(leads.assignedMembershipId, ctx.membershipId) : sql`false`;
}

async function activity(ex: Executor, ctx: Ctx, leadId: string, a: { type: string; body?: string | null; fromStage?: LeadStage | null; toStage?: LeadStage | null; metadata?: Record<string, unknown> }) {
  await ex.insert(leadActivities).values({
    businessId: ctx.businessId,
    leadId,
    type: a.type,
    body: a.body ?? null,
    fromStage: a.fromStage ?? null,
    toStage: a.toStage ?? null,
    actorMembershipId: ctx.membershipId,
    metadata: a.metadata ?? null,
    createdAt: now(ctx),
  });
}

async function lockLead(tx: Tx, ctx: Ctx, id: string): Promise<LeadRow> {
  const [lead] = await tx
    .select()
    .from(leads)
    .where(and(eq(leads.businessId, ctx.businessId), eq(leads.id, id), scope(ctx)))
    .for("update");
  if (!lead) throw notFound("Lead");
  return lead;
}

async function assertAssignee(ex: Executor, ctx: Ctx, membershipId: string | null) {
  if (!membershipId) return null;
  const [m] = await ex
    .select({ id: businessMemberships.id, name: users.name, isActive: businessMemberships.isActive })
    .from(businessMemberships)
    .innerJoin(users, eq(users.id, businessMemberships.userId))
    .where(and(eq(businessMemberships.businessId, ctx.businessId), eq(businessMemberships.id, membershipId)))
    .limit(1);
  if (!m || !m.isActive) throw invalid("Choose an active staff member.");
  return m;
}

async function assertBranch(ex: Executor, ctx: Ctx, branchId: string | null) {
  if (!branchId) return;
  const [b] = await ex.select({ id: branches.id }).from(branches).where(and(eq(branches.businessId, ctx.businessId), eq(branches.id, branchId))).limit(1);
  if (!b) throw invalid("Unknown branch.");
}

// ─── Queries ─────────────────────────────────────────────────────────────────

export type LeadFilter = {
  q?: string;
  stage?: string | null;
  source?: string | null;
  assigned?: string | null;
  followUp?: "due" | "overdue" | null;
  open?: boolean;
  page?: number;
  pageSize?: number;
  sort?: string;
  dir?: "asc" | "desc";
};

function leadConds(ctx: Ctx, f: LeadFilter): SQL[] {
  const conds: SQL[] = [eq(leads.businessId, ctx.businessId), isNull(leads.archivedAt), scope(ctx)];
  if (f.stage && (LEAD_STAGES as readonly string[]).includes(f.stage)) conds.push(sql`${leads.stage} = ${f.stage}`);
  if (f.open) conds.push(notInArray(leads.stage, ["converted", "lost"]));
  if (f.source) conds.push(eq(leads.source, f.source));
  if (f.assigned === "unassigned") conds.push(isNull(leads.assignedMembershipId));
  else if (f.assigned === "me" && ctx.membershipId) conds.push(eq(leads.assignedMembershipId, ctx.membershipId));
  else if (isUuid(f.assigned)) conds.push(eq(leads.assignedMembershipId, f.assigned));
  if (f.followUp === "due") conds.push(lte(leads.followUpAt, new Date(Date.now() + 86_400_000)), notInArray(leads.stage, ["converted", "lost"]));
  if (f.followUp === "overdue") conds.push(lte(leads.followUpAt, new Date()), notInArray(leads.stage, ["converted", "lost"]));
  if (f.q) {
    const p = likePattern(f.q);
    conds.push(sql`(${leads.firstName} || ' ' || ${leads.lastName} ilike ${p} or coalesce(${leads.email}, '') ilike ${p} or coalesce(${leads.phone}, '') ilike ${p} or ${leads.code} ilike ${p})`);
  }
  return conds;
}

const leadColumns = {
  id: leads.id,
  code: leads.code,
  firstName: leads.firstName,
  lastName: leads.lastName,
  email: leads.email,
  phone: leads.phone,
  source: leads.source,
  interest: leads.interest,
  stage: leads.stage,
  followUpAt: leads.followUpAt,
  estimatedValueCents: leads.estimatedValueCents,
  createdAt: leads.createdAt,
  updatedAt: leads.updatedAt,
  convertedCustomerId: leads.convertedCustomerId,
  assignedMembershipId: leads.assignedMembershipId,
  assignedName: users.name,
  branchName: branches.name,
};

export async function listLeads(ctx: Ctx, f: LeadFilter) {
  requirePermission(ctx, "leads.view");
  const { page, pageSize, offset } = paging(f);
  const where = and(...leadConds(ctx, f));
  const sortCol = { created: leads.createdAt, updated: leads.updatedAt, follow_up: leads.followUpAt, name: leads.lastName, value: leads.estimatedValueCents }[f.sort ?? "created"] ?? leads.createdAt;
  const rows = await db()
    .select(leadColumns)
    .from(leads)
    .leftJoin(businessMemberships, eq(businessMemberships.id, leads.assignedMembershipId))
    .leftJoin(users, eq(users.id, businessMemberships.userId))
    .leftJoin(branches, eq(branches.id, leads.preferredBranchId))
    .where(where)
    .orderBy(f.dir === "asc" ? sql`${sortCol} asc nulls last` : sql`${sortCol} desc nulls last`, desc(leads.id))
    .limit(pageSize)
    .offset(offset);
  const [{ count }] = await db().select({ count: sql<number>`count(*)::int` }).from(leads).where(where);
  return pageOf(rows, Number(count), page, pageSize);
}

/** Pipeline board: open stages show every lead; converted/lost show the 30 most recent. */
export async function pipelineBoard(ctx: Ctx, f: { q?: string; assigned?: string | null; source?: string | null }) {
  requirePermission(ctx, "leads.view");
  const conds = leadConds(ctx, f);
  const rows = await db()
    .select(leadColumns)
    .from(leads)
    .leftJoin(businessMemberships, eq(businessMemberships.id, leads.assignedMembershipId))
    .leftJoin(users, eq(users.id, businessMemberships.userId))
    .leftJoin(branches, eq(branches.id, leads.preferredBranchId))
    .where(and(...conds, or(notInArray(leads.stage, ["converted", "lost"]), gte(leads.updatedAt, new Date(Date.now() - 45 * 86_400_000)))))
    .orderBy(asc(sql`coalesce(${leads.followUpAt}, ${leads.createdAt})`))
    .limit(600);
  return LEAD_STAGES.map((stage) => {
    const items = rows.filter((r) => r.stage === stage);
    return {
      stage,
      label: LEAD_STAGE_LABELS[stage],
      count: items.length,
      valueCents: items.reduce((s, r) => s + (r.estimatedValueCents ?? 0), 0),
      leads: stage === "converted" || stage === "lost" ? items.slice(-30).reverse() : items,
    };
  });
}

export async function getLead(ctx: Ctx, id: string) {
  requirePermission(ctx, "leads.view");
  const [lead] = await db()
    .select({ lead: leads, assignedName: users.name, branchName: branches.name, customerCode: customers.code })
    .from(leads)
    .leftJoin(businessMemberships, eq(businessMemberships.id, leads.assignedMembershipId))
    .leftJoin(users, eq(users.id, businessMemberships.userId))
    .leftJoin(branches, eq(branches.id, leads.preferredBranchId))
    .leftJoin(customers, eq(customers.id, leads.convertedCustomerId))
    .where(and(eq(leads.businessId, ctx.businessId), eq(leads.id, id), scope(ctx)))
    .limit(1);
  if (!lead) throw notFound("Lead");
  const actor = users;
  const timeline = await db()
    .select({ activity: leadActivities, actorName: actor.name })
    .from(leadActivities)
    .leftJoin(businessMemberships, eq(businessMemberships.id, leadActivities.actorMembershipId))
    .leftJoin(actor, eq(actor.id, businessMemberships.userId))
    .where(and(eq(leadActivities.businessId, ctx.businessId), eq(leadActivities.leadId, id)))
    .orderBy(desc(leadActivities.createdAt));
  const appts = await db()
    .select({ id: appointments.id, startsAt: appointments.startsAt, status: appointments.status })
    .from(appointments)
    .where(and(eq(appointments.businessId, ctx.businessId), eq(appointments.leadId, id)))
    .orderBy(desc(appointments.startsAt));
  return { ...lead, timeline, appointments: appts };
}

/** Customers that look like the same person (email or phone match), shown before converting. */
export async function duplicateCandidates(ctx: Ctx, leadId: string) {
  requirePermission(ctx, "leads.view");
  const [lead] = await db().select().from(leads).where(and(eq(leads.businessId, ctx.businessId), eq(leads.id, leadId), scope(ctx))).limit(1);
  if (!lead) throw notFound("Lead");
  const conds: SQL[] = [];
  if (lead.email) conds.push(sql`lower(${customers.email}) = ${lead.email.toLowerCase()}`);
  if (lead.phone) conds.push(sql`regexp_replace(coalesce(${customers.phone}, ''), '[^0-9]', '', 'g') = ${lead.phone.replace(/\D/g, "")}`);
  if (!conds.length) return [];
  return db()
    .select({ id: customers.id, code: customers.code, firstName: customers.firstName, lastName: customers.lastName, email: customers.email, phone: customers.phone })
    .from(customers)
    .where(and(eq(customers.businessId, ctx.businessId), isNull(customers.archivedAt), or(...conds)))
    .limit(5);
}

// ─── Mutations ───────────────────────────────────────────────────────────────

export async function createLead(ctx: Ctx, raw: unknown) {
  requirePermission(ctx, "leads.manage");
  const input = leadInput.parse(raw);
  if (input.assignedMembershipId && input.assignedMembershipId !== ctx.membershipId) requirePermission(ctx, "leads.assign");
  // Staff who can't see all leads keep what they create.
  const assignedMembershipId = input.assignedMembershipId ?? (can(ctx, "leads.view_all") ? null : ctx.membershipId);
  try {
    return await getDb().transaction(async (tx) => {
      await assertAssignee(tx, ctx, assignedMembershipId);
      await assertBranch(tx, ctx, input.preferredBranchId);
      const code = await nextNumber(tx, ctx.businessId, "lead", "LD-", 5);
      const at = now(ctx);
      const [lead] = await tx
        .insert(leads)
        .values({ ...input, assignedMembershipId, businessId: ctx.businessId, code, createdAt: at, updatedAt: at })
        .returning();
      await activity(tx, ctx, lead.id, { type: "created", body: input.message, toStage: "new", metadata: { source: input.source } });
      await audit(tx, ctx, { action: "lead.created", entityType: "lead", entityId: lead.id, summary: `Added lead ${lead.firstName} ${lead.lastName} (${lead.code})` });
      await onLeadChanged(tx, ctx.businessId, lead.id);
      return lead;
    });
  } catch (error) {
    mapDbError(error);
  }
}

export async function updateLead(ctx: Ctx, id: string, raw: unknown) {
  requirePermission(ctx, "leads.manage");
  const input = leadInput.parse(raw);
  try {
    return await getDb().transaction(async (tx) => {
      const lead = await lockLead(tx, ctx, id);
      if (input.assignedMembershipId !== lead.assignedMembershipId) {
        requirePermission(ctx, "leads.assign");
        await assertAssignee(tx, ctx, input.assignedMembershipId);
      }
      await assertBranch(tx, ctx, input.preferredBranchId);
      const changes = diff(lead as unknown as Record<string, unknown>, input);
      const [row] = await tx.update(leads).set({ ...input, updatedAt: now(ctx) }).where(eq(leads.id, id)).returning();
      if (changes.assignedMembershipId) {
        const who = await assertAssignee(tx, ctx, input.assignedMembershipId);
        await activity(tx, ctx, id, { type: "assignment", body: who ? `Assigned to ${who.name}` : "Unassigned" });
      }
      if (changes.followUpAt && input.followUpAt) await activity(tx, ctx, id, { type: "follow_up", body: `Follow-up set for ${input.followUpAt.toISOString()}`, metadata: { at: input.followUpAt.toISOString() } });
      await audit(tx, ctx, { action: "lead.updated", entityType: "lead", entityId: id, summary: `Updated lead ${row.firstName} ${row.lastName}`, changes });
      await onLeadChanged(tx, ctx.businessId, id);
      return row;
    });
  } catch (error) {
    mapDbError(error);
  }
}

export async function changeLeadStage(ctx: Ctx, id: string, to: LeadStage, note?: string | null) {
  requirePermission(ctx, "leads.manage");
  if (!LEAD_STAGES.includes(to)) throw invalid("Unknown stage.");
  if (to === "converted") throw invalid("Use “Convert to customer” to convert a lead.");
  if (to === "lost" && !note?.trim()) throw invalid("Add a reason when marking a lead as lost.");
  try {
    return await getDb().transaction(async (tx) => {
      const lead = await lockLead(tx, ctx, id);
      if (lead.stage === "converted") throw invalid("Converted leads keep their history and can't change stage.");
      if (lead.stage === to) return lead;
      const at = now(ctx);
      const [row] = await tx
        .update(leads)
        .set({
          stage: to,
          lostReason: to === "lost" ? note!.trim() : null,
          lastContactedAt: to === "contacted" ? at : lead.lastContactedAt,
          updatedAt: at,
        })
        .where(eq(leads.id, id))
        .returning();
      await activity(tx, ctx, id, { type: "stage_change", body: note?.trim() || null, fromStage: lead.stage, toStage: to });
      await audit(tx, ctx, {
        action: "lead.stage_changed",
        entityType: "lead",
        entityId: id,
        summary: `${lead.code}: ${LEAD_STAGE_LABELS[lead.stage]} → ${LEAD_STAGE_LABELS[to]}`,
      });
      await onLeadChanged(tx, ctx.businessId, id);
      return row;
    });
  } catch (error) {
    mapDbError(error);
  }
}

export async function addLeadNote(ctx: Ctx, id: string, input: { body: string; type?: "note" | "call" | "email" | "sms"; followUpAt?: string | null }) {
  requirePermission(ctx, "leads.manage");
  const body = input.body?.trim();
  if (!body) throw invalid("Write a note first.");
  if (body.length > 4000) throw invalid("Keep notes under 4,000 characters.");
  const followUp = input.followUpAt ? new Date(input.followUpAt) : null;
  if (followUp && Number.isNaN(followUp.getTime())) throw invalid("Invalid follow-up time.");
  return getDb().transaction(async (tx) => {
    const lead = await lockLead(tx, ctx, id);
    const type = input.type ?? "note";
    await activity(tx, ctx, id, { type, body });
    const at = now(ctx);
    await tx
      .update(leads)
      .set({
        updatedAt: at,
        ...(type !== "note" ? { lastContactedAt: at } : {}),
        ...(followUp ? { followUpAt: followUp } : {}),
      })
      .where(eq(leads.id, id));
    if (followUp) await activity(tx, ctx, id, { type: "follow_up", body: `Follow-up set`, metadata: { at: followUp.toISOString() } });
    await audit(tx, ctx, { action: `lead.${type}`, entityType: "lead", entityId: id, summary: `${type === "note" ? "Note" : `Logged ${type}`} on ${lead.code}` });
    return { id };
  });
}

/**
 * Converts a lead into a customer, or links it to an existing one. Idempotent: a lead that is
 * already converted returns its customer, and the unique (business, converted_from_lead_id)
 * constraint stops two concurrent conversions from creating two customers.
 */
export async function convertLead(ctx: Ctx, id: string, opts: { customerId?: string | null } = {}) {
  requirePermission(ctx, "leads.manage");
  requirePermission(ctx, "customers.manage");
  try {
    return await getDb().transaction(async (tx) => {
      const lead = await lockLead(tx, ctx, id);
      if (lead.convertedCustomerId) return { customerId: lead.convertedCustomerId, created: false, alreadyConverted: true };
      const at = now(ctx);
      let customerId: string;
      let created = false;
      if (opts.customerId) {
        const [c] = await tx
          .select({ id: customers.id, firstName: customers.firstName, lastName: customers.lastName })
          .from(customers)
          .where(and(eq(customers.businessId, ctx.businessId), eq(customers.id, opts.customerId), isNull(customers.archivedAt)))
          .limit(1);
        if (!c) throw invalid("Choose an active customer to link.");
        customerId = c.id;
      } else {
        const code = await nextNumber(tx, ctx.businessId, "customer", "CUS-", 5);
      // A customer may already hold this GHL contact (matched by email earlier) — then the new customer
      // starts without it rather than failing on the unique key; the GHL contact mirror links them later.
      const [ghlHolder] = lead.externalGhlContactId
        ? await tx.select({ id: customers.id }).from(customers).where(and(eq(customers.businessId, ctx.businessId), eq(customers.externalGhlContactId, lead.externalGhlContactId))).limit(1)
        : [];
      const ghlIdFree = !ghlHolder;
        const [c] = await tx
          .insert(customers)
          .values({
            businessId: ctx.businessId,
            code,
            firstName: lead.firstName,
            lastName: lead.lastName || "—",
            email: lead.email,
            phone: lead.phone,
            source: lead.source,
            notes: lead.message ? `From lead ${lead.code}: ${lead.message}` : `Converted from lead ${lead.code}`,
            homeBranchId: lead.preferredBranchId,
            marketingConsent: lead.marketingConsent,
            smsConsent: lead.smsConsent,
            convertedFromLeadId: lead.id,
            externalGhlContactId: ghlIdFree ? lead.externalGhlContactId : null,
            createdByMembershipId: ctx.membershipId,
            createdAt: at,
            updatedAt: at,
          })
          .returning({ id: customers.id });
        customerId = c.id;
        created = true;
        await audit(tx, ctx, { action: "customer.created", entityType: "customer", entityId: c.id, summary: `Created customer ${lead.firstName} ${lead.lastName} (${code}) from lead ${lead.code}` });
      }
      await tx.update(leads).set({ stage: "converted", convertedCustomerId: customerId, convertedAt: at, updatedAt: at }).where(eq(leads.id, id));
      // Appointments booked while they were a lead now belong to the customer too.
      await tx
        .update(appointments)
        .set({ customerId, updatedAt: at })
        .where(and(eq(appointments.businessId, ctx.businessId), eq(appointments.leadId, id), isNull(appointments.customerId)));
      await activity(tx, ctx, id, { type: "conversion", body: created ? "Converted to a new customer" : "Linked to an existing customer", fromStage: lead.stage, toStage: "converted", metadata: { customerId } });
      await audit(tx, ctx, { action: "lead.converted", entityType: "lead", entityId: id, summary: `Converted lead ${lead.code} to a customer` });
      await onLeadChanged(tx, ctx.businessId, id);
      return { customerId, created, alreadyConverted: false };
    });
  } catch (error) {
    mapDbError(error);
  }
}

export async function assignLead(ctx: Ctx, id: string, membershipId: string | null) {
  requirePermission(ctx, "leads.assign");
  try {
    return await getDb().transaction(async (tx) => {
      const lead = await lockLead(tx, ctx, id);
      if (lead.assignedMembershipId === membershipId) return lead;
      const who = await assertAssignee(tx, ctx, membershipId);
      const [row] = await tx.update(leads).set({ assignedMembershipId: membershipId, updatedAt: now(ctx) }).where(eq(leads.id, id)).returning();
      await activity(tx, ctx, id, { type: "assignment", body: who ? `Assigned to ${who.name}` : "Unassigned" });
      await audit(tx, ctx, { action: "lead.assigned", entityType: "lead", entityId: id, summary: `${lead.code} ${who ? `assigned to ${who.name}` : "unassigned"}` });
      return row;
    });
  } catch (error) {
    mapDbError(error);
  }
}

export async function setLeadFollowUp(ctx: Ctx, id: string, at: Date | null) {
  requirePermission(ctx, "leads.manage");
  return getDb().transaction(async (tx) => {
    const lead = await lockLead(tx, ctx, id);
    await tx.update(leads).set({ followUpAt: at, updatedAt: now(ctx) }).where(eq(leads.id, id));
    await activity(tx, ctx, id, { type: "follow_up", body: at ? "Follow-up scheduled" : "Follow-up cleared", metadata: at ? { at: at.toISOString() } : {} });
    await audit(tx, ctx, { action: "lead.follow_up", entityType: "lead", entityId: id, summary: `${lead.code}: follow-up ${at ? "scheduled" : "cleared"}` });
    return { id };
  });
}

export async function archiveLead(ctx: Ctx, id: string) {
  requirePermission(ctx, "leads.manage");
  if (!can(ctx, "leads.view_all")) throw forbidden("Only managers can archive leads.");
  return getDb().transaction(async (tx) => {
    const lead = await lockLead(tx, ctx, id);
    await tx.update(leads).set({ archivedAt: now(ctx), updatedAt: now(ctx) }).where(eq(leads.id, id));
    await audit(tx, ctx, { action: "lead.archived", entityType: "lead", entityId: id, summary: `Archived lead ${lead.code}` });
    return { id };
  });
}

/**
 * Public website submission. Unauthenticated: callers pass the business id resolved from the site.
 * Repeat submissions from the same email/phone within 30 days are added to the open lead instead
 * of creating duplicates.
 */
export async function capturePublicLead(businessId: string, raw: unknown, meta: { ip?: string | null } = {}) {
  const input = publicLeadInput.parse(raw);
  if (input.website) return { ok: true as const, leadId: null }; // Honeypot tripped: pretend success.
  const ctx = { ...systemCtx(businessId, "Website"), ip: meta.ip ?? null };
  const [first, ...rest] = input.fullName.trim().split(/\s+/);
  const lastName = rest.join(" ");
  const message = [
    input.kind === "product_inquiry" && input.productName ? `Product inquiry: ${input.productName}` : null,
    input.kind === "appointment_request" ? "Appointment request" : null,
    input.message,
  ]
    .filter(Boolean)
    .join("\n");
  try {
    return await getDb().transaction(async (tx) => {
      if (input.preferredBranchId) await assertBranch(tx, ctx, input.preferredBranchId);
      const matchConds: SQL[] = [];
      if (input.email) matchConds.push(sql`lower(${leads.email}) = ${input.email}`);
      if (input.phone) matchConds.push(sql`regexp_replace(coalesce(${leads.phone}, ''), '[^0-9]', '', 'g') = ${input.phone.replace(/\D/g, "")}`);
      const [existing] = await tx
        .select()
        .from(leads)
        .where(
          and(
            eq(leads.businessId, businessId),
            isNull(leads.archivedAt),
            notInArray(leads.stage, ["converted", "lost"]),
            gte(leads.createdAt, new Date(Date.now() - 30 * 86_400_000)),
            or(...matchConds),
          ),
        )
        .orderBy(desc(leads.createdAt))
        .limit(1)
        .for("update");
      if (existing) {
        // Anyone can type an email or phone into a public form, so a repeat submission never switches
        // consent on for the existing person; the request is logged for staff to confirm instead.
        await activity(tx, ctx, existing.id, {
          type: "inquiry",
          body: message || "Submitted another website inquiry.",
          metadata: { interest: input.interest, kind: input.kind, consentRequested: { sms: input.smsConsent, marketing: input.marketingConsent } },
        });
        await tx.update(leads).set({ updatedAt: now(ctx) }).where(eq(leads.id, existing.id));
        return { ok: true as const, leadId: existing.id };
      }
      const code = await nextNumber(tx, businessId, "lead", "LD-", 5);
      const at = now(ctx);
      const [lead] = await tx
        .insert(leads)
        .values({
          businessId,
          code,
          firstName: first,
          lastName,
          email: input.email,
          phone: input.phone,
          source: "website",
          interest: input.interest,
          message: message || null,
          preferredBranchId: input.preferredBranchId,
          smsConsent: input.smsConsent,
          marketingConsent: input.marketingConsent,
          createdAt: at,
          updatedAt: at,
        })
        .returning({ id: leads.id });
      await activity(tx, ctx, lead.id, {
        type: "created",
        body: message || null,
        toStage: "new",
        metadata: { source: "website", kind: input.kind, interest: LEAD_INTEREST_LABELS[input.interest] },
      });
      await audit(tx, ctx, { action: "lead.created", entityType: "lead", entityId: lead.id, summary: `Website ${input.kind.replace("_", " ")} from ${input.fullName} (${code})` });
      await onLeadChanged(tx, ctx.businessId, lead.id);
      return { ok: true as const, leadId: lead.id };
    });
  } catch (error) {
    mapDbError(error);
  }
}

export async function staffForAssignment(ctx: Ctx) {
  return db()
    .select({ id: businessMemberships.id, name: users.name, role: businessMemberships.role })
    .from(businessMemberships)
    .innerJoin(users, eq(users.id, businessMemberships.userId))
    .where(and(eq(businessMemberships.businessId, ctx.businessId), eq(businessMemberships.isActive, true), inArray(businessMemberships.role, ["owner", "manager", "sales"])))
    .orderBy(asc(users.name));
}

