"use server";

import { refresh } from "next/cache";
import type { FulfillmentStage } from "@/lib/schemas";
import { runAction } from "@/server/actions";
import * as sales from "@/server/services/sales";

export async function recordPaymentAction(input: unknown) {
  return runAction(async (ctx) => {
    const r = await sales.recordPayment(ctx, input);
    refresh();
    return { paymentId: r.paymentId, replayed: r.replayed };
  }, "Payment recorded");
}

export async function voidPaymentAction(paymentId: string, reason: string) {
  return runAction(async (ctx) => {
    await sales.voidPayment(ctx, paymentId, reason);
    refresh();
    return { paymentId };
  }, "Payment voided");
}

export async function refundAction(input: unknown) {
  return runAction(async (ctx) => {
    const r = await sales.refundSale(ctx, input);
    refresh();
    return { number: r.number };
  });
}

export async function cancelSaleAction(saleId: string, reason: string) {
  return runAction(async (ctx) => {
    await sales.cancelSale(ctx, saleId, reason);
    refresh();
    return { saleId };
  }, "Sale cancelled");
}

export async function transitionOrderAction(saleId: string, to: FulfillmentStage, reason?: string) {
  return runAction(async (ctx) => {
    await sales.transitionOrder(ctx, saleId, to, reason ?? null);
    refresh();
    return { saleId };
  }, "Order updated");
}

export async function createOrderAction(input: unknown) {
  return runAction(async (ctx) => {
    const r = await sales.createOrder(ctx, input);
    refresh();
    return { saleId: r.saleId, number: r.number };
  });
}

export async function updateOrderAction(saleId: string, input: { dueOn?: string | null; labSupplierId?: string | null; labReference?: string | null; notes?: string | null }) {
  return runAction(async (ctx) => {
    await sales.updateOrder(ctx, saleId, input);
    refresh();
    return { saleId };
  }, "Order details saved");
}
