import { createHash, createPublicKey, timingSafeEqual, verify } from "node:crypto";
import { and, eq, ne } from "drizzle-orm";
import { decrypt } from "@/server/auth/tokens";
import { getDb } from "@/server/db";
import { integrationConnections, type SyncCategory } from "@/server/db/schema";
import { env } from "@/server/env";
import { log } from "@/server/log";
import { GHL_WEBHOOK_ED25519_PUBLIC_KEY, GHL_WEBHOOK_RSA_PUBLIC_KEY } from "./constants";
import { enqueue, GHL, processBusiness } from "./engine";
import { HANDLERS } from "./handlers";

/**
 * Inbound webhooks.
 *
 * 1. Marketplace app webhooks (one URL for the whole app): signed by HighLevel with Ed25519
 *    (X-GHL-Signature) or, legacy, RSA-SHA256 (X-WH-Signature). Routed to the business that owns the
 *    event's locationId. Deduplicated by webhookId. Stored first, then processed; if processing fails
 *    the stored event is retried by the worker, so GHL always gets a fast 200 for a valid delivery.
 * 2. Workflow webhooks (GHL workflow "Webhook" action, per business): authenticated with a shared
 *    secret header and treated as contact events.
 */

export const MAX_WEBHOOK_BYTES = 256 * 1024;
const MAX_AGE_MS = 72 * 3_600_000; // GHL retries up to 12 times with back-off; webhookId dedupe is the real guard.

export function verifyGhlSignature(rawBody: string, headers: Headers): { ok: boolean; scheme: "ed25519" | "rsa" | null } {
  const ed = headers.get("x-ghl-signature");
  const rsa = headers.get("x-wh-signature");
  const candidates = [rawBody];
  try {
    const reserialised = JSON.stringify(JSON.parse(rawBody));
    if (reserialised !== rawBody) candidates.push(reserialised); // official example verifies JSON.stringify(req.body)
  } catch {
    /* not JSON — raw only */
  }
  if (ed) {
    try {
      const key = createPublicKey(env().GHL_WEBHOOK_ED25519_PUBLIC_KEY ?? GHL_WEBHOOK_ED25519_PUBLIC_KEY);
      const sig = Buffer.from(ed, "base64");
      if (candidates.some((c) => verify(null, Buffer.from(c, "utf8"), key, sig))) return { ok: true, scheme: "ed25519" };
    } catch {
      /* malformed signature/key → invalid */
    }
  }
  if (rsa) {
    try {
      const key = createPublicKey(env().GHL_WEBHOOK_RSA_PUBLIC_KEY ?? GHL_WEBHOOK_RSA_PUBLIC_KEY);
      const sig = Buffer.from(rsa, "base64");
      if (candidates.some((c) => verify("sha256", Buffer.from(c, "utf8"), key, sig))) return { ok: true, scheme: "rsa" };
    } catch {
      /* invalid */
    }
  }
  return { ok: false, scheme: null };
}

type Route = { eventType: string; category: SyncCategory; payload: (body: Record<string, unknown>) => Record<string, unknown>; externalId: (body: Record<string, unknown>) => string | null };

const contactRoute = (type: string): Route => ({ eventType: `ghl.${type}`, category: "contacts", payload: (b) => b, externalId: (b) => (b.id as string) ?? null });
const oppRoute = (type: string): Route => ({ eventType: `ghl.${type}`, category: "opportunities", payload: (b) => b, externalId: (b) => (b.id as string) ?? null });
const apptRoute = (type: string): Route => ({
  eventType: `ghl.${type}`,
  category: "appointments",
  payload: (b) => b,
  externalId: (b) => ((b.appointment as { id?: string } | undefined)?.id ?? (b.id as string)) ?? null,
});
const orderRoute: Route = { eventType: "order.import", category: "orders", payload: (b) => ({ orderId: b._id ?? b.id }), externalId: (b) => ((b._id ?? b.id) as string) ?? null };

const ROUTES: Record<string, Route> = {
  ContactCreate: contactRoute("ContactCreate"),
  ContactUpdate: contactRoute("ContactUpdate"),
  ContactTagUpdate: contactRoute("ContactTagUpdate"),
  ContactDndUpdate: contactRoute("ContactUpdate"),
  ContactDelete: contactRoute("ContactDelete"),
  OpportunityCreate: oppRoute("OpportunityCreate"),
  OpportunityUpdate: oppRoute("OpportunityUpdate"),
  OpportunityStageUpdate: oppRoute("OpportunityStageUpdate"),
  OpportunityStatusUpdate: oppRoute("OpportunityStatusUpdate"),
  OpportunityMonetaryValueUpdate: oppRoute("OpportunityMonetaryValueUpdate"),
  OpportunityAssignedToUpdate: oppRoute("OpportunityAssignedToUpdate"),
  OpportunityDelete: oppRoute("OpportunityDelete"),
  AppointmentCreate: apptRoute("AppointmentCreate"),
  AppointmentUpdate: apptRoute("AppointmentUpdate"),
  AppointmentDelete: apptRoute("AppointmentDelete"),
  OrderCreate: orderRoute,
  OrderStatusUpdate: orderRoute,
};

function locationOf(body: Record<string, unknown>): string | null {
  const appt = body.appointment as { locationId?: string } | undefined;
  const alt = body.altType === "location" ? (body.altId as string | undefined) : undefined;
  return (body.locationId as string | undefined) ?? appt?.locationId ?? alt ?? null;
}

export type WebhookResult = { status: number; body: Record<string, unknown> };

export async function handleMarketplaceWebhook(rawBody: string, headers: Headers, opts: { processInline?: boolean; fetchImpl?: typeof fetch } = {}): Promise<WebhookResult> {
  if (Buffer.byteLength(rawBody) > MAX_WEBHOOK_BYTES) return { status: 413, body: { error: "Payload too large" } };
  const sig = verifyGhlSignature(rawBody, headers);
  if (!sig.ok) {
    log.warn("ghl.webhook_bad_signature", { hasEd25519: Boolean(headers.get("x-ghl-signature")), hasRsa: Boolean(headers.get("x-wh-signature")) });
    return { status: 401, body: { error: "Invalid signature" } };
  }
  let body: Record<string, unknown>;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return { status: 400, body: { error: "Invalid JSON" } };
  }
  const type = String(body.type ?? "");
  const locationId = locationOf(body);
  const webhookId = (body.webhookId as string | undefined) ?? createHash("sha256").update(rawBody).digest("hex");
  const ts = body.timestamp ? Date.parse(String(body.timestamp)) : NaN;
  if (Number.isFinite(ts) && Date.now() - ts > MAX_AGE_MS) return { status: 200, body: { status: "ignored", reason: "stale" } };
  if (!locationId) return { status: 200, body: { status: "ignored", reason: "no location" } };

  const [conn] = await getDb()
    .select({ businessId: integrationConnections.businessId, id: integrationConnections.id, status: integrationConnections.status })
    .from(integrationConnections)
    .where(and(eq(integrationConnections.provider, GHL), eq(integrationConnections.externalAccountId, locationId), ne(integrationConnections.status, "disabled")))
    .limit(1);
  if (!conn) return { status: 200, body: { status: "ignored", reason: "location not connected" } };

  if (type === "UNINSTALL") {
    await getDb()
      .update(integrationConnections)
      .set({ status: "disabled", accessTokenEncrypted: null, refreshTokenEncrypted: null, credentialsEncrypted: null, lastError: "The app was uninstalled from the sub-account in GoHighLevel.", updatedAt: new Date() })
      .where(eq(integrationConnections.id, conn.id));
    log.info("ghl.uninstalled", { businessId: conn.businessId });
    return { status: 200, body: { status: "disconnected" } };
  }
  const route = ROUTES[type];
  if (!route) return { status: 200, body: { status: "ignored", reason: `event ${type || "unknown"} not used` } };

  const id = await enqueue(getDb(), {
    businessId: conn.businessId,
    direction: "inbound",
    eventType: route.eventType,
    category: route.category,
    externalId: route.externalId(body),
    payload: route.payload(body),
    idempotencyKey: `wh:${webhookId}`,
  });
  if (!id) return { status: 200, body: { status: "duplicate" } };
  if (opts.processInline !== false) {
    try {
      await processBusiness(conn.businessId, HANDLERS, { onlyIds: [id] });
    } catch (error) {
      log.warn("ghl.webhook_inline_failed", { businessId: conn.businessId, eventId: id, error: error instanceof Error ? error.message : String(error) });
    }
  }
  return { status: 200, body: { status: "accepted", eventId: id } };
}

// ─── Workflow webhook (per business, shared secret) ──────────────────────────

export function secretsMatch(provided: string | null, expected: string) {
  if (!provided) return false;
  return timingSafeEqual(createHash("sha256").update(provided).digest(), createHash("sha256").update(expected).digest());
}

export async function handleWorkflowWebhook(businessId: string, headers: Headers, rawBody: string, opts: { processInline?: boolean } = {}): Promise<WebhookResult> {
  if (Buffer.byteLength(rawBody) > MAX_WEBHOOK_BYTES) return { status: 413, body: { error: "Payload too large" } };
  const [conn] = await getDb()
    .select({ status: integrationConnections.status, secret: integrationConnections.webhookSecretEncrypted })
    .from(integrationConnections)
    .where(and(eq(integrationConnections.businessId, businessId), eq(integrationConnections.provider, GHL)))
    .limit(1);
  // A disconnected integration accepts nothing, even with the old secret.
  if (!conn?.secret || conn.status === "disabled" || conn.status === "not_configured") return { status: 404, body: { error: "Integration not connected" } };
  if (!secretsMatch(headers.get("x-webhook-secret"), decrypt(conn.secret, env().APP_SECRET))) return { status: 401, body: { error: "Invalid signature" } };
  let json: Record<string, unknown>;
  try {
    json = JSON.parse(rawBody);
  } catch {
    return { status: 400, body: { error: "Invalid JSON" } };
  }
  const contactId = (json.contact_id ?? json.contactId ?? json.id) as string | undefined;
  if (!contactId || typeof contactId !== "string") return { status: 400, body: { error: "Missing contact id" } };
  const contact = {
    id: contactId,
    firstName: (json.first_name ?? json.firstName ?? (typeof json.full_name === "string" ? json.full_name.split(" ")[0] : undefined)) as string | undefined,
    lastName: (json.last_name ?? json.lastName ?? (typeof json.full_name === "string" ? json.full_name.split(" ").slice(1).join(" ") : undefined)) as string | undefined,
    email: (json.email as string | null | undefined) ?? null,
    phone: (json.phone as string | null | undefined) ?? null,
    tags: Array.isArray(json.tags) ? (json.tags as string[]) : undefined,
    customData: json.customData,
  };
  const eventKey = headers.get("x-event-id") ?? createHash("sha256").update(rawBody).digest("hex");
  const id = await enqueue(getDb(), {
    businessId,
    direction: "inbound",
    eventType: "ghl.ContactUpdate",
    category: "contacts",
    externalId: contactId,
    payload: contact as Record<string, unknown>,
    idempotencyKey: `wf:${eventKey}`,
  });
  if (!id) return { status: 200, body: { status: "duplicate" } };
  if (opts.processInline !== false) {
    const r = await processBusiness(businessId, HANDLERS, { onlyIds: [id] }).catch(() => null);
    return { status: 200, body: { status: r && r.synced ? "processed" : "accepted", eventId: id } };
  }
  return { status: 200, body: { status: "accepted", eventId: id } };
}
