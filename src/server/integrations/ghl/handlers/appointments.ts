import { and, eq, isNull } from "drizzle-orm";
import { getDb } from "@/server/db";
import { appointments, appointmentTypes, branches, customers, ghlCalendars, ghlUsers, leads } from "@/server/db/schema";
import { audit, isUniqueViolation, systemCtx } from "@/server/services/core";
import type { GhlAppointment } from "../api";
import { apiFor } from "../connection";
import { APPOINTMENT_STATUS_FROM_GHL, APPOINTMENT_STATUS_TO_GHL } from "../constants";
import type { Handler } from "../engine";
import { GhlNotFoundError } from "../errors";
import { ensureContact, mirrorContactById } from "./contacts";

/**
 * Appointments. When a business sets "GoHighLevel calendars are authoritative":
 *  - GHL bookings (website widgets, GHL staff) arrive via Appointment* webhooks and are mirrored into the
 *    dashboard calendar (matched by GHL id; stale deliveries ignored; deletes become cancellations).
 *  - Dashboard bookings/changes are saved locally as `pending`, pushed to GHL immediately, and marked
 *    `synced` only after GHL confirms. If GHL is down they stay visibly pending/failed and retry.
 *  - Each GHL calendar is mapped to one branch + appointment type in Settings; unmapped calendars are
 *    held for review instead of guessed.
 */

const PG_OVERLAP = "appointments_no_practitioner_overlap";

function isOverlap(error: unknown) {
  let e: unknown = error;
  for (let i = 0; i < 4 && e; i++) {
    const c = e as { code?: string; constraint?: string; cause?: unknown };
    if (c.code === "23P01" || c.constraint === PG_OVERLAP) return true;
    e = c.cause;
  }
  return false;
}

export const inboundAppointment: Handler = async (event, env) => {
  const businessId = env.businessId;
  const payload = (event.payload ?? {}) as { appointment?: GhlAppointment } & Partial<GhlAppointment>;
  const appt = (payload.appointment ?? payload) as GhlAppointment;
  if (!appt?.id) return { status: "skipped", note: "Event has no appointment id" };
  const [existing] = await getDb().select().from(appointments).where(and(eq(appointments.businessId, businessId), eq(appointments.externalGhlAppointmentId, appt.id))).limit(1);

  if (event.eventType === "ghl.AppointmentDelete") {
    if (!existing) return { status: "skipped", note: "Unknown appointment" };
    await getDb().update(appointments).set({ status: "cancelled", cancelReason: "Deleted in GoHighLevel", syncState: "synced", updatedAt: new Date() }).where(eq(appointments.id, existing.id));
    return { status: "synced", externalId: appt.id, note: "Cancelled (deleted in GHL)" };
  }
  const updated = appt.dateUpdated ? new Date(appt.dateUpdated) : null;
  if (existing?.ghlUpdatedAt && updated && updated <= existing.ghlUpdatedAt) return { status: "skipped", note: "Older than the version already received (out of order)" };

  const [calendar] = await getDb().select().from(ghlCalendars).where(and(eq(ghlCalendars.businessId, businessId), eq(ghlCalendars.ghlCalendarId, appt.calendarId))).limit(1);
  if (!calendar?.branchId || !calendar.appointmentTypeId) {
    return { status: "needs_review", externalId: appt.id, note: `GHL calendar ${calendar?.name ?? appt.calendarId} isn't mapped to a branch and appointment type (Settings → Integrations → Calendars).` };
  }
  const { api } = await apiFor(businessId);
  let leadId: string | null = null;
  let customerId: string | null = null;
  let guestName: string | null = null;
  if (appt.contactId) {
    const mirror = await mirrorContactById(api, businessId, appt.contactId).catch(() => null);
    customerId = mirror?.customerId ?? null;
    leadId = customerId ? null : mirror?.leadId ?? null;
    if (!mirror) guestName = appt.title ?? "GoHighLevel booking";
  } else guestName = appt.title ?? "GoHighLevel booking";
  const [user] = appt.assignedUserId
    ? await getDb().select().from(ghlUsers).where(and(eq(ghlUsers.businessId, businessId), eq(ghlUsers.ghlUserId, appt.assignedUserId))).limit(1)
    : [];
  const status = APPOINTMENT_STATUS_FROM_GHL[String(appt.appointmentStatus ?? "new").toLowerCase()] ?? "scheduled";
  const values = {
    branchId: calendar.branchId,
    appointmentTypeId: calendar.appointmentTypeId,
    customerId,
    leadId,
    guestName: customerId || leadId ? null : guestName,
    practitionerMembershipId: user?.membershipId ?? null,
    startsAt: new Date(appt.startTime),
    endsAt: new Date(appt.endTime),
    status,
    notes: appt.notes ?? existing?.notes ?? null,
    source: existing?.source ?? "gohighlevel",
    ghlCalendarId: appt.calendarId,
    ghlUpdatedAt: updated ?? new Date(),
    syncState: "synced" as const,
    cancelReason: status === "cancelled" ? existing?.cancelReason ?? "Cancelled in GoHighLevel" : null,
    updatedAt: new Date(),
  };
  if (!(values.endsAt > values.startsAt)) return { status: "needs_review", externalId: appt.id, note: "GHL sent an appointment whose end is not after its start" };

  const write = async (practitioner: string | null) => {
    if (existing) {
      await getDb().update(appointments).set({ ...values, practitionerMembershipId: practitioner }).where(eq(appointments.id, existing.id));
      return existing.id;
    }
    const [row] = await getDb()
      .insert(appointments)
      .values({ ...values, practitionerMembershipId: practitioner, businessId, externalGhlAppointmentId: appt.id, createdAt: appt.dateAdded ? new Date(appt.dateAdded) : new Date() })
      .returning({ id: appointments.id });
    return row.id;
  };
  let id: string;
  let note: string | null = null;
  try {
    id = await write(values.practitionerMembershipId);
  } catch (error) {
    if (isUniqueViolation(error)) return { status: "skipped", externalId: appt.id, note: "Already recorded by a concurrent delivery" };
    if (!isOverlap(error)) throw error;
    // GHL is authoritative: keep the booking, but leave the practitioner unassigned and flag it.
    id = await write(null);
    note = "Overlapped another booking for the assigned practitioner in the dashboard — saved without a practitioner; review the calendar.";
  }
  if (leadId && !existing) {
    await getDb().update(leads).set({ stage: "appointment_scheduled", updatedAt: new Date() }).where(and(eq(leads.businessId, businessId), eq(leads.id, leadId), isNull(leads.archivedAt)));
  }
  await audit(getDb(), systemCtx(businessId, "GoHighLevel"), { action: existing ? "appointment.updated" : "appointment.created", entityType: "appointment", entityId: id, summary: `${existing ? "Updated" : "New"} GoHighLevel booking (${calendar.name})` });
  return note ? { status: "needs_review", externalId: appt.id, note } : { status: "synced", externalId: appt.id, result: { appointmentId: id, created: !existing } };
};

/** appointment.push — sends a dashboard booking/change to GHL and marks it synced once GHL confirms. */
export const appointmentPush: Handler = async (event, env) => {
  const businessId = env.businessId;
  const [a] = await getDb().select().from(appointments).where(and(eq(appointments.businessId, businessId), eq(appointments.id, event.entityId!))).limit(1);
  if (!a) return { status: "skipped", note: "Appointment no longer exists" };
  const { api, settings } = await apiFor(businessId);
  if (settings.appointmentsAuthority !== "ghl") return { status: "skipped", note: "Dashboard is the appointments system of record" };
  const markFailed = async (note: string) => {
    await getDb().update(appointments).set({ syncState: "failed" }).where(eq(appointments.id, a.id));
    return { status: "needs_review" as const, note };
  };
  const [calendar] = await getDb()
    .select()
    .from(ghlCalendars)
    .where(and(eq(ghlCalendars.businessId, businessId), eq(ghlCalendars.branchId, a.branchId), eq(ghlCalendars.appointmentTypeId, a.appointmentTypeId), eq(ghlCalendars.isActive, true)))
    .limit(1);
  if (!calendar && !a.ghlCalendarId) {
    const [b] = await getDb().select({ name: branches.name }).from(branches).where(eq(branches.id, a.branchId)).limit(1);
    const [t] = await getDb().select({ name: appointmentTypes.name }).from(appointmentTypes).where(eq(appointmentTypes.id, a.appointmentTypeId)).limit(1);
    return markFailed(`No GHL calendar is mapped to ${t?.name ?? "this type"} at ${b?.name ?? "this branch"}.`);
  }
  // Contact: customer → lead → guest (a guest gets a new GHL contact from name/phone).
  let contactId: string | null = null;
  if (a.customerId) {
    const [c] = await getDb().select().from(customers).where(eq(customers.id, a.customerId)).limit(1);
    if (c) {
      const res = await ensureContact(api, businessId, { kind: "customer", id: c.id, firstName: c.firstName, lastName: c.lastName, email: c.email, phone: c.phone, externalGhlContactId: c.externalGhlContactId }, { pushIdentity: true });
      if ("conflict" in res) return markFailed(res.conflict);
      contactId = res.contactId;
    }
  } else if (a.leadId) {
    const [l] = await getDb().select().from(leads).where(eq(leads.id, a.leadId)).limit(1);
    if (l) {
      const res = await ensureContact(api, businessId, { kind: "lead", id: l.id, firstName: l.firstName, lastName: l.lastName, email: l.email, phone: l.phone, source: l.source, externalGhlContactId: l.externalGhlContactId }, { pushIdentity: l.source !== "gohighlevel" });
      if ("conflict" in res) return markFailed(res.conflict);
      contactId = res.contactId;
    }
  } else if (a.guestName) {
    const [first, ...rest] = a.guestName.trim().split(/\s+/);
    contactId = (await api.createContact({ firstName: first, lastName: rest.join(" ") || undefined, phone: a.guestPhone ?? undefined, email: a.guestEmail ?? undefined, source: "Optical dashboard booking" })).contact.id;
  }
  if (!contactId) return markFailed("The appointment has no customer, lead or guest to attach in GHL.");
  const [user] = a.practitionerMembershipId
    ? await getDb().select().from(ghlUsers).where(and(eq(ghlUsers.businessId, businessId), eq(ghlUsers.membershipId, a.practitionerMembershipId))).limit(1)
    : [];
  const body = {
    calendarId: a.ghlCalendarId ?? calendar!.ghlCalendarId,
    contactId,
    startTime: a.startsAt.toISOString(),
    endTime: a.endsAt.toISOString(),
    appointmentStatus: APPOINTMENT_STATUS_TO_GHL[a.status] ?? "new",
    ...(user ? { assignedUserId: user.ghlUserId } : {}),
    ...(a.notes ? { description: a.notes } : {}),
    // Staff already chose an open slot in the dashboard; don't let GHL's own availability rules reject it.
    ignoreFreeSlotValidation: true,
  };
  let saved: GhlAppointment;
  if (a.externalGhlAppointmentId) {
    try {
      const res = await api.updateAppointment(a.externalGhlAppointmentId, body);
      saved = (res.event ?? res) as GhlAppointment;
    } catch (error) {
      if (!(error instanceof GhlNotFoundError)) throw error;
      return markFailed("The booking was deleted in GHL. Re-create it or cancel it here.");
    }
  } else {
    const res = await api.createAppointment(body);
    saved = (res.event ?? res) as GhlAppointment;
  }
  if (!saved?.id) throw new Error("GoHighLevel didn't return the appointment id");
  await getDb()
    .update(appointments)
    .set({ externalGhlAppointmentId: saved.id, ghlCalendarId: body.calendarId, ghlUpdatedAt: saved.dateUpdated ? new Date(saved.dateUpdated) : new Date(), syncState: "synced" })
    .where(eq(appointments.id, a.id));
  return { status: "synced", externalId: saved.id, result: { created: !a.externalGhlAppointmentId } };
};
