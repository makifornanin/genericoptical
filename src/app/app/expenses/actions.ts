"use server";

import { refresh } from "next/cache";
import { runAction } from "@/server/actions";
import * as expenses from "@/server/services/expenses";
import { requirePermission } from "@/server/services/core";
import { saveAttachment } from "@/server/storage";

export async function saveExpenseAction(id: string | null, form: FormData) {
  return runAction(async (ctx) => {
    requirePermission(ctx, "expenses.manage");
    const file = form.get("attachment");
    const attachment = file instanceof File && file.size > 0 ? await saveAttachment(ctx.businessId, file) : null;
    const input = JSON.parse(String(form.get("data") ?? "{}"));
    const row = await expenses.saveExpense(ctx, id, input, attachment);
    refresh();
    return { id: row!.id };
  }, id ? "Expense updated" : "Expense recorded");
}

export async function voidExpenseAction(id: string, reason: string) {
  return runAction(async (ctx) => {
    await expenses.voidExpense(ctx, id, reason);
    refresh();
    return { id };
  }, "Expense voided");
}

export async function createExpenseCategoryAction(name: string) {
  return runAction(async (ctx) => {
    const c = await expenses.createExpenseCategory(ctx, name);
    refresh();
    return { id: c!.id, name: c!.name };
  }, "Category added");
}
