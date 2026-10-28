"use server";

import { z } from "zod";
import { runAction } from "@/server/actions";
import { getSession } from "@/server/auth/session";
import { changePassword } from "@/server/services/auth";
import { invalid } from "@/server/services/core";

const input = z.object({ currentPassword: z.string().min(1, "Enter your current password."), newPassword: z.string(), confirmPassword: z.string() });

export async function changePasswordAction(raw: unknown) {
  return runAction(async (ctx) => {
    const v = input.parse(raw);
    if (v.newPassword !== v.confirmPassword) throw invalid("The new passwords don't match.", { confirmPassword: ["Doesn't match."] });
    const session = await getSession();
    await changePassword(ctx, v.currentPassword, v.newPassword, session?.sessionId);
    return { ok: true };
  }, "Password changed. Other devices have been signed out.");
}
