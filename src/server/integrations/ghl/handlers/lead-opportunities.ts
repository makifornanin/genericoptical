import { and, asc, eq, isNotNull, isNull } from "drizzle-orm";
import { LEAD_INTEREST_LABELS, LEAD_SOURCE_LABELS, type LeadStage } from "@/lib/schemas";
import { getDb } from "@/server/db";
import { ghlOpportunities, leadActivities, leads } from "@/server/db/schema";
import { log } from "@/server/log";
import { toMajor, toMinor, type GhlApi, type GhlOpportunity } from "../api";
import { activeConnection, type GhlSettings } from "../config";
import { apiFor } from "../connection";
import { GhlNotFoundError } from "../errors";
import { upsertMirror, type OpportunityMirror } from "./opportunities";

/**
 * Lead pipeline ("Optical — Lead Management"): every dashboard lead with a GHL contact gets exactly
 * one opportunity, linked by ghl_opportunities.owner_lead_id.
 *
 * Ownership (docs/GHL_ARCHITECTURE.md): GHL is authoritative for marketing pipeline activity, the
 * dashboard for conversion (a converted lead has a real customer record).
 *  - A stage changed in the dashboard is pushed to GHL.
 *  - A stage changed in GHL (webhook or polling) is applied to the lead, unless the lead is already
 *    converted. "Won" in GHL is never turned into a conversion by itself: someone converts the lead.
 *  - lastPushed records what the dashboard last wrote, so the two directions never echo each other.
 */

type LeadRow = typeof leads.$inferSelect;
type LeadMapKey = keyof GhlSettings["leadStageMap"];

export function desiredForLead(lead: Pick<LeadRow, "firstName" | "lastName" | "code" | "interest" | "stage" | "estimatedValueCents">, settings: GhlSettings) {
  const who = `${lead.firstName} ${lead.lastName}`.trim();
  const name = `${who}${lead.interest ? ` · ${LEAD_INTEREST_LABELS[lead.interest] ?? lead.interest}` : ""} (${lead.code})`;
  const status = lead.stage === "lost" ? "lost" : lead.stage === "converted" ? "won" : "open";
  const stageId = lead.stage === "lost" ? null : (settings.leadStageMap[lead.stage as LeadMapKey] ?? null);
  return { name, status, stageId, valueCents: Number(lead.estimatedValueCents ?? 0) };
}

/** Creates or updates the lead's opportunity. Returns null when the lead pipeline isn't mapped. */
export async function syncLeadOpportunity(api: GhlApi, businessId: string, settings: GhlSettings, leadId: string, contactId: string) {
  if (!settings.leadPipelineId || !settings.sync.opportunities) return null;
  const [lead] = await getDb().select().from(leads).where(and(eq(leads.businessId, businessId), eq(leads.id, leadId))).limit(1);
  if (!lead) return null;
  const desired = desiredForLead(lead, settings);
  const [mirror] = await getDb().select().from(ghlOpportunities).where(and(eq(ghlOpportunities.businessId, businessId), eq(ghlOpportunities.ownerLeadId, lead.id))).limit(1);

  if (!mirror) {
    const { opportunity } = await api.createOpportunity({
      pipelineId: settings.leadPipelineId,
      ...(desired.stageId ? { pipelineStageId: desired.stageId } : {}),
      name: desired.name,
      status: desired.status,
      contactId,
      monetaryValue: toMajor(desired.valueCents),
      source: LEAD_SOURCE_LABELS[lead.source] ?? lead.source,
    });
    await upsertMirror(businessId, opportunity, { ownerLeadId: lead.id, leadId: lead.id, lastPushed: { ...desired } });
    return { opportunityId: opportunity.id, created: true as const };
  }
  if (mirror.deletedAt) return { opportunityId: mirror.ghlOpportunityId, deleted: true as const };

  let remote: GhlOpportunity;
  try {
    remote = (await api.getOpportunity(mirror.ghlOpportunityId)).opportunity;
  } catch (error) {
    if (!(error instanceof GhlNotFoundError)) throw error;
    // Deleted in GHL on purpose or by mistake: don't silently recreate it.
    await getDb().update(ghlOpportunities).set({ deletedAt: new Date(), updatedAt: new Date() }).where(eq(ghlOpportunities.id, mirror.id));
    return { opportunityId: mirror.ghlOpportunityId, deleted: true as const };
  }
  const last = mirror.lastPushed;
  const changedLocally = !last || last.stageId !== desired.stageId || last.status !== desired.status;
  const patch: Record<string, unknown> = {};
  if (changedLocally) {
    if (remote.status !== desired.status) patch.status = desired.status;
    if (desired.stageId && remote.pipelineStageId !== desired.stageId) patch.pipelineStageId = desired.stageId;
  }
  if (toMinor(remote.monetaryValue ?? 0) !== desired.valueCents && (!last || last.valueCents !== desired.valueCents)) patch.monetaryValue = toMajor(desired.valueCents);
  if (remote.name !== desired.name && (!last || last.name !== desired.name)) patch.name = desired.name;
  if (!Object.keys(patch).length) {
    await upsertMirror(businessId, remote, { ownerLeadId: lead.id, leadId: lead.id, lastPushed: { ...desired } });
    return { opportunityId: remote.id, updated: [] as string[] };
  }
  const { opportunity } = await api.updateOpportunity(remote.id, { pipelineId: remote.pipelineId ?? settings.leadPipelineId, ...patch });
  await upsertMirror(businessId, opportunity ?? { ...remote, ...patch }, { ownerLeadId: lead.id, leadId: lead.id, lastPushed: { ...desired } });
  return { opportunityId: remote.id, updated: Object.keys(patch) };
}

/**
 * Applies a GHL-side change of a lead opportunity to the dashboard lead. Never converts a lead and
 * never touches a converted one. Returns what changed (or null).
 */
export async function applyLeadOpportunityFromGhl(businessId: string, settings: GhlSettings, mirror: OpportunityMirror, opp: GhlOpportunity) {
  if (!mirror.ownerLeadId || opp.pipelineId !== settings.leadPipelineId) return null;
  const [lead] = await getDb().select().from(leads).where(and(eq(leads.businessId, businessId), eq(leads.id, mirror.ownerLeadId))).limit(1);
  if (!lead || lead.stage === "converted" || lead.archivedAt) return null;
  let target: LeadStage | null = null;
  if (opp.status === "lost" || opp.status === "abandoned") target = "lost";
  else if (opp.status === "open") {
    const hit = (Object.entries(settings.leadStageMap) as [LeadMapKey, string | null][]).find(([, id]) => id && id === opp.pipelineStageId);
    if (hit && hit[0] !== "converted") target = hit[0];
  }
  if (!target || target === lead.stage) return null;
  const now = new Date();
  const changed = await getDb().transaction(async (tx) => {
    const rows = await tx
      .update(leads)
      .set({ stage: target, updatedAt: now })
      .where(and(eq(leads.id, lead.id), eq(leads.stage, lead.stage)))
      .returning({ id: leads.id });
    if (!rows.length) return false; // changed locally meanwhile: the next push will reconcile
    await tx.insert(leadActivities).values({
      businessId,
      leadId: lead.id,
      type: "stage_change",
      body: "Moved in GoHighLevel",
      fromStage: lead.stage,
      toStage: target,
      metadata: { source: "gohighlevel", opportunityId: opp.id },
      createdAt: now,
    });
    // Record the new state as already pushed, so this change isn't sent back to GHL.
    await tx.update(ghlOpportunities).set({ lastPushed: { ...desiredForLead({ ...lead, stage: target! }, settings) } }).where(eq(ghlOpportunities.id, mirror.id));
    return true;
  });
  return changed ? { leadId: lead.id, from: lead.stage, to: target } : null;
}

/**
 * Private Integration connections receive no marketplace webhooks, so lead opportunities are polled:
 * each open lead opportunity is re-read and GHL-side changes are applied. Capped per run.
 */
export async function pollLeadOpportunities(businessId: string, limit = 100, fetchImpl?: typeof fetch) {
  const conn = await activeConnection(getDb(), businessId);
  if (!conn?.settings.leadPipelineId || !conn.settings.sync.opportunities) return { checked: 0, applied: 0 };
  const rows = await getDb()
    .select()
    .from(ghlOpportunities)
    .where(and(eq(ghlOpportunities.businessId, businessId), isNotNull(ghlOpportunities.ownerLeadId), isNull(ghlOpportunities.deletedAt), eq(ghlOpportunities.status, "open")))
    .orderBy(asc(ghlOpportunities.lastSyncedAt))
    .limit(limit);
  if (!rows.length) return { checked: 0, applied: 0 };
  const { api } = await apiFor(businessId, fetchImpl);
  let applied = 0;
  for (const mirror of rows) {
    try {
      const remote = (await api.getOpportunity(mirror.ghlOpportunityId)).opportunity;
      const row = await upsertMirror(businessId, remote);
      if (await applyLeadOpportunityFromGhl(businessId, conn.settings, row, remote)) applied++;
    } catch (error) {
      if (error instanceof GhlNotFoundError) await getDb().update(ghlOpportunities).set({ deletedAt: new Date() }).where(eq(ghlOpportunities.id, mirror.id));
      else log.warn("ghl.lead_opportunity_poll_failed", { businessId, opportunityId: mirror.ghlOpportunityId, error: String(error).slice(0, 200) });
    }
  }
  return { checked: rows.length, applied };
}
