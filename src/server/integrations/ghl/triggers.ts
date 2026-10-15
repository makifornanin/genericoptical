import { sql } from "drizzle-orm";
import type { Executor } from "@/server/db";
import { activeConnection, type ActiveConnection, type SyncArea } from "./config";
import { enqueue } from "./engine";

/**
 * Outbox triggers called by the business services inside their own transactions. Each one writes a
 * coalesced, state-based event ("sync the current state of X"), so several changes to the same record
 * collapse into one API call and the handler always sends the latest values.
 *
 * They are no-ops (one cheap lookup per transaction) when the business hasn't connected GHL or has
 * switched the sync area off.
 */

const cache = new WeakMap<object, Promise<ActiveConnection | null>>();

function connectionFor(ex: Executor, businessId: string) {
  // Cache per transaction object so a sale with ten lines does one lookup, not ten.
  const key = ex as unknown as object;
  let hit = cache.get(key);
  if (!hit) {
    hit = activeConnection(ex, businessId);
    cache.set(key, hit);
  }
  return hit;
}

async function enabled(ex: Executor, businessId: string, area: SyncArea) {
  const conn = await connectionFor(ex, businessId);
  return conn && conn.settings.sync[area] ? conn : null;
}

/** Stock or reservations changed for a variant at a location. Only the published stockroom matters. */
export async function onStockChanged(ex: Executor, businessId: string, variantId: string, locationId: string) {
  const conn = await enabled(ex, businessId, "inventory");
  if (!conn) return;
  if (conn.settings.inventoryLocationId && conn.settings.inventoryLocationId !== locationId) return;
  await enqueue(ex, { businessId, direction: "outbound", eventType: "inventory.push", category: "inventory", entityType: "variant", entityId: variantId, coalesce: true });
}

export async function onProductChanged(ex: Executor, businessId: string, productId: string) {
  if (!(await enabled(ex, businessId, "products"))) return;
  await enqueue(ex, { businessId, direction: "outbound", eventType: "product.sync", category: "products", entityType: "product", entityId: productId, coalesce: true });
}

/** A dashboard sale/order was created, paid, progressed, refunded or cancelled. */
export async function onSaleChanged(ex: Executor, businessId: string, saleId: string, channel: string = "in_store") {
  if (channel === "ghl_online") return; // GHL already has the order; it isn't re-sent as an opportunity.
  if (!(await enabled(ex, businessId, "sales"))) return;
  await enqueue(ex, { businessId, direction: "outbound", eventType: "sale.sync", category: "sales", entityType: "sale", entityId: saleId, coalesce: true });
}

export async function onCustomerChanged(ex: Executor, businessId: string, customerId: string) {
  if (!(await enabled(ex, businessId, "contacts"))) return;
  await enqueue(ex, { businessId, direction: "outbound", eventType: "customer.upsert", category: "contacts", entityType: "customer", entityId: customerId, coalesce: true });
}

export async function onLeadChanged(ex: Executor, businessId: string, leadId: string) {
  if (!(await enabled(ex, businessId, "contacts"))) return;
  await enqueue(ex, { businessId, direction: "outbound", eventType: "lead.upsert", category: "contacts", entityType: "lead", entityId: leadId, coalesce: true });
}

/**
 * An order became ready for pickup. Queues the "order ready" tag for the customer's GHL contact (a GHL
 * workflow sends the actual message). Returns false when nothing will be sent, so the caller can say so.
 */
export async function onOrderReady(ex: Executor, businessId: string, saleId: string, readyAtMs: number) {
  if (!(await enabled(ex, businessId, "contacts"))) return false;
  await enqueue(ex, { businessId, direction: "outbound", eventType: "order.ready", category: "sales", entityType: "sale", entityId: saleId, idempotencyKey: `order-ready:${saleId}:${readyAtMs}` });
  return true;
}

/**
 * A dashboard appointment was created/changed. Only when GHL calendars are authoritative: the row is
 * marked pending and an immediate push to GHL is queued (the action kicks the worker after commit).
 */
export async function onAppointmentChanged(ex: Executor, businessId: string, appointmentId: string) {
  const conn = await enabled(ex, businessId, "appointments");
  if (!conn || conn.settings.appointmentsAuthority !== "ghl") return false;
  await ex.execute(sql`update appointments set sync_state = 'pending' where business_id = ${businessId} and id = ${appointmentId}`);
  await enqueue(ex, { businessId, direction: "outbound", eventType: "appointment.push", category: "appointments", entityType: "appointment", entityId: appointmentId, coalesce: true });
  return true;
}
