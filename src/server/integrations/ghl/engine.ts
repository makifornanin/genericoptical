import { randomUUID } from "node:crypto";
import { after } from "next/server";
import { and, eq, inArray, sql } from "drizzle-orm";
import { getDb, type Executor } from "@/server/db";
import { integrationConnections, integrationSyncEvents, type SyncCategory } from "@/server/db/schema";
import { log, errorFields } from "@/server/log";
import { GhlAuthError, GhlError, GhlNetworkError, GhlPermissionError, GhlRateLimitError, GhlReauthRequiredError, GhlServerError } from "./errors";

/**
 * Durable synchronisation engine (transactional outbox + inbox).
 *
 * - Events are rows in integration_sync_events, written in the same transaction as the business
 *   change (outbound) or immediately after webhook verification (inbound). Nothing lives only in memory.
 * - Workers claim due events with FOR UPDATE SKIP LOCKED and mark them `processing` with a lease, then
 *   run the handler OUTSIDE any database transaction (external calls must never be inside one).
 * - Outcomes: synced (external system confirmed) | skipped (nothing to do) | needs_review (a person
 *   must decide) | retry_scheduled (transient failure, exponential back-off with jitter) | failed (gave up).
 * - A 429 pauses the whole business until the rate-limit window passes; a revoked token pauses the
 *   connection until an owner reconnects. Leases older than LEASE_MS are recovered automatically.
 */

export const GHL = "gohighlevel";
export const MAX_ATTEMPTS = 8;
const LEASE_MS = 10 * 60_000;

export type SyncEvent = typeof integrationSyncEvents.$inferSelect;
export type HandlerOutcome = {
  status: "synced" | "skipped" | "needs_review";
  externalId?: string | null;
  note?: string | null;
  result?: Record<string, unknown>;
};
export type Handler = (event: SyncEvent, env: HandlerEnv) => Promise<HandlerOutcome>;
export type HandlerEnv = { businessId: string; workerId: string; now: () => Date };

export type EnqueueInput = {
  businessId: string;
  direction: "inbound" | "outbound";
  eventType: string;
  category: SyncCategory;
  entityType?: string | null;
  entityId?: string | null;
  externalId?: string | null;
  payload?: Record<string, unknown>;
  idempotencyKey?: string | null;
  /** Skip the insert when an unprocessed event with the same type and entity already exists (state-based handlers). */
  coalesce?: boolean;
  delayMs?: number;
  status?: "pending" | "needs_review" | "skipped";
  note?: string | null;
};

/** Adds an event. Returns the new event id, or null when it was coalesced/deduplicated. */
export async function enqueue(ex: Executor, input: EnqueueInput): Promise<string | null> {
  const values = {
    businessId: input.businessId,
    provider: GHL,
    direction: input.direction,
    eventType: input.eventType,
    category: input.category,
    entityType: input.entityType ?? null,
    entityId: input.entityId ?? null,
    externalId: input.externalId ?? null,
    payload: input.payload ?? {},
    idempotencyKey: input.idempotencyKey ?? null,
    status: input.status ?? "pending",
    lastError: input.note ?? null,
    // The database clock, the same one claim() compares against, so app/DB clock skew can never make
    // a just-queued event look "not yet due".
    nextAttemptAt: sql`now() + make_interval(secs => ${(input.delayMs ?? 0) / 1000})`,
  } as const;
  if (input.coalesce && input.entityId) {
    const res = await ex.execute<{ id: string }>(sql`
      insert into integration_sync_events (business_id, provider, direction, event_type, category, entity_type, entity_id, external_id, payload, idempotency_key, status, last_error, next_attempt_at)
      select ${values.businessId}, ${GHL}, ${values.direction}, ${values.eventType}, ${values.category}, ${values.entityType}, ${values.entityId}, ${values.externalId},
             ${JSON.stringify(values.payload)}::jsonb, ${values.idempotencyKey}, ${values.status}, ${values.lastError}, ${values.nextAttemptAt}
      where not exists (
        select 1 from integration_sync_events
        where business_id = ${values.businessId} and provider = ${GHL} and event_type = ${values.eventType}
          and entity_id = ${values.entityId} and status in ('pending', 'retry_scheduled')
      )
      on conflict do nothing
      returning id`);
    if (res.rows[0]) scheduleKick(values.businessId, input.delayMs);
    return res.rows[0]?.id ?? null;
  }
  const rows = await ex.insert(integrationSyncEvents).values(values).onConflictDoNothing().returning({ id: integrationSyncEvents.id });
  if (rows[0] && values.status === "pending") scheduleKick(values.businessId, input.delayMs);
  return rows[0]?.id ?? null;
}

const lastKick = new Map<string, number>();

/**
 * Runs the worker for this business right after the current request's response (Next.js after()), so a
 * POS sale or lead change reaches GHL in seconds rather than at the next scheduled run. De-duplicated
 * per business per instance; outside a request (scripts, tests, the cron worker's own follow-ups) after()
 * throws and the scheduled worker picks the event up instead. Runs after the transaction has committed.
 */
function scheduleKick(businessId: string, delayMs = 0) {
  if (delayMs > 0) return;
  const now = Date.now();
  if ((lastKick.get(businessId) ?? 0) > now - 2000) return;
  try {
    after(async () => {
      lastKick.set(businessId, Date.now());
      const { kickGhl } = await import("./index");
      // If nothing was claimable yet (e.g. the commit isn't visible to this connection), try once more.
      if (!(await kickGhl(businessId))) {
        await new Promise((r) => setTimeout(r, 1500));
        await kickGhl(businessId);
      }
    });
    lastKick.set(businessId, now);
  } catch {
    // Not in a request scope: the scheduled worker handles it.
  }
}

/** Back-off: 30s, 1m, 2m, 4m … capped at 6h, ±20% jitter so retries don't stampede. */
export function backoffMs(attempts: number) {
  const base = Math.min(30_000 * 2 ** Math.max(0, attempts - 1), 6 * 3_600_000);
  return Math.round(base * (0.8 + Math.random() * 0.4));
}

/** Claims due events for one business (or specific event ids) and leases them to this worker. */
async function claim(businessId: string, workerId: string, limit: number, onlyIds?: string[]) {
  const idFilter = onlyIds?.length ? sql`and e.id in (${sql.join(onlyIds.map((i) => sql`${i}`), sql`, `)})` : sql``;
  const res = await getDb().execute<{ id: string }>(sql`
    update integration_sync_events set status = 'processing', locked_at = now(), locked_by = ${workerId}, attempts = attempts + 1
    where id in (
      select e.id from integration_sync_events e
      where e.business_id = ${businessId} and e.provider = ${GHL}
        and e.status in ('pending', 'retry_scheduled') and e.next_attempt_at <= now() ${idFilter}
      order by e.created_at
      limit ${limit}
      for update skip locked
    )
    returning id`);
  if (!res.rows.length) return [];
  const rows = await getDb()
    .select()
    .from(integrationSyncEvents)
    .where(inArray(integrationSyncEvents.id, res.rows.map((r) => r.id)));
  return rows.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
}

/** Returns leases abandoned by crashed workers to the queue. */
export async function recoverStaleLeases() {
  const res = await getDb().execute(sql`
    update integration_sync_events set status = 'retry_scheduled', locked_at = null, locked_by = null,
      last_error = coalesce(last_error, 'Worker stopped before finishing; retrying.'), next_attempt_at = now()
    where status = 'processing' and locked_at < now() - (${LEASE_MS} || ' milliseconds')::interval`);
  return res.rowCount ?? 0;
}

async function finish(event: SyncEvent, workerId: string, patch: Partial<typeof integrationSyncEvents.$inferInsert>) {
  await getDb()
    .update(integrationSyncEvents)
    .set({ ...patch, lockedAt: null, lockedBy: null })
    .where(and(eq(integrationSyncEvents.id, event.id), eq(integrationSyncEvents.lockedBy, workerId)));
}

async function connectionState(businessId: string) {
  const [conn] = await getDb()
    .select({ id: integrationConnections.id, status: integrationConnections.status, rateLimitedUntil: integrationConnections.rateLimitedUntil })
    .from(integrationConnections)
    .where(and(eq(integrationConnections.businessId, businessId), eq(integrationConnections.provider, GHL)))
    .limit(1);
  return conn ?? null;
}

export type ProcessResult = { claimed: number; synced: number; skipped: number; retried: number; failed: number; review: number; paused?: string };

/**
 * Processes due events for one business. Inbound events are processed even while outbound calls
 * are paused (they only write locally); outbound handlers fail fast with a pause reason.
 */
export async function processBusiness(businessId: string, handlers: Record<string, Handler>, opts: { limit?: number; onlyIds?: string[]; now?: () => Date } = {}): Promise<ProcessResult> {
  const workerId = randomUUID();
  const result: ProcessResult = { claimed: 0, synced: 0, skipped: 0, retried: 0, failed: 0, review: 0 };
  const conn = await connectionState(businessId);
  if (!conn || conn.status === "disabled" || conn.status === "not_configured") return { ...result, paused: "not_connected" };
  if (conn.rateLimitedUntil && conn.rateLimitedUntil > new Date()) return { ...result, paused: "rate_limited" };
  const events = await claim(businessId, workerId, opts.limit ?? 25, opts.onlyIds);
  result.claimed = events.length;
  const env: HandlerEnv = { businessId, workerId, now: opts.now ?? (() => new Date()) };
  for (const event of events) {
    const handler = handlers[event.eventType];
    const elog = log.child({ businessId, eventId: event.id, eventType: event.eventType, attempt: event.attempts });
    if (!handler) {
      await finish(event, workerId, { status: "skipped", lastError: `No handler for ${event.eventType}`, processedAt: new Date() });
      result.skipped++;
      continue;
    }
    try {
      const outcome = await handler(event, env);
      await finish(event, workerId, {
        status: outcome.status,
        externalId: outcome.externalId ?? event.externalId,
        lastError: outcome.note ?? null,
        lastHttpStatus: null,
        result: outcome.result ?? null,
        processedAt: new Date(),
      });
      if (outcome.status === "synced") {
        result.synced++;
        await getDb().update(integrationConnections).set({ lastSuccessAt: new Date(), lastSyncAt: new Date() }).where(eq(integrationConnections.id, conn.id));
      } else if (outcome.status === "skipped") result.skipped++;
      else result.review++;
      elog.info("ghl.sync_event", { outcome: outcome.status });
    } catch (error) {
      const decision = decide(error, event);
      await finish(event, workerId, {
        status: decision.status,
        lastError: decision.message.slice(0, 500),
        lastHttpStatus: error instanceof GhlError ? error.status ?? null : null,
        nextAttemptAt: new Date(Date.now() + decision.delayMs),
        attempts: decision.refundAttempt ? Math.max(0, event.attempts - 1) : event.attempts,
        processedAt: decision.status === "failed" || decision.status === "needs_review" ? new Date() : null,
      });
      if (decision.status === "retry_scheduled") result.retried++;
      else if (decision.status === "failed") result.failed++;
      else result.review++;
      (decision.status === "retry_scheduled" ? elog.warn : elog.error)("ghl.sync_event_error", { outcome: decision.status, ...errorFields(error) });
      if (error instanceof GhlRateLimitError) {
        await getDb().update(integrationConnections).set({ rateLimitedUntil: new Date(Date.now() + error.retryAfterMs) }).where(eq(integrationConnections.id, conn.id));
        await deferRemaining(events, event, workerId, error.retryAfterMs);
        result.paused = "rate_limited";
        break;
      }
      if (error instanceof GhlReauthRequiredError || error instanceof GhlAuthError) {
        await getDb().update(integrationConnections).set({ status: "reauth_required", lastError: decision.message, updatedAt: new Date() }).where(eq(integrationConnections.id, conn.id));
        await deferRemaining(events, event, workerId, 5 * 60_000);
        result.paused = "reauth_required";
        break;
      }
      if (error instanceof GhlPermissionError) {
        await getDb().update(integrationConnections).set({ lastError: decision.message, updatedAt: new Date() }).where(eq(integrationConnections.id, conn.id));
      }
    }
  }
  return result;
}

/** Releases the rest of a claimed batch without counting an attempt. */
async function deferRemaining(events: SyncEvent[], current: SyncEvent, workerId: string, delayMs: number) {
  const rest = events.filter((e) => e.createdAt >= current.createdAt && e.id !== current.id).map((e) => e.id);
  if (!rest.length) return;
  await getDb()
    .update(integrationSyncEvents)
    .set({ status: "retry_scheduled", lockedAt: null, lockedBy: null, attempts: sql`greatest(0, ${integrationSyncEvents.attempts} - 1)`, nextAttemptAt: new Date(Date.now() + delayMs) })
    .where(and(inArray(integrationSyncEvents.id, rest), eq(integrationSyncEvents.lockedBy, workerId)));
}

type Decision = { status: "retry_scheduled" | "failed" | "needs_review"; delayMs: number; message: string; refundAttempt?: boolean };

export function decide(error: unknown, event: Pick<SyncEvent, "attempts">): Decision {
  const message = error instanceof Error ? error.message : String(error);
  if (error instanceof GhlRateLimitError) return { status: "retry_scheduled", delayMs: error.retryAfterMs, message, refundAttempt: true };
  if (error instanceof GhlReauthRequiredError || error instanceof GhlAuthError) return { status: "retry_scheduled", delayMs: 5 * 60_000, message, refundAttempt: true };
  if (error instanceof GhlPermissionError) return { status: "needs_review", delayMs: 0, message };
  const transient = error instanceof GhlServerError || error instanceof GhlNetworkError || !(error instanceof GhlError);
  if (transient && event.attempts < MAX_ATTEMPTS) return { status: "retry_scheduled", delayMs: backoffMs(event.attempts), message };
  return { status: "failed", delayMs: 0, message: event.attempts >= MAX_ATTEMPTS ? `Gave up after ${event.attempts} attempts: ${message}` : message };
}

/** Puts failed / needs-review events back in the queue (manual retry from Settings → Integrations). */
export async function retryEvents(businessId: string, ids: string[] | "all_failed", reviewerMembershipId: string | null) {
  const where =
    ids === "all_failed"
      ? and(eq(integrationSyncEvents.businessId, businessId), inArray(integrationSyncEvents.status, ["failed", "needs_review"]))
      : and(eq(integrationSyncEvents.businessId, businessId), inArray(integrationSyncEvents.id, ids), inArray(integrationSyncEvents.status, ["failed", "needs_review", "retry_scheduled"]));
  const res = await getDb()
    .update(integrationSyncEvents)
    .set({ status: "pending", attempts: 0, nextAttemptAt: new Date(), reviewedAt: new Date(), reviewedByMembershipId: reviewerMembershipId })
    .where(where)
    .returning({ id: integrationSyncEvents.id });
  return res.length;
}

/** Marks needs-review events as dismissed (resolved by a person, nothing more to send). */
export async function dismissEvents(businessId: string, ids: string[], reviewerMembershipId: string | null, note: string) {
  const res = await getDb()
    .update(integrationSyncEvents)
    .set({ status: "skipped", lastError: `Dismissed: ${note}`.slice(0, 500), reviewedAt: new Date(), reviewedByMembershipId: reviewerMembershipId, processedAt: new Date() })
    .where(and(eq(integrationSyncEvents.businessId, businessId), inArray(integrationSyncEvents.id, ids), inArray(integrationSyncEvents.status, ["failed", "needs_review"])))
    .returning({ id: integrationSyncEvents.id });
  return res.length;
}

/** Businesses with due work, for the scheduled worker. */
export async function businessesWithDueEvents(limit = 50) {
  const res = await getDb().execute<{ business_id: string }>(sql`
    select distinct e.business_id from integration_sync_events e
    join integration_connections c on c.business_id = e.business_id and c.provider = ${GHL}
    where e.provider = ${GHL} and e.status in ('pending', 'retry_scheduled') and e.next_attempt_at <= now()
      and c.status in ('connected', 'error', 'reauth_required') and (c.rate_limited_until is null or c.rate_limited_until <= now())
    limit ${limit}`);
  return res.rows.map((r) => r.business_id);
}
