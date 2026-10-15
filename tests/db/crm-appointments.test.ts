import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import { getDb } from "@/server/db";
import { customers as customersTable } from "@/server/db/schema";
import * as appointments from "@/server/services/appointments";
import * as customers from "@/server/services/customers";
import * as leads from "@/server/services/leads";
import { createBusiness, customer, futureDay, type Fixture } from "./fixtures";

let f: Fixture;
beforeAll(async () => {
  f = await createBusiness("CRM");
});

describe("customers", () => {
  it("creates, updates, searches and archives customers with an audit trail", async () => {
    const c = await customers.createCustomer(f.ctx.sales, { firstName: "Rosa", lastName: "Lim", email: "Rosa.Lim@Example.com", phone: "+63 917 111 2222" });
    expect(c!.code).toMatch(/^CUS-/);
    expect(c!.email).toBe("rosa.lim@example.com");
    await customers.updateCustomer(f.ctx.sales, c!.id, { firstName: "Rosa", lastName: "Lim-Tan", phone: "+63 917 111 2222" });
    const found = await customers.listCustomers(f.ctx.sales, { q: "lim-tan" });
    expect(found.rows.map((r) => r.id)).toContain(c!.id);
    const profile = await customers.getCustomer(f.ctx.owner, c!.id);
    expect(profile.history.map((h) => h.action)).toEqual(expect.arrayContaining(["customer.created", "customer.updated"]));
    await customers.setCustomerArchived(f.ctx.sales, c!.id, true);
    expect((await customers.listCustomers(f.ctx.sales, { q: "lim-tan" })).rows).toHaveLength(0);
  });

  it("validates input", async () => {
    await expect(customers.createCustomer(f.ctx.sales, { firstName: "", lastName: "X" })).rejects.toThrow();
    await expect(customers.createCustomer(f.ctx.sales, { firstName: "A", lastName: "B", email: "not-an-email" })).rejects.toThrow();
  });

  it("restricts prescriptions to authorised roles", async () => {
    const c = await customer(f);
    await customers.savePrescription(f.ctx.practitioner, null, { customerId: c.id, examinedOn: "2026-10-01", odSphere: "-1.25", osSphere: -1.5, odAxis: 90, pdDistance: 62 });
    expect(await customers.listPrescriptions(f.ctx.practitioner, c.id)).toHaveLength(1);
    await expect(customers.listPrescriptions(f.ctx.sales, c.id)).rejects.toThrow(/permission/i);
    await expect(customers.savePrescription(f.ctx.sales, null, { customerId: c.id, examinedOn: "2026-10-01" })).rejects.toThrow(/permission/i);
    // The customer profile hides prescriptions from roles without access.
    expect((await customers.getCustomer(f.ctx.sales, c.id)).prescriptions).toBeNull();
    await expect(customers.savePrescription(f.ctx.practitioner, null, { customerId: c.id, examinedOn: "2026-10-01", odAxis: 200 })).rejects.toThrow();
  });
});

describe("leads and conversion", () => {
  it("moves a lead through the pipeline, preserving its timeline", async () => {
    const lead = await leads.createLead(f.ctx.manager, { firstName: "Paolo", lastName: "Cruz", phone: "+63 918 555 0001", source: "facebook", interest: "eye_exam" });
    await leads.assignLead(f.ctx.manager, lead!.id, f.membership.sales);
    await leads.changeLeadStage(f.ctx.sales, lead!.id, "contacted");
    await leads.addLeadNote(f.ctx.sales, lead!.id, { body: "Called, wants Saturday", type: "call" });
    await leads.changeLeadStage(f.ctx.sales, lead!.id, "qualified");
    await expect(leads.changeLeadStage(f.ctx.sales, lead!.id, "lost")).rejects.toThrow(/reason/i);
    await expect(leads.changeLeadStage(f.ctx.sales, lead!.id, "converted")).rejects.toThrow(/convert to customer/i);
    const detail = await leads.getLead(f.ctx.sales, lead!.id);
    expect(detail.lead.stage).toBe("qualified");
    expect(detail.timeline.map((t) => t.activity.type)).toEqual(expect.arrayContaining(["created", "assignment", "stage_change", "call"]));
  });

  it("scopes sales staff to their assigned leads", async () => {
    const mine = await leads.createLead(f.ctx.manager, { firstName: "Mine", phone: "+63 918 555 0002", assignedMembershipId: f.membership.sales });
    const other = await leads.createLead(f.ctx.manager, { firstName: "Other", phone: "+63 918 555 0003" });
    const list = await leads.listLeads(f.ctx.sales, {});
    expect(list.rows.map((r) => r.id)).toContain(mine!.id);
    expect(list.rows.map((r) => r.id)).not.toContain(other!.id);
    await expect(leads.getLead(f.ctx.sales, other!.id)).rejects.toThrow(/not found/i);
    await expect(leads.assignLead(f.ctx.sales, mine!.id, f.membership.manager)).rejects.toThrow(/permission/i);
  });

  it("converts once: retries and concurrent conversions never create duplicate customers", async () => {
    const lead = await leads.createLead(f.ctx.manager, { firstName: "Dana", lastName: "Reyes", email: "dana.r@example.com", phone: "+63 918 555 0004" });
    const results = await Promise.allSettled([leads.convertLead(f.ctx.manager, lead!.id), leads.convertLead(f.ctx.manager, lead!.id), leads.convertLead(f.ctx.manager, lead!.id)]);
    const ok = results.filter((r) => r.status === "fulfilled") as PromiseFulfilledResult<Awaited<ReturnType<typeof leads.convertLead>>>[];
    expect(ok.length).toBeGreaterThan(0);
    expect(new Set(ok.map((r) => r.value!.customerId)).size).toBe(1);
    const rows = await getDb().select().from(customersTable).where(eq(customersTable.convertedFromLeadId, lead!.id));
    expect(rows).toHaveLength(1);
    const detail = await leads.getLead(f.ctx.manager, lead!.id);
    expect(detail.lead.stage).toBe("converted");
    expect(detail.timeline.some((t) => t.activity.type === "conversion")).toBe(true);
    await expect(leads.changeLeadStage(f.ctx.manager, lead!.id, "contacted")).rejects.toThrow(/converted/i);
  });

  it("can link a lead to an existing customer and suggests duplicates", async () => {
    const existing = await customers.createCustomer(f.ctx.owner, { firstName: "Marco", lastName: "Uy", email: "marco.uy@example.com" });
    const lead = await leads.createLead(f.ctx.manager, { firstName: "Marco", lastName: "Uy", email: "marco.uy@example.com" });
    const dupes = await leads.duplicateCandidates(f.ctx.manager, lead!.id);
    expect(dupes.map((d) => d.id)).toContain(existing!.id);
    const res = await leads.convertLead(f.ctx.manager, lead!.id, { customerId: existing!.id });
    expect(res).toMatchObject({ customerId: existing!.id, created: false });
  });

  it("captures website inquiries, de-duplicating repeat submissions", async () => {
    const a = await leads.capturePublicLead(f.businessId, { fullName: "Web Visitor", email: "web@example.com", interest: "contact_lenses", message: "First" });
    const b = await leads.capturePublicLead(f.businessId, { fullName: "Web Visitor", email: "WEB@example.com", interest: "contact_lenses", message: "Second" });
    expect(a!.leadId).toBe(b!.leadId);
    const detail = await leads.getLead(f.ctx.manager, a!.leadId!);
    expect(detail.timeline.filter((t) => t.activity.type === "inquiry")).toHaveLength(1);
    // Honeypot submissions are silently dropped.
    const spam = await leads.capturePublicLead(f.businessId, { fullName: "Bot", email: "bot@example.com", website: "http://spam" });
    expect(spam!.leadId).toBeNull();
    await expect(leads.capturePublicLead(f.businessId, { fullName: "No Contact" })).rejects.toThrow();
  });
});

describe("appointments", () => {
  const monday = futureDay(1);

  it("books within business hours and blocks practitioner double-booking", async () => {
    const c = await customer(f);
    const a = await appointments.createAppointment(f.ctx.sales, {
      branchId: f.main.id,
      appointmentTypeId: f.examTypeId,
      customerId: c.id,
      practitionerMembershipId: f.membership.practitioner,
      date: monday,
      time: "10:00",
    });
    expect(a!.status).toBe("scheduled");
    await expect(
      appointments.createAppointment(f.ctx.sales, { branchId: f.main.id, appointmentTypeId: f.examTypeId, customerId: c.id, practitionerMembershipId: f.membership.practitioner, date: monday, time: "10:30" }),
    ).rejects.toThrow(/already has an appointment/i);
    // Back-to-back is fine (45-minute exam ends 10:45).
    await appointments.createAppointment(f.ctx.sales, { branchId: f.main.id, appointmentTypeId: f.examTypeId, customerId: c.id, practitionerMembershipId: f.membership.practitioner, date: monday, time: "10:45" });
    // Outside hours and closed days are rejected.
    await expect(
      appointments.createAppointment(f.ctx.sales, { branchId: f.main.id, appointmentTypeId: f.examTypeId, customerId: c.id, practitionerMembershipId: f.membership.practitioner, date: monday, time: "17:30" }),
    ).rejects.toThrow(/opening hours/i);
    await expect(
      appointments.createAppointment(f.ctx.sales, { branchId: f.main.id, appointmentTypeId: f.examTypeId, customerId: c.id, practitionerMembershipId: f.membership.practitioner, date: futureDay(0), time: "10:00" }),
    ).rejects.toThrow(/closed/i);
    // Exams need a practitioner; consultations can run concurrently without one.
    await expect(appointments.createAppointment(f.ctx.sales, { branchId: f.main.id, appointmentTypeId: f.examTypeId, customerId: c.id, date: monday, time: "13:00" })).rejects.toThrow(/practitioner/i);
    await appointments.createAppointment(f.ctx.sales, { branchId: f.main.id, appointmentTypeId: f.consultTypeId, guestName: "Walk in", date: monday, time: "13:00" });
    await appointments.createAppointment(f.ctx.sales, { branchId: f.main.id, appointmentTypeId: f.consultTypeId, guestName: "Walk in 2", date: monday, time: "13:00" });
  });

  it("the database prevents concurrent double-booking", async () => {
    const c = await customer(f);
    const tuesday = futureDay(2);
    const book = () =>
      appointments.createAppointment(f.ctx.sales, { branchId: f.main.id, appointmentTypeId: f.examTypeId, customerId: c.id, practitionerMembershipId: f.membership.practitioner, date: tuesday, time: "14:00" });
    const results = await Promise.allSettled([book(), book(), book()]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
  });

  it("stores times in UTC from the business time zone (Asia/Manila, UTC+8)", async () => {
    const c = await customer(f);
    const wed = futureDay(3);
    const a = await appointments.createAppointment(f.ctx.sales, { branchId: f.main.id, appointmentTypeId: f.consultTypeId, customerId: c.id, date: wed, time: "09:00" });
    expect(a!.startsAt.toISOString()).toBe(`${wed}T01:00:00.000Z`);
  });

  it("reschedules, cancels with a reason, and records history; practitioners only manage their own", async () => {
    const c = await customer(f);
    const thu = futureDay(4);
    const a = await appointments.createAppointment(f.ctx.sales, { branchId: f.main.id, appointmentTypeId: f.examTypeId, customerId: c.id, practitionerMembershipId: f.membership.practitioner, date: thu, time: "09:00" });
    await appointments.setAppointmentStatus(f.ctx.practitioner, a!.id, "confirmed");
    const moved = await appointments.updateAppointment(f.ctx.sales, a!.id, { branchId: f.main.id, appointmentTypeId: f.examTypeId, customerId: c.id, practitionerMembershipId: f.membership.practitioner, date: thu, time: "11:00" });
    expect(moved!.status).toBe("scheduled");
    await expect(appointments.setAppointmentStatus(f.ctx.sales, a!.id, "cancelled")).rejects.toThrow(/reason/i);
    await appointments.setAppointmentStatus(f.ctx.sales, a!.id, "cancelled", "Customer request");
    const detail = await appointments.getAppointment(f.ctx.owner, a!.id);
    expect(detail.history.map((h) => h.action)).toEqual(expect.arrayContaining(["appointment.created", "appointment.rescheduled", "appointment.status_changed"]));
    // Cancelled slot is free again.
    await appointments.createAppointment(f.ctx.sales, { branchId: f.main.id, appointmentTypeId: f.examTypeId, customerId: c.id, practitionerMembershipId: f.membership.practitioner, date: thu, time: "11:00" });
  });

  it("books a lead's appointment, moving the lead to Appointment scheduled", async () => {
    const lead = await leads.createLead(f.ctx.manager, { firstName: "Lead", lastName: "Booker", phone: "+63 918 555 0099" });
    await appointments.createAppointment(f.ctx.sales, { branchId: f.main.id, appointmentTypeId: f.consultTypeId, leadId: lead!.id, date: futureDay(5), time: "15:00" });
    expect((await leads.getLead(f.ctx.manager, lead!.id)).lead.stage).toBe("appointment_scheduled");
  });

  it("respects a chosen practitioner's bookings even for types that don't require one", async () => {
    const thu = futureDay(4, 3);
    const c = await customer(f, "Optional Staff");
    await appointments.createAppointment(f.ctx.sales, { branchId: f.main.id, appointmentTypeId: f.examTypeId, customerId: c.id, practitionerMembershipId: f.membership.practitioner, date: thu, time: "10:00" });
    // Without a preference the consult can run at 10:00 (another staff member can take it)…
    const any = await appointments.availableSlots(f.businessId, { branchId: f.main.id, appointmentTypeId: f.consultTypeId, date: thu });
    expect(any.some((s) => s.time === "10:00")).toBe(true);
    // …but not with the practitioner who is already busy then.
    const withP = await appointments.availableSlots(f.businessId, { branchId: f.main.id, appointmentTypeId: f.consultTypeId, date: thu, practitionerId: f.membership.practitioner });
    expect(withP.some((s) => s.time === "10:00")).toBe(false);
    expect(withP.some((s) => s.time === "11:00")).toBe(true);
    await expect(
      appointments.createAppointment(f.ctx.sales, { branchId: f.main.id, appointmentTypeId: f.consultTypeId, customerId: c.id, practitionerMembershipId: f.membership.practitioner, date: thu, time: "10:00" }),
    ).rejects.toThrow(/already has an appointment/i);
  });

  it("offers only free slots and books public requests against them", async () => {
    const fri = futureDay(5, 2);
    const slots = await appointments.availableSlots(f.businessId, { branchId: f.main.id, appointmentTypeId: f.examTypeId, date: fri });
    expect(slots[0].time).toBe("09:00");
    const res = await appointments.requestPublicAppointment(f.businessId, { fullName: "Public Person", phone: "+63 918 777 0000", branchId: f.main.id, appointmentTypeId: f.examTypeId, date: fri, time: "09:00" });
    expect(res!.appointmentId).toBeTruthy();
    const after = await appointments.availableSlots(f.businessId, { branchId: f.main.id, appointmentTypeId: f.examTypeId, date: fri });
    expect(after.some((s) => s.time === "09:00" || s.time === "09:30")).toBe(false);
    await expect(
      appointments.requestPublicAppointment(f.businessId, { fullName: "Second", phone: "+63 918 777 0001", branchId: f.main.id, appointmentTypeId: f.examTypeId, date: fri, time: "09:00" }),
    ).rejects.toThrow(/taken/i);
  });
});
