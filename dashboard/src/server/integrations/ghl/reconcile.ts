import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { getDb, type Executor } from "@/server/db";
import { ghlProductLinks, integrationMismatches, productVariants, products, sales } from "@/server/db/schema";
import { log } from "@/server/log";
import { audit, notFound, requirePermission, type Ctx } from "@/server/services/core";
import { apiFor } from "./connection";
import { enqueue, GHL } from "./engine";
import { pollLeadOpportunities } from "./handlers/lead-opportunities";
import { availableAt, publishedLocationId } from "./handlers/products";

/**
 * Reconciliation and deterministic "backend intelligence": compares the dashboard with GHL and with
 * itself, and records findings in integration_mismatches. Nothing here changes local stock or money —
 * a person resolves each finding (push the dashboard value, or dismiss).
 */

export type MismatchKind =
  | "inventory"
  | "oversold_online"
  | "online_refund_restock"
  | "order_unmapped_items"
  | "order_total"
  | "duplicate_customer"
  | "duplicate_lead"
  | "stale_external";

export async function recordMismatch(
  ex: Executor,
  businessId: string,
  m: { kind: MismatchKind; dedupeKey: string; message: string; entityType?: string; entityId?: string | null; externalId?: string | null; localValue?: unknown; externalValue?: unknown },
) {
  await ex.execute(sql`
    insert into integration_mismatches (business_id, provider, kind, dedupe_key, entity_type, entity_id, external_id, message, local_value, external_value)
    values (${businessId}, ${GHL}, ${m.kind}, ${m.dedupeKey}, ${m.entityType ?? null}, ${m.entityId ?? null}, ${m.externalId ?? null}, ${m.message},
            ${JSON.stringify(m.localValue ?? null)}::jsonb, ${JSON.stringify(m.externalValue ?? null)}::jsonb)
    on conflict (business_id, provider, kind, dedupe_key) where status = 'open'
    do update set message = excluded.message, local_value = excluded.local_value, external_value = excluded.external_value, last_seen_at = now()`);
}

async function autoResolve(businessId: string, kind: MismatchKind, keepKeys: string[]) {
  await getDb()
    .update(integrationMismatches)
    .set({ status: "resolved", resolvedAt: new Date(), resolution: "No longer different at the last check" })
    .where(
      and(
        eq(integrationMismatches.businessId, businessId),
        eq(integrationMismatches.kind, kind),
        eq(integrationMismatches.status, "open"),
        keepKeys.length ? sql`${integrationMismatches.dedupeKey} not in (${sql.join(keepKeys.map((k) => sql`${k}`), sql`, `)})` : sql`true`,
      ),
    );
}

/** Compares published GHL quantities with dashboard availability for every linked variant. */
export async function reconcileInventory(businessId: string, fetchImpl?: typeof fetch) {
  const { api, settings } = await apiFor(businessId, fetchImpl);
  const links = await getDb()
    .select({ variantId: ghlProductLinks.variantId, priceId: ghlProductLinks.ghlPriceId, sku: productVariants.sku, name: products.name })
    .from(ghlProductLinks)
    .innerJoin(productVariants, eq(productVariants.id, ghlProductLinks.variantId))
    .innerJoin(products, eq(products.id, ghlProductLinks.productId))
    .where(and(eq(ghlProductLinks.businessId, businessId), eq(products.productType, "stock"), sql`${ghlProductLinks.ghlPriceId} is not null`, sql`${productVariants.archivedAt} is null`));
  if (!links.length) return { checked: 0, mismatched: 0 };
  const remote = new Map<string, number | null>();
  for (let offset = 0; ; offset += 100) {
    const page = await api.listInventory({ limit: 100, offset });
    for (const item of page.inventory ?? []) remote.set(item._id, item.availableQuantity ?? null);
    if (!page.inventory?.length || offset + 100 >= (page.total ?? 0)) break;
  }
  const locationId = await publishedLocationId(businessId, settings);
  const keys: string[] = [];
  for (const l of links) {
    const local = await availableAt(businessId, l.variantId, locationId);
    const ext = remote.has(l.priceId!) ? remote.get(l.priceId!) : undefined;
    if (ext === undefined) {
      keys.push(l.variantId);
      await recordMismatch(getDb(), businessId, { kind: "inventory", dedupeKey: l.variantId, entityType: "variant", entityId: l.variantId, externalId: l.priceId, message: `${l.name} (${l.sku}) is linked to a GHL price that no longer appears in GHL inventory.`, localValue: local, externalValue: null });
    } else if (ext !== local) {
      keys.push(l.variantId);
      await recordMismatch(getDb(), businessId, { kind: "inventory", dedupeKey: l.variantId, entityType: "variant", entityId: l.variantId, externalId: l.priceId, message: `${l.name} (${l.sku}): dashboard has ${local} available, GHL shows ${ext ?? "untracked"}.`, localValue: local, externalValue: ext });
    }
  }
  await autoResolve(businessId, "inventory", keys);
  return { checked: links.length, mismatched: keys.length };
}

/** Finds paid GHL orders from the last `days` days that haven't been imported, and queues them. */
export async function reconcileOrders(businessId: string, days = 14, fetchImpl?: typeof fetch) {
  const { api, settings } = await apiFor(businessId, fetchImpl);
  if (!settings.sync.orders) return { checked: 0, queued: 0 };
  const startAt = new Date(Date.now() - days * 86_400_000).toISOString();
  let checked = 0;
  let queued = 0;
  for (let offset = 0; offset < 1000; offset += 100) {
    const page = await api.listOrders({ startAt, limit: 100, offset });
    const ids = (page.data ?? []).map((o) => o._id);
    checked += ids.length;
    if (ids.length) {
      const known = await getDb().select({ id: sales.externalGhlOrderId }).from(sales).where(and(eq(sales.businessId, businessId), inArray(sales.externalGhlOrderId, ids)));
      const knownSet = new Set(known.map((k) => k.id));
      for (const o of page.data) {
        const id = await enqueue(getDb(), {
          businessId,
          direction: "inbound",
          eventType: "order.import",
          category: "orders",
          externalId: o._id,
          payload: { orderId: o._id },
          // Re-check known orders only when GHL reports a newer version (refunds).
          idempotencyKey: `reconcile-order:${o._id}:${o.updatedAt ?? ""}`,
        });
        if (id && !knownSet.has(o._id)) queued++;
      }
    }
    if (ids.length < 100) break;
  }
  return { checked, queued };
}

/** Same email or phone on more than one active customer (or open lead) — candidates to merge. */
export async function detectDuplicates(businessId: string) {
  const customersDup = await getDb().execute<{ key: string; ids: string[]; n: number }>(sql`
    select key, array_agg(id::text order by created_at) as ids, count(*)::int as n from (
      select id, created_at, 'email:' || lower(email) as key from customers where business_id = ${businessId} and archived_at is null and email is not null and email <> ''
      union all
      select id, created_at, 'phone:' || regexp_replace(phone, '[^0-9]', '', 'g') from customers where business_id = ${businessId} and archived_at is null and length(regexp_replace(coalesce(phone, ''), '[^0-9]', '', 'g')) >= 7
    ) x group by key having count(*) > 1 limit 200`);
  const keys: string[] = [];
  for (const d of customersDup.rows) {
    keys.push(d.key);
    await recordMismatch(getDb(), businessId, { kind: "duplicate_customer", dedupeKey: d.key, entityType: "customer", entityId: d.ids[0], message: `${d.n} customers share ${d.key.replace(":", " ")}. Merge or correct them so contact sync stays one-to-one.`, localValue: d.ids });
  }
  await autoResolve(businessId, "duplicate_customer", keys);
  return { duplicateCustomers: customersDup.rows.length };
}

/** Runs every reconciliation for one business; errors in one check don't stop the others. */
export async function reconcileAll(businessId: string, fetchImpl?: typeof fetch) {
  const out: Record<string, unknown> = {};
  for (const [name, fn] of [
    ["inventory", () => reconcileInventory(businessId, fetchImpl)],
    ["orders", () => reconcileOrders(businessId, 14, fetchImpl)],
    ["duplicates", () => detectDuplicates(businessId)],
    ["leadOpportunities", () => pollLeadOpportunities(businessId, 100, fetchImpl)],
  ] as const) {
    try {
      out[name] = await fn();
    } catch (error) {
      out[name] = { error: error instanceof Error ? error.message : String(error) };
      log.warn("ghl.reconcile_failed", { businessId, check: name, error: error instanceof Error ? error.message : String(error) });
    }
  }
  return out;
}

export async function listMismatches(ctx: Ctx, status: "open" | "resolved" | "ignored" = "open") {
  requirePermission(ctx, "integrations.manage");
  return getDb()
    .select()
    .from(integrationMismatches)
    .where(and(eq(integrationMismatches.businessId, ctx.businessId), eq(integrationMismatches.status, status)))
    .orderBy(asc(integrationMismatches.kind), asc(integrationMismatches.detectedAt))
    .limit(200);
}

/**
 * Resolves a finding. "push_local" re-publishes the dashboard value to GHL (inventory only — the
 * dashboard is the source of truth); "ignore" dismisses it. Local stock is never overwritten.
 */
export async function resolveMismatch(ctx: Ctx, id: string, action: "push_local" | "ignore" | "resolved", note?: string) {
  requirePermission(ctx, "integrations.manage");
  const [m] = await getDb().select().from(integrationMismatches).where(and(eq(integrationMismatches.businessId, ctx.businessId), eq(integrationMismatches.id, id))).limit(1);
  if (!m || m.status !== "open") throw notFound("Finding");
  await getDb().transaction(async (tx) => {
    if (action === "push_local") {
      if (m.kind !== "inventory" || !m.entityId) throw notFound("Pushable finding");
      await enqueue(tx, { businessId: ctx.businessId, direction: "outbound", eventType: "inventory.push", category: "inventory", entityType: "variant", entityId: m.entityId, coalesce: true });
    }
    await tx
      .update(integrationMismatches)
      .set({ status: action === "ignore" ? "ignored" : "resolved", resolvedAt: new Date(), resolvedByMembershipId: ctx.membershipId, resolution: note ?? (action === "push_local" ? "Dashboard quantity pushed to GHL" : action === "ignore" ? "Dismissed" : "Resolved") })
      .where(eq(integrationMismatches.id, id));
    await audit(tx, ctx, { action: "ghl.mismatch_resolved", entityType: "integration_mismatch", entityId: id, summary: `${action === "ignore" ? "Dismissed" : "Resolved"}: ${m.message}`.slice(0, 300) });
  });
}
