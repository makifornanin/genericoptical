import { and, eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { getDb } from "@/server/db";
import { ghlOpportunities, integrationConnections, leadActivities, leads } from "@/server/db/schema";
import { ensureOpticalPipelines, pollLeadOpportunities, probeGhlAccess, processGhl } from "@/server/integrations/ghl";
import { parseSettings } from "@/server/integrations/ghl/config";
import * as leadsSvc from "@/server/services/leads";
import * as sales from "@/server/services/sales";
import { createBusiness, customer, key, stockProduct, type Fixture } from "./fixtures";
import { connect, events, fakeFor } from "./ghl-helpers";
import type { FakeGhl } from "./ghl-fake";

/*
 * Phase 5 GoHighLevel behaviour against the in-memory simulator (tests/db/ghl-fake.ts). This proves the
 * dashboard's logic, not the live API — live checks are recorded separately in docs/PHASE5_STATUS.md.
 */

let f: Fixture;
let fake: FakeGhl;
beforeEach(async () => {
  f = await createBusiness(`P5${Math.random().toString(36).slice(2, 6)}`);
  fake = fakeFor("p5");
  fake.pipelines.push({ id: "pl_existing", name: "Panapa Bacoor — Patient Journey", stages: [{ id: "st_x", name: "Booked", position: 0 }] });
  await connect(f, fake);
});

async function settings() {
  const [row] = await getDb().select({ settings: integrationConnections.settings }).from(integrationConnections).where(eq(integrationConnections.businessId, f.businessId));
  return parseSettings(row.settings);
}
const stageNamed = (pipelineId: string, name: string) => fake.pipelines.find((p) => p.id === pipelineId)!.stages.find((s) => s.name === name)!.id;

describe("Optical pipelines", () => {
  it("creates both pipelines once, maps every stage, and never touches other pipelines", async () => {
    const first = await ensureOpticalPipelines(f.ctx.owner);
    expect(first.lead).toMatchObject({ name: "Optical — Lead Management", created: true, missingStages: [] });
    expect(first.sales).toMatchObject({ name: "Optical — Sales & Orders", created: true, missingStages: [] });
    expect(first.lead.stages.map((s) => s.name)).toEqual(["New Lead", "Contacted", "Qualified", "Appointment Scheduled", "Follow-Up", "Converted"]);
    expect(first.sales.stages.map((s) => s.name)).toEqual(["New Order", "Payment Pending", "Processing", "Ready for Pickup", "Completed"]);
    const s = await settings();
    expect(s.leadPipelineId).toBe(first.lead.id);
    expect(s.leadStageMap.appointment_scheduled).toBe(stageNamed(first.lead.id, "Appointment Scheduled"));
    expect(s.salesPipelineId).toBe(first.sales.id);
    expect(s.stageMap).toMatchObject({ orderOpen: stageNamed(first.sales.id, "New Order"), paymentPending: stageNamed(first.sales.id, "Payment Pending"), posCompleted: stageNamed(first.sales.id, "Completed") });

    const again = await ensureOpticalPipelines(f.ctx.owner);
    expect(again.lead).toMatchObject({ id: first.lead.id, created: false });
    expect(again.sales).toMatchObject({ id: first.sales.id, created: false });
    expect(fake.pipelines).toHaveLength(3); // existing + 2, no duplicates
    expect(fake.pipelines[0]).toEqual({ id: "pl_existing", name: "Panapa Bacoor — Patient Journey", stages: [{ id: "st_x", name: "Booked", position: 0 }] });
    expect(fake.callsTo("PUT /opportunities/pipelines")).toHaveLength(0);
    expect(fake.callsTo("DELETE")).toHaveLength(0);
  });

  it("reuses a pipeline whose name differs only by dash or case, and reports missing stages instead of editing it", async () => {
    fake.pipelines.push({ id: "pl_lead", name: "optical - lead management", stages: [{ id: "a", name: "New Lead", position: 0 }, { id: "b", name: "Contacted", position: 1 }] });
    const res = await ensureOpticalPipelines(f.ctx.owner);
    expect(res.lead).toMatchObject({ id: "pl_lead", created: false, missingStages: ["Qualified", "Appointment Scheduled", "Follow-Up", "Converted"] });
    expect((await settings()).leadStageMap).toMatchObject({ new: "a", contacted: "b", qualified: null });
    expect(fake.pipelines.find((p) => p.id === "pl_lead")!.stages).toHaveLength(2);
  });

  it("falls back to string stages if GHL rejects stage objects", async () => {
    fake.pipelineStageFormat = "strings";
    const res = await ensureOpticalPipelines(f.ctx.owner);
    expect(res.lead.created && res.sales.created).toBe(true);
    expect(fake.pipelines).toHaveLength(3);
  });

  it("is limited to people who manage integrations", async () => {
    await expect(ensureOpticalPipelines(f.ctx.sales)).rejects.toThrow();
  });
});

describe("lead opportunities", () => {
  beforeEach(async () => {
    await ensureOpticalPipelines(f.ctx.owner);
  });

  it("creates one contact and one opportunity per lead, follows dashboard stage changes and never duplicates on retries", async () => {
    const lead = await leadsSvc.createLead(f.ctx.owner, { firstName: "Mara", lastName: "Lim", email: "mara.p5@example.com", source: "website", interest: "frames" });
    await processGhl(f.businessId);
    const s = await settings();
    const [mirror] = await getDb().select().from(ghlOpportunities).where(and(eq(ghlOpportunities.businessId, f.businessId), eq(ghlOpportunities.ownerLeadId, lead!.id)));
    const opp = fake.opportunities.get(mirror.ghlOpportunityId)!;
    expect(opp).toMatchObject({ pipelineId: s.leadPipelineId, pipelineStageId: s.leadStageMap.new, status: "open", source: "Website" });
    expect(String(opp.name)).toContain("Mara Lim · Frames only");

    await leadsSvc.changeLeadStage(f.ctx.owner, lead!.id, "qualified");
    await processGhl(f.businessId);
    expect(fake.opportunities.get(mirror.ghlOpportunityId)).toMatchObject({ pipelineStageId: s.leadStageMap.qualified, status: "open" });

    // A replayed / retried event doesn't create a second opportunity.
    await leadsSvc.updateLead(f.ctx.owner, lead!.id, { firstName: "Mara", lastName: "Lim", email: "mara.p5@example.com", source: "website", interest: "frames", message: "retry" }).catch(() => undefined);
    await processGhl(f.businessId);
    expect([...fake.opportunities.values()].filter((o) => o.contactId === opp.contactId)).toHaveLength(1);
    expect(fake.calls.filter((x) => x.method === "POST" && x.path === "/opportunities/")).toHaveLength(1);

    await leadsSvc.changeLeadStage(f.ctx.owner, lead!.id, "lost", "Chose another shop");
    await processGhl(f.businessId);
    expect(fake.opportunities.get(mirror.ghlOpportunityId)).toMatchObject({ status: "lost" });
  });

  it("applies a stage moved in GHL to the lead (polling), without echoing it back", async () => {
    const lead = await leadsSvc.createLead(f.ctx.owner, { firstName: "Ana", lastName: "Cruz", email: "ana.p5@example.com", source: "walk_in" });
    await processGhl(f.businessId);
    const s = await settings();
    const [mirror] = await getDb().select().from(ghlOpportunities).where(eq(ghlOpportunities.ownerLeadId, lead!.id));
    // Someone moves the opportunity in GHL.
    Object.assign(fake.opportunities.get(mirror.ghlOpportunityId)!, { pipelineStageId: s.leadStageMap.appointment_scheduled, updatedAt: new Date(Date.now() + 5000).toISOString() });
    const putsBefore = fake.callsTo("PUT /opportunities/").length;
    expect(await pollLeadOpportunities(f.businessId)).toEqual({ checked: 1, applied: 1 });
    const [row] = await getDb().select({ stage: leads.stage }).from(leads).where(eq(leads.id, lead!.id));
    expect(row.stage).toBe("appointment_scheduled");
    const acts = await getDb().select().from(leadActivities).where(eq(leadActivities.leadId, lead!.id));
    expect(acts.some((a) => a.type === "stage_change" && a.body === "Moved in GoHighLevel")).toBe(true);
    // A later dashboard sync of the same lead doesn't push the stage back.
    await leadsSvc.updateLead(f.ctx.owner, lead!.id, { firstName: "Ana", lastName: "Cruz", email: "ana.p5@example.com", source: "walk_in", message: "note" }).catch(() => undefined);
    await processGhl(f.businessId);
    expect(fake.callsTo("PUT /opportunities/").filter((c) => (c.body as { pipelineStageId?: string })?.pipelineStageId).length).toBe(putsBefore);
    // "Won" in GHL never converts a lead by itself.
    Object.assign(fake.opportunities.get(mirror.ghlOpportunityId)!, { status: "won", updatedAt: new Date(Date.now() + 10000).toISOString() });
    await pollLeadOpportunities(f.businessId);
    expect((await getDb().select({ stage: leads.stage }).from(leads).where(eq(leads.id, lead!.id)))[0].stage).toBe("appointment_scheduled");
  });
});

describe("sales pipeline stages", () => {
  beforeEach(async () => {
    await ensureOpticalPipelines(f.ctx.owner);
  });

  it("puts a POS sale with a balance in Payment Pending, then Completed/won when paid; never a GHL payment", async () => {
    const s = await settings();
    const frame = await stockProduct(f, { price: 1000, qty: 3 });
    const c = await customer(f, "Sale Person");
    const res = await sales.checkout(f.ctx.sales, { branchId: f.main.id, customerId: c.id, items: [{ variantId: frame.variantId, quantity: 1 }], payments: [{ method: "cash", amountCents: 40000 }], idempotencyKey: key() });
    await processGhl(f.businessId);
    const [mirror] = await getDb().select().from(ghlOpportunities).where(eq(ghlOpportunities.saleId, res.saleId));
    expect(fake.opportunities.get(mirror.ghlOpportunityId)).toMatchObject({ pipelineId: s.salesPipelineId, pipelineStageId: s.stageMap.paymentPending, status: "open", monetaryValue: 1000 });
    expect(fake.notes.at(-1)?.body).toMatch(/not processed by GoHighLevel Payments/);

    await sales.recordPayment(f.ctx.sales, { saleId: res.saleId, method: "gcash", amountCents: 60000, reference: "GC-P5", idempotencyKey: key() });
    await processGhl(f.businessId);
    expect(fake.opportunities.get(mirror.ghlOpportunityId)).toMatchObject({ pipelineStageId: s.stageMap.posCompleted, status: "won" });
    expect(fake.calls.filter((x) => x.method === "POST" && x.path === "/opportunities/")).toHaveLength(1);
    expect(fake.calls.some((x) => x.path.startsWith("/payments") && x.method !== "GET")).toBe(false);
  });

  it("keeps the local sale and retries when GHL is down", async () => {
    const frame = await stockProduct(f, { price: 500, qty: 2 });
    const c = await customer(f, "Outage Person");
    fake.fail(() => true, 503, { times: 50 });
    const res = await sales.checkout(f.ctx.sales, { branchId: f.main.id, customerId: c.id, items: [{ variantId: frame.variantId, quantity: 1 }], payments: [{ method: "cash", amountCents: 50000 }], idempotencyKey: key() });
    await processGhl(f.businessId);
    expect((await sales.getSale(f.ctx.owner, res.saleId)).sale.status).toBe("completed");
    const sync = (await events(f.businessId, "sale.sync")).find((e) => e.entityId === res.saleId);
    expect(["retry_scheduled", "pending"]).toContain(sync?.status);
  });
});

describe("access check", () => {
  it("reports read access per area and names a missing scope", async () => {
    fake.fail((c) => c.path === "/products/inventory", 403, { times: 1, body: { message: "The token is not authorized for this scope." } });
    const res = await probeGhlAccess(f.ctx.owner);
    const byKey = Object.fromEntries(res.checks.map((c) => [c.key, c]));
    expect(byKey.location.ok).toBe(true);
    expect(byKey.pipelines).toMatchObject({ ok: true });
    expect(byKey.pipelines.detail).toContain("Panapa Bacoor");
    expect(byKey.inventory).toMatchObject({ ok: false, detail: expect.stringMatching(/missing this scope/) });
    expect(fake.calls.every((c) => c.method === "GET")).toBe(true);
  });
});
