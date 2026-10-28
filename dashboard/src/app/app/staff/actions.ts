"use server";

import { refresh } from "next/cache";
import { runAction } from "@/server/actions";
import * as staff from "@/server/services/staff";

export async function saveStaffAction(id: string | null, input: unknown, temporaryPassword?: string) {
  return runAction(async (ctx) => {
    if (id) await staff.updateStaff(ctx, id, input);
    else await staff.createStaff(ctx, input, temporaryPassword ?? "");
    refresh();
    return { ok: true };
  }, id ? "Staff member updated" : "Staff member added");
}

export async function setTemporaryPasswordAction(id: string, password: string) {
  return runAction(async (ctx) => {
    await staff.setTemporaryPassword(ctx, id, password);
    return { ok: true };
  }, "Temporary password set — share it securely. They're signed out everywhere.");
}
