import { and, asc, desc, eq, inArray, isNull, sql, type SQL } from "drizzle-orm";
import { getDb } from "@/server/db";
import {
  appointmentTypes,
  branches,
  businesses,
  businessMemberships,
  ghlCalendars,
  ghlContacts,
  ghlOpportunities,
  ghlPipelines,
  ghlProductLinks,
  ghlUsers,
  integrationMismatches,
  integrationSyncEvents,
  inventoryLocations,
  SYNC_CATEGORIES,
  users,
} from "@/server/db/schema";
import { env } from "@/server/env";
import { log } from "@/server/log";
import { audit, invalid, notFound, pageOf, paging, requirePermission, type Ctx } from "@/server/services/core";
import { parseSettings } from "./config";
import { connectionRow, oauthConfigured, redirectUri, workflowWebhookSecret } from "./connection";
import { businessesWithDueEvents, enqueue, GHL, processBusiness, recoverStaleLeases, type ProcessResult } from "./engine";
import { HANDLERS } from "./handlers";
import { queueFullProductSync } from "./handlers/products";
import { reconcileAll } from "./reconcile";

export { changeOpportunity, pipelineSummary } from "./handlers/opportunities";
export { completeOAuth, connectPrivateToken, disconnect, oauthConfigured, startOAuth, updateSettings } from "./connection";
export { dismissEvents, retryEvents } from "./engine";
export { listMismatches, reconcileAll, resolveMismatch } from "./reconcile";
export { handleMarketplaceWebhook, handleWorkflowWebhook } from "./webhooks";
export { ensureOpticalPipelines, probeGhlAccess, LEAD_PIPELINE, SALES_PIPELINE } from "./setup";
export { pollLeadOpportunities } from "./handlers/lead-opportunities";

/** Processes due events for one business. */
export function processGhl(businessId: string, opts: { limit?: number; onlyIds?: string[] } = {}): Promise<ProcessResult> {
  return processBusiness(businessId, HANDLERS, opts);
}

/** Best-effort immediate processing after a commit (the event is already durable if this fails). */
/** Processes a few due events for one business now. Returns how many were claimed (0 on failure). */
export async function kickGhl(businessId: string) {
  try {
    const res = await processBusiness(businessId, HANDLERS, { limit: 10 });
    return res.claimed;
  } catch (error) {
    log.warn("ghl.kick_failed", { businessId, error: error instanceof Error ? error.message : String(error) });
    return 0;
  }
}

/**
 * Scheduled worker: recovers abandoned leases, then drains every business with due events. One
 * business failing never stops the others. Every `reconcileEveryMs` it also runs reconciliation.
 */
export async function processAllDue(opts: { maxBusinesses?: number; reconcile?: boolean } = {}) {
  const recovered = await recoverStaleLeases();
  const results: Record<string, ProcessResult | { error: string }> = {};
  for (const businessId of await businessesWithDueEvents(opts.maxBusinesses ?? 50)) {
    try {
      results[businessId] = await processBusiness(businessId, HANDLERS, { limit: 50 });
    } catch (error) {
      results[businessId] = { error: error instanceof Error ? error.message : String(error) };
      log.error("ghl.worker_business_failed", { businessId, error: error instanceof Error ? error.message : String(error) });
    }
  }
  const reconciled: Record<string, unknown> = {};
  if (opts.reconcile) {
    const conns = await getDb().execute<{ business_id: string }>(sql`select business_id from integration_connections where provider = ${GHL} and status = 'connected'`);
    for (const r of conns.rows) reconciled[r.business_id] = await reconcileAll(r.business_id);
  }
  return { recovered, results, reconciled };
}

// ─── Monitoring overview (Settings → Integrations) ───────────────────────────

/** Queued sync work older than this is reported as stalled. */
export const BACKLOG_STALE_MINUTES = 30;

export async function ghlOverview(ctx: Ctx) {
  requirePermission(ctx, "integrations.manage");
  const db = getDb();
  const row = await connectionRow(ctx.businessId);
  const settings = parseSettings(row?.settings);
  const [biz] = await db.select({ slug: businesses.slug }).from(businesses).where(eq(businesses.id, ctx.businessId)).limit(1);
  const stats = await db.execute<{ category: string; status: string; n: number; last_synced: Date | null }>(sql`
    select category, status, count(*)::int as n, max(processed_at) filter (where status = 'synced') as last_synced
    from integration_sync_events where business_id = ${ctx.businessId} and provider = ${GHL}
    group by category, status`);
  const byCategory = Object.fromEntries(
    SYNC_CATEGORIES.map((c) => {
      const rows = stats.rows.filter((r) => r.category === c);
      const count = (s: string) => rows.filter((r) => r.status === s).reduce((n, r) => n + Number(r.n), 0);
      const last = rows.map((r) => r.last_synced).filter(Boolean).sort((a, b) => new Date(b!).getTime() - new Date(a!).getTime())[0] ?? null;
      return [c, { pending: count("pending") + count("retry_scheduled") + count("processing"), synced: count("synced"), failed: count("failed"), review: count("needs_review"), lastSyncedAt: last ? new Date(last).toISOString() : null }];
    }),
  ) as Record<string, { pending: number; synced: number; failed: number; review: number; lastSyncedAt: string | null }>;
  // Stale-sync detection: queued work older than BACKLOG_STALE_MINUTES means the scheduled worker isn't
  // running, GHL is unreachable, or the business is paused — staff see a warning instead of silence.
  const [backlog] = (
    await db.execute<{ oldest: Date | null; stuck: number }>(sql`
      select min(created_at) filter (where status in ('pending', 'retry_scheduled')) as oldest,
             count(*) filter (where status = 'processing' and locked_at < now() - interval '10 minutes')::int as stuck
      from integration_sync_events where business_id = ${ctx.businessId} and provider = ${GHL}`)
  ).rows;
  const oldestQueuedAt = backlog?.oldest ? new Date(backlog.oldest) : null;
  const [pipelines, calendars, ghlUserRows, staff, branchRows, typeRows, locations, mismatchCount, productCounts] = await Promise.all([
    db.select().from(ghlPipelines).where(eq(ghlPipelines.businessId, ctx.businessId)).orderBy(asc(ghlPipelines.name)),
    db.select().from(ghlCalendars).where(eq(ghlCalendars.businessId, ctx.businessId)).orderBy(asc(ghlCalendars.name)),
    db.select().from(ghlUsers).where(eq(ghlUsers.businessId, ctx.businessId)).orderBy(asc(ghlUsers.name)),
    db.select({ id: businessMemberships.id, name: users.name }).from(businessMemberships).innerJoin(users, eq(users.id, businessMemberships.userId)).where(and(eq(businessMemberships.businessId, ctx.businessId), eq(businessMemberships.isActive, true))).orderBy(asc(users.name)),
    db.select({ id: branches.id, name: branches.name }).from(branches).where(and(eq(branches.businessId, ctx.businessId), eq(branches.isActive, true))).orderBy(asc(branches.sortOrder)),
    db.select({ id: appointmentTypes.id, name: appointmentTypes.name }).from(appointmentTypes).where(and(eq(appointmentTypes.businessId, ctx.businessId), eq(appointmentTypes.isActive, true))).orderBy(asc(appointmentTypes.sortOrder)),
    db.select({ id: inventoryLocations.id, name: inventoryLocations.name }).from(inventoryLocations).where(eq(inventoryLocations.businessId, ctx.businessId)).orderBy(asc(inventoryLocations.name)),
    db.select({ n: sql<number>`count(*)::int` }).from(integrationMismatches).where(and(eq(integrationMismatches.businessId, ctx.businessId), eq(integrationMismatches.status, "open"))),
    db.execute<{ linked: number; contacts: number; opportunities: number }>(sql`
      select (select count(*) from ghl_product_links where business_id = ${ctx.businessId} and ghl_price_id is not null)::int as linked,
             (select count(*) from ghl_contacts where business_id = ${ctx.businessId} and deleted_at is null)::int as contacts,
             (select count(*) from ghl_opportunities where business_id = ${ctx.businessId} and deleted_at is null)::int as opportunities`),
  ]);
  const base = env().APP_URL.replace(/\/$/, "");
  return {
    connection: row
      ? {
          status: row.status,
          authType: row.authType,
          locationId: row.externalAccountId,
          accountName: row.accountName,
          accountTimezone: row.accountTimezone,
          connectedAt: row.connectedAt?.toISOString() ?? null,
          tokenExpiresAt: row.tokenExpiresAt?.toISOString() ?? null,
          scopes: row.scopes,
          lastSuccessAt: row.lastSuccessAt?.toISOString() ?? null,
          lastSyncAt: row.lastSyncAt?.toISOString() ?? null,
          rateLimitedUntil: row.rateLimitedUntil?.toISOString() ?? null,
          lastError: row.lastError,
        }
      : null,
    oauthAvailable: oauthConfigured(),
    redirectUri: redirectUri(),
    marketplaceWebhookUrl: `${base}/api/integrations/ghl/webhooks`,
    workflowWebhookUrl: `${base}/api/integrations/ghl/webhook/${biz?.slug ?? ""}`,
    workflowWebhookSecret: await workflowWebhookSecret(ctx),
    settings,
    byCategory,
    openMismatches: Number(mismatchCount[0]?.n ?? 0),
    backlog: {
      oldestQueuedAt: oldestQueuedAt?.toISOString() ?? null,
      stale: Boolean(oldestQueuedAt && Date.now() - oldestQueuedAt.getTime() > BACKLOG_STALE_MINUTES * 60_000),
      stuckEvents: Number(backlog?.stuck ?? 0),
    },
    counts: productCounts.rows[0] ?? { linked: 0, contacts: 0, opportunities: 0 },
    mapping: {
      pipelines: pipelines.map((p) => ({ id: p.ghlPipelineId, name: p.name, stages: p.stages })),
      calendars: calendars.map((c) => ({ id: c.ghlCalendarId, name: c.name, branchId: c.branchId, appointmentTypeId: c.appointmentTypeId, practitionerMembershipId: c.practitionerMembershipId, isActive: c.isActive })),
      users: ghlUserRows.map((u) => ({ id: u.ghlUserId, name: u.name, email: u.email, membershipId: u.membershipId })),
      staff,
      branches: branchRows,
      appointmentTypes: typeRows,
      locations,
    },
  };
}

export type GhlOverview = Awaited<ReturnType<typeof ghlOverview>>;

export async function listSyncEvents(ctx: Ctx, f: { status?: string | null; category?: string | null; page?: number }) {
  requirePermission(ctx, "integrations.manage");
  const { page, pageSize, offset } = paging({ page: f.page, pageSize: 25 });
  const conds: SQL[] = [eq(integrationSyncEvents.businessId, ctx.businessId), eq(integrationSyncEvents.provider, GHL)];
  if (f.status === "problems") conds.push(inArray(integrationSyncEvents.status, ["failed", "needs_review"]));
  else if (f.status === "pending") conds.push(inArray(integrationSyncEvents.status, ["pending", "retry_scheduled", "processing"]));
  else if (f.status) conds.push(eq(integrationSyncEvents.status, f.status as "synced"));
  if (f.category && (SYNC_CATEGORIES as readonly string[]).includes(f.category)) conds.push(eq(integrationSyncEvents.category, f.category as "contacts"));
  const where = and(...conds);
  const [rows, [{ total }]] = await Promise.all([
    getDb().select().from(integrationSyncEvents).where(where).orderBy(desc(integrationSyncEvents.createdAt)).limit(pageSize).offset(offset),
    getDb().select({ total: sql<number>`count(*)::int` }).from(integrationSyncEvents).where(where),
  ]);
  return pageOf(rows, Number(total), page, pageSize);
}

// ─── Mappings ────────────────────────────────────────────────────────────────

export async function mapCalendar(ctx: Ctx, ghlCalendarId: string, branchId: string | null, appointmentTypeId: string | null, practitionerMembershipId: string | null = null) {
  requirePermission(ctx, "integrations.manage");
  const db = getDb();
  if (branchId) {
    const [b] = await db.select({ id: branches.id }).from(branches).where(and(eq(branches.businessId, ctx.businessId), eq(branches.id, branchId))).limit(1);
    if (!b) throw invalid("Unknown branch.");
  }
  if (appointmentTypeId) {
    const [t] = await db.select({ id: appointmentTypes.id }).from(appointmentTypes).where(and(eq(appointmentTypes.businessId, ctx.businessId), eq(appointmentTypes.id, appointmentTypeId))).limit(1);
    if (!t) throw invalid("Unknown appointment type.");
  }
  if (practitionerMembershipId) {
    const [m] = await db
      .select({ id: businessMemberships.id })
      .from(businessMemberships)
      .where(and(eq(businessMemberships.businessId, ctx.businessId), eq(businessMemberships.id, practitionerMembershipId), eq(businessMemberships.isActive, true)))
      .limit(1);
    if (!m) throw invalid("Unknown staff member.");
  }
  const res = await db
    .update(ghlCalendars)
    .set({ branchId, appointmentTypeId, practitionerMembershipId })
    .where(and(eq(ghlCalendars.businessId, ctx.businessId), eq(ghlCalendars.ghlCalendarId, ghlCalendarId)))
    .returning({ name: ghlCalendars.name });
  if (!res.length) throw notFound("Calendar");
  await audit(db, ctx, { action: "ghl.calendar_mapped", entityType: "business", entityId: ctx.businessId, summary: `Mapped GHL calendar “${res[0].name}”` });
}

export async function mapUser(ctx: Ctx, ghlUserId: string, membershipId: string | null) {
  requirePermission(ctx, "integrations.manage");
  const db = getDb();
  if (membershipId) {
    const [m] = await db.select({ id: businessMemberships.id }).from(businessMemberships).where(and(eq(businessMemberships.businessId, ctx.businessId), eq(businessMemberships.id, membershipId))).limit(1);
    if (!m) throw invalid("Unknown staff member.");
    await db.update(ghlUsers).set({ membershipId: null }).where(and(eq(ghlUsers.businessId, ctx.businessId), eq(ghlUsers.membershipId, membershipId)));
  }
  const res = await db.update(ghlUsers).set({ membershipId }).where(and(eq(ghlUsers.businessId, ctx.businessId), eq(ghlUsers.ghlUserId, ghlUserId))).returning({ name: ghlUsers.name });
  if (!res.length) throw notFound("GHL user");
  await audit(db, ctx, { action: "ghl.user_mapped", entityType: "business", entityId: ctx.businessId, summary: `Mapped GHL user “${res[0].name}”` });
}

/** Queues a bulk sync for one area (first-time publish or recovery). */
export async function queueFullSync(ctx: Ctx, area: "metadata" | "products" | "inventory" | "customers") {
  requirePermission(ctx, "integrations.manage");
  const db = getDb();
  const businessId = ctx.businessId;
  let queued = 0;
  if (area === "metadata") queued = (await enqueue(db, { businessId, direction: "outbound", eventType: "system.refresh_metadata", category: "system", payload: {} })) ? 1 : 0;
  if (area === "products") queued = await queueFullProductSync(businessId);
  if (area === "inventory") {
    const links = await db.select({ variantId: ghlProductLinks.variantId }).from(ghlProductLinks).where(and(eq(ghlProductLinks.businessId, businessId), sql`${ghlProductLinks.ghlPriceId} is not null`));
    for (const l of links) if (await enqueue(db, { businessId, direction: "outbound", eventType: "inventory.push", category: "inventory", entityType: "variant", entityId: l.variantId, coalesce: true })) queued++;
  }
  if (area === "customers") {
    const rows = await db.execute<{ id: string }>(sql`select id from customers where business_id = ${businessId} and archived_at is null and (email is not null or length(regexp_replace(coalesce(phone, ''), '[^0-9]', '', 'g')) >= 7)`);
    for (const r of rows.rows) if (await enqueue(db, { businessId, direction: "outbound", eventType: "customer.upsert", category: "contacts", entityType: "customer", entityId: r.id, coalesce: true })) queued++;
  }
  await audit(db, ctx, { action: "ghl.bulk_sync", entityType: "business", entityId: businessId, summary: `Queued GoHighLevel ${area} sync (${queued} item(s))` });
  return queued;
}

// ─── Opportunities view ──────────────────────────────────────────────────────

export async function listOpportunities(ctx: Ctx, f: { pipelineId?: string | null; status?: string | null }) {
  requirePermission(ctx, "leads.view");
  const conds: SQL[] = [eq(ghlOpportunities.businessId, ctx.businessId), isNull(ghlOpportunities.deletedAt)];
  if (f.pipelineId) conds.push(eq(ghlOpportunities.pipelineId, f.pipelineId));
  if (f.status && ["open", "won", "lost", "abandoned"].includes(f.status)) conds.push(eq(ghlOpportunities.status, f.status));
  const rows = await getDb()
    .select({ opp: ghlOpportunities, contactFirst: ghlContacts.firstName, contactLast: ghlContacts.lastName })
    .from(ghlOpportunities)
    .leftJoin(ghlContacts, and(eq(ghlContacts.businessId, ghlOpportunities.businessId), eq(ghlContacts.ghlContactId, ghlOpportunities.ghlContactId)))
    .where(and(...conds))
    .orderBy(desc(ghlOpportunities.ghlUpdatedAt))
    .limit(500);
  const pipelines = await getDb().select().from(ghlPipelines).where(eq(ghlPipelines.businessId, ctx.businessId)).orderBy(asc(ghlPipelines.name));
  return { rows: rows.map((r) => ({ ...r.opp, contactName: [r.contactFirst, r.contactLast].filter(Boolean).join(" ") || null })), pipelines };
}
