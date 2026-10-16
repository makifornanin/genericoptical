"use server";

import { refresh } from "next/cache";
import { runAction } from "@/server/actions";
import { getDb } from "@/server/db";
import { sellableVariants } from "@/server/services/catalog";
import { searchCustomers } from "@/server/services/customers";
import { locationForBranch } from "@/server/services/inventory";
import * as pos from "@/server/services/pos";
import { checkout, quoteCart } from "@/server/services/sales";
import { toPosItem } from "./items";

export async function checkoutAction(input: unknown) {
  return runAction(async (ctx) => {
    const res = await checkout(ctx, input);
    refresh();
    return res;
  });
}

/** Server-priced totals and stock problems for the current cart (nothing is written). */
export async function quoteCartAction(input: unknown) {
  return runAction((ctx) => quoteCart(ctx, input));
}

export async function posCustomerSearchAction(q: string) {
  return runAction((ctx) => searchCustomers(ctx, String(q).slice(0, 100), 8));
}

export async function posCustomerContextAction(customerId: string) {
  return runAction((ctx) => pos.posCustomerContext(ctx, String(customerId)));
}

export async function holdCartAction(input: unknown) {
  return runAction((ctx) => pos.holdCart(ctx, input), "Cart put on hold");
}

export async function listHeldCartsAction(branchId: string) {
  return runAction((ctx) => pos.listHeldCarts(ctx, String(branchId)));
}

export async function resumeHeldCartAction(id: string) {
  return runAction((ctx) => pos.resumeHeldCart(ctx, String(id)));
}

export async function cancelHeldCartAction(id: string) {
  return runAction((ctx) => pos.cancelHeldCart(ctx, String(id)), "Held cart discarded");
}

export async function posInsightsAction(branchId: string) {
  return runAction((ctx) => pos.posInsights(ctx, String(branchId)));
}

/** Exact SKU or barcode lookup for scans that aren't in the products loaded on screen. */
export async function posLookupAction(branchId: string, code: string) {
  return runAction(async (ctx) => {
    const term = String(code).trim().slice(0, 80);
    if (!term) return null;
    const location = await locationForBranch(getDb(), ctx, String(branchId));
    const rows = await sellableVariants(ctx, { locationId: location.id, q: term, limit: 10 });
    const hit = rows.find((r) => r.barcode === term || r.sku.toLowerCase() === term.toLowerCase());
    return hit ? toPosItem(hit) : null;
  });
}
