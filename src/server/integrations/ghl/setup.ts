import { and, eq } from "drizzle-orm";
import { getDb } from "@/server/db";
import { ghlPipelines, integrationConnections } from "@/server/db/schema";
import { audit, requirePermission, type Ctx } from "@/server/services/core";
import type { GhlPipeline } from "./api";
import { parseSettings, type GhlSettings } from "./config";
import { apiFor } from "./connection";
import { GhlAuthError, GhlError, GhlPermissionError, GhlRequestError } from "./errors";

/**
 * Setup helpers for a connected sub-account: a read-only access check, and creating or mapping the
 * two Optical pipelines. Neither ever deletes or edits existing GHL pipelines, contacts or opportunities.
 */

// ─── Access check (read-only) ────────────────────────────────────────────────

export type AccessCheck = { key: string; label: string; scope: string; ok: boolean; detail: string };

/**
 * Probes what the stored credential can actually read. Every call is a GET; write scopes can't be
 * probed without writing, so they're confirmed by the first change that syncs (see the sync log).
 */
export async function probeGhlAccess(ctx: Ctx, fetchImpl?: typeof fetch) {
  requirePermission(ctx, "integrations.manage");
  const { api, connection } = await apiFor(ctx.businessId, fetchImpl);
  const checks: AccessCheck[] = [];
  const run = async (key: string, label: string, scope: string, fn: () => Promise<string>) => {
    try {
      checks.push({ key, label, scope, ok: true, detail: await fn() });
    } catch (error) {
      const detail =
        error instanceof GhlPermissionError
          ? "Not allowed: the token is missing this scope."
          : error instanceof GhlAuthError
            ? "The token was rejected (expired, revoked or wrong sub-account)."
            : error instanceof GhlError
              ? error.message
              : "Unexpected error.";
      checks.push({ key, label, scope, ok: false, detail });
    }
  };
  let location: { id: string; name: string; timezone?: string; companyId?: string } | null = null;
  await run("location", "Sub-account", "locations.readonly", async () => {
    location = (await api.getLocation()).location;
    return `${location.name}${location.timezone ? ` · ${location.timezone}` : ""}`;
  });
  await run("contacts", "Contacts (read)", "contacts.readonly", async () => {
    await api.findDuplicate({ email: "access-check@example.invalid" });
    return "Duplicate search works";
  });
  await run("pipelines", "Pipelines and opportunities (read)", "opportunities.readonly", async () => {
    const { pipelines } = await api.listPipelines();
    return `${pipelines?.length ?? 0} pipeline(s): ${(pipelines ?? []).map((p) => p.name).join(", ") || "none"}`;
  });
  await run("calendars", "Calendars (read)", "calendars.readonly", async () => {
    const { calendars } = await api.listCalendars();
    return `${calendars?.length ?? 0} calendar(s)`;
  });
  const companyId = connection.companyId ?? (location as { companyId?: string } | null)?.companyId ?? null;
  if (companyId) {
    await run("users", "Users (read)", "users.readonly", async () => {
      const { users } = await api.searchUsers(companyId);
      return `${users?.length ?? 0} user(s)`;
    });
  }
  await run("inventory", "Products and stock (read)", "products.readonly, products/prices.readonly", async () => {
    const res = await api.listInventory({ limit: 1, offset: 0 });
    const n = Number(res.total);
    return Number.isFinite(n) && n >= 0 ? `${n} price/stock row(s)` : "Stock list readable";
  });
  await run("orders", "Online-store orders (read)", "payments/orders.readonly", async () => {
    const res = await api.listOrders({ limit: 1, offset: 0 });
    return `${res.totalCount ?? res.data?.length ?? 0} order(s)`;
  });
  await audit(getDb(), ctx, {
    action: "ghl.access_checked",
    entityType: "integration",
    entityId: connection.id,
    summary: `Checked GoHighLevel access: ${checks.filter((c) => c.ok).length}/${checks.length} read checks passed`,
  });
  return { checkedAt: new Date().toISOString(), locationId: api.locationId, checks };
}

// ─── Optical pipelines ───────────────────────────────────────────────────────

export const LEAD_PIPELINE = {
  name: "Optical — Lead Management",
  stages: ["New Lead", "Contacted", "Qualified", "Appointment Scheduled", "Follow-Up", "Converted"],
  map: { new: "New Lead", contacted: "Contacted", qualified: "Qualified", appointment_scheduled: "Appointment Scheduled", follow_up: "Follow-Up", converted: "Converted" } as Record<keyof GhlSettings["leadStageMap"], string>,
};
export const SALES_PIPELINE = {
  name: "Optical — Sales & Orders",
  stages: ["New Order", "Payment Pending", "Processing", "Ready for Pickup", "Completed"],
  map: { orderOpen: "New Order", paymentPending: "Payment Pending", processing: "Processing", orderReady: "Ready for Pickup", orderCompleted: "Completed", posCompleted: "Completed" } as Record<keyof GhlSettings["stageMap"], string>,
};

/** Names compare case-insensitively and treat hyphens, en and em dashes alike. */
const norm = (s: string) => s.toLowerCase().replace(/[‐-―-]/g, "-").replace(/\s+/g, " ").trim();

export type PipelineOutcome = { name: string; id: string; created: boolean; stages: { name: string; id: string }[]; missingStages: string[] };

/**
 * Finds the two Optical pipelines by name, creates any that don't exist (never duplicates, never edits
 * an existing pipeline), and maps their stages in the business's sync settings.
 */
export async function ensureOpticalPipelines(ctx: Ctx, fetchImpl?: typeof fetch) {
  requirePermission(ctx, "integrations.manage");
  const { api, connection } = await apiFor(ctx.businessId, fetchImpl);
  let pipelines = (await api.listPipelines()).pipelines ?? [];
  const created: string[] = [];
  for (const def of [LEAD_PIPELINE, SALES_PIPELINE]) {
    if (pipelines.some((p) => norm(p.name) === norm(def.name))) continue;
    // The docs' example sends stage objects { name, position, showInFunnel }; the schema text says
    // strings. Try the documented example first and only fall back on a validation error.
    const shapes: unknown[][] = [def.stages.map((name, i) => ({ name, position: i, showInFunnel: true, showInPieChart: true })), def.stages];
    let res: Awaited<ReturnType<typeof api.createPipeline>> | null = null;
    const rejected: string[] = [];
    for (const stages of shapes) {
      try {
        res = await api.createPipeline({ name: def.name, stages });
        break;
      } catch (error) {
        if (!(error instanceof GhlRequestError)) throw error;
        rejected.push(error.message);
      }
    }
    if (!res) throw new GhlRequestError(422, `Couldn't create “${def.name}”: ${rejected.join(" | ")}`);
    created.push(def.name);
    pipelines = (await api.listPipelines()).pipelines ?? [];
    // If the list lags behind the create, use the created pipeline from the response (never create twice).
    const made = res.pipeline ?? (res.id ? (res as GhlPipeline) : null);
    if (made?.id && !pipelines.some((p) => p.id === made.id)) pipelines.push({ id: made.id, name: made.name ?? def.name, stages: made.stages ?? [] });
  }
  // Mirror pipelines for the mapping screens.
  for (const p of pipelines) {
    const stages = (p.stages ?? []).map((s, i) => ({ id: s.id, name: s.name, position: s.position ?? i }));
    await getDb()
      .insert(ghlPipelines)
      .values({ businessId: ctx.businessId, ghlPipelineId: p.id, name: p.name, stages, fetchedAt: new Date() })
      .onConflictDoUpdate({ target: [ghlPipelines.businessId, ghlPipelines.ghlPipelineId], set: { name: p.name, stages, fetchedAt: new Date() } });
  }
  const outcome = (def: typeof LEAD_PIPELINE | typeof SALES_PIPELINE): PipelineOutcome & { pipeline: GhlPipeline } => {
    const p = pipelines.find((x) => norm(x.name) === norm(def.name));
    if (!p) throw new GhlError(`GoHighLevel didn't return the “${def.name}” pipeline after creating it.`);
    const stages = (p.stages ?? []).map((s) => ({ name: s.name, id: s.id }));
    return { pipeline: p, name: p.name, id: p.id, created: created.includes(def.name), stages, missingStages: def.stages.filter((n) => !stages.some((s) => norm(s.name) === norm(n))) };
  };
  const lead = outcome(LEAD_PIPELINE);
  const sales = outcome(SALES_PIPELINE);
  const stageId = (o: PipelineOutcome, name: string) => o.stages.find((s) => norm(s.name) === norm(name))?.id ?? null;

  const [row] = await getDb().select({ settings: integrationConnections.settings }).from(integrationConnections).where(eq(integrationConnections.id, connection.id)).limit(1);
  const current = parseSettings(row?.settings);
  const next: GhlSettings = {
    ...current,
    leadPipelineId: lead.id,
    leadStageMap: Object.fromEntries(Object.entries(LEAD_PIPELINE.map).map(([k, n]) => [k, stageId(lead, n)])) as GhlSettings["leadStageMap"],
    salesPipelineId: sales.id,
    stageMap: Object.fromEntries(Object.entries(SALES_PIPELINE.map).map(([k, n]) => [k, stageId(sales, n)])) as GhlSettings["stageMap"],
  };
  await getDb().update(integrationConnections).set({ settings: next, updatedAt: new Date() }).where(and(eq(integrationConnections.id, connection.id), eq(integrationConnections.businessId, ctx.businessId)));
  await audit(getDb(), ctx, {
    action: "ghl.pipelines_mapped",
    entityType: "integration",
    entityId: connection.id,
    summary: `GHL pipelines: “${lead.name}” ${lead.id} (${lead.created ? "created" : "existing"}), “${sales.name}” ${sales.id} (${sales.created ? "created" : "existing"})`,
    changes: { leadPipelineId: lead.id, leadStageMap: next.leadStageMap, salesPipelineId: sales.id, stageMap: next.stageMap },
  });
  const strip = ({ pipeline: _p, ...o }: PipelineOutcome & { pipeline: GhlPipeline }) => (void _p, o);
  return { lead: strip(lead), sales: strip(sales) };
}
