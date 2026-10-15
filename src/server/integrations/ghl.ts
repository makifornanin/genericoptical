/**
 * GoHighLevel (LeadConnector API v2) integration.
 *
 * Scope (deliberately limited to endpoints already verified in production by this author):
 *  - Outbound: contact find-or-create/update (+ stage tags), and an "order ready" trigger tag that a
 *    GHL workflow can use to message the customer.
 *  - Inbound: a webhook receiver (GHL workflow "Webhook" action) that creates/updates leads.
 * Not implemented: opportunity and calendar sync — documented in docs/INTEGRATIONS.md.
 *
 * Ownership rules (prevent sync loops):
 *  - Customers and leads created in the platform are owned by the platform; GHL receives copies.
 *  - Contacts created in GHL arrive as leads (source "gohighlevel"); later edits from GHL only fill
 *    empty fields, never overwrite platform data.
 *  - Inbound events for a contact the platform pushed in the last 2 minutes are treated as echoes.
 */
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { and, asc, desc, eq, gte, lte, or, sql } from "drizzle-orm";
import { z } from "zod";
import { decrypt, encrypt } from "@/server/auth/tokens";
import { getDb } from "@/server/db";
import { customers, integrationConnections, integrationSyncEvents, leadActivities, leads } from "@/server/db/schema";
import { env } from "@/server/env";
import { audit, invalid, isUniqueViolation, nextNumber, requirePermission, systemCtx, type Ctx } from "@/server/services/core";
import { GHL } from "@/server/services/outbox";

const BASE_URL = "https://services.leadconnectorhq.com";
const VERSION = "2021-07-28";

export type GhlSettings = { tagPrefix: string; stageTags: boolean; orderReadyTag: string; appointmentsAuthority: "platform" | "ghl" };
const DEFAULT_SETTINGS: GhlSettings = { tagPrefix: "specta", stageTags: true, orderReadyTag: "order-ready", appointmentsAuthority: "platform" };

type Fetch = typeof fetch;

class GhlApiError extends Error {
  constructor(
    message: string,
    public status?: number,
  ) {
    super(message);
  }
}

async function request<T>(fetchImpl: Fetch, token: string, path: string, init: { method?: string; query?: Record<string, string>; body?: unknown } = {}): Promise<T> {
  const url = new URL(path, BASE_URL);
  for (const [k, v] of Object.entries(init.query ?? {})) url.searchParams.set(k, v);
  let res: Response;
  try {
    res = await fetchImpl(url, {
      method: init.method ?? "GET",
      headers: { Authorization: `Bearer ${token}`, Version: VERSION, Accept: "application/json", "Content-Type": "application/json" },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });
  } catch (error) {
    throw new GhlApiError(error instanceof Error && error.name === "TimeoutError" ? "GoHighLevel timed out" : "Couldn't reach GoHighLevel");
  }
  const payload = (await res.json().catch(() => null)) as { message?: unknown } | null;
  if (!res.ok) {
    const msg = Array.isArray(payload?.message) ? payload!.message.join("; ") : typeof payload?.message === "string" ? payload.message : `HTTP ${res.status}`;
    throw new GhlApiError(res.status === 401 || res.status === 403 ? `Access denied by GoHighLevel (${msg}). Check the token's scopes.` : msg, res.status);
  }
  return payload as T;
}

// ─── Connection management ───────────────────────────────────────────────────

async function connectionRow(businessId: string) {
  const [row] = await getDb()
    .select()
    .from(integrationConnections)
    .where(and(eq(integrationConnections.businessId, businessId), eq(integrationConnections.provider, GHL)))
    .limit(1);
  return row ?? null;
}

export async function getGhlStatus(ctx: Ctx) {
  requirePermission(ctx, "integrations.manage");
  const row = await connectionRow(ctx.businessId);
  const counts = await getDb().execute<{ status: string; n: number }>(sql`
    select status, count(*)::int as n from integration_sync_events where business_id = ${ctx.businessId} and provider = ${GHL} group by status`);
  const recent = await getDb()
    .select()
    .from(integrationSyncEvents)
    .where(and(eq(integrationSyncEvents.businessId, ctx.businessId), eq(integrationSyncEvents.provider, GHL)))
    .orderBy(desc(integrationSyncEvents.createdAt))
    .limit(12);
  return {
    status: row?.status ?? "not_configured",
    locationId: row?.externalAccountId ?? null,
    hasToken: Boolean(row?.credentialsEncrypted),
    webhookSecret: row?.webhookSecretEncrypted ? decrypt(row.webhookSecretEncrypted, env().APP_SECRET) : null,
    settings: { ...DEFAULT_SETTINGS, ...((row?.settings as Partial<GhlSettings>) ?? {}) },
    lastTestedAt: row?.lastTestedAt ?? null,
    lastSyncAt: row?.lastSyncAt ?? null,
    lastError: row?.lastError ?? null,
    counts: Object.fromEntries(counts.rows.map((r) => [r.status, Number(r.n)])) as Record<string, number>,
    recent,
  };
}

const connectionInput = z.object({
  locationId: z.string().trim().min(5, "Enter the sub-account (location) ID.").max(80),
  token: z.string().trim().max(400).optional(),
  settings: z
    .object({
      tagPrefix: z.string().trim().min(1).max(30).regex(/^[a-z0-9-]+$/i, "Letters, numbers and dashes."),
      stageTags: z.boolean(),
      orderReadyTag: z.string().trim().min(1).max(40),
      appointmentsAuthority: z.enum(["platform", "ghl"]),
    })
    .partial()
    .default({}),
});

/** Saves credentials (encrypted at rest). The connection stays unverified until `testGhlConnection` succeeds. */
export async function saveGhlConnection(ctx: Ctx, raw: unknown) {
  requirePermission(ctx, "integrations.manage");
  const input = connectionInput.parse(raw);
  const existing = await connectionRow(ctx.businessId);
  if (!existing?.credentialsEncrypted && !input.token) throw invalid("Enter a Private Integration token.", { token: ["Required."] });
  const secret = env().APP_SECRET;
  const values = {
    externalAccountId: input.locationId,
    credentialsEncrypted: input.token ? encrypt(input.token, secret) : existing!.credentialsEncrypted,
    webhookSecretEncrypted: existing?.webhookSecretEncrypted ?? encrypt(randomBytes(24).toString("base64url"), secret),
    settings: { ...DEFAULT_SETTINGS, ...((existing?.settings as Partial<GhlSettings>) ?? {}), ...input.settings },
    status: input.token || input.locationId !== existing?.externalAccountId ? ("not_configured" as const) : existing!.status,
    lastError: null,
    updatedAt: new Date(),
  };
  if (existing) await getDb().update(integrationConnections).set(values).where(eq(integrationConnections.id, existing.id));
  else await getDb().insert(integrationConnections).values({ ...values, businessId: ctx.businessId, provider: GHL });
  await audit(getDb(), ctx, { action: "integration.saved", entityType: "business", entityId: ctx.businessId, summary: "Updated GoHighLevel connection settings" });
}

/** Verifies the token against the location before marking the integration connected. */
export async function testGhlConnection(ctx: Ctx, fetchImpl: Fetch = fetch) {
  requirePermission(ctx, "integrations.manage");
  const row = await connectionRow(ctx.businessId);
  if (!row?.credentialsEncrypted || !row.externalAccountId) throw invalid("Save the location ID and token first.");
  const token = decrypt(row.credentialsEncrypted, env().APP_SECRET);
  try {
    // A duplicate search is a harmless read that requires contacts scope on this location.
    await request(fetchImpl, token, "/contacts/search/duplicate", { query: { locationId: row.externalAccountId, email: "connection-test@invalid.example" } });
    await getDb().update(integrationConnections).set({ status: "connected", lastTestedAt: new Date(), lastError: null, updatedAt: new Date() }).where(eq(integrationConnections.id, row.id));
    await audit(getDb(), ctx, { action: "integration.connected", entityType: "business", entityId: ctx.businessId, summary: "GoHighLevel connection verified" });
    return { ok: true as const };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Connection test failed";
    await getDb().update(integrationConnections).set({ status: "error", lastTestedAt: new Date(), lastError: message, updatedAt: new Date() }).where(eq(integrationConnections.id, row.id));
    return { ok: false as const, error: message };
  }
}

export async function disconnectGhl(ctx: Ctx) {
  requirePermission(ctx, "integrations.manage");
  await getDb()
    .update(integrationConnections)
    .set({ status: "disabled", credentialsEncrypted: null, lastError: null, updatedAt: new Date() })
    .where(and(eq(integrationConnections.businessId, ctx.businessId), eq(integrationConnections.provider, GHL)));
  await audit(getDb(), ctx, { action: "integration.disconnected", entityType: "business", entityId: ctx.businessId, summary: "Disconnected GoHighLevel (token removed)" });
}

// ─── Outbound processing (transactional outbox) ──────────────────────────────

type ContactRef = { id: string; tags: string[] };

async function findOrCreateContact(f: Fetch, token: string, locationId: string, person: { firstName: string; lastName: string; email: string | null; phone: string | null; source: string }) {
  const search = async (q: Record<string, string>) =>
    (await request<{ contact?: { id: string; tags?: string[] | null } | null }>(f, token, "/contacts/search/duplicate", { query: { locationId, ...q } })).contact ?? null;
  const found = (person.email ? await search({ email: person.email }) : null) ?? (person.phone ? await search({ number: person.phone }) : null);
  if (found) return { id: found.id, tags: found.tags ?? [] } satisfies ContactRef;
  const { contact } = await request<{ contact: { id: string; tags?: string[] } }>(f, token, "/contacts/", {
    method: "POST",
    body: { locationId, firstName: person.firstName, lastName: person.lastName || undefined, name: `${person.firstName} ${person.lastName}`.trim(), email: person.email ?? undefined, phone: person.phone ?? undefined, source: person.source },
  });
  return { id: contact.id, tags: contact.tags ?? [] } satisfies ContactRef;
}

async function addTag(f: Fetch, token: string, contactId: string, tag: string, retrigger = false) {
  const path = `/contacts/${encodeURIComponent(contactId)}/tags`;
  if (retrigger) await request(f, token, path, { method: "DELETE", body: { tags: [tag] } }).catch(() => undefined);
  await request(f, token, path, { method: "POST", body: { tags: [tag] } });
}

/**
 * Sends pending outbound events. Safe to run concurrently: each event is claimed with
 * FOR UPDATE SKIP LOCKED. Failed events back off exponentially (max 6 attempts).
 */
export async function processGhlOutbox(businessId: string, opts: { limit?: number; fetchImpl?: Fetch } = {}) {
  const f = opts.fetchImpl ?? fetch;
  const row = await connectionRow(businessId);
  if (!row || row.status !== "connected" || !row.credentialsEncrypted || !row.externalAccountId) return { processed: 0, failed: 0, skipped: 0, reason: "not_connected" as const };
  const token = decrypt(row.credentialsEncrypted, env().APP_SECRET);
  const locationId = row.externalAccountId;
  const settings = { ...DEFAULT_SETTINGS, ...((row.settings as Partial<GhlSettings>) ?? {}) };
  let processed = 0;
  let failed = 0;
  let skipped = 0;
  for (let i = 0; i < (opts.limit ?? 25); i++) {
    const done = await getDb().transaction(async (tx) => {
      const [ev] = await tx
        .select()
        .from(integrationSyncEvents)
        .where(and(eq(integrationSyncEvents.businessId, businessId), eq(integrationSyncEvents.provider, GHL), eq(integrationSyncEvents.direction, "outbound"), eq(integrationSyncEvents.status, "pending"), lte(integrationSyncEvents.nextAttemptAt, new Date())))
        .orderBy(asc(integrationSyncEvents.createdAt))
        .limit(1)
        .for("update", { skipLocked: true });
      if (!ev) return "empty" as const;
      try {
        const result = await handleOutbound(tx, f, token, locationId, settings, ev);
        await tx.update(integrationSyncEvents).set({ status: result.status, externalId: result.externalId ?? ev.externalId, lastError: result.note ?? null, attempts: ev.attempts + 1, processedAt: new Date() }).where(eq(integrationSyncEvents.id, ev.id));
        return result.status;
      } catch (error) {
        const attempts = ev.attempts + 1;
        const message = error instanceof Error ? error.message : String(error);
        await tx
          .update(integrationSyncEvents)
          .set({ status: attempts >= 6 ? "failed" : "pending", attempts, lastError: message.slice(0, 500), nextAttemptAt: new Date(Date.now() + 2 ** attempts * 30_000) })
          .where(eq(integrationSyncEvents.id, ev.id));
        return "failed" as const;
      }
    });
    if (done === "empty") break;
    if (done === "processed") processed++;
    else if (done === "skipped") skipped++;
    else failed++;
  }
  await getDb().update(integrationConnections).set({ lastSyncAt: new Date() }).where(eq(integrationConnections.id, row.id));
  return { processed, failed, skipped };
}

async function handleOutbound(
  tx: Parameters<Parameters<ReturnType<typeof getDb>["transaction"]>[0]>[0],
  f: Fetch,
  token: string,
  locationId: string,
  settings: GhlSettings,
  ev: typeof integrationSyncEvents.$inferSelect,
): Promise<{ status: "processed" | "skipped"; externalId?: string; note?: string }> {
  if (ev.entityType === "lead" && (ev.eventType === "contact.upsert" || ev.eventType === "opportunity.stage")) {
    const [lead] = await tx.select().from(leads).where(and(eq(leads.businessId, ev.businessId), eq(leads.id, ev.entityId!))).limit(1);
    if (!lead) return { status: "skipped", note: "Lead no longer exists" };
    if (!lead.email && !lead.phone) return { status: "skipped", note: "Lead has no email or phone" };
    const contact = lead.externalGhlContactId
      ? { id: lead.externalGhlContactId, tags: [] }
      : await findOrCreateContact(f, token, locationId, { firstName: lead.firstName, lastName: lead.lastName, email: lead.email, phone: lead.phone, source: `Website (${lead.source})` });
    if (!lead.externalGhlContactId) await tx.update(leads).set({ externalGhlContactId: contact.id }).where(eq(leads.id, lead.id));
    if (settings.stageTags) await addTag(f, token, contact.id, `${settings.tagPrefix}-stage-${lead.stage}`);
    return { status: "processed", externalId: contact.id };
  }
  if (ev.entityType === "sale" && ev.eventType === "order.ready_for_pickup") {
    const customerId = (ev.payload as { customerId?: string } | null)?.customerId;
    if (!customerId) return { status: "skipped", note: "Order has no customer" };
    const [c] = await tx.select().from(customers).where(and(eq(customers.businessId, ev.businessId), eq(customers.id, customerId))).limit(1);
    if (!c || (!c.email && !c.phone)) return { status: "skipped", note: "Customer has no email or phone" };
    if (!c.smsConsent) return { status: "skipped", note: "Customer hasn't consented to SMS updates" };
    const contact = c.externalGhlContactId ? { id: c.externalGhlContactId, tags: [] } : await findOrCreateContact(f, token, locationId, { firstName: c.firstName, lastName: c.lastName, email: c.email, phone: c.phone, source: "Optical platform" });
    if (!c.externalGhlContactId) await tx.update(customers).set({ externalGhlContactId: contact.id }).where(eq(customers.id, c.id));
    await addTag(f, token, contact.id, settings.orderReadyTag, true);
    return { status: "processed", externalId: contact.id };
  }
  if (ev.eventType === "appointment.upsert") return { status: "skipped", note: "Calendar sync isn't enabled in this version" };
  return { status: "skipped", note: `No handler for ${ev.eventType}` };
}

// ─── Inbound webhook ─────────────────────────────────────────────────────────

const webhookSchema = z
  .object({
    contact_id: z.string().optional(),
    contactId: z.string().optional(),
    id: z.string().optional(),
    first_name: z.string().optional(),
    firstName: z.string().optional(),
    last_name: z.string().optional(),
    lastName: z.string().optional(),
    full_name: z.string().optional(),
    email: z.string().optional().nullable(),
    phone: z.string().optional().nullable(),
    type: z.string().optional(),
    customData: z.record(z.string(), z.unknown()).optional(),
  })
  .loose();

export function verifyWebhookSecret(provided: string | null, expected: string) {
  if (!provided) return false;
  const a = createHash("sha256").update(provided).digest();
  const b = createHash("sha256").update(expected).digest();
  return timingSafeEqual(a, b);
}

/**
 * Handles a GHL workflow webhook. Authenticated with a shared secret sent as the
 * `x-webhook-secret` header (configured in the workflow's Webhook action). Idempotent per event.
 */
export async function handleGhlWebhook(businessSlugOrId: { businessId: string }, headers: Headers, rawBody: string) {
  const row = await connectionRow(businessSlugOrId.businessId);
  if (!row?.webhookSecretEncrypted) return { status: 404, body: { error: "Integration not configured" } };
  if (!verifyWebhookSecret(headers.get("x-webhook-secret"), decrypt(row.webhookSecretEncrypted, env().APP_SECRET))) return { status: 401, body: { error: "Invalid signature" } };
  if (rawBody.length > 100_000) return { status: 413, body: { error: "Payload too large" } };
  let json: unknown;
  try {
    json = JSON.parse(rawBody);
  } catch {
    return { status: 400, body: { error: "Invalid JSON" } };
  }
  const parsed = webhookSchema.safeParse(json);
  if (!parsed.success) return { status: 400, body: { error: "Unrecognised payload" } };
  const p = parsed.data;
  const contactId = p.contact_id ?? p.contactId ?? p.id;
  if (!contactId) return { status: 400, body: { error: "Missing contact id" } };
  const businessId = businessSlugOrId.businessId;
  const eventKey = headers.get("x-event-id") ?? createHash("sha256").update(rawBody).digest("hex");
  const firstName = (p.first_name ?? p.firstName ?? p.full_name?.split(" ")[0] ?? "").trim() || "GoHighLevel contact";
  const lastName = (p.last_name ?? p.lastName ?? p.full_name?.split(" ").slice(1).join(" ") ?? "").trim();
  const email = p.email?.trim().toLowerCase() || null;
  const phone = p.phone?.trim() || null;
  const ctx = systemCtx(businessId, "GoHighLevel");

  // The event record and its effects commit together: a crash rolls both back so GHL's retry is
  // processed afresh, while a concurrent or repeated delivery waits on the unique key and is
  // reported as a duplicate.
  try {
    return await getDb().transaction(async (tx) => {
      const [event] = await tx
        .insert(integrationSyncEvents)
        .values({ businessId, provider: GHL, direction: "inbound", eventType: p.type ?? "contact.webhook", externalId: contactId, idempotencyKey: eventKey, status: "pending", payload: json as Record<string, unknown> })
        .returning({ id: integrationSyncEvents.id });
      const finish = (status: "processed" | "skipped", note: string, entityId?: string) =>
        tx
          .update(integrationSyncEvents)
          .set({ status, lastError: note, entityType: entityId ? "lead" : null, entityId: entityId ?? null, processedAt: new Date(), attempts: 1 })
          .where(eq(integrationSyncEvents.id, event.id));

      // Echo suppression: we just pushed this contact ourselves.
      const [echo] = await tx
        .select({ id: integrationSyncEvents.id })
        .from(integrationSyncEvents)
        .where(and(eq(integrationSyncEvents.businessId, businessId), eq(integrationSyncEvents.direction, "outbound"), eq(integrationSyncEvents.externalId, contactId), gte(integrationSyncEvents.processedAt, new Date(Date.now() - 120_000))))
        .limit(1);
      if (echo) {
        await finish("skipped", "Echo of an update sent by the platform");
        return { status: 200, body: { status: "skipped", reason: "echo" } };
      }

      const [customer] = await tx.select({ id: customers.id }).from(customers).where(and(eq(customers.businessId, businessId), eq(customers.externalGhlContactId, contactId))).limit(1);
      if (customer) {
        await finish("skipped", "Contact belongs to an existing customer (platform-owned)");
        return { status: 200, body: { status: "skipped", reason: "customer_owned" } };
      }
      const matchConds = [eq(leads.externalGhlContactId, contactId)];
      if (email) matchConds.push(sql`lower(${leads.email}) = ${email}`);
      const [lead] = await tx
        .select()
        .from(leads)
        .where(and(eq(leads.businessId, businessId), or(...matchConds)))
        .orderBy(desc(leads.createdAt))
        .limit(1)
        .for("update");
      if (lead) {
        // GHL only fills gaps; it never overwrites what staff entered in the platform.
        await tx
          .update(leads)
          .set({ externalGhlContactId: lead.externalGhlContactId ?? contactId, email: lead.email ?? email, phone: lead.phone ?? phone, updatedAt: new Date() })
          .where(eq(leads.id, lead.id));
        await finish("processed", "Linked/updated existing lead", lead.id);
        return { status: 200, body: { status: "updated", leadId: lead.id } };
      }
      const code = await nextNumber(tx, businessId, "lead", "LD-", 5);
      const [created] = await tx
        .insert(leads)
        .values({ businessId, code, firstName, lastName, email, phone, source: "gohighlevel", externalGhlContactId: contactId, message: typeof p.customData?.message === "string" ? p.customData.message : null })
        .returning({ id: leads.id });
      await tx.insert(leadActivities).values({ businessId, leadId: created.id, type: "created", toStage: "new", body: "Received from GoHighLevel", metadata: { contactId } });
      await audit(tx, ctx, { action: "lead.created", entityType: "lead", entityId: created.id, summary: `Lead ${code} received from GoHighLevel` });
      await finish("processed", "Created lead", created.id);
      return { status: 200, body: { status: "created", leadId: created.id } };
    });
  } catch (error) {
    if (isUniqueViolation(error)) return { status: 200, body: { status: "duplicate" } };
    throw error;
  }
}

