"use server";

import { refresh } from "next/cache";
import { runAction } from "@/server/actions";
import * as appointments from "@/server/services/appointments";
import { requirePermission } from "@/server/services/core";

export async function saveAppointmentAction(id: string | null, input: unknown) {
  return runAction(async (ctx) => {
    const row = id ? await appointments.updateAppointment(ctx, id, input) : await appointments.createAppointment(ctx, input);
    refresh();
    return { id: row!.id };
  }, id ? "Appointment updated" : "Appointment booked");
}

export async function setAppointmentStatusAction(id: string, status: "scheduled" | "confirmed" | "completed" | "cancelled" | "no_show", reason?: string) {
  return runAction(async (ctx) => {
    await appointments.setAppointmentStatus(ctx, id, status, reason ?? null);
    refresh();
    return { id };
  }, "Appointment updated");
}

export async function slotsAction(input: { branchId: string; appointmentTypeId: string; date: string; practitionerId?: string | null }) {
  return runAction(async (ctx) => {
    requirePermission(ctx, "appointments.view");
    return appointments.availableSlots(ctx.businessId, input);
  });
}
