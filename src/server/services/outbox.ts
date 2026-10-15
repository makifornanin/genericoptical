import { and, eq } from "drizzle-orm";
import type { Executor } from "@/server/db";
import { integrationConnections, integrationSyncEvents } from "@/server/db/schema";
import type { Ctx } from "./core";

export const GHL = "gohighlevel";

/**
 * Transactional outbox: records an outbound sync event in the SAME transaction as the business
 * change, so a sync is never lost or sent for a change that rolled back. Returns false (and writes
 * nothing) when the business hasn't connected the integration.
 */
export async function enqueueOutbound(
  ex: Executor,
  ctx: Ctx,
  event: { eventType: string; entityType: string; entityId: string; payload?: Record<string, unknown>; idempotencyKey?: string },
): Promise<boolean> {
  const [conn] = await ex
    .select({ status: integrationConnections.status })
    .from(integrationConnections)
    .where(and(eq(integrationConnections.businessId, ctx.businessId), eq(integrationConnections.provider, GHL)))
    .limit(1);
  if (!conn || conn.status !== "connected") return false;
  await ex
    .insert(integrationSyncEvents)
    .values({
      businessId: ctx.businessId,
      provider: GHL,
      direction: "outbound",
      eventType: event.eventType,
      entityType: event.entityType,
      entityId: event.entityId,
      payload: event.payload ?? {},
      idempotencyKey: event.idempotencyKey ?? null,
      status: "pending",
    })
    .onConflictDoNothing();
  return true;
}

export async function isIntegrationConnected(ex: Executor, businessId: string, provider = GHL) {
  const [conn] = await ex
    .select({ status: integrationConnections.status })
    .from(integrationConnections)
    .where(and(eq(integrationConnections.businessId, businessId), eq(integrationConnections.provider, provider)))
    .limit(1);
  return conn?.status === "connected";
}
