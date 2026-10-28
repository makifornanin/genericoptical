import { and, asc, eq } from "drizzle-orm";
import { formatMoney } from "@/lib/money";
import { getDb } from "@/server/db";
import { branches, businesses, ghlContacts, ghlProductLinks, sales } from "@/server/db/schema";
import { systemCtx } from "@/server/services/core";
import { createCustomer } from "@/server/services/customers";
import { convertLead } from "@/server/services/leads";
import { importOnlineSale, refundSale } from "@/server/services/sales";
import { toMinor, type GhlOrder, type GhlTransaction } from "../api";
import { apiFor } from "../connection";
import type { Handler } from "../engine";
import { GhlNotFoundError } from "../errors";
import { recordMismatch } from "../reconcile";
import { mirrorContactById } from "./contacts";

/**
 * GHL online orders → dashboard sales.
 *
 * Every OrderCreate/OrderStatusUpdate (or reconciliation) queues `order.import`. The handler fetches the
 * order's CURRENT state and its transactions, so duplicate and out-of-order webhooks are harmless.
 *  - Paid = sum of successful transactions for the order (GHL's order object has no payment-status field).
 *  - Not paid yet → nothing recorded; imported once payment succeeds.
 *  - Paid → one completed sale (channel ghl_online, unique per GHL order id); stock consumed ONCE at
 *    import. A payment event for an already-imported order changes nothing.
 *  - Refunded in GHL → a revenue refund for the difference; restocking is left to a person (a refund
 *    doesn't prove the goods came back), flagged for review.
 *  - Unmapped line items or price differences → the order is held for review, never guessed.
 */

const SUCCESS = new Set(["succeeded", "success", "paid", "completed", "captured"]);

export function paymentSummary(transactions: GhlTransaction[]) {
  const ok = transactions.filter((t) => SUCCESS.has(String(t.status ?? "").toLowerCase()));
  return {
    paidCents: ok.reduce((s, t) => s + toMinor(t.amount), 0),
    refundedCents: ok.reduce((s, t) => s + toMinor(t.amountRefunded ?? 0), 0),
    payments: ok.map((t) => ({ reference: t._id, amountCents: toMinor(t.amount), receivedAt: t.createdAt ? new Date(t.createdAt) : new Date() })),
  };
}

const importCtx = (businessId: string) =>
  systemCtx(businessId, "GoHighLevel online store", ["pos.use", "sales.view", "sales.refund", "customers.manage", "customers.view", "leads.manage", "leads.view", "leads.view_all"]);

async function customerFor(businessId: string, order: GhlOrder, api: Awaited<ReturnType<typeof apiFor>>["api"]) {
  if (!order.contactId) return null;
  const mirror = await mirrorContactById(api, businessId, order.contactId).catch(() => null);
  if (mirror?.customerId) return mirror.customerId;
  const ctx = importCtx(businessId);
  if (mirror?.leadId) {
    const converted = await convertLead(ctx, mirror.leadId, {}).catch(() => null);
    if (converted?.customerId) {
      await getDb().update(ghlContacts).set({ customerId: converted.customerId }).where(eq(ghlContacts.id, mirror.id));
      return converted.customerId;
    }
  }
  const snap = order.contactSnapshot ?? {};
  const firstName = snap.firstName?.trim() || "Online";
  const created = await createCustomer(ctx, { firstName, lastName: snap.lastName?.trim() || "customer", email: snap.email ?? null, phone: snap.phone ?? null, notes: "Created from a GoHighLevel online order", source: "GoHighLevel online store" }).catch(() => null);
  if (created && mirror) await getDb().update(ghlContacts).set({ customerId: created.id }).where(eq(ghlContacts.id, mirror.id));
  return created?.id ?? null;
}

export const orderImport: Handler = async (event, env) => {
  const businessId = env.businessId;
  const orderId = (event.payload as { orderId?: string; _id?: string } | null)?.orderId ?? (event.payload as { _id?: string } | null)?._id ?? event.externalId;
  if (!orderId) return { status: "skipped", note: "Event has no order id" };
  const { api, settings } = await apiFor(businessId);
  if (!settings.sync.orders) return { status: "skipped", note: "Online order import is switched off" };

  let order: GhlOrder;
  try {
    const res = await api.getOrder(orderId);
    order = (res.data ?? res) as GhlOrder;
  } catch (error) {
    if (error instanceof GhlNotFoundError) return { status: "skipped", externalId: orderId, note: "Order not found in GHL" };
    throw error;
  }
  if (order.liveMode === false) return { status: "skipped", externalId: orderId, note: "Test-mode order — not imported" };
  const summary = paymentSummary((await api.listOrderTransactions(orderId)).data ?? []);
  const [local] = await getDb().select().from(sales).where(and(eq(sales.businessId, businessId), eq(sales.externalGhlOrderId, orderId))).limit(1);

  if (!local) {
    if (summary.paidCents <= 0) return { status: "skipped", externalId: orderId, note: `Not paid yet (GHL status: ${order.status ?? "unknown"}) — imported once payment succeeds` };
    const priceIds = (order.items ?? []).map((i) => i.price?._id).filter(Boolean) as string[];
    const links = priceIds.length
      ? await getDb().select().from(ghlProductLinks).where(and(eq(ghlProductLinks.businessId, businessId)))
      : [];
    const byPrice = new Map(links.filter((l) => l.ghlPriceId).map((l) => [l.ghlPriceId!, l]));
    const unmapped = (order.items ?? []).filter((i) => !i.price?._id || !byPrice.has(i.price._id)).map((i) => i.name ?? i.product?.name ?? "item");
    if (!order.items?.length || unmapped.length) {
      await recordMismatch(getDb(), businessId, {
        kind: "order_unmapped_items",
        dedupeKey: orderId,
        externalId: orderId,
        message: `GHL order ${orderId} has items that aren't linked to dashboard products (${unmapped.join(", ") || "no items"}). Publish/link the products, then retry the import.`,
        externalValue: order.items ?? [],
      });
      return { status: "needs_review", externalId: orderId, note: `Items not linked to dashboard products: ${unmapped.join(", ") || "none listed"}` };
    }
    const branchId =
      settings.onlineBranchId ??
      (await getDb().select({ id: branches.id }).from(branches).where(and(eq(branches.businessId, businessId), eq(branches.isActive, true))).orderBy(asc(branches.sortOrder)).limit(1))[0]?.id;
    if (!branchId) return { status: "needs_review", externalId: orderId, note: "Choose the branch for online orders in Settings → Integrations" };
    const customerId = await customerFor(businessId, order, api);
    const result = await importOnlineSale(importCtx(businessId), {
      externalOrderId: orderId,
      externalStatus: order.status ?? null,
      branchId,
      customerId,
      lines: order.items!.map((i) => ({ variantId: byPrice.get(i.price!._id!)!.variantId, quantity: Math.max(1, Math.round(i.qty)), unitPriceCents: toMinor(i.price?.amount ?? 0) })),
      payments: summary.payments,
      orderedAt: order.createdAt ? new Date(order.createdAt) : new Date(),
      notes: `GoHighLevel online order ${orderId}`,
    });
    const [biz] = await getDb().select({ currency: businesses.currency, locale: businesses.locale }).from(businesses).where(eq(businesses.id, businessId)).limit(1);
    if (result.oversold.length) {
      await recordMismatch(getDb(), businessId, { kind: "oversold_online", dedupeKey: orderId, entityType: "sale", entityId: result.saleId, externalId: orderId, message: `Online order ${result.number} sold more than was in stock: ${result.oversold.join("; ")}. Stock was not driven negative — count and adjust.` });
    }
    const ghlTotal = toMinor(order.amount);
    if (Math.abs(ghlTotal - result.totalCents) > 1) {
      await recordMismatch(getDb(), businessId, {
        kind: "order_total",
        dedupeKey: orderId,
        entityType: "sale",
        entityId: result.saleId,
        externalId: orderId,
        message: `Online order ${result.number}: GHL total ${formatMoney(ghlTotal, biz.currency, biz.locale)} vs line prices ${formatMoney(result.totalCents, biz.currency, biz.locale)} (shipping, coupons or tax differ). Revenue uses the line prices.`,
        localValue: result.totalCents,
        externalValue: ghlTotal,
      });
    }
    return { status: "synced", externalId: orderId, result: { saleId: result.saleId, number: result.number, created: result.created, oversold: result.oversold.length } };
  }

  // Already imported: only refunds can change it.
  const alreadyRefunded = local.refundedCashCents;
  if (summary.refundedCents > alreadyRefunded) {
    const diff = Math.min(summary.refundedCents - alreadyRefunded, local.paidCents - alreadyRefunded);
    if (diff > 0) {
      await refundSale(importCtx(businessId), { saleId: local.id, items: [], amountCents: diff, method: "other", reason: "Refunded in GoHighLevel", idempotencyKey: `ghl-refund:${orderId}:${summary.refundedCents}` });
      await recordMismatch(getDb(), businessId, { kind: "online_refund_restock", dedupeKey: `${orderId}:${summary.refundedCents}`, entityType: "sale", entityId: local.id, externalId: orderId, message: `A GHL refund was recorded on ${local.number}. If items came back, restock them (Stock → Adjust), then mark this resolved.` });
    }
  }
  await getDb().update(sales).set({ externalGhlStatus: order.status ?? null, updatedAt: new Date() }).where(eq(sales.id, local.id));
  return { status: summary.refundedCents > alreadyRefunded ? "synced" : "skipped", externalId: orderId, note: summary.refundedCents > alreadyRefunded ? "Refund imported" : "Already imported; nothing changed" };
};
