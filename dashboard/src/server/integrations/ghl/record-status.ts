import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { getDb } from "@/server/db";
import { ghlOpportunities, ghlPipelines, integrationSyncEvents, leads } from "@/server/db/schema";
import { can, type Ctx } from "@/server/services/core";
import { activeConnection } from "./config";

/**
 * What GoHighLevel holds for one dashboard record, from the local mirror and the sync log: the linked
 * contact, the opportunity (pipeline, stage, status) and the latest sync attempt. Read-only and local:
 * opening a page never calls GHL.
 */
export async function ghlRecordStatus(ctx: Ctx, kind: "lead" | "sale", id: string) {
  if (!can(ctx, kind === "lead" ? "leads.view" : "sales.view")) return null;
  const db = getDb();
  if (!(await activeConnection(db, ctx.businessId))) return null;
  const [opp] = await db
    .select()
    .from(ghlOpportunities)
    .where(and(eq(ghlOpportunities.businessId, ctx.businessId), kind === "lead" ? eq(ghlOpportunities.ownerLeadId, id) : eq(ghlOpportunities.saleId, id)))
    .limit(1);
  let pipeline: string | null = null;
  let stage: string | null = null;
  if (opp?.pipelineId) {
    const [p] = await db.select().from(ghlPipelines).where(and(eq(ghlPipelines.businessId, ctx.businessId), eq(ghlPipelines.ghlPipelineId, opp.pipelineId))).limit(1);
    pipeline = p?.name ?? null;
    stage = p?.stages.find((s) => s.id === opp.pipelineStageId)?.name ?? null;
  }
  let contactId = opp?.ghlContactId ?? null;
  if (!contactId) {
    const { rows } =
      kind === "lead"
        ? await db.execute<{ c: string | null }>(sql`select ${leads.externalGhlContactId} as c from ${leads} where ${leads.businessId} = ${ctx.businessId} and ${leads.id} = ${id}`)
        : await db.execute<{ c: string | null }>(sql`select c.external_ghl_contact_id as c from sales s join customers c on c.id = s.customer_id where s.business_id = ${ctx.businessId} and s.id = ${id}`);
    contactId = rows[0]?.c ?? null;
  }
  const [event] = await db
    .select({ status: integrationSyncEvents.status, lastError: integrationSyncEvents.lastError, attempts: integrationSyncEvents.attempts, createdAt: integrationSyncEvents.createdAt, processedAt: integrationSyncEvents.processedAt })
    .from(integrationSyncEvents)
    .where(and(eq(integrationSyncEvents.businessId, ctx.businessId), eq(integrationSyncEvents.entityId, id), inArray(integrationSyncEvents.eventType, kind === "lead" ? ["lead.upsert"] : ["sale.sync"])))
    .orderBy(desc(integrationSyncEvents.createdAt))
    .limit(1);
  return {
    contactId,
    opportunity: opp ? { id: opp.ghlOpportunityId, pipeline, stage, status: opp.status, valueCents: Number(opp.monetaryValueCents), deleted: Boolean(opp.deletedAt), lastSyncedAt: opp.lastSyncedAt } : null,
    lastEvent: event ? { status: event.status, lastError: event.lastError, attempts: event.attempts, at: event.processedAt ?? event.createdAt } : null,
  };
}

export type GhlRecordStatus = NonNullable<Awaited<ReturnType<typeof ghlRecordStatus>>>;
