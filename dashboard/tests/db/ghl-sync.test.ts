import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { resolveRange } from "@/lib/dates";
import { getDb } from "@/server/db";
import {
  appointments,
  customers as customersTable,
  ghlCalendars,
  ghlContacts,
  ghlOpportunities,
  ghlProductLinks,
  inventoryBalances,
  integrationMismatches,
  integrationSyncEvents,
  leads,
  payments,
  refunds,
  sales as salesTable,
  stockMovements,
} from "@/server/db/schema";
import { changeOpportunity, handleMarketplaceWebhook, mapCalendar, pipelineSummary, processGhl, reconcileAll, resolveMismatch } from "@/server/integrations/ghl";
import { setGhlFetch } from "@/server/integrations/ghl/connection";
import * as appts from "@/server/services/appointments";
import * as leadsSvc from "@/server/services/leads";
import * as reports from "@/server/services/reports";
import * as sales from "@/server/services/sales";
import { createBusiness, customer, futureDay, key, stockProduct, type Fixture } from "./fixtures";
import type { FakeGhl } from "./ghl-fake";
import { connect, events, fakeFor, signedHeaders, webhookBody } from "./ghl-helpers";

const ALL_ON = { contacts: true, opportunities: true, appointments: true, products: true, inventory: true, sales: true, orders: true };

let f: Fixture;
let fake: FakeGhl;
beforeEach(async () => {
  f = await createBusiness("S");
  fake = fakeFor("S");
  fake.pipelines = [{ id: "pl_sales", name: "Sales", stages: [{ id: "st_new", name: "New", position: 0 }, { id: "st_won", name: "Purchased", position: 1 }, { id: "st_manual", name: "Follow-up", position: 2 }] }];
  fake.calendars = [{ id: "cal_exam", name: "Main — Eye exam", isActive: true }];
});
afterEach(() => setGhlFetch(null));

async function deliver(type: string, data: Record<string, unknown>) {
  const body = webhookBody(type, fake.locationId, data);
  return handleMarketplaceWebhook(body, signedHeaders(body));
}

const stockAt = async (variantId: string, locationId: string) => {
  const [b] = await getDb().select().from(inventoryBalances).where(and(eq(inventoryBalances.variantId, variantId), eq(inventoryBalances.locationId, locationId)));
  return b ? b.onHand - b.reserved : 0;
};

describe("contacts and leads", () => {
  it("pushes a dashboard lead as a contact with a stage tag, and moves the tag when the stage changes", async () => {
    await connect(f, fake);
    const lead = await leadsSvc.createLead(f.ctx.owner, { firstName: "Mara", lastName: "Lim", email: "mara@example.com", source: "walk_in" });
    await processGhl(f.businessId);
    const [mirror] = await getDb().select().from(ghlContacts).where(eq(ghlContacts.leadId, lead!.id));
    const contact = fake.contacts.get(mirror.ghlContactId)!;
    expect(contact).toMatchObject({ firstName: "Mara", email: "mara@example.com" });
    expect(contact.tags).toContain("specta-stage-new");
    await leadsSvc.changeLeadStage(f.ctx.owner, lead!.id, "qualified");
    await processGhl(f.businessId);
    expect(fake.contacts.get(mirror.ghlContactId)!.tags).toEqual(["specta-stage-qualified"]);
  });

  it("links to an existing GHL contact found by email instead of creating a duplicate", async () => {
    await connect(f, fake);
    fake.contacts.set("ct_existing", { id: "ct_existing", firstName: "Ana", email: "ana@example.com", tags: [] });
    const lead = await leadsSvc.createLead(f.ctx.owner, { firstName: "Ana", lastName: "Cruz", email: "ANA@example.com", source: "walk_in" });
    await processGhl(f.businessId);
    expect(fake.calls.filter((c) => c.method === "POST" && c.path === "/contacts/")).toHaveLength(0);
    const [row] = await getDb().select().from(leads).where(eq(leads.id, lead!.id));
    expect(row.externalGhlContactId).toBe("ct_existing");
  });

  it("holds the sync for review when one GHL contact matches two different dashboard customers", async () => {
    await connect(f, fake);
    // Customer 1 syncs first and owns the GHL contact for same@example.com.
    const c1 = await customer(f, "Dup One");
    await getDb().update(customersTable).set({ email: "same@example.com" }).where(eq(customersTable.id, c1.id));
    await processGhl(f.businessId);
    // Customer 2 — a duplicate person entered separately — has the same email and no mapping yet.
    const c2 = await customer(f, "Dup Two");
    await getDb().update(customersTable).set({ email: "same@example.com" }).where(eq(customersTable.id, c2.id));
    await processGhl(f.businessId);
    const review = (await events(f.businessId, "customer.upsert")).filter((e) => e.status === "needs_review");
    expect(review).toHaveLength(1);
    expect(review[0].lastError).toMatch(/possible duplicate person/);
  });

  it("creates a GHL-owned lead from a GHL form contact, ignores out-of-order updates, and never overwrites a customer", async () => {
    await connect(f, fake);
    const t0 = new Date(Date.now() - 60_000).toISOString();
    const t1 = new Date().toISOString();
    expect((await deliver("ContactCreate", { id: "ct_form", firstName: "Iris", lastName: "Tan", email: "iris@example.com", phone: "+63 917 555 0101", source: "Website form", tags: ["website"], dateUpdated: t0 })).body.status).toBe("accepted");
    let [lead] = await getDb().select().from(leads).where(eq(leads.externalGhlContactId, "ct_form"));
    expect(lead).toMatchObject({ source: "gohighlevel", firstName: "Iris", stage: "new" });
    await deliver("ContactUpdate", { id: "ct_form", firstName: "Iris", lastName: "Tan-Reyes", email: "iris@example.com", dateUpdated: t1 });
    await deliver("ContactUpdate", { id: "ct_form", firstName: "STALE", lastName: "OLD", email: "iris@example.com", dateUpdated: t0 });
    [lead] = await getDb().select().from(leads).where(eq(leads.id, lead.id));
    expect(lead.lastName).toBe("Tan-Reyes");

    // A customer's identity is dashboard-owned: GHL edits don't change it.
    const c = await customer(f, "Owned Cust");
    await getDb().insert(ghlContacts).values({ businessId: f.businessId, ghlContactId: "ct_owned", customerId: c.id, ghlUpdatedAt: new Date(Date.now() - 120_000) });
    await deliver("ContactUpdate", { id: "ct_owned", firstName: "Changed", lastName: "InGhl", dateUpdated: new Date().toISOString() });
    const [cust] = await getDb().select().from(customersTable).where(eq(customersTable.id, c.id));
    expect(cust.firstName).toBe("Owned");
  });

  it("keeps the dashboard lead when the GHL contact is deleted", async () => {
    await connect(f, fake);
    await deliver("ContactCreate", { id: "ct_gone", firstName: "Gone", email: "gone@example.com", dateUpdated: new Date().toISOString() });
    await deliver("ContactDelete", { id: "ct_gone" });
    const [mirror] = await getDb().select().from(ghlContacts).where(eq(ghlContacts.ghlContactId, "ct_gone"));
    expect(mirror.deletedAt).toBeTruthy();
    expect(await getDb().select().from(leads).where(eq(leads.externalGhlContactId, "ct_gone"))).toHaveLength(1);
  });
});

describe("opportunities and POS sales", () => {
  it("mirrors GHL opportunities and keeps pipeline value separate from revenue", async () => {
    await connect(f, fake);
    fake.contacts.set("ct_o", { id: "ct_o", firstName: "Opp", email: "opp@example.com", dateUpdated: new Date().toISOString() });
    fake.opportunities.set("op_1", { id: "op_1", name: "Progressive lenses", status: "won", monetaryValue: 12500, pipelineId: "pl_sales", pipelineStageId: "st_won", contactId: "ct_o", updatedAt: new Date().toISOString() });
    await deliver("OpportunityStatusUpdate", { id: "op_1", status: "won" });
    const [mirror] = await getDb().select().from(ghlOpportunities).where(eq(ghlOpportunities.ghlOpportunityId, "op_1"));
    expect(mirror).toMatchObject({ status: "won", monetaryValueCents: 1_250_000, pipelineStageId: "st_won" });
    expect((await pipelineSummary(f.businessId)).won.valueCents).toBe(1_250_000);
    const range = resolveRange("today", "Asia/Manila");
    const fin = await reports.financials(f.ctx.owner, range.from, range.to, range.fromDay, range.toDay);
    expect(fin.netSalesCents).toBe(0); // a won opportunity is not revenue
  });

  it("refuses a dashboard change when GHL has a newer version, then applies it once refreshed", async () => {
    await connect(f, fake);
    fake.opportunities.set("op_2", { id: "op_2", name: "Frames", status: "open", monetaryValue: 3000, pipelineId: "pl_sales", pipelineStageId: "st_new", updatedAt: new Date(Date.now() - 60_000).toISOString() });
    await deliver("OpportunityCreate", { id: "op_2" });
    const [mirror] = await getDb().select().from(ghlOpportunities).where(eq(ghlOpportunities.ghlOpportunityId, "op_2"));
    fake.opportunities.get("op_2")!.updatedAt = new Date().toISOString(); // edited in GHL meanwhile
    fake.opportunities.get("op_2")!.pipelineStageId = "st_manual";
    await expect(changeOpportunity(f.ctx.owner, mirror.id, { stageId: "st_won" })).rejects.toThrow(/changed in GoHighLevel/);
    expect(fake.callsTo("PUT /opportunities/")).toHaveLength(0);
    const updated = await changeOpportunity(f.ctx.owner, mirror.id, { stageId: "st_won" });
    expect(updated.pipelineStageId).toBe("st_won");
    expect(fake.opportunities.get("op_2")!.pipelineStageId).toBe("st_won");
  });

  it("turns a POS sale into one won opportunity with a contact note; the payment stays a dashboard record", async () => {
    await connect(f, fake, { salesPipelineId: "pl_sales", stageMap: { posCompleted: "st_won", orderOpen: null, orderReady: null, orderCompleted: null, paymentPending: null, processing: null } });
    const c = await customer(f, "Pos Buyer");
    await getDb().update(customersTable).set({ email: "pos@example.com" }).where(eq(customersTable.id, c.id));
    const p = await stockProduct(f, { price: 1500, qty: 5 });
    const sale = await sales.checkout(f.ctx.sales, { branchId: f.main.id, customerId: c.id, items: [{ variantId: p.variantId, quantity: 2 }], payments: [{ method: "cash", amountCents: 300_000 }], idempotencyKey: key() });
    await processGhl(f.businessId);
    const [opp] = await getDb().select().from(ghlOpportunities).where(eq(ghlOpportunities.saleId, sale!.saleId));
    expect(opp).toMatchObject({ status: "won", monetaryValueCents: 300_000, pipelineId: "pl_sales", pipelineStageId: "st_won" });
    expect(fake.opportunities.get(opp.ghlOpportunityId)).toMatchObject({ monetaryValue: 3000, status: "won" });
    expect(fake.notes.at(-1)!.body).toMatch(/not processed by GoHighLevel Payments/);
    expect(fake.callsTo("POST /payments")).toHaveLength(0); // never fabricates GHL payments

    // A partial refund lowers the value; retries don't duplicate the opportunity.
    await sales.refundSale(f.ctx.manager, { saleId: sale!.saleId, items: [], amountCents: 50_000, method: "cash", reason: "Goodwill", idempotencyKey: key() });
    await processGhl(f.businessId);
    expect(fake.opportunities.get(opp.ghlOpportunityId)!.monetaryValue).toBe(2500);
    expect(fake.opportunities.size).toBe(1);
  });

  it("respects a stage moved by hand in GHL unless the sale's own stage changes", async () => {
    await connect(f, fake, { salesPipelineId: "pl_sales", stageMap: { posCompleted: "st_won", orderOpen: null, orderReady: null, orderCompleted: null, paymentPending: null, processing: null } });
    const c = await customer(f, "Stage Keeper");
    await getDb().update(customersTable).set({ email: "keeper@example.com" }).where(eq(customersTable.id, c.id));
    const p = await stockProduct(f, { price: 1000, qty: 5 });
    const sale = await sales.checkout(f.ctx.sales, { branchId: f.main.id, customerId: c.id, items: [{ variantId: p.variantId, quantity: 1 }], payments: [{ method: "cash", amountCents: 100_000 }], idempotencyKey: key() });
    await processGhl(f.businessId);
    const [opp] = await getDb().select().from(ghlOpportunities).where(eq(ghlOpportunities.saleId, sale!.saleId));
    fake.opportunities.get(opp.ghlOpportunityId)!.pipelineStageId = "st_manual"; // a person moved it in GHL
    await sales.refundSale(f.ctx.manager, { saleId: sale!.saleId, items: [], amountCents: 10_000, method: "cash", reason: "Adj", idempotencyKey: key() });
    await processGhl(f.businessId);
    expect(fake.opportunities.get(opp.ghlOpportunityId)).toMatchObject({ pipelineStageId: "st_manual", monetaryValue: 900 });
  });

  it("asks for a pipeline before syncing sales and skips walk-ins without a customer", async () => {
    await connect(f, fake);
    const p = await stockProduct(f, { price: 500, qty: 5 });
    const walkIn = await sales.checkout(f.ctx.sales, { branchId: f.main.id, customerId: null, items: [{ variantId: p.variantId, quantity: 1 }], payments: [{ method: "cash", amountCents: 50_000 }], idempotencyKey: key() });
    const c = await customer(f, "No Pipeline");
    await getDb().update(customersTable).set({ email: "nopipe@example.com" }).where(eq(customersTable.id, c.id));
    const withCust = await sales.checkout(f.ctx.sales, { branchId: f.main.id, customerId: c.id, items: [{ variantId: p.variantId, quantity: 1 }], payments: [{ method: "cash", amountCents: 50_000 }], idempotencyKey: key() });
    await processGhl(f.businessId);
    const evs = await events(f.businessId, "sale.sync");
    expect(evs.find((e) => e.entityId === walkIn!.saleId)!.status).toBe("skipped");
    expect(evs.find((e) => e.entityId === withCust!.saleId)).toMatchObject({ status: "needs_review", lastError: expect.stringMatching(/sales pipeline/) });
  });
});

describe("products and inventory (dashboard is the source of truth)", () => {
  it("publishes product + price, then sends the new absolute quantity after a POS sale", async () => {
    await connect(f, fake, { sync: ALL_ON, inventoryLocationId: f.main.locationId });
    const p = await stockProduct(f, { price: 2950, qty: 20, name: "Arden 101" });
    await processGhl(f.businessId);
    const [link] = await getDb().select().from(ghlProductLinks).where(eq(ghlProductLinks.variantId, p.variantId));
    const price = fake.prices.get(link.ghlPriceId!)!;
    expect(price).toMatchObject({ amount: 2950, currency: "PHP", sku: p.sku.toUpperCase(), trackInventory: true, availableQuantity: 20 });
    expect(fake.products.get(link.ghlProductId!)).toMatchObject({ name: "Arden 101", productType: "PHYSICAL" });

    await sales.checkout(f.ctx.sales, { branchId: f.main.id, customerId: null, items: [{ variantId: p.variantId, quantity: 2 }], payments: [{ method: "cash", amountCents: 590_000 }], idempotencyKey: key() });
    expect(await stockAt(p.variantId, f.main.locationId)).toBe(18);
    await processGhl(f.businessId);
    expect(fake.prices.get(link.ghlPriceId!)!.availableQuantity).toBe(18);
    const call = fake.callsTo("POST /products/inventory").at(-1)!;
    expect(call.body).toMatchObject({ altId: fake.locationId, altType: "location", items: [{ priceId: link.ghlPriceId, availableQuantity: 18 }] });
  });

  it("keeps the local stock change when GHL is down, retries, and never pushes a stale value", async () => {
    await connect(f, fake, { sync: ALL_ON, inventoryLocationId: f.main.locationId });
    const p = await stockProduct(f, { price: 1000, qty: 20 });
    await processGhl(f.businessId);
    const [link] = await getDb().select().from(ghlProductLinks).where(eq(ghlProductLinks.variantId, p.variantId));
    fake.fail("POST /products/inventory", 503, { times: 1 });
    await sales.checkout(f.ctx.sales, { branchId: f.main.id, customerId: null, items: [{ variantId: p.variantId, quantity: 2 }], payments: [{ method: "cash", amountCents: 200_000 }], idempotencyKey: key() });
    await processGhl(f.businessId);
    expect(await stockAt(p.variantId, f.main.locationId)).toBe(18);
    const pushes = (await events(f.businessId, "inventory.push")).filter((e) => e.entityId === p.variantId).sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
    const ev = pushes.at(-1)!;
    expect(ev.status).toBe("retry_scheduled");
    // Another sale while GHL is down: still one pending event; the retry sends the CURRENT value (17).
    await sales.checkout(f.ctx.sales, { branchId: f.main.id, customerId: null, items: [{ variantId: p.variantId, quantity: 1 }], payments: [{ method: "cash", amountCents: 100_000 }], idempotencyKey: key() });
    expect((await events(f.businessId, "inventory.push")).filter((e) => e.entityId === p.variantId && ["pending", "retry_scheduled"].includes(e.status))).toHaveLength(1);
    await getDb().update(integrationSyncEvents).set({ nextAttemptAt: new Date() }).where(eq(integrationSyncEvents.id, ev.id));
    await processGhl(f.businessId);
    expect(fake.prices.get(link.ghlPriceId!)!.availableQuantity).toBe(17);
  });

  it("reconciliation reports a GHL quantity that drifted and only fixes it on request — local stock untouched", async () => {
    await connect(f, fake, { sync: ALL_ON, inventoryLocationId: f.main.locationId });
    const p = await stockProduct(f, { price: 1000, qty: 9 });
    await processGhl(f.businessId);
    const [link] = await getDb().select().from(ghlProductLinks).where(eq(ghlProductLinks.variantId, p.variantId));
    fake.prices.get(link.ghlPriceId!)!.availableQuantity = 4; // someone edited it in GHL
    await reconcileAll(f.businessId);
    const [m] = await getDb().select().from(integrationMismatches).where(and(eq(integrationMismatches.businessId, f.businessId), eq(integrationMismatches.kind, "inventory")));
    expect(m).toMatchObject({ status: "open", localValue: 9, externalValue: 4 });
    expect(await stockAt(p.variantId, f.main.locationId)).toBe(9);
    await resolveMismatch(f.ctx.owner, m.id, "push_local");
    await processGhl(f.businessId);
    expect(fake.prices.get(link.ghlPriceId!)!.availableQuantity).toBe(9);
    await reconcileAll(f.businessId);
    const open = await getDb().select().from(integrationMismatches).where(and(eq(integrationMismatches.businessId, f.businessId), eq(integrationMismatches.status, "open")));
    expect(open.filter((x) => x.kind === "inventory")).toHaveLength(0);
  });
});

describe("duplicate detection", () => {
  it("reports customers sharing an email or phone so contact sync stays one-to-one, and closes the finding once fixed", async () => {
    await connect(f, fake);
    const a = await customer(f, "Dup One");
    const b = await customer(f, "Dup Two");
    const email = `dup-${randomUUID().slice(0, 6)}@example.com`;
    await getDb().update(customersTable).set({ email }).where(eq(customersTable.id, a.id));
    await getDb().update(customersTable).set({ email: email.toUpperCase() }).where(eq(customersTable.id, b.id));
    await reconcileAll(f.businessId);
    const [m] = await getDb().select().from(integrationMismatches).where(and(eq(integrationMismatches.businessId, f.businessId), eq(integrationMismatches.kind, "duplicate_customer")));
    expect(m).toMatchObject({ status: "open", dedupeKey: `email:${email}` });
    expect(m.message).toMatch(/2 customers share email/);
    // Running it again doesn't open a second finding.
    await reconcileAll(f.businessId);
    expect(await getDb().select().from(integrationMismatches).where(and(eq(integrationMismatches.businessId, f.businessId), eq(integrationMismatches.kind, "duplicate_customer"), eq(integrationMismatches.status, "open")))).toHaveLength(1);
    await getDb().update(customersTable).set({ email: `other-${email}` }).where(eq(customersTable.id, b.id));
    await reconcileAll(f.businessId);
    const [after] = await getDb().select().from(integrationMismatches).where(eq(integrationMismatches.id, m.id));
    expect(after.status).toBe("resolved");
  });
});

describe("GHL online orders", () => {
  async function published(qty = 10) {
    await connect(f, fake, { sync: ALL_ON, inventoryLocationId: f.main.locationId, onlineBranchId: f.main.id });
    const p = await stockProduct(f, { price: 1200, qty });
    await processGhl(f.businessId);
    const [link] = await getDb().select().from(ghlProductLinks).where(eq(ghlProductLinks.variantId, p.variantId));
    return { p, priceId: link.ghlPriceId! };
  }

  it("ignores unpaid orders, imports a paid one once, and deducts stock once despite duplicate/payment events", async () => {
    const { p, priceId } = await published(10);
    fake.contacts.set("ct_buyer", { id: "ct_buyer", firstName: "Web", lastName: "Buyer", email: "web.buyer@example.com", dateUpdated: new Date().toISOString() });
    fake.addOrder({ id: "or_1", contactId: "ct_buyer", amount: 2400, items: [{ priceId, qty: 2, amount: 1200, name: "Frame" }] });
    await deliver("OrderCreate", { _id: "or_1", altId: fake.locationId, altType: "location" });
    expect(await getDb().select().from(salesTable).where(eq(salesTable.externalGhlOrderId, "or_1"))).toHaveLength(0);

    fake.pay("or_1", 2400);
    await deliver("OrderStatusUpdate", { _id: "or_1", altId: fake.locationId, altType: "location", status: "completed" });
    await deliver("OrderStatusUpdate", { _id: "or_1", altId: fake.locationId, altType: "location", status: "completed", note: "retry" });
    const imported = await getDb().select().from(salesTable).where(eq(salesTable.externalGhlOrderId, "or_1"));
    expect(imported).toHaveLength(1);
    expect(imported[0]).toMatchObject({ channel: "ghl_online", status: "completed", totalCents: 240_000, paidCents: 240_000, paymentStatus: "paid" });
    const pays = await getDb().select().from(payments).where(eq(payments.saleId, imported[0].id));
    expect(pays).toHaveLength(1);
    expect(pays[0].method).toBe("ghl_online");
    expect(await stockAt(p.variantId, f.main.locationId)).toBe(8);
    expect(await getDb().select().from(stockMovements).where(eq(stockMovements.referenceId, imported[0].id))).toHaveLength(1);
    // Counted once in revenue.
    const range = resolveRange("today", "Asia/Manila");
    const fin = await reports.financials(f.ctx.owner, range.from, range.to, range.fromDay, range.toDay);
    expect(fin.transactions).toBe(1);
    // The imported order is not echoed back to GHL as an opportunity.
    expect((await events(f.businessId, "sale.sync")).filter((e) => e.entityId === imported[0].id)).toHaveLength(0);
    // The customer was created from the GHL contact and linked.
    const [mirror] = await getDb().select().from(ghlContacts).where(eq(ghlContacts.ghlContactId, "ct_buyer"));
    expect(mirror.customerId).toBe(imported[0].customerId);
  });

  it("records a GHL refund as a revenue refund and flags restocking for a person", async () => {
    const { p, priceId } = await published(5);
    fake.addOrder({ id: "or_r", amount: 1200, items: [{ priceId, qty: 1, amount: 1200 }] });
    fake.pay("or_r", 1200, { id: "tx_r" });
    await deliver("OrderCreate", { _id: "or_r", altId: fake.locationId, altType: "location" });
    fake.transactions.find((t) => t._id === "tx_r")!.amountRefunded = 1200;
    await deliver("OrderStatusUpdate", { _id: "or_r", altId: fake.locationId, altType: "location", status: "refunded" });
    await deliver("OrderStatusUpdate", { _id: "or_r", altId: fake.locationId, altType: "location", status: "refunded" });
    const [sale] = await getDb().select().from(salesTable).where(eq(salesTable.externalGhlOrderId, "or_r"));
    const rf = await getDb().select().from(refunds).where(eq(refunds.saleId, sale.id));
    expect(rf).toHaveLength(1);
    expect(rf[0]).toMatchObject({ amountCents: 120_000, affectsRevenue: true });
    expect(await stockAt(p.variantId, f.main.locationId)).toBe(4); // not restocked automatically
    const [m] = await getDb().select().from(integrationMismatches).where(eq(integrationMismatches.kind, "online_refund_restock"));
    expect(m.status).toBe("open");
  });

  it("holds orders with unlinked items and records oversold lines without negative stock", async () => {
    const { p, priceId } = await published(1);
    fake.prices.set("pc_unknown", { _id: "pc_unknown", product: "pr_x", name: "Mystery", amount: 99 });
    fake.addOrder({ id: "or_u", amount: 99, items: [{ priceId: "pc_unknown", qty: 1, amount: 99 }] });
    fake.pay("or_u", 99);
    await deliver("OrderCreate", { _id: "or_u", altId: fake.locationId, altType: "location" });
    const [held] = (await events(f.businessId, "order.import")).filter((e) => e.externalId === "or_u");
    expect(held.status).toBe("needs_review");

    fake.addOrder({ id: "or_o", amount: 3600, items: [{ priceId, qty: 3, amount: 1200 }] });
    fake.pay("or_o", 3600);
    await deliver("OrderCreate", { _id: "or_o", altId: fake.locationId, altType: "location" });
    const [sale] = await getDb().select().from(salesTable).where(eq(salesTable.externalGhlOrderId, "or_o"));
    expect(sale.totalCents).toBe(360_000);
    expect(await stockAt(p.variantId, f.main.locationId)).toBe(1); // untouched, never negative
    const [m] = await getDb().select().from(integrationMismatches).where(eq(integrationMismatches.kind, "oversold_online"));
    expect(m.message).toMatch(/1 available, 3 sold online/);
  });
});

describe("appointments (GHL calendars authoritative)", () => {
  it("mirrors GHL bookings, applies reschedules in order, and turns deletes into cancellations", async () => {
    await connect(f, fake, { sync: ALL_ON, appointmentsAuthority: "ghl" });
    await getDb().update(ghlCalendars).set({ branchId: f.main.id, appointmentTypeId: f.examTypeId }).where(and(eq(ghlCalendars.businessId, f.businessId), eq(ghlCalendars.ghlCalendarId, "cal_exam")));
    fake.contacts.set("ct_pat", { id: "ct_pat", firstName: "Pat", lastName: "Ient", email: "pat@example.com", dateUpdated: new Date().toISOString() });
    const day = futureDay(2);
    const start = new Date(`${day}T02:00:00.000Z`);
    const appt = { id: "ap_g1", calendarId: "cal_exam", contactId: "ct_pat", appointmentStatus: "confirmed", startTime: start.toISOString(), endTime: new Date(start.getTime() + 45 * 60_000).toISOString(), dateUpdated: new Date(Date.now() - 60_000).toISOString() };
    await deliver("AppointmentCreate", { appointment: appt });
    let [row] = await getDb().select().from(appointments).where(eq(appointments.externalGhlAppointmentId, "ap_g1"));
    expect(row).toMatchObject({ status: "confirmed", syncState: "synced", branchId: f.main.id, source: "gohighlevel" });
    expect(row.leadId).toBeTruthy(); // the GHL contact became a lead

    const later = new Date(start.getTime() + 3_600_000);
    await deliver("AppointmentUpdate", { appointment: { ...appt, startTime: later.toISOString(), endTime: new Date(later.getTime() + 45 * 60_000).toISOString(), dateUpdated: new Date().toISOString() } });
    await deliver("AppointmentUpdate", { appointment: { ...appt, appointmentStatus: "cancelled", dateUpdated: new Date(Date.now() - 120_000).toISOString() } }); // stale
    [row] = await getDb().select().from(appointments).where(eq(appointments.id, row.id));
    expect(row.startsAt.toISOString()).toBe(later.toISOString());
    expect(row.status).toBe("confirmed");

    await deliver("AppointmentDelete", { appointment: { id: "ap_g1" } });
    [row] = await getDb().select().from(appointments).where(eq(appointments.id, row.id));
    expect(row.status).toBe("cancelled");
  });

  it("assigns a booking with no GHL user to the calendar's mapped practitioner", async () => {
    await connect(f, fake, { sync: ALL_ON, appointmentsAuthority: "ghl" });
    await mapCalendar(f.ctx.owner, "cal_exam", f.main.id, f.examTypeId, f.membership.practitioner);
    await expect(mapCalendar(f.ctx.owner, "cal_exam", f.main.id, f.examTypeId, "00000000-0000-4000-8000-000000000000")).rejects.toThrow(/Unknown staff/);
    const start = new Date(`${futureDay(5)}T02:00:00.000Z`);
    await deliver("AppointmentCreate", { appointment: { id: "ap_cal_pr", calendarId: "cal_exam", appointmentStatus: "confirmed", title: "Walk-in booking", startTime: start.toISOString(), endTime: new Date(start.getTime() + 45 * 60_000).toISOString() } });
    const [row] = await getDb().select().from(appointments).where(eq(appointments.externalGhlAppointmentId, "ap_cal_pr"));
    expect(row.practitionerMembershipId).toBe(f.membership.practitioner);
  });

  it("holds bookings from unmapped calendars for review", async () => {
    await connect(f, fake, { sync: ALL_ON, appointmentsAuthority: "ghl" });
    const start = new Date(`${futureDay(3)}T03:00:00.000Z`);
    await deliver("AppointmentCreate", { appointment: { id: "ap_u", calendarId: "cal_exam", startTime: start.toISOString(), endTime: new Date(start.getTime() + 1_800_000).toISOString() } });
    const [ev] = (await events(f.businessId, "ghl.AppointmentCreate")).filter((e) => e.externalId === "ap_u");
    expect(ev).toMatchObject({ status: "needs_review", lastError: expect.stringMatching(/isn't mapped/) });
  });

  it("pushes a dashboard booking to GHL and marks it synced only after GHL confirms", async () => {
    await connect(f, fake, { sync: ALL_ON, appointmentsAuthority: "ghl" });
    await getDb().update(ghlCalendars).set({ branchId: f.main.id, appointmentTypeId: f.examTypeId }).where(and(eq(ghlCalendars.businessId, f.businessId), eq(ghlCalendars.ghlCalendarId, "cal_exam")));
    const c = await customer(f, "Book Here");
    await getDb().update(customersTable).set({ email: "bookhere@example.com" }).where(eq(customersTable.id, c.id));
    fake.fail("POST /calendars/events/appointments", 503, { times: 1 });
    const a = await appts.createAppointment(f.ctx.sales, { branchId: f.main.id, appointmentTypeId: f.examTypeId, customerId: c.id, practitionerMembershipId: f.membership.practitioner, date: futureDay(4), time: "10:00" });
    let [row] = await getDb().select().from(appointments).where(eq(appointments.id, a!.id));
    expect(row.syncState).toBe("pending");
    await processGhl(f.businessId); // GHL unavailable → still pending, retry scheduled
    [row] = await getDb().select().from(appointments).where(eq(appointments.id, a!.id));
    expect(row.syncState).toBe("pending");
    await getDb().update(integrationSyncEvents).set({ nextAttemptAt: new Date() }).where(eq(integrationSyncEvents.entityId, a!.id));
    await processGhl(f.businessId);
    [row] = await getDb().select().from(appointments).where(eq(appointments.id, a!.id));
    expect(row.syncState).toBe("synced");
    expect(fake.appointments.get(row.externalGhlAppointmentId!)).toMatchObject({ calendarId: "cal_exam", appointmentStatus: "new" });

    // Reschedule → update, not a second appointment.
    await appts.updateAppointment(f.ctx.sales, a!.id, { branchId: f.main.id, appointmentTypeId: f.examTypeId, customerId: c.id, practitionerMembershipId: f.membership.practitioner, date: futureDay(4), time: "11:00" });
    await processGhl(f.businessId);
    expect(fake.appointments.size).toBe(1);
    expect(fake.callsTo("PUT /calendars/events/appointments/")).toHaveLength(1);
  });
});

describe("multi-business isolation", () => {
  it("routes each sub-account's events only to its own business", async () => {
    await connect(f, fake);
    const other = await createBusiness("T");
    const fake2 = fakeFor("T");
    fake2.accessTokens.clear();
    fake2.accessTokens.set("pit-other-token-111111", fake2.locationId);
    const route: typeof fetch = (input, init) => (new Headers(init?.headers).get("authorization")?.includes("pit-other") ? fake2.fetch(input, init) : fake.fetch(input, init));
    setGhlFetch(route);
    const { connectPrivateToken } = await import("@/server/integrations/ghl");
    await connectPrivateToken(other.ctx.owner, { locationId: fake2.locationId, token: "pit-other-token-111111" });
    const body = webhookBody("ContactCreate", fake2.locationId, { id: "ct_iso", firstName: "Iso", email: "iso@example.com", dateUpdated: new Date().toISOString() });
    await handleMarketplaceWebhook(body, signedHeaders(body));
    expect(await getDb().select().from(leads).where(and(eq(leads.businessId, other.businessId), eq(leads.externalGhlContactId, "ct_iso")))).toHaveLength(1);
    expect(await getDb().select().from(leads).where(and(eq(leads.businessId, f.businessId), eq(leads.externalGhlContactId, "ct_iso")))).toHaveLength(0);
    expect(await getDb().select().from(ghlContacts).where(eq(ghlContacts.businessId, f.businessId))).toHaveLength(0);
    // Event ids for one business can't be retried from the other.
    const [ev] = await events(other.businessId);
    const { retryEvents } = await import("@/server/integrations/ghl");
    expect(await retryEvents(f.businessId, [ev.id], f.membership.owner)).toBe(0);
    void randomUUID;
  });
});
