import { and, eq, sql } from "drizzle-orm";
import { formatMoney } from "@/lib/money";
import { getDb } from "@/server/db";
import { businesses, customers, ghlContacts, ghlOpportunities, ghlPipelines, sales } from "@/server/db/schema";
import { audit, conflict, invalid, notFound, requirePermission, type Ctx } from "@/server/services/core";
import { toMajor, toMinor, type GhlApi, type GhlOpportunity } from "../api";
import { apiFor } from "../connection";
import type { GhlSettings } from "../config";
import type { Handler } from "../engine";
import { GhlNotFoundError } from "../errors";
import { ensureContact, mirrorContactById } from "./contacts";

/**
 * Opportunities.
 *  - GHL pipelines are the marketing CRM: every opportunity is mirrored locally (ghl_opportunities) and
 *    shown in the dashboard. Pipeline value is CRM data and is never counted as revenue.
 *  - POS sales and customer orders create/update ONE opportunity each in the configured sales
 *    pipeline. The dashboard owns that opportunity's value and won/lost status (they come from real
 *    transactions); a stage moved by hand in GHL is respected unless the order's own stage changes.
 *  - Dashboard-initiated changes to any opportunity call GHL first and update the mirror only after GHL
 *    confirms. GHL has no version/ETag, so `updatedAt` is compared to detect concurrent edits.
 */

type Mirror = typeof ghlOpportunities.$inferSelect;

async function upsertMirror(businessId: string, opp: GhlOpportunity, extra: Partial<typeof ghlOpportunities.$inferInsert> = {}) {
  const [contact] = opp.contactId
    ? await getDb().select().from(ghlContacts).where(and(eq(ghlContacts.businessId, businessId), eq(ghlContacts.ghlContactId, opp.contactId))).limit(1)
    : [];
  const values = {
    ghlContactId: opp.contactId ?? null,
    leadId: contact?.leadId ?? null,
    customerId: contact?.customerId ?? null,
    name: opp.name ?? "Opportunity",
    pipelineId: opp.pipelineId ?? null,
    pipelineStageId: opp.pipelineStageId ?? null,
    status: ["open", "won", "lost", "abandoned"].includes(opp.status) ? opp.status : "open",
    monetaryValueCents: toMinor(opp.monetaryValue ?? 0),
    assignedTo: opp.assignedTo ?? null,
    source: opp.source ?? null,
    ghlCreatedAt: opp.createdAt ? new Date(opp.createdAt) : null,
    ghlUpdatedAt: opp.updatedAt ? new Date(opp.updatedAt) : new Date(),
    lastSyncedAt: new Date(),
    deletedAt: null,
    updatedAt: new Date(),
    ...extra,
  };
  const [row] = await getDb()
    .insert(ghlOpportunities)
    .values({ ...values, businessId, ghlOpportunityId: opp.id })
    .onConflictDoUpdate({ target: [ghlOpportunities.businessId, ghlOpportunities.ghlOpportunityId], set: values })
    .returning();
  return row;
}

/** Inbound Opportunity* webhooks. The payload has no updatedAt, so the current state is fetched (also makes out-of-order delivery harmless). */
export const inboundOpportunity: Handler = async (event, env) => {
  const payload = (event.payload ?? {}) as { id?: string; contactId?: string };
  const id = payload.id ?? event.externalId;
  if (!id) return { status: "skipped", note: "Event has no opportunity id" };
  if (event.eventType === "ghl.OpportunityDelete") {
    await getDb().update(ghlOpportunities).set({ deletedAt: new Date(), updatedAt: new Date() }).where(and(eq(ghlOpportunities.businessId, env.businessId), eq(ghlOpportunities.ghlOpportunityId, id)));
    return { status: "synced", externalId: id, note: "Marked deleted" };
  }
  const { api } = await apiFor(env.businessId);
  let opp: GhlOpportunity;
  try {
    opp = (await api.getOpportunity(id)).opportunity;
  } catch (error) {
    if (error instanceof GhlNotFoundError) {
      await getDb().update(ghlOpportunities).set({ deletedAt: new Date() }).where(and(eq(ghlOpportunities.businessId, env.businessId), eq(ghlOpportunities.ghlOpportunityId, id)));
      return { status: "skipped", externalId: id, note: "No longer exists in GHL" };
    }
    throw error;
  }
  if (opp.contactId) await mirrorContactById(api, env.businessId, opp.contactId);
  const row = await upsertMirror(env.businessId, opp);
  return { status: "synced", externalId: id, result: { status: row.status, stage: row.pipelineStageId, valueCents: row.monetaryValueCents } };
};

/** What a dashboard sale should look like in the CRM pipeline. */
function desiredFor(sale: typeof sales.$inferSelect, settings: GhlSettings, currency: string, locale: string) {
  const net = Math.max(0, sale.totalCents - sale.refundedCents);
  const label = sale.kind === "order" ? "Order" : "Sale";
  const name = `${label} ${sale.number} · ${formatMoney(sale.totalCents, currency, locale)}`;
  let status: "open" | "won" | "lost" = "open";
  let stageId: string | null = null;
  if (sale.status === "cancelled") status = "lost";
  else if (sale.status === "completed") {
    status = net > 0 ? "won" : "lost";
    stageId = sale.kind === "order" ? settings.stageMap.orderCompleted : settings.stageMap.posCompleted;
  } else {
    stageId = sale.fulfillmentStatus === "ready_for_pickup" ? settings.stageMap.orderReady ?? settings.stageMap.orderOpen : settings.stageMap.orderOpen;
  }
  return { name, status, stageId, valueCents: net };
}

/**
 * sale.sync — creates/updates the sale's CRM opportunity and leaves a contact note the first time.
 * Payments stay in PostgreSQL: the note says they were recorded at the shop's POS, not processed by GHL.
 */
export const saleSync: Handler = async (event, env) => {
  const [sale] = await getDb().select().from(sales).where(and(eq(sales.businessId, env.businessId), eq(sales.id, event.entityId!))).limit(1);
  if (!sale) return { status: "skipped", note: "Sale no longer exists" };
  if (sale.channel === "ghl_online") return { status: "skipped", note: "Online order imported from GHL — not re-sent" };
  if (!sale.customerId) return { status: "skipped", note: "Walk-in sale without a customer — GHL opportunities need a contact" };
  const { api, settings } = await apiFor(env.businessId);
  if (!settings.salesPipelineId) return { status: "needs_review", note: "Choose the sales pipeline (and stages) in Settings → Integrations → GoHighLevel, then retry." };
  const [biz] = await getDb().select({ currency: businesses.currency, locale: businesses.locale }).from(businesses).where(eq(businesses.id, env.businessId)).limit(1);
  const [cust] = await getDb().select().from(customers).where(and(eq(customers.businessId, env.businessId), eq(customers.id, sale.customerId))).limit(1);
  if (!cust) return { status: "skipped", note: "Customer no longer exists" };
  const contact = await ensureContact(api, env.businessId, { kind: "customer", id: cust.id, firstName: cust.firstName, lastName: cust.lastName, email: cust.email, phone: cust.phone, externalGhlContactId: cust.externalGhlContactId }, { pushIdentity: true });
  if ("conflict" in contact) return { status: "needs_review", note: contact.conflict };

  const desired = desiredFor(sale, settings, biz.currency, biz.locale);
  const [mirror] = await getDb().select().from(ghlOpportunities).where(and(eq(ghlOpportunities.businessId, env.businessId), eq(ghlOpportunities.saleId, sale.id))).limit(1);

  if (!mirror) {
    const { opportunity } = await api.createOpportunity({
      pipelineId: settings.salesPipelineId,
      ...(desired.stageId ? { pipelineStageId: desired.stageId } : {}),
      name: desired.name,
      status: desired.status,
      contactId: contact.contactId,
      monetaryValue: toMajor(desired.valueCents),
      source: "Optical dashboard POS",
    });
    await upsertMirror(env.businessId, opportunity, { saleId: sale.id, customerId: cust.id, lastPushed: { ...desired } });
    const paid = formatMoney(sale.paidCents, biz.currency, biz.locale);
    const total = formatMoney(sale.totalCents, biz.currency, biz.locale);
    await api
      .addNote(contact.contactId, `${desired.name}\nTotal ${total}; payments recorded at the shop: ${paid}${sale.balanceDueCents > 0 ? `; balance due ${formatMoney(sale.balanceDueCents, biz.currency, biz.locale)}` : ""}.\nRecorded in the dashboard POS — not processed by GoHighLevel Payments.`)
      .catch(() => undefined);
    return { status: "synced", externalId: opportunity.id, result: { created: true, ...desired } };
  }

  // Update path: respect a stage moved by hand in GHL unless the sale's own stage changed since our last push.
  let remote: GhlOpportunity;
  try {
    remote = (await api.getOpportunity(mirror.ghlOpportunityId)).opportunity;
  } catch (error) {
    if (!(error instanceof GhlNotFoundError)) throw error;
    await getDb().update(ghlOpportunities).set({ deletedAt: new Date(), saleId: null }).where(eq(ghlOpportunities.id, mirror.id));
    return { status: "needs_review", note: "The sale's opportunity was deleted in GHL. Retry to create a new one." };
  }
  const last = mirror.lastPushed;
  const stageChangedLocally = !last || last.stageId !== desired.stageId;
  const patch: Record<string, unknown> = {};
  if (remote.status !== desired.status) patch.status = desired.status;
  if (toMinor(remote.monetaryValue ?? 0) !== desired.valueCents) patch.monetaryValue = toMajor(desired.valueCents);
  if (remote.name !== desired.name && (!last || last.name !== desired.name || remote.name === last.name)) patch.name = desired.name;
  if (desired.stageId && stageChangedLocally && remote.pipelineStageId !== desired.stageId) patch.pipelineStageId = desired.stageId;
  if (!Object.keys(patch).length) {
    await upsertMirror(env.businessId, remote, { saleId: sale.id, lastPushed: { ...desired } });
    return { status: "synced", externalId: remote.id, note: "Already up to date" };
  }
  const { opportunity } = await api.updateOpportunity(remote.id, { pipelineId: remote.pipelineId ?? settings.salesPipelineId, ...patch });
  await upsertMirror(env.businessId, opportunity ?? { ...remote, ...patch }, { saleId: sale.id, lastPushed: { ...desired } });
  return { status: "synced", externalId: remote.id, result: { updated: Object.keys(patch) } };
};

/**
 * Dashboard action: move an opportunity to another stage / status. Calls GHL first; the mirror changes
 * only after GHL confirms. If GHL's copy changed since the dashboard last saw it, nothing is written and
 * the mirror is refreshed so the user can decide again.
 */
export async function changeOpportunity(ctx: Ctx, id: string, change: { stageId?: string | null; status?: "open" | "won" | "lost" | "abandoned" }, fetchImpl?: typeof fetch) {
  requirePermission(ctx, "leads.manage");
  const [mirror] = await getDb().select().from(ghlOpportunities).where(and(eq(ghlOpportunities.businessId, ctx.businessId), eq(ghlOpportunities.id, id))).limit(1);
  if (!mirror || mirror.deletedAt) throw notFound("Opportunity");
  if (change.stageId && mirror.pipelineId) {
    const [pipeline] = await getDb().select().from(ghlPipelines).where(and(eq(ghlPipelines.businessId, ctx.businessId), eq(ghlPipelines.ghlPipelineId, mirror.pipelineId))).limit(1);
    if (pipeline && !pipeline.stages.some((s) => s.id === change.stageId)) throw invalid("That stage isn't part of this opportunity's pipeline.");
  }
  const { api } = await apiFor(ctx.businessId, fetchImpl);
  const remote = (await api.getOpportunity(mirror.ghlOpportunityId)).opportunity;
  const remoteUpdated = remote.updatedAt ? new Date(remote.updatedAt).getTime() : 0;
  if (mirror.ghlUpdatedAt && remoteUpdated > mirror.ghlUpdatedAt.getTime() + 1000) {
    await upsertMirror(ctx.businessId, remote);
    throw conflict("This opportunity was changed in GoHighLevel since you loaded it. The latest version is now shown — check it and try again.");
  }
  const body: Record<string, unknown> = { pipelineId: remote.pipelineId };
  if (change.stageId) body.pipelineStageId = change.stageId;
  if (change.status) body.status = change.status;
  const { opportunity } = await api.updateOpportunity(remote.id, body);
  const row = await upsertMirror(ctx.businessId, opportunity ?? { ...remote, ...body, updatedAt: new Date().toISOString() });
  await audit(getDb(), ctx, { action: "ghl.opportunity_updated", entityType: "ghl_opportunity", entityId: row.id, summary: `Updated GHL opportunity “${row.name}”${change.status ? ` → ${change.status}` : ""}` });
  return row;
}

/** Pipeline totals for display. CRM value only — never mixed with revenue. */
export async function pipelineSummary(businessId: string) {
  const res = await getDb().execute<{ status: string; n: number; value: number }>(sql`
    select status, count(*)::int as n, coalesce(sum(monetary_value_cents), 0)::bigint as value
    from ghl_opportunities where business_id = ${businessId} and deleted_at is null group by status`);
  return Object.fromEntries(res.rows.map((r) => [r.status, { count: Number(r.n), valueCents: Number(r.value) }])) as Record<string, { count: number; valueCents: number }>;
}

export type { Mirror as OpportunityMirror, GhlApi };
