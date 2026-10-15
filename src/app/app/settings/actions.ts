"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { runAction } from "@/server/actions";
import { clearSessionCookie, getSession } from "@/server/auth/session";
import { removeDemoData, seedDemo } from "@/server/demo/seed";
import { disconnectGhl, processGhlOutbox, saveGhlConnection, testGhlConnection } from "@/server/integrations/ghl";
import { forbidden, requirePermission, type Ctx } from "@/server/services/core";
import * as settings from "@/server/services/settings";

async function run(fn: (ctx: Ctx) => Promise<unknown>, msg: string) {
  return runAction(async (ctx) => {
    await fn(ctx);
    refresh();
    return { ok: true };
  }, msg);
}

export async function saveProfileAction(input: unknown) {
  return run((ctx) => settings.updateBusinessProfile(ctx, input), "Business profile saved");
}
export async function saveTaxAction(input: unknown) {
  return run((ctx) => settings.updateTaxSettings(ctx, input), "Currency & tax settings saved");
}
export async function saveHoursAction(input: unknown) {
  return run((ctx) => settings.updateBusinessHours(ctx, input), "Business hours saved");
}
export async function saveWebsiteAction(input: unknown) {
  return run((ctx) => settings.updateWebsiteContent(ctx, input), "Website content saved");
}
export async function saveBranchAction(id: string | null, input: unknown) {
  return run((ctx) => settings.saveBranch(ctx, id, input), "Branch saved");
}
export async function saveAppointmentTypeAction(id: string | null, input: unknown) {
  return run((ctx) => settings.saveAppointmentType(ctx, id, input), "Appointment type saved");
}
export async function saveGhlAction(input: unknown) {
  return run((ctx) => saveGhlConnection(ctx, input), "GoHighLevel settings saved");
}
export async function disconnectGhlAction() {
  return run((ctx) => disconnectGhl(ctx), "GoHighLevel disconnected");
}

export async function testGhlAction() {
  return runAction(async (ctx) => {
    const r = await testGhlConnection(ctx);
    refresh();
    if (!r.ok) throw forbidden(`Connection test failed: ${r.error}`);
    return r;
  }, "Connected to GoHighLevel");
}

export async function syncGhlNowAction() {
  return runAction(async (ctx) => {
    requirePermission(ctx, "integrations.manage");
    const r = await processGhlOutbox(ctx.businessId);
    refresh();
    return r;
  });
}

/**
 * Rebuilds the demo dataset. Only available when DEMO_MODE=true AND the signed-in business is a
 * demo business AND the user holds demo.reset (owners). Never touches non-demo businesses.
 */
export async function resetDemoAction() {
  const session = await getSession();
  if (!session) return { ok: false as const, error: "Sign in again." };
  if (process.env.DEMO_MODE !== "true" || !session.business.isDemo || !session.ctx.permissions.has("demo.reset")) {
    return { ok: false as const, error: "Demo reset isn't available here." };
  }
  await removeDemoData();
  await seedDemo({ log: () => {} });
  await clearSessionCookie();
  redirect("/login?demoReset=1");
}
