"use server";

import { refresh } from "next/cache";
import { runAction } from "@/server/actions";
import { searchCustomers } from "@/server/services/customers";
import { checkout } from "@/server/services/sales";

export async function checkoutAction(input: unknown) {
  return runAction(async (ctx) => {
    const res = await checkout(ctx, input);
    refresh();
    return res;
  });
}

export async function posCustomerSearchAction(q: string) {
  return runAction((ctx) => searchCustomers(ctx, q, 8));
}
