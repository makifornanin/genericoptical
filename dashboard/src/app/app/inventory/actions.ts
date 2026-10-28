"use server";

import { refresh } from "next/cache";
import { runAction } from "@/server/actions";
import * as inventory from "@/server/services/inventory";

export async function adjustStockAction(input: unknown) {
  return runAction(async (ctx) => {
    const r = await inventory.adjustStock(ctx, input);
    refresh();
    return r;
  }, "Stock updated");
}

export async function transferStockAction(input: unknown) {
  return runAction(async (ctx) => {
    const r = await inventory.transferStock(ctx, input);
    refresh();
    return r;
  }, "Transfer recorded");
}
