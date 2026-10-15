"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { z } from "zod";
import { runAction } from "@/server/actions";
import { clearSessionCookie, getSession } from "@/server/auth/session";
import { getPool } from "@/server/db";
import { removeDemoData, seedDemo } from "@/server/demo/seed";
import {
  connectPrivateToken,
  disconnect,
  dismissEvents,
  kickGhl,
  mapCalendar,
  mapUser,
  processGhl,
  queueFullSync,
  reconcileAll,
  resolveMismatch,
  retryEvents,
  startOAuth,
  updateSettings,
} from "@/server/integrations/ghl";
import { ghlSettingsSchema } from "@/server/integrations/ghl/config";
import { log } from "@/server/log";
import { requirePermission, type Ctx } from "@/server/services/core";
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

// ─── GoHighLevel ─────────────────────────────────────────────────────────────

/** Returns the HighLevel consent URL; the browser navigates there. */
export async function startGhlOAuthAction() {
  return runAction((ctx) => startOAuth(ctx));
}

export async function connectGhlTokenAction(input: unknown) {
  return runAction(async (ctx) => {
    const r = await connectPrivateToken(ctx, input);
    after(() => kickGhl(ctx.businessId));
    refresh();
    return r;
  }, "Connected to GoHighLevel");
}

export async function disconnectGhlAction(forget: boolean) {
  return run((ctx) => disconnect(ctx, { forget }), forget ? "GoHighLevel disconnected and sync data forgotten" : "GoHighLevel disconnected");
}

export async function syncGhlNowAction() {
  return runAction(async (ctx) => {
    requirePermission(ctx, "integrations.manage");
    const r = await processGhl(ctx.businessId, { limit: 50 });
    refresh();
    return r;
  });
}

export async function reconcileGhlAction() {
  return runAction(async (ctx) => {
    requirePermission(ctx, "integrations.manage");
    const r = await reconcileAll(ctx.businessId);
    refresh();
    return r;
  }, "Reconciliation finished");
}

export async function retryGhlEventsAction(ids: string[] | "all_failed") {
  return runAction(async (ctx) => {
    requirePermission(ctx, "integrations.manage");
    const n = await retryEvents(ctx.businessId, ids === "all_failed" ? "all_failed" : z.array(z.string().uuid()).max(500).parse(ids), ctx.membershipId);
    after(() => kickGhl(ctx.businessId));
    refresh();
    return { retried: n };
  });
}

export async function dismissGhlEventsAction(ids: string[], note: string) {
  return runAction(async (ctx) => {
    requirePermission(ctx, "integrations.manage");
    const n = await dismissEvents(ctx.businessId, z.array(z.string().uuid()).max(500).parse(ids), ctx.membershipId, z.string().trim().min(1, "Add a short note").max(200).parse(note));
    refresh();
    return { dismissed: n };
  });
}

export async function resolveMismatchAction(id: string, action: "push_local" | "ignore" | "resolved") {
  return runAction(async (ctx) => {
    await resolveMismatch(ctx, z.string().uuid().parse(id), z.enum(["push_local", "ignore", "resolved"]).parse(action));
    if (action === "push_local") after(() => kickGhl(ctx.businessId));
    refresh();
    return { ok: true };
  }, action === "push_local" ? "Dashboard quantity queued for GoHighLevel" : "Finding updated");
}

export async function saveGhlSettingsAction(input: unknown) {
  return run((ctx) => updateSettings(ctx, ghlSettingsSchema.partial().parse(input)), "GoHighLevel sync settings saved");
}

export async function mapGhlCalendarAction(calendarId: string, branchId: string | null, appointmentTypeId: string | null) {
  return run((ctx) => mapCalendar(ctx, z.string().min(1).max(80).parse(calendarId), branchId || null, appointmentTypeId || null), "Calendar mapping saved");
}

export async function mapGhlUserAction(ghlUserId: string, membershipId: string | null) {
  return run((ctx) => mapUser(ctx, z.string().min(1).max(80).parse(ghlUserId), membershipId || null), "User mapping saved");
}

export async function queueGhlSyncAction(area: "metadata" | "products" | "inventory" | "customers") {
  return runAction(async (ctx) => {
    const n = await queueFullSync(ctx, z.enum(["metadata", "products", "inventory", "customers"]).parse(area));
    after(() => kickGhl(ctx.businessId));
    refresh();
    return { queued: n };
  });
}

// ─── Demo ────────────────────────────────────────────────────────────────────

/**
 * Rebuilds the demo dataset. Only available when DEMO_MODE=true AND the signed-in business is a
 * demo business AND the user holds demo.reset (owners). Never touches non-demo businesses.
 * A session-level advisory lock stops two resets racing; failures are reported, not swallowed.
 */
export async function resetDemoAction() {
  const session = await getSession();
  if (!session) return { ok: false as const, error: "Sign in again." };
  if (process.env.DEMO_MODE !== "true" || !session.business.isDemo || !session.ctx.permissions.has("demo.reset")) {
    return { ok: false as const, error: "Demo reset isn't available here." };
  }
  const client = await getPool().connect();
  try {
    const { rows } = await client.query<{ locked: boolean }>("select pg_try_advisory_lock(hashtext('specta:demo-reset')) as locked");
    if (!rows[0]?.locked) return { ok: false as const, error: "A demo reset is already running. Try again in a minute." };
    try {
      await removeDemoData();
      await seedDemo({ log: () => {} });
    } finally {
      await client.query("select pg_advisory_unlock(hashtext('specta:demo-reset'))");
    }
  } catch (error) {
    log.error("demo.reset_failed", { error: error instanceof Error ? error.message : String(error) });
    return { ok: false as const, error: "The demo reset failed. Run `npm run db:reset-demo` on the server to restore it." };
  } finally {
    client.release();
  }
  await clearSessionCookie();
  redirect("/login?demoReset=1");
}
