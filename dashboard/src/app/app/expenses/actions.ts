"use server";

import { refresh } from "next/cache";
import { runAction } from "@/server/actions";
import * as expenses from "@/server/services/expenses";
import { requirePermission } from "@/server/services/core";
import { expenseInput } from "@/lib/schemas";
import { deleteAttachment, saveAttachment } from "@/server/storage";

export async function saveExpenseAction(id: string | null, form: FormData) {
  return runAction(async (ctx) => {
    requirePermission(ctx, "expenses.manage");
    // Validate first so a rejected form never leaves an orphan file on disk.
    const input = expenseInput.parse(JSON.parse(String(form.get("data") ?? "{}")));
    const file = form.get("attachment");
    const previous = id && file instanceof File && file.size > 0 ? await expenses.getExpenseAttachment(ctx, id).catch(() => null) : null;
    const attachment = file instanceof File && file.size > 0 ? await saveAttachment(ctx.businessId, file) : null;
    let row;
    try {
      row = await expenses.saveExpense(ctx, id, input, attachment);
    } catch (error) {
      await deleteAttachment(attachment?.path);
      throw error;
    }
    if (attachment && previous?.path && previous.path !== attachment.path) await deleteAttachment(previous.path);
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
