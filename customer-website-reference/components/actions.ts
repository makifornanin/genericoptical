"use server";

import { requestMeta } from "@/server/auth/session";
import { toResult } from "@/server/actions";
import { availableSlots, requestPublicAppointment } from "@/server/services/appointments";
import { AppError } from "@/server/services/core";
import { capturePublicLead } from "@/server/services/leads";
import { getSiteBusiness } from "@/server/services/settings";

// Simple per-instance rate limit for public forms (use a shared store such as Redis when running multiple instances).
const hits = new Map<string, number[]>();
function rateLimit(key: string, max = 8, windowMs = 10 * 60_000) {
  const now = Date.now();
  const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
  if (recent.length >= max) throw new AppError("Too many submissions from this connection. Please try again in a few minutes or call us.", "validation");
  recent.push(now);
  hits.set(key, recent);
}

async function business() {
  const biz = await getSiteBusiness();
  if (!biz) throw new AppError("This site isn't set up yet.", "not_found");
  return biz;
}

export async function submitInquiryAction(input: unknown) {
  return toResult(async () => {
    const { ip } = await requestMeta();
    rateLimit(`inq:${ip ?? "unknown"}`);
    const biz = await business();
    await capturePublicLead(biz.id, input, { ip });
    return { ok: true };
  });
}

export async function publicSlotsAction(input: { branchId: string; appointmentTypeId: string; date: string }) {
  return toResult(async () => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date)) throw new AppError("Choose a date.", "validation");
    const biz = await business();
    const slots = await availableSlots(biz.id, input);
    return slots.map((s) => s.time);
  });
}

export async function bookAppointmentAction(input: unknown) {
  return toResult(async () => {
    const { ip } = await requestMeta();
    rateLimit(`book:${ip ?? "unknown"}`, 5);
    const biz = await business();
    const res = await requestPublicAppointment(biz.id, input, { ip });
    const booked = res && "startsAt" in res ? res : null;
    return { ok: true, startsAt: booked?.startsAt.toISOString() ?? null, typeName: booked?.typeName ?? null, branchName: booked?.branchName ?? null };
  });
}
