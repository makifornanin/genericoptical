"use server";

import { refresh } from "next/cache";
import { runAction } from "@/server/actions";
import * as purchasing from "@/server/services/purchasing";

export async function savePoAction(id: string | null, input: unknown) {
  return runAction(async (ctx) => {
    const r = await purchasing.savePurchaseOrder(ctx, id, input);
    refresh();
    return r!;
  }, id ? "Purchase order saved" : "Purchase order created");
}

export async function confirmPoAction(id: string) {
  return runAction(async (ctx) => {
    await purchasing.confirmPurchaseOrder(ctx, id);
    refresh();
    return { id };
  }, "Purchase order confirmed with supplier");
}

export async function cancelPoAction(id: string, reason: string) {
  return runAction(async (ctx) => {
    await purchasing.cancelPurchaseOrder(ctx, id, reason);
    refresh();
    return { id };
  }, "Purchase order cancelled");
}

export async function closePoAction(id: string, reason: string) {
  return runAction(async (ctx) => {
    await purchasing.closePurchaseOrder(ctx, id, reason);
    refresh();
    return { id };
  }, "Purchase order closed");
}

export async function receivePoAction(input: unknown) {
  return runAction(async (ctx) => {
    const r = await purchasing.receivePurchaseOrder(ctx, input);
    refresh();
    return r!;
  }, "Stock received");
}

export async function saveSupplierAction(id: string | null, input: unknown) {
  return runAction(async (ctx) => {
    const r = await purchasing.saveSupplier(ctx, id, input);
    refresh();
    return { id: r!.id };
  }, id ? "Supplier updated" : "Supplier added");
}

export async function archiveSupplierAction(id: string, archived: boolean) {
  return runAction(async (ctx) => {
    await purchasing.setSupplierArchived(ctx, id, archived);
    refresh();
    return { id };
  }, archived ? "Supplier archived" : "Supplier restored");
}
