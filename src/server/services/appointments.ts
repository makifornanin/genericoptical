import { TZDate } from "@date-fns/tz";
import { and, asc, desc, eq, gt, inArray, lt, ne, sql, type SQL } from "drizzle-orm";
import { formatInZone } from "@/lib/dates";
import { APPOINTMENT_STATUS_LABELS, appointmentInput, publicAppointmentInput } from "@/lib/schemas";
import { WEEKDAYS, type WeekHours } from "@/lib/types";
import { getDb, type Executor, type Tx } from "@/server/db";
import {
  appointments,
  appointmentTypes,
  auditLogs,
  branches,
  businesses,
  businessMemberships,
  customers,
  leadActivities,
  leads,
  users,
} from "@/server/db/schema";
import { audit, can, conflict, db, forbidden, invalid, mapDbError, nextNumber, notFound, now, requirePermission, systemCtx, type Ctx } from "./core";
import { onAppointmentChanged } from "@/server/integrations/ghl/triggers";

type Status = (typeof appointments.$inferSelect)["status"];
const ACTIVE: Status[] = ["scheduled", "confirmed", "completed"];

function ownScope(ctx: Ctx): SQL {
  if (can(ctx, "appointments.view_all")) return sql`true`;
  return ctx.membershipId ? eq(appointments.practitionerMembershipId, ctx.membershipId) : sql`false`;
}

const toMinutes = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
};

async function bizSettings(ex: Executor, businessId: string) {
  const [b] = await ex
    .select({ timezone: businesses.timezone, hours: businesses.businessHours, settings: businesses.settings, name: businesses.name })
    .from(businesses)
    .where(eq(businesses.id, businessId));
  if (!b) throw notFound("Business");
  return b;
}

/** Converts a local date+time in the business time zone into a UTC instant. */
export function zonedInstant(day: string, time: string, timezone: string): Date {
  const [y, m, d] = day.split("-").map(Number);
  const [hh, mm] = time.split(":").map(Number);
  return new Date(new TZDate(y, m - 1, d, hh, mm, timezone).getTime());
}

function hoursFor(day: string, timezone: string, branchHours: WeekHours | null, businessHours: WeekHours) {
  const [y, m, d] = day.split("-").map(Number);
  const weekday = WEEKDAYS[(new TZDate(y, m - 1, d, 12, 0, timezone).getDay() + 6) % 7];
  return (branchHours ?? businessHours)[weekday];
}

function assertWithinHours(day: string, time: string, duration: number, timezone: string, branchHours: WeekHours | null, businessHours: WeekHours) {
  const hours = hoursFor(day, timezone, branchHours, businessHours);
  if (!hours) throw invalid("The branch is closed on that day.", { date: ["Closed on this day."] });
  const start = toMinutes(time);
  if (start < toMinutes(hours.open) || start + duration > toMinutes(hours.close)) {
    throw invalid(`Appointments must fit within opening hours (${hours.open}–${hours.close}).`, { time: [`Open ${hours.open}–${hours.close}.`] });
  }
}

async function loadRefs(tx: Executor, ctx: Ctx, input: { branchId: string; appointmentTypeId: string; customerId: string | null; leadId: string | null; practitionerMembershipId: string | null }) {
  const [branch] = await tx.select().from(branches).where(and(eq(branches.businessId, ctx.businessId), eq(branches.id, input.branchId))).limit(1);
  if (!branch || !branch.isActive) throw invalid("Choose an active branch.");
  const [type] = await tx
    .select()
    .from(appointmentTypes)
    .where(and(eq(appointmentTypes.businessId, ctx.businessId), eq(appointmentTypes.id, input.appointmentTypeId)))
    .limit(1);
  if (!type || !type.isActive) throw invalid("Choose an appointment type.");
  if (input.customerId) {
    const [c] = await tx.select({ id: customers.id }).from(customers).where(and(eq(customers.businessId, ctx.businessId), eq(customers.id, input.customerId))).limit(1);
    if (!c) throw invalid("Unknown customer.");
  }
  let lead: typeof leads.$inferSelect | undefined;
  if (input.leadId) {
    [lead] = await tx.select().from(leads).where(and(eq(leads.businessId, ctx.businessId), eq(leads.id, input.leadId))).limit(1);
    if (!lead) throw invalid("Unknown lead.");
  }
  let practitionerName: string | null = null;
  if (input.practitionerMembershipId) {
    const [p] = await tx
      .select({ id: businessMemberships.id, takes: businessMemberships.takesAppointments, active: businessMemberships.isActive, name: users.name })
      .from(businessMemberships)
      .innerJoin(users, eq(users.id, businessMemberships.userId))
      .where(and(eq(businessMemberships.businessId, ctx.businessId), eq(businessMemberships.id, input.practitionerMembershipId)))
      .limit(1);
    if (!p || !p.active || !p.takes) throw invalid("Choose a practitioner who takes appointments.");
    practitionerName = p.name;
  } else if (type.requiresPractitioner) {
    throw invalid(`${type.name} needs a practitioner.`, { practitionerMembershipId: ["Choose a practitioner."] });
  }
  return { branch, type, lead, practitionerName };
}

async function assertNoOverlap(tx: Executor, ctx: Ctx, practitionerId: string | null, startsAt: Date, endsAt: Date, excludeId?: string) {
  if (!practitionerId) return;
  const conds: SQL[] = [
    eq(appointments.businessId, ctx.businessId),
    eq(appointments.practitionerMembershipId, practitionerId),
    inArray(appointments.status, ACTIVE),
    lt(appointments.startsAt, endsAt),
    gt(appointments.endsAt, startsAt),
  ];
  if (excludeId) conds.push(ne(appointments.id, excludeId));
  const [clash] = await tx.select({ id: appointments.id, startsAt: appointments.startsAt }).from(appointments).where(and(...conds)).limit(1);
  if (clash) throw conflict("That practitioner already has an appointment at this time.");
}

// ─── Queries ─────────────────────────────────────────────────────────────────

export async function listAppointments(
  ctx: Ctx,
  f: { from: Date; to: Date; branchId?: string | null; practitionerId?: string | null; status?: string | null; customerId?: string | null; limit?: number },
) {
  requirePermission(ctx, "appointments.view");
  const conds: SQL[] = [eq(appointments.businessId, ctx.businessId), ownScope(ctx), lt(appointments.startsAt, f.to), gt(appointments.endsAt, f.from)];
  if (f.branchId) conds.push(eq(appointments.branchId, f.branchId));
  if (f.practitionerId) conds.push(eq(appointments.practitionerMembershipId, f.practitionerId));
  if (f.status) conds.push(sql`${appointments.status} = ${f.status}`);
  if (f.customerId) conds.push(eq(appointments.customerId, f.customerId));
  return db()
    .select({
      id: appointments.id,
      startsAt: appointments.startsAt,
      endsAt: appointments.endsAt,
      status: appointments.status,
      notes: appointments.notes,
      source: appointments.source,
      branchId: appointments.branchId,
      branchName: branches.name,
      typeId: appointmentTypes.id,
      typeName: appointmentTypes.name,
      typeCode: appointmentTypes.code,
      customerId: appointments.customerId,
      customerName: sql<string | null>`case when ${customers.id} is null then null else ${customers.firstName} || ' ' || ${customers.lastName} end`,
      customerPhone: customers.phone,
      leadId: appointments.leadId,
      leadName: sql<string | null>`case when ${leads.id} is null then null else ${leads.firstName} || ' ' || ${leads.lastName} end`,
      guestName: appointments.guestName,
      guestPhone: appointments.guestPhone,
      practitionerMembershipId: appointments.practitionerMembershipId,
      practitionerName: users.name,
      practitionerColor: businessMemberships.calendarColor,
    })
    .from(appointments)
    .innerJoin(branches, eq(branches.id, appointments.branchId))
    .innerJoin(appointmentTypes, eq(appointmentTypes.id, appointments.appointmentTypeId))
    .leftJoin(customers, eq(customers.id, appointments.customerId))
    .leftJoin(leads, eq(leads.id, appointments.leadId))
    .leftJoin(businessMemberships, eq(businessMemberships.id, appointments.practitionerMembershipId))
    .leftJoin(users, eq(users.id, businessMemberships.userId))
    .where(and(...conds))
    .orderBy(asc(appointments.startsAt))
    .limit(f.limit ?? 1000);
}

export async function getAppointment(ctx: Ctx, id: string) {
  requirePermission(ctx, "appointments.view");
  const [row] = await db()
    .select({ appointment: appointments, typeName: appointmentTypes.name, branchName: branches.name, practitionerName: users.name })
    .from(appointments)
    .innerJoin(appointmentTypes, eq(appointmentTypes.id, appointments.appointmentTypeId))
    .innerJoin(branches, eq(branches.id, appointments.branchId))
    .leftJoin(businessMemberships, eq(businessMemberships.id, appointments.practitionerMembershipId))
    .leftJoin(users, eq(users.id, businessMemberships.userId))
    .where(and(eq(appointments.businessId, ctx.businessId), eq(appointments.id, id), ownScope(ctx)))
    .limit(1);
  if (!row) throw notFound("Appointment");
  const history = await db()
    .select()
    .from(auditLogs)
    .where(and(eq(auditLogs.businessId, ctx.businessId), eq(auditLogs.entityType, "appointment"), eq(auditLogs.entityId, id)))
    .orderBy(desc(auditLogs.createdAt));
  return { ...row, history };
}

export async function appointmentTypesFor(ex: Executor, businessId: string, publicOnly = false) {
  const conds: SQL[] = [eq(appointmentTypes.businessId, businessId), eq(appointmentTypes.isActive, true)];
  if (publicOnly) conds.push(eq(appointmentTypes.isPublic, true));
  return ex.select().from(appointmentTypes).where(and(...conds)).orderBy(asc(appointmentTypes.sortOrder), asc(appointmentTypes.name));
}

export async function practitioners(ex: Executor, businessId: string) {
  return ex
    .select({ id: businessMemberships.id, name: users.name, color: businessMemberships.calendarColor, branchId: businessMemberships.defaultBranchId })
    .from(businessMemberships)
    .innerJoin(users, eq(users.id, businessMemberships.userId))
    .where(and(eq(businessMemberships.businessId, businessId), eq(businessMemberships.isActive, true), eq(businessMemberships.takesAppointments, true)))
    .orderBy(asc(users.name));
}

/**
 * Start times on a day where the appointment fits inside opening hours and at least one eligible
 * practitioner (or the chosen one) is free. Times are local "HH:mm" in the business time zone.
 */
export async function availableSlots(
  businessId: string,
  opts: { branchId: string; appointmentTypeId: string; date: string; practitionerId?: string | null; stepMinutes?: number; now?: Date },
) {
  const ex = db();
  const biz = await bizSettings(ex, businessId);
  const [branch] = await ex.select().from(branches).where(and(eq(branches.businessId, businessId), eq(branches.id, opts.branchId))).limit(1);
  const [type] = await ex.select().from(appointmentTypes).where(and(eq(appointmentTypes.businessId, businessId), eq(appointmentTypes.id, opts.appointmentTypeId))).limit(1);
  if (!branch || !type) return [];
  const hours = hoursFor(opts.date, biz.timezone, branch.businessHours, biz.hours);
  if (!hours) return [];
  const step = opts.stepMinutes ?? 30;
  const dayStart = zonedInstant(opts.date, "00:00", biz.timezone);
  const dayEnd = new Date(dayStart.getTime() + 86_400_000);
  // A specifically chosen practitioner always constrains the slots, even when the type doesn't need one.
  const constrained = Boolean(opts.practitionerId) || type.requiresPractitioner;
  const staff = opts.practitionerId
    ? [opts.practitionerId]
    : type.requiresPractitioner
      ? (await practitioners(ex, businessId)).filter((p) => !p.branchId || p.branchId === branch.id).map((p) => p.id)
      : [];
  const booked = staff.length
    ? await ex
        .select({ practitionerId: appointments.practitionerMembershipId, startsAt: appointments.startsAt, endsAt: appointments.endsAt })
        .from(appointments)
        .where(
          and(
            eq(appointments.businessId, businessId),
            inArray(appointments.practitionerMembershipId, staff),
            inArray(appointments.status, ACTIVE),
            lt(appointments.startsAt, dayEnd),
            gt(appointments.endsAt, dayStart),
          ),
        )
    : [];
  const current = opts.now ?? new Date();
  const slots: { time: string; practitionerIds: string[] }[] = [];
  for (let t = toMinutes(hours.open); t + type.durationMinutes <= toMinutes(hours.close); t += step) {
    const time = `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`;
    const start = zonedInstant(opts.date, time, biz.timezone);
    if (start.getTime() < current.getTime() + 30 * 60_000) continue;
    const end = new Date(start.getTime() + type.durationMinutes * 60_000);
    if (!constrained) {
      slots.push({ time, practitionerIds: [] });
      continue;
    }
    const free = staff.filter((id) => !booked.some((b) => b.practitionerId === id && b.startsAt < end && b.endsAt > start));
    if (free.length) slots.push({ time, practitionerIds: free });
  }
  return slots;
}

// ─── Mutations ───────────────────────────────────────────────────────────────

function assertCanManage(ctx: Ctx, practitionerId: string | null) {
  requirePermission(ctx, "appointments.manage");
  if (!can(ctx, "appointments.view_all") && practitionerId !== ctx.membershipId) {
    throw forbidden("You can only manage your own appointments.");
  }
}

export async function createAppointment(ctx: Ctx, raw: unknown) {
  const input = appointmentInput.parse(raw);
  assertCanManage(ctx, input.practitionerMembershipId);
  try {
    return await getDb().transaction(async (tx) => {
      const biz = await bizSettings(tx, ctx.businessId);
      const { branch, type, lead, practitionerName } = await loadRefs(tx, ctx, input);
      const duration = input.durationMinutes ?? type.durationMinutes;
      assertWithinHours(input.date, input.time, duration, biz.timezone, branch.businessHours, biz.hours);
      const startsAt = zonedInstant(input.date, input.time, biz.timezone);
      if (startsAt.getTime() < now(ctx).getTime() - 12 * 3600_000) throw invalid("Appointments can't be booked in the past.", { date: ["In the past."] });
      const endsAt = new Date(startsAt.getTime() + duration * 60_000);
      await assertNoOverlap(tx, ctx, input.practitionerMembershipId, startsAt, endsAt);
      const at = now(ctx);
      const [appt] = await tx
        .insert(appointments)
        .values({
          businessId: ctx.businessId,
          branchId: branch.id,
          appointmentTypeId: type.id,
          customerId: input.customerId ?? lead?.convertedCustomerId ?? null,
          leadId: input.leadId,
          practitionerMembershipId: input.practitionerMembershipId,
          startsAt,
          endsAt,
          notes: input.notes,
          guestName: input.guestName,
          guestPhone: input.guestPhone,
          guestEmail: input.guestEmail,
          source: "dashboard",
          createdByMembershipId: ctx.membershipId,
          createdAt: at,
          updatedAt: at,
        })
        .returning();
      if (lead) await markLeadScheduled(tx, ctx, lead, `${type.name} on ${formatInZone(startsAt, biz.timezone, "MMM d, h:mm a")}`);
      await audit(tx, ctx, {
        action: "appointment.created",
        entityType: "appointment",
        entityId: appt.id,
        summary: `Booked ${type.name} at ${branch.name} for ${formatInZone(startsAt, biz.timezone, "MMM d, yyyy h:mm a")}${practitionerName ? ` with ${practitionerName}` : ""}`,
      });
      await onAppointmentChanged(tx, ctx.businessId, appt.id);
      return appt;
    });
  } catch (error) {
    mapDbError(error);
  }
}

async function markLeadScheduled(tx: Tx, ctx: Ctx, lead: typeof leads.$inferSelect, body: string) {
  if (lead.stage === "converted" || lead.stage === "lost") return;
  await tx.insert(leadActivities).values({
    businessId: ctx.businessId,
    leadId: lead.id,
    type: "appointment",
    body,
    fromStage: lead.stage,
    toStage: lead.stage === "appointment_scheduled" ? null : "appointment_scheduled",
    actorMembershipId: ctx.membershipId,
    createdAt: now(ctx),
  });
  if (lead.stage !== "appointment_scheduled") {
    await tx.update(leads).set({ stage: "appointment_scheduled", updatedAt: now(ctx) }).where(eq(leads.id, lead.id));
  }
}

export async function updateAppointment(ctx: Ctx, id: string, raw: unknown) {
  const input = appointmentInput.parse(raw);
  try {
    return await getDb().transaction(async (tx) => {
      const [existing] = await tx
        .select()
        .from(appointments)
        .where(and(eq(appointments.businessId, ctx.businessId), eq(appointments.id, id), ownScope(ctx)))
        .for("update");
      if (!existing) throw notFound("Appointment");
      assertCanManage(ctx, existing.practitionerMembershipId);
      assertCanManage(ctx, input.practitionerMembershipId);
      if (existing.status === "cancelled" || existing.status === "completed" || existing.status === "no_show") {
        throw invalid(`${APPOINTMENT_STATUS_LABELS[existing.status]} appointments can't be edited. Book a new one instead.`);
      }
      const biz = await bizSettings(tx, ctx.businessId);
      const { branch, type, practitionerName } = await loadRefs(tx, ctx, input);
      const duration = input.durationMinutes ?? type.durationMinutes;
      assertWithinHours(input.date, input.time, duration, biz.timezone, branch.businessHours, biz.hours);
      const startsAt = zonedInstant(input.date, input.time, biz.timezone);
      const endsAt = new Date(startsAt.getTime() + duration * 60_000);
      await assertNoOverlap(tx, ctx, input.practitionerMembershipId, startsAt, endsAt, id);
      const rescheduled = existing.startsAt.getTime() !== startsAt.getTime();
      const [row] = await tx
        .update(appointments)
        .set({
          branchId: branch.id,
          appointmentTypeId: type.id,
          customerId: input.customerId,
          leadId: input.leadId,
          practitionerMembershipId: input.practitionerMembershipId,
          startsAt,
          endsAt,
          notes: input.notes,
          guestName: input.guestName,
          guestPhone: input.guestPhone,
          guestEmail: input.guestEmail,
          // A rescheduled appointment needs confirming again.
          status: rescheduled ? "scheduled" : existing.status,
          updatedAt: now(ctx),
        })
        .where(eq(appointments.id, id))
        .returning();
      const fmt = (d: Date) => formatInZone(d, biz.timezone, "MMM d, yyyy h:mm a");
      await audit(tx, ctx, {
        action: rescheduled ? "appointment.rescheduled" : "appointment.updated",
        entityType: "appointment",
        entityId: id,
        summary: rescheduled
          ? `Rescheduled ${type.name} from ${fmt(existing.startsAt)} to ${fmt(startsAt)}${practitionerName ? ` with ${practitionerName}` : ""}`
          : `Updated ${type.name} on ${fmt(startsAt)}`,
      });
      await onAppointmentChanged(tx, ctx.businessId, id);
      return row;
    });
  } catch (error) {
    mapDbError(error);
  }
}

export async function setAppointmentStatus(ctx: Ctx, id: string, status: Status, reason?: string | null) {
  if (!["scheduled", "confirmed", "completed", "cancelled", "no_show"].includes(status)) throw invalid("Unknown status.");
  if (status === "cancelled" && !reason?.trim()) throw invalid("Add a cancellation reason.");
  try {
    return await getDb().transaction(async (tx) => {
      const [existing] = await tx
        .select()
        .from(appointments)
        .where(and(eq(appointments.businessId, ctx.businessId), eq(appointments.id, id), ownScope(ctx)))
        .for("update");
      if (!existing) throw notFound("Appointment");
      assertCanManage(ctx, existing.practitionerMembershipId);
      if (existing.status === status) return existing;
      const terminal = ["completed", "cancelled", "no_show"].includes(existing.status);
      if (terminal && status !== "scheduled") throw invalid("Reopen this appointment first.");
      if (terminal && !can(ctx, "appointments.view_all")) throw forbidden("Ask a manager to reopen this appointment.");
      if (status === "completed" && existing.startsAt.getTime() > now(ctx).getTime() + 3600_000) throw invalid("An appointment can't be completed before it starts.");
      if (terminal) await assertNoOverlap(tx, ctx, existing.practitionerMembershipId, existing.startsAt, existing.endsAt, id);
      const [row] = await tx
        .update(appointments)
        .set({ status, cancelReason: status === "cancelled" ? reason!.trim() : null, updatedAt: now(ctx) })
        .where(eq(appointments.id, id))
        .returning();
      const [info] = await tx
        .select({
          typeName: appointmentTypes.name,
          person: sql<string | null>`coalesce(${customers.firstName} || ' ' || ${customers.lastName}, ${leads.firstName} || ' ' || ${leads.lastName}, ${appointments.guestName})`,
          timezone: businesses.timezone,
        })
        .from(appointments)
        .innerJoin(appointmentTypes, eq(appointmentTypes.id, appointments.appointmentTypeId))
        .innerJoin(businesses, eq(businesses.id, appointments.businessId))
        .leftJoin(customers, eq(customers.id, appointments.customerId))
        .leftJoin(leads, eq(leads.id, appointments.leadId))
        .where(eq(appointments.id, id));
      await audit(tx, ctx, {
        action: "appointment.status_changed",
        entityType: "appointment",
        entityId: id,
        summary: `${info?.typeName ?? "Appointment"}${info?.person ? ` for ${info.person}` : ""} (${formatInZone(existing.startsAt, info?.timezone ?? "Asia/Manila", "MMM d, h:mm a")}): ${APPOINTMENT_STATUS_LABELS[existing.status]} → ${APPOINTMENT_STATUS_LABELS[status]}${reason?.trim() ? ` · ${reason.trim()}` : ""}`,
      });
      await onAppointmentChanged(tx, ctx.businessId, id);
      return row;
    });
  } catch (error) {
    mapDbError(error);
  }
}

/**
 * Public booking request from the website. Re-checks the slot server-side, assigns a free
 * practitioner, records (or reuses) the lead, and books the appointment in one transaction.
 */
export async function requestPublicAppointment(businessId: string, raw: unknown, meta: { ip?: string | null } = {}) {
  const input = publicAppointmentInput.parse(raw);
  if (input.website) return { ok: true as const, appointmentId: null };
  const ctx = { ...systemCtx(businessId, "Website"), ip: meta.ip ?? null };
  const slots = await availableSlots(businessId, { branchId: input.branchId, appointmentTypeId: input.appointmentTypeId, date: input.date });
  const slot = slots.find((s) => s.time === input.time);
  if (!slot) throw conflict("That time was just taken or is outside opening hours. Please pick another slot.");
  try {
    return await getDb().transaction(async (tx) => {
      const biz = await bizSettings(tx, businessId);
      const [type] = await tx.select().from(appointmentTypes).where(and(eq(appointmentTypes.businessId, businessId), eq(appointmentTypes.id, input.appointmentTypeId), eq(appointmentTypes.isPublic, true))).limit(1);
      if (!type) throw invalid("That appointment type can't be booked online.");
      const [branch] = await tx.select().from(branches).where(and(eq(branches.businessId, businessId), eq(branches.id, input.branchId), eq(branches.isActive, true))).limit(1);
      if (!branch) throw invalid("Choose a branch.");
      const startsAt = zonedInstant(input.date, input.time, biz.timezone);
      const endsAt = new Date(startsAt.getTime() + type.durationMinutes * 60_000);
      const practitionerId = slot.practitionerIds[0] ?? null;

      // Find or create the lead for this person.
      const digits = input.phone.replace(/\D/g, "");
      const [existingLead] = await tx
        .select()
        .from(leads)
        .where(
          and(
            eq(leads.businessId, businessId),
            sql`${leads.archivedAt} is null`,
            sql`${leads.stage} not in ('converted', 'lost')`,
            sql`(regexp_replace(coalesce(${leads.phone}, ''), '[^0-9]', '', 'g') = ${digits}${input.email ? sql` or lower(${leads.email}) = ${input.email}` : sql``})`,
          ),
        )
        .orderBy(desc(leads.createdAt))
        .limit(1)
        .for("update");
      let lead = existingLead;
      if (!lead) {
        const [first, ...rest] = input.fullName.trim().split(/\s+/);
        const code = await nextNumber(tx, businessId, "lead", "LD-", 5);
        [lead] = await tx
          .insert(leads)
          .values({
            businessId,
            code,
            firstName: first,
            lastName: rest.join(" "),
            email: input.email,
            phone: input.phone,
            source: "website",
            interest: type.code === "contact_lens_fitting" ? "contact_lenses" : "eye_exam",
            message: input.message,
            preferredBranchId: branch.id,
            smsConsent: input.smsConsent,
            marketingConsent: input.marketingConsent,
            createdAt: now(ctx),
            updatedAt: now(ctx),
          })
          .returning();
        await tx.insert(leadActivities).values({ businessId, leadId: lead.id, type: "created", body: input.message, toStage: "new", metadata: { source: "website", kind: "appointment_request" }, createdAt: now(ctx) });
      }
      await assertNoOverlap(tx, ctx, practitionerId, startsAt, endsAt);
      const [appt] = await tx
        .insert(appointments)
        .values({
          businessId,
          branchId: branch.id,
          appointmentTypeId: type.id,
          leadId: lead.id,
          customerId: lead.convertedCustomerId,
          practitionerMembershipId: practitionerId,
          startsAt,
          endsAt,
          status: "scheduled",
          source: "website",
          guestName: input.fullName,
          guestPhone: input.phone,
          guestEmail: input.email,
          notes: input.message,
          createdAt: now(ctx),
          updatedAt: now(ctx),
        })
        .returning();
      await markLeadScheduled(tx, ctx, lead, `Booked online: ${type.name} at ${branch.name}, ${formatInZone(startsAt, biz.timezone, "MMM d, h:mm a")}`);
      await audit(tx, ctx, {
        action: "appointment.created",
        entityType: "appointment",
        entityId: appt.id,
        summary: `Online booking: ${type.name} at ${branch.name} for ${formatInZone(startsAt, biz.timezone, "MMM d, yyyy h:mm a")} (${input.fullName})`,
      });
      await onAppointmentChanged(tx, ctx.businessId, appt.id);
      return { ok: true as const, appointmentId: appt.id, startsAt, typeName: type.name, branchName: branch.name };
    });
  } catch (error) {
    mapDbError(error);
  }
}
